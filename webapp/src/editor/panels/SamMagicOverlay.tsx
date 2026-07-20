// ---------------------------------------------------------------------------
// 업로드 이미지 매직툴 실시간 오버레이 — 브라우저 SAM 기반
//
// SketchUp ID 마스크가 없는 업로드/미연결 이미지에서 hover 실시간 영역
// 하이라이트를 제공한다. 이미지당 1회 인코딩(백그라운드 워커) 후,
// 마우스 이동마다 포인트 디코딩(수십 ms)으로 마스크를 받아 외곽선을 그린다.
// 클릭하면 그 마스크를 기존 aiSelMask 파이프라인(선택 영역만 편집)에 넘긴다.
//
// SAM 로드/인코딩 실패 시(오프라인 등) 포인터를 통과시켜 기존 Gemini 클릭
// 세그멘테이션 폴백이 그대로 동작한다.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react'
import { useClassicStore } from '../../state/classicStore'
import { prepareSam, decodeSamPoint, samMaskToDataUrl, type SamMask } from '../../engine/sam/samSession'
import { maskToHighlightOverlay } from '../../engine/segmentPoint'

const HOVER_READY_TEXT = '매직: 마우스를 올리면 영역이 실시간 인식됩니다 — 클릭하면 선택 (Shift+클릭: 영역 추가)'

/** 기존 선택 마스크(dataURL)와 새 마스크의 합집합 dataURL */
async function unionMasks(existing: string, add: string, w: number, h: number): Promise<string | null> {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('마스크 로드 실패'))
    img.src = src
  })
  try {
    const [a, b] = await Promise.all([load(existing), load(add)])
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(a, 0, 0, w, h)
    ctx.globalCompositeOperation = 'lighten'
    ctx.drawImage(b, 0, 0, w, h)
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

export function SamMagicOverlay({ image }: { image: string }) {
  const samStatus = useClassicStore((st) => st.samStatus)
  const aiSelOverlay = useClassicStore((st) => st.aiSelOverlay)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const busyRef = useRef(false)
  const latestRef = useRef<{ fx: number; fy: number } | null>(null)
  const lastMaskRef = useRef<(SamMask & { fx: number; fy: number }) | null>(null)

  // 이미지 인코딩 준비 (모듈이 이미지당 1회로 중복 제거)
  useEffect(() => {
    let cancelled = false
    void prepareSam(image).then((ok) => {
      if (cancelled) return
      const st = useClassicStore.getState()
      if (st.sourceTool !== 'magic') return
      st.set({
        statusText: ok
          ? HOVER_READY_TEXT
          : '매직: 실시간 인식을 사용할 수 없습니다 — 객체를 클릭하면 AI가 영역을 인식합니다',
      })
    })
    return () => { cancelled = true }
  }, [image])

  // hover 마스크 그리기: 틸 외곽선(2회 팽창) + 은은한 채움
  const drawHover = (mask: SamMask | null) => {
    const cv = canvasRef.current
    if (!cv) return
    if (!mask) {
      cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height)
      return
    }
    const { data, w, h } = mask
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
    }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const edge = new Uint8Array(w * h)
    for (let p = 0; p < w * h; p++) {
      if (!data[p]) continue
      const x = p % w
      const y = (p / w) | 0
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
          !data[p - 1] || !data[p + 1] || !data[p - w] || !data[p + w]) {
        edge[p] = 1
      }
    }
    const out = ctx.createImageData(w, h)
    const px = out.data
    for (let p = 0; p < w * h; p++) {
      if (!data[p]) continue
      // 외곽선은 이웃 팽창으로 화면 축소 시에도 보이는 두께 확보
      const x = p % w
      const y = (p / w) | 0
      const isEdge = edge[p] ||
        (x > 1 && edge[p - 2]) || (x < w - 2 && edge[p + 2]) ||
        (y > 1 && edge[p - 2 * w]) || (y < h - 2 && edge[p + 2 * w]) ||
        edge[p - 1] || edge[p + 1] || edge[p - w] || edge[p + w]
      const i = p * 4
      px[i] = 0
      px[i + 1] = 240
      px[i + 2] = 200
      px[i + 3] = isEdge ? 255 : 42
    }
    ctx.clearRect(0, 0, w, h)
    ctx.putImageData(out, 0, 0)
  }

  // 디코딩 큐: 진행 중이면 최신 좌표만 유지 (중간 좌표는 버린다)
  const requestDecode = (fx: number, fy: number) => {
    const last = lastMaskRef.current
    if (last && Math.abs(last.fx - fx) < 0.004 && Math.abs(last.fy - fy) < 0.004) return
    latestRef.current = { fx, fy }
    if (busyRef.current) return
    busyRef.current = true
    void (async () => {
      while (latestRef.current) {
        const p = latestRef.current
        latestRef.current = null
        const m = await decodeSamPoint(image, p.fx, p.fy)
        lastMaskRef.current = m ? { ...m, fx: p.fx, fy: p.fy } : null
        drawHover(m)
      }
      busyRef.current = false
    })()
  }

  const posFromEvent = (e: React.MouseEvent): { fx: number; fy: number } | null => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width
    const fy = (e.clientY - r.top) / r.height
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return null
    return { fx, fy }
  }

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation() // Gemini 클릭 폴백(AspectFitBox onPick) 중복 실행 방지
    const pos = posFromEvent(e)
    if (!pos) return
    const additive = e.shiftKey
    // hover로 이미 받은 마스크가 그 지점 것이면 재사용, 아니면 즉시 디코딩
    const last = lastMaskRef.current
    const mask = last && Math.abs(last.fx - pos.fx) < 0.01 && Math.abs(last.fy - pos.fy) < 0.01
      ? last
      : await decodeSamPoint(image, pos.fx, pos.fy)
    if (!mask) return
    let maskUri = samMaskToDataUrl(mask)
    if (!maskUri) return
    const st = useClassicStore.getState()
    if (additive && st.aiSelMask) {
      maskUri = (await unionMasks(st.aiSelMask, maskUri, mask.w, mask.h)) ?? maskUri
    }
    const overlay = await maskToHighlightOverlay(maskUri)
    useClassicStore.getState().set({
      aiSelMask: maskUri,
      aiSelOverlay: overlay,
      aiSelLabel: '선택 영역',
      statusText: additive && st.aiSelMask
        ? '매직: 영역 추가됨 — 프롬프트 입력 후 생성하면 선택 영역만 변경됩니다'
        : '매직: 영역 선택됨 — 프롬프트 입력 후 생성하면 이 영역만 변경됩니다',
    })
  }

  // 준비 전/실패: 포인터를 통과시켜 기존 클릭(Gemini) 경로 유지
  const interactive = samStatus === 'ready'

  return (
    <>
      {aiSelOverlay && (
        <img
          src={aiSelOverlay}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full"
          draggable={false}
        />
      )}
      {interactive && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ cursor: 'crosshair' }}
          onMouseMove={(e) => {
            const pos = posFromEvent(e)
            if (pos) requestDecode(pos.fx, pos.fy)
          }}
          onMouseLeave={() => {
            latestRef.current = null
            lastMaskRef.current = null
            drawHover(null)
          }}
          onClick={(e) => { void onClick(e) }}
        />
      )}
      {samStatus === 'loading' && (
        <div
          className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-1"
          style={{ background: 'rgba(8,10,12,0.78)', color: '#9be8d8', fontSize: 10.5, fontWeight: 600 }}
        >
          AI 영역 인식 준비 중…
        </div>
      )}
    </>
  )
}
