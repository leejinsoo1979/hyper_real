// ---------------------------------------------------------------------------
// Livewire (Intelligent Scissors) — 자석툴의 엣지 자동 추적 엔진
//
// 포토샵 자석 올가미처럼 두 앵커 사이 경로가 이미지의 경계(엣지)를 따라가게
// 한다. 이미지를 축소해 그레이스케일 소벨 그래디언트를 1회 계산해두고,
// 앵커→커서 경로는 "엣지일수록 싸고 평탄할수록 비싼" 비용 그리드 위에서
// A* 최단 경로로 구한다. 좌표는 전부 이미지 비율(0..1)로 주고받는다.
// ---------------------------------------------------------------------------

const MAX_SIDE = 640
/** 엣지 위 이동 대비 평탄 영역 이동의 최대 비용 배율 */
const FLAT_PENALTY = 18
/** 경로 탐색 범위: 두 점의 바운딩 박스 + 여유 (전체 그리드 탐색 방지) */
const CORRIDOR_MARGIN = 48

export class LivewireMap {
  private cost: Float32Array // 픽셀별 이동 비용 (엣지=낮음)
  private w: number
  private h: number

  private constructor(cost: Float32Array, w: number, h: number) {
    this.cost = cost
    this.w = w
    this.h = h
  }

  static async build(image: string): Promise<LivewireMap | null> {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('이미지 로드 실패'))
        i.src = image
      })
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(2, Math.round(img.naturalWidth * scale))
      const h = Math.max(2, Math.round(img.naturalHeight * scale))
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, w, h)
      const d = ctx.getImageData(0, 0, w, h).data

      const lum = new Float32Array(w * h)
      for (let i = 0; i < w * h; i++) {
        lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
      }
      // 소벨 그래디언트 크기
      const grad = new Float32Array(w * h)
      let gmax = 1
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          const gx =
            lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] -
            lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1]
          const gy =
            lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] -
            lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1]
          const g = Math.sqrt(gx * gx + gy * gy)
          grad[i] = g
          if (g > gmax) gmax = g
        }
      }
      // 비용: 엣지(그래디언트 큼)=1, 평탄=FLAT_PENALTY
      const cost = new Float32Array(w * h)
      for (let i = 0; i < w * h; i++) {
        cost[i] = 1 + (1 - grad[i] / gmax) * (FLAT_PENALTY - 1)
      }
      return new LivewireMap(cost, w, h)
    } catch {
      return null
    }
  }

  /**
   * 두 지점(비율 좌표) 사이의 엣지 추적 경로. 실패 시 직선(두 점)을 반환.
   * 반환 좌표도 비율(0..1).
   */
  path(fx0: number, fy0: number, fx1: number, fy1: number): [number, number][] {
    const { w, h, cost } = this
    const sx = Math.max(0, Math.min(w - 1, Math.round(fx0 * (w - 1))))
    const sy = Math.max(0, Math.min(h - 1, Math.round(fy0 * (h - 1))))
    const tx = Math.max(0, Math.min(w - 1, Math.round(fx1 * (w - 1))))
    const ty = Math.max(0, Math.min(h - 1, Math.round(fy1 * (h - 1))))
    const fallback: [number, number][] = [[fx0, fy0], [fx1, fy1]]
    if (sx === tx && sy === ty) return fallback

    // 탐색 범위 제한 (코리도)
    const x0 = Math.max(0, Math.min(sx, tx) - CORRIDOR_MARGIN)
    const y0 = Math.max(0, Math.min(sy, ty) - CORRIDOR_MARGIN)
    const x1 = Math.min(w - 1, Math.max(sx, tx) + CORRIDOR_MARGIN)
    const y1 = Math.min(h - 1, Math.max(sy, ty) + CORRIDOR_MARGIN)
    const cw = x1 - x0 + 1
    const ch = y1 - y0 + 1
    const N = cw * ch

    const dist = new Float32Array(N).fill(Infinity)
    const prev = new Int32Array(N).fill(-1)
    const visited = new Uint8Array(N)
    const start = (sy - y0) * cw + (sx - x0)
    const goal = (ty - y0) * cw + (tx - x0)
    dist[start] = 0

    // 이진 힙 (A*: 휴리스틱 = 유클리드 거리 × 최소비용 1)
    const heap: number[] = [start]
    const fscore = new Float32Array(N).fill(Infinity)
    const hcost = (i: number) => {
      const ix = i % cw
      const iy = (i / cw) | 0
      const gx = goal % cw
      const gy = (goal / cw) | 0
      return Math.sqrt((ix - gx) ** 2 + (iy - gy) ** 2)
    }
    fscore[start] = hcost(start)
    const heapPush = (n: number) => {
      heap.push(n)
      let i = heap.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (fscore[heap[p]] <= fscore[heap[i]]) break
        ;[heap[p], heap[i]] = [heap[i], heap[p]]
        i = p
      }
    }
    const heapPop = (): number => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length > 0) {
        heap[0] = last
        let i = 0
        for (;;) {
          const l = i * 2 + 1
          const r = l + 1
          let m = i
          if (l < heap.length && fscore[heap[l]] < fscore[heap[m]]) m = l
          if (r < heap.length && fscore[heap[r]] < fscore[heap[m]]) m = r
          if (m === i) break
          ;[heap[m], heap[i]] = [heap[i], heap[m]]
          i = m
        }
      }
      return top
    }

    const DIAG = Math.SQRT2
    let found = false
    let guard = 0
    const maxIter = N * 4
    while (heap.length > 0 && guard++ < maxIter) {
      const cur = heapPop()
      if (visited[cur]) continue
      visited[cur] = 1
      if (cur === goal) {
        found = true
        break
      }
      const cx = cur % cw
      const cy = (cur / cw) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
          const nb = ny * cw + nx
          if (visited[nb]) continue
          const step = dx !== 0 && dy !== 0 ? DIAG : 1
          const nd = dist[cur] + cost[(ny + y0) * w + (nx + x0)] * step
          if (nd < dist[nb]) {
            dist[nb] = nd
            prev[nb] = cur
            fscore[nb] = nd + hcost(nb)
            heapPush(nb)
          }
        }
      }
    }
    if (!found) return fallback

    // 경로 역추적 → 비율 좌표 (다운샘플: 2픽셀 간격이면 충분)
    const pts: [number, number][] = []
    let node = goal
    while (node !== -1) {
      const px = (node % cw) + x0
      const py = ((node / cw) | 0) + y0
      pts.push([px / (w - 1), py / (h - 1)])
      node = prev[node]
    }
    pts.reverse()
    if (pts.length > 2) {
      const thinned: [number, number][] = [pts[0]]
      for (let i = 1; i < pts.length - 1; i += 2) thinned.push(pts[i])
      thinned.push(pts[pts.length - 1])
      return thinned
    }
    return pts
  }
}
