// ---------------------------------------------------------------------------
// Gemini 세그멘테이션 — 클릭 지점의 객체 영역 마스크 (업로드 이미지용 매직툴)
//
// 스케치업 ID 마스크가 없는 업로드 이미지에서 매직툴을 지원한다:
// 원본 이미지와 클릭 좌표를 Gemini(텍스트 모델)에 보내
// { box_2d, mask } JSON을 받고, 전체 해상도의 이진 선택
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

interface SegEntry {
  box_2d?: number[]
  // Gemini 세그멘테이션 응답은 모델/API 버전에 따라 base64 PNG 또는
  // bounding box 내부 0-1000 좌표의 [x, y] 폴리곤으로 온다.
  mask?: string | number[][]
  label?: string
}

function parseSegJson(text: string): SegEntry[] {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    const start = Math.min(
      ...[cleaned.indexOf('['), cleaned.indexOf('{')].filter((i) => i >= 0),
    )
    if (!Number.isFinite(start)) return []
    const parsed = JSON.parse(cleaned.slice(start)) as SegEntry | SegEntry[] | { boxes?: SegEntry[] }
    const wrapper = parsed as { boxes?: unknown }
    const entries: SegEntry[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(wrapper.boxes)
        ? wrapper.boxes as SegEntry[]
        : [parsed as SegEntry]
    return entries.filter((e) => e.mask && Array.isArray(e.box_2d) && e.box_2d.length === 4)
  } catch {
    return []
  }
}

function containsPoint(entry: SegEntry, x: number, y: number): boolean {
  if (!entry.box_2d || entry.box_2d.length !== 4) return false
  const [ymin, xmin, ymax, xmax] = entry.box_2d
  return x >= xmin && x <= xmax && y >= ymin && y <= ymax
}

function maskContainsPoint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fx: number,
  fy: number,
): boolean {
  const x = Math.max(0, Math.min(width - 1, Math.round(fx * width)))
  const y = Math.max(0, Math.min(height - 1, Math.round(fy * height)))
  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.005))
  const left = Math.max(0, x - radius)
  const top = Math.max(0, y - radius)
  const w = Math.min(width - left, radius * 2 + 1)
  const h = Math.min(height - top, radius * 2 + 1)
  const pixels = ctx.getImageData(left, top, w, h).data
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 127) return true
  }
  return false
}

/**
 * 클릭 지점(비율 좌표)의 객체 세그멘테이션 마스크를 만든다.
 * 반환: 원본 해상도의 이진 마스크 dataURL (객체=흰색, 배경=검정). 실패 시 null
 */
export async function segmentObjectAtPoint(
  image: string,
  fx: number,
  fy: number,
  signal?: AbortSignal,
): Promise<{ mask: string; label: string } | null> {
  const img = await loadImage(image)
  const pointX = Math.round(fx * 1000)
  const pointY = Math.round(fy * 1000)

  const prompt =
    `The user clicked point [y, x] = [${pointY}, ${pointX}] in this image, ` +
    'where both coordinates are normalized from 0 to 1000. ' +
    'Segment the single visible object or continuous planar surface whose pixels contain that exact point ' +
    '(for example a sofa, wall face, floor face, ceiling face, table, or cabinet). ' +
    'The returned mask MUST contain the clicked point. Do not choose a nearby object, shadow, edge, line, or highlight. ' +
    'Output ONLY a JSON array with exactly one entry: ' +
    '{"box_2d": [ymin, xmin, ymax, xmax] normalized to 0-1000, ' +
    '"mask": polygon as an array of [x, y] points normalized to 0-1000 within the bounding box, ' +
    '"label": short name}. No other text.'

  const result = await callGemini({
    image,
    prompt,
    modelOverride: 'gemini-3.5-flash',
    responseModalities: ['TEXT'],
    responseMimeType: 'application/json',
    systemInstruction: 'You are a precise image segmentation engine. Always answer with valid JSON only.',
    signal,
  })
  if (!result.text) return null
  const entries = parseSegJson(result.text)
  const entry = entries
    .filter((candidate) => containsPoint(candidate, pointX, pointY))
    .sort((a, b) => {
      const [ay1, ax1, ay2, ax2] = a.box_2d!
      const [by1, bx1, by2, bx2] = b.box_2d!
      return (ay2 - ay1) * (ax2 - ax1) - (by2 - by1) * (bx2 - bx1)
    })[0]
  if (!entry?.mask || !entry.box_2d) return null

  // box(0-1000 정규화) → 픽셀 좌표
  const W = img.naturalWidth
  const H = img.naturalHeight
  const [ymin, xmin, ymax, xmax] = entry.box_2d
  const bx = Math.max(0, Math.round((xmin / 1000) * W))
  const by = Math.max(0, Math.round((ymin / 1000) * H))
  const bw = Math.min(W, Math.round(((xmax - xmin) / 1000) * W))
  const bh = Math.min(H, Math.round(((ymax - ymin) / 1000) * H))
  if (bw < 2 || bh < 2) return null

  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const octx = out.getContext('2d')
  if (!octx) return null
  octx.fillStyle = '#000000'
  octx.fillRect(0, 0, W, H)

  if (typeof entry.mask === 'string') {
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
    octx.drawImage(mc, bx, by)
  } else {
    const polygon = entry.mask.filter(
      (point) => point.length >= 2 && point.every(Number.isFinite),
    )
    if (polygon.length < 3) return null
    octx.fillStyle = '#ffffff'
    octx.beginPath()
    polygon.forEach(([x, y], index) => {
      const px = bx + (x / 1000) * bw
      const py = by + (y / 1000) * bh
      if (index === 0) octx.moveTo(px, py)
      else octx.lineTo(px, py)
    })
    octx.closePath()
    octx.fill()
  }

  // 모델이 클릭점과 무관한 주변 물체를 반환하면 잘못된 선택을 보여주지 않는다.
  if (!maskContainsPoint(octx, W, H, fx, fy)) return null

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
