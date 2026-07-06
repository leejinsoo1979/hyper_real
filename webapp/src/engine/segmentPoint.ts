// ---------------------------------------------------------------------------
// Gemini 세그멘테이션 — 클릭 지점의 객체 영역 마스크 (업로드 이미지용 매직툴)
//
// 스케치업 ID 마스크가 없는 업로드 이미지에서 매직툴을 지원한다:
// 클릭 지점에 빨간 원을 그린 사본을 Gemini(텍스트 모델)에 보내
// { box_2d, mask(base64 PNG) } JSON을 받고, 전체 해상도의 이진 선택
// 마스크(선택=흰색/배경=검정)로 합성해 반환한다.
// 이 마스크는 기존 매직툴 파이프라인(선택 영역만 편집 + 영역 밖 원본
// 픽셀 보존)과 동일한 형식이다.
// ---------------------------------------------------------------------------

import { callGemini } from './geminiClient'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = src.startsWith('data:') || src.startsWith('http') ? src : `data:image/png;base64,${src}`
  })
}

/** 클릭 지점에 흰 테두리 + 빨간 원 마커를 그린 사본 */
function markPoint(img: HTMLImageElement, fx: number, fy: number): string {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const x = fx * c.width
  const y = fy * c.height
  const r = Math.max(12, Math.min(c.width, c.height) * 0.04)
  ctx.lineWidth = Math.max(4, r * 0.24)
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = Math.max(2.5, r * 0.14)
  ctx.strokeStyle = '#ff2d2d'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  return c.toDataURL('image/png')
}

interface SegEntry {
  box_2d?: number[]
  mask?: string
  label?: string
}

function parseSegJson(text: string): SegEntry | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  const objStart = cleaned.indexOf('{')
  try {
    if (start !== -1 && end > start) {
      const arr = JSON.parse(cleaned.slice(start, end + 1)) as SegEntry[]
      return arr.find((e) => e.mask && Array.isArray(e.box_2d)) ?? null
    }
    if (objStart !== -1) {
      const obj = JSON.parse(cleaned.slice(objStart, cleaned.lastIndexOf('}') + 1)) as SegEntry
      return obj.mask && Array.isArray(obj.box_2d) ? obj : null
    }
  } catch {
    return null
  }
  return null
}

/**
 * 클릭 지점(비율 좌표)의 객체 세그멘테이션 마스크를 만든다.
 * 반환: 원본 해상도의 이진 마스크 dataURL (객체=흰색, 배경=검정). 실패 시 null
 */
export async function segmentObjectAtPoint(
  image: string,
  fx: number,
  fy: number,
): Promise<{ mask: string; label: string } | null> {
  const img = await loadImage(image)
  const marked = markPoint(img, fx, fy)

  const prompt =
    'Find the single object or surface directly under the red circle marker in this image ' +
    '(e.g. a sofa, a wall, a floor, a table). ' +
    'Output ONLY a JSON array with exactly one entry: ' +
    '{"box_2d": [ymin, xmin, ymax, xmax] normalized to 0-1000, ' +
    '"mask": segmentation mask as a base64 PNG (probability map inside the box), ' +
    '"label": short name}. No other text.'

  const result = await callGemini({
    image: marked,
    prompt,
    responseModalities: ['TEXT'],
    systemInstruction: 'You are a precise image segmentation engine. Always answer with valid JSON only.',
  })
  if (!result.text) return null
  const entry = parseSegJson(result.text)
  if (!entry?.mask || !entry.box_2d || entry.box_2d.length !== 4) return null

  // box(0-1000 정규화) → 픽셀 좌표
  const W = img.naturalWidth
  const H = img.naturalHeight
  const [ymin, xmin, ymax, xmax] = entry.box_2d
  const bx = Math.max(0, Math.round((xmin / 1000) * W))
  const by = Math.max(0, Math.round((ymin / 1000) * H))
  const bw = Math.min(W, Math.round(((xmax - xmin) / 1000) * W))
  const bh = Math.min(H, Math.round(((ymax - ymin) / 1000) * H))
  if (bw < 2 || bh < 2) return null

  const maskSrc = entry.mask.startsWith('data:') ? entry.mask : `data:image/png;base64,${entry.mask}`
  const maskImg = await loadImage(maskSrc)

  // 박스 크기로 스케일한 확률맵 → 임계값(127)으로 이진화 → 전체 캔버스에 배치
  const mc = document.createElement('canvas')
  mc.width = bw
  mc.height = bh
  const mctx = mc.getContext('2d', { willReadFrequently: true })
  if (!mctx) return null
  mctx.drawImage(maskImg, 0, 0, bw, bh)
  const md = mctx.getImageData(0, 0, bw, bh)
  for (let i = 0; i < bw * bh; i++) {
    // 흰 배경 PNG(알파 없음)와 알파맵 PNG 모두 대응: 알파 있으면 알파, 없으면 밝기
    const a = md.data[i * 4 + 3]
    const v = a < 255 ? a : md.data[i * 4]
    const on = v > 127 ? 255 : 0
    md.data[i * 4] = on
    md.data[i * 4 + 1] = on
    md.data[i * 4 + 2] = on
    md.data[i * 4 + 3] = 255
  }
  mctx.putImageData(md, 0, 0)

  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const octx = out.getContext('2d')
  if (!octx) return null
  octx.fillStyle = '#000000'
  octx.fillRect(0, 0, W, H)
  octx.drawImage(mc, bx, by)
  return { mask: out.toDataURL('image/png'), label: entry.label ?? '객체' }
}

/** 이진 마스크 → 소스 위에 겹칠 반투명 틸(teal) 하이라이트 오버레이 PNG */
export async function maskToHighlightOverlay(mask: string): Promise<string | null> {
  try {
    const img = await loadImage(mask)
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < c.width * c.height; i++) {
      const on = d.data[i * 4] > 127
      d.data[i * 4] = 0
      d.data[i * 4 + 1] = 201
      d.data[i * 4 + 2] = 167
      d.data[i * 4 + 3] = on ? 105 : 0
    }
    ctx.putImageData(d, 0, 0)
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}
