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

// ── Gemini (production) ────────────────────────────────────────────────────

async function modifyDetailsGemini(input: ModifierInput): Promise<NodeResult> {
  const hasMask = Boolean(input.mask)

  const sysInstruction =
    'You are an image detail editor. ' +
    'Apply the requested modification to the input image. ' +
    (hasMask
      ? 'Two images are provided: the first is the original, the second is the same scene with hand-drawn colored markings indicating WHERE to apply the modification. ' +
        'Apply the change ONLY within the marked region(s). Every unmarked area must remain EXACTLY identical to the original. ' +
        'Never reproduce the marking strokes themselves in the output.'
      : 'Preserve overall composition and only change the areas described in the prompt.')

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
    maskImage: maskOverlay,
    prompt: maskOverlay
      ? `${input.prompt}\n\n[REGION] Apply the modification only to the area marked with colored strokes in the second image. Do not draw the strokes in the result.`
      : input.prompt,
    systemInstruction: sysInstruction,
  })

  const outputImage = result.image
    ? `data:image/png;base64,${result.image}`
    : input.image

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
