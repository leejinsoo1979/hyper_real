// ---------------------------------------------------------------------------
// 같은 재질 영역 확장 — SketchUp ID 마스크의 "재질 단위 선택"을 업로드 이미지에서 재현
//
// SAM은 클릭한 객체 '하나'만 세그멘테이션한다. 브릿지 모드처럼 같은 재질이
// 전부 선택되게 하기 위해: 클릭 영역의 평균 색을 기준으로 이미지 전체에서
// 색이 유사한 후보 지점을 추리고, 각 지점을 SAM으로 디코딩해 평균 색이
// 일치하는 영역만 합집합으로 묶는다. (경계는 SAM이, 재질 판정은 색이 담당)
//
// 업로드 이미지에는 재질 정보가 없으므로 '같은 재질'은 외형 기반 근사다.
// 평평한 단색 면(SketchUp 계열 렌더)에서 특히 잘 맞는다.
// ---------------------------------------------------------------------------

import { decodeSamPoint, type SamMask } from './samSession'

/** 후보 지점당 SAM 디코딩 상한 — 1회 수십 ms이므로 전체 ~1초 이내 유지 */
const MAX_DECODES = 14
/** 평균 색 거리(RGB 유클리드) 허용치 — 그림자/음영 약간을 허용하는 수준 */
const COLOR_TOL = 34

interface Rgb { r: number; g: number; b: number }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = src
  })
}

async function imagePixels(image: string, w: number, h: number): Promise<Uint8ClampedArray | null> {
  try {
    const img = await loadImage(image)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h).data
  } catch {
    return null
  }
}

/** 마스크 영역의 평균 색 (stride 샘플링) */
function meanColor(px: Uint8ClampedArray, mask: Uint8Array, w: number, h: number): Rgb | null {
  let r = 0, g = 0, b = 0, n = 0
  const stride = 2
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const p = y * w + x
      if (!mask[p]) continue
      r += px[p * 4]
      g += px[p * 4 + 1]
      b += px[p * 4 + 2]
      n++
    }
  }
  if (n === 0) return null
  return { r: r / n, g: g / n, b: b / n }
}

/** 지점 주변 5x5 평균 색 */
function patchColor(px: Uint8ClampedArray, cx: number, cy: number, w: number, h: number): Rgb {
  let r = 0, g = 0, b = 0, n = 0
  for (let y = Math.max(0, cy - 2); y <= Math.min(h - 1, cy + 2); y++) {
    for (let x = Math.max(0, cx - 2); x <= Math.min(w - 1, cx + 2); x++) {
      const p = y * w + x
      r += px[p * 4]
      g += px[p * 4 + 1]
      b += px[p * 4 + 2]
      n++
    }
  }
  return { r: r / n, g: g / n, b: b / n }
}

function colorDist(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

/**
 * 클릭한 영역(seed)과 같은 재질로 보이는 영역 전부를 합친 마스크를 만든다.
 * 실패/추가 영역 없음이면 seed 그대로. regions = 합쳐진 영역 수(seed 포함).
 */
export async function expandSameMaterial(
  image: string,
  seed: SamMask,
): Promise<{ mask: SamMask; regions: number }> {
  const { w, h } = seed
  const px = await imagePixels(image, w, h)
  if (!px) return { mask: seed, regions: 1 }

  const union = new Uint8Array(seed.data)
  const target = meanColor(px, union, w, h)
  if (!target) return { mask: seed, regions: 1 }

  // 색이 유사한 후보 지점 그리드 스캔 (가까운 색부터 시도)
  const stride = Math.max(16, Math.round(Math.min(w, h) / 40))
  const cands: { x: number; y: number; d: number }[] = []
  for (let y = stride >> 1; y < h; y += stride) {
    for (let x = stride >> 1; x < w; x += stride) {
      if (union[y * w + x]) continue
      const d = colorDist(patchColor(px, x, y, w, h), target)
      if (d <= COLOR_TOL) cands.push({ x, y, d })
    }
  }
  cands.sort((a, b) => a.d - b.d)

  let decodes = 0
  let regions = 1
  for (const c of cands) {
    if (decodes >= MAX_DECODES) break
    if (union[c.y * w + c.x]) continue // 앞서 합쳐진 영역이 이미 덮음
    decodes++
    const m = await decodeSamPoint(image, c.x / w, c.y / h)
    if (!m || m.w !== w || m.h !== h) continue
    // SAM이 잡은 영역의 평균 색도 기준과 일치해야 같은 재질로 인정
    const mc = meanColor(px, m.data, w, h)
    if (!mc || colorDist(mc, target) > COLOR_TOL) continue
    let added = 0
    for (let i = 0; i < w * h; i++) {
      if (m.data[i] && !union[i]) {
        union[i] = 255
        added++
      }
    }
    if (added > 50) regions++
  }

  return { mask: { data: union, w, h, score: seed.score }, regions }
}
