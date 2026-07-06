import type { ModifierInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'
import { callGemini, useMock } from '../geminiClient'

// ── Mock (development) ─────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function modifyDetailsMock(input: ModifierInput): Promise<NodeResult> {
  await delay(2000)
  return {
    image: input.image,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Mask compositing ───────────────────────────────────────────────────────

function toDataUri(image: string): string {
  if (image.startsWith('data:') || image.startsWith('http')) return image
  const mime =
    image.startsWith('/9j/') ? 'image/jpeg'
    : image.startsWith('UklGR') ? 'image/webp'
    : 'image/png'
  return `data:${mime};base64,${image}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('마스크 합성용 이미지 로드 실패'))
    img.src = src
  })
}

/**
 * 원본 이미지 위에 드로잉 마스크를 합성한 "마킹된 사본"을 만든다.
 * 투명 PNG 선만 보내면 모델이 위치를 못 잡으므로, 반드시 원본에 겹쳐서 보낸다.
 */
async function compositeMaskOverlay(image: string, mask: string): Promise<string> {
  const [base, overlay] = await Promise.all([loadImage(toDataUri(image)), loadImage(mask)])
  const canvas = document.createElement('canvas')
  canvas.width = base.naturalWidth
  canvas.height = base.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스 컨텍스트 생성 실패')
  ctx.drawImage(base, 0, 0)
  // 마스크는 캔버스 표시 해상도로 그려졌으므로 원본 크기에 맞춰 늘린다
  ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/**
 * 스트로크 알파 → 편집 허용 영역(이진). 스트로크 자체 + 스트로크로 둘러싼
 * 폐곡선 내부(테두리에서 도달 불가능한 픽셀)를 영역으로 인정한다.
 */
function buildRegionData(strokeAlpha: Uint8Array, w: number, h: number): Uint8Array {
  const OUT = 1
  const STROKE = 2
  const state = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (strokeAlpha[i] > 16) state[i] = STROKE

  const queue: number[] = []
  const push = (i: number) => {
    if (state[i] === 0) {
      state[i] = OUT
      queue.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (queue.length > 0) {
    const i = queue.pop()!
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (y > 0) push(i - w)
    if (y < h - 1) push(i + w)
  }

  const region = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) region[i] = state[i] === OUT ? 0 : 255
  return region
}

/**
 * 마킹 영역 강제 합성: AI가 마킹 밖을 바꿔버려도 최종 결과에서는
 * 마킹 영역(스트로크+폐곡선 내부, 약간 팽창+페더)만 편집본을 쓰고
 * 나머지는 원본 픽셀을 그대로 유지한다. 실패 시 null (편집본 그대로 사용).
 */
export async function compositeEditedIntoRegion(
  original: string,
  edited: string,
  mask: string,
): Promise<string | null> {
  try {
    const [base, editedImg, strokes] = await Promise.all([
      loadImage(toDataUri(original)),
      loadImage(toDataUri(edited)),
      loadImage(mask),
    ])
    const w = base.naturalWidth
    const h = base.naturalHeight

    // 스트로크 알파 추출 (원본 크기로 스케일)
    const sc = document.createElement('canvas')
    sc.width = w
    sc.height = h
    const sctx = sc.getContext('2d', { willReadFrequently: true })
    if (!sctx) return null
    sctx.drawImage(strokes, 0, 0, w, h)
    const sdata = sctx.getImageData(0, 0, w, h).data
    const alpha = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) alpha[i] = sdata[i * 4 + 3]

    const region = buildRegionData(alpha, w, h)

    // 영역 → 알파 마스크 캔버스
    const mc = document.createElement('canvas')
    mc.width = w
    mc.height = h
    const mctx = mc.getContext('2d')
    if (!mctx) return null
    const mimg = mctx.createImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      mimg.data[i * 4] = 255
      mimg.data[i * 4 + 1] = 255
      mimg.data[i * 4 + 2] = 255
      mimg.data[i * 4 + 3] = region[i]
    }
    mctx.putImageData(mimg, 0, 0)

    // 팽창(붓 가장자리 손실 방지) + 페더(경계 자연스럽게)
    const r = Math.max(4, Math.round(Math.min(w, h) * 0.012))
    const dil = document.createElement('canvas')
    dil.width = w
    dil.height = h
    const dctx = dil.getContext('2d')
    if (!dctx) return null
    for (const dx of [-r, 0, r]) {
      for (const dy of [-r, 0, r]) {
        dctx.drawImage(mc, dx, dy)
      }
    }
    const feather = document.createElement('canvas')
    feather.width = w
    feather.height = h
    const fctx = feather.getContext('2d')
    if (!fctx) return null
    fctx.filter = 'blur(3px)'
    fctx.drawImage(dil, 0, 0)

    // 편집본을 영역으로 클리핑 → 원본 위에 합성
    const clip = document.createElement('canvas')
    clip.width = w
    clip.height = h
    const cctx = clip.getContext('2d')
    if (!cctx) return null
    cctx.drawImage(editedImg, 0, 0, w, h)
    cctx.globalCompositeOperation = 'destination-in'
    cctx.drawImage(feather, 0, 0)

    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const octx = out.getContext('2d')
    if (!octx) return null
    octx.drawImage(base, 0, 0)
    octx.drawImage(clip, 0, 0)
    return out.toDataURL('image/png')
  } catch {
    return null
  }
}

// ── Gemini (production) ────────────────────────────────────────────────────

async function modifyDetailsGemini(input: ModifierInput): Promise<NodeResult> {
  const hasMask = Boolean(input.mask)
  const materialReferences = input.materialReferences?.filter(Boolean) ?? []
  const hasMaterialReferences = materialReferences.length > 0

  const sysInstruction =
    'You are an image detail editor. ' +
    'Apply the requested modification to the input image. ' +
    (hasMask
      ? 'Two images are provided: the first is the original, the second is the same scene with hand-drawn colored markings indicating WHERE to apply the modification. ' +
        'Apply the change ONLY within the marked region(s). Every unmarked area must remain EXACTLY identical to the original. ' +
        'Never reproduce the marking strokes themselves in the output.'
      : 'Preserve overall composition and only change the areas described in the prompt.') +
    (hasMaterialReferences
      ? ' Additional reference image(s) are provided after the primary scene. Use them only as material appearance references for color, texture, grain, pattern, scale, roughness, and reflectivity.'
      : '')

  let maskOverlay: string | undefined
  if (input.mask) {
    try {
      maskOverlay = await compositeMaskOverlay(input.image, input.mask)
    } catch {
      // 합성 실패 시 마스크 없이 프롬프트만으로 진행 (조용히 죽지 않도록 결과는 유지)
      maskOverlay = undefined
    }
  }

  const result = await callGemini({
    image: input.image,
    extraImages: hasMaterialReferences ? materialReferences : undefined,
    maskImage: maskOverlay,
    prompt: [
      input.prompt,
      hasMaterialReferences
        ? '[MATERIAL REFERENCE] Use the additional reference image(s) only for the target material appearance. Do not copy objects, lighting, camera, or composition from the reference image(s).'
        : '',
      maskOverlay
        ? '[REGION] Apply the modification only to the area marked with colored strokes in the marked scene image. Do not draw the strokes in the result.'
        : '',
    ].filter(Boolean).join('\n\n'),
    systemInstruction: sysInstruction,
  })

  let outputImage = result.image
    ? `data:image/png;base64,${result.image}`
    : input.image

  // 마킹 강제: AI가 지시를 어기고 마킹 밖을 바꿔도 최종 결과에서는
  // 마킹 영역만 반영되고 나머지는 원본 픽셀이 100% 유지된다
  if (result.image && input.mask) {
    const composited = await compositeEditedIntoRegion(input.image, outputImage, input.mask)
    if (composited) outputImage = composited
  }

  return {
    image: outputImage,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Exported switcher ──────────────────────────────────────────────────────

export async function modifyDetails(input: ModifierInput): Promise<NodeResult> {
  return useMock() ? modifyDetailsMock(input) : modifyDetailsGemini(input)
}
