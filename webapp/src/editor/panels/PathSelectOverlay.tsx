// ---------------------------------------------------------------------------
// 펜툴/자석툴 선택 오버레이 — 포토샵식 수동 영역 선택
//
// - 펜툴(pen): 클릭으로 꼭짓점을 찍어 다각형을 만든다 (직선 연결)
// - 자석툴(magnet): 클릭 앵커 사이를 livewire가 이미지 경계를 따라 연결
//
// 공통 조작: 첫 점 근처 클릭/더블클릭/Enter = 닫기, Esc = 취소,
// Backspace = 마지막 점 삭제. 닫을 때 Shift = 기존 선택에 추가,
// Alt = 기존 선택에서 빼기. 결과는 aiSelMask 파이프라인(선택 영역만 편집).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { useClassicStore } from '../../state/classicStore'
import { maskToHighlightOverlay } from '../../engine/segmentPoint'
import { LivewireMap } from '../../engine/livewire'

type Pt = [number, number] // 이미지 비율 좌표

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** 다각형(비율 좌표) → 원본 해상도 이진 마스크. combine으로 기존 마스크와 합성 */
async function polygonToMask(
  image: string,
  boundary: Pt[],
  existing: string | null,
  combine: 'replace' | 'add' | 'subtract',
): Promise<string | null> {
  const img = await loadImage(image)
  if (!img) return null
  const W = img.naturalWidth
  const H = img.naturalHeight
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)
  if (existing && combine !== 'replace') {
    const ex = await loadImage(existing)
    if (ex) ctx.drawImage(ex, 0, 0, W, H)
  }
  ctx.beginPath()
  boundary.forEach(([fx, fy], i) => {
    if (i === 0) ctx.moveTo(fx * W, fy * H)
    else ctx.lineTo(fx * W, fy * H)
  })
  ctx.closePath()
  if (combine === 'subtract') {
    ctx.fillStyle = '#000000'
  } else {
    ctx.fillStyle = '#ffffff'
  }
  ctx.fill()
  return c.toDataURL('image/png')
}

export function PathSelectOverlay({ image, mode }: { image: string; mode: 'pen' | 'magnet' }) {
  const aiSelOverlay = useClassicStore((st) => st.aiSelOverlay)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 확정된 앵커와 앵커 사이 경로 (자석: livewire 폴리라인 / 펜: [시작,끝])
  const anchorsRef = useRef<Pt[]>([])
  const segmentsRef = useRef<Pt[][]>([])
  const previewRef = useRef<Pt[] | null>(null)
  const livewireRef = useRef<LivewireMap | null>(null)
  const [, setTick] = useState(0) // 앵커 변화 시 리렌더용
  const rafRef = useRef(0)

  // 자석툴: 엣지 맵 준비 (이미지당 1회)
  useEffect(() => {
    anchorsRef.current = []
    segmentsRef.current = []
    previewRef.current = null
    livewireRef.current = null
    if (mode !== 'magnet') return
    let cancelled = false
    useClassicStore.getState().set({ statusText: '자석툴: 경계 인식 준비 중…' })
    void LivewireMap.build(image).then((m) => {
      if (cancelled) return
      livewireRef.current = m
      useClassicStore.getState().set({
        statusText: m
          ? '자석툴: 클릭으로 시작 — 경계를 따라 선이 붙습니다 (Enter=완료, Esc=취소)'
          : '자석툴: 경계 인식 실패 — 펜툴 방식(직선)으로 동작합니다',
      })
    })
    return () => { cancelled = true }
  }, [image, mode])

  useEffect(() => {
    if (mode === 'pen') {
      useClassicStore.getState().set({
        statusText: '펜툴: 점을 찍어 영역을 그리세요 — 첫 점 클릭/Enter=완료, Esc=취소 (Shift=추가, Alt=빼기)',
      })
    }
  }, [mode])

  const posFromEvent = (e: React.MouseEvent): Pt | null => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width
    const fy = (e.clientY - r.top) / r.height
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return null
    return [fx, fy]
  }

  const segmentTo = (to: Pt): Pt[] => {
    const anchors = anchorsRef.current
    const from = anchors[anchors.length - 1]
    if (mode === 'magnet' && livewireRef.current) {
      return livewireRef.current.path(from[0], from[1], to[0], to[1])
    }
    return [from, to]
  }

  const boundaryPoints = (withPreview: boolean): Pt[] => {
    const pts: Pt[] = []
    for (const seg of segmentsRef.current) pts.push(...seg)
    if (withPreview && previewRef.current) pts.push(...previewRef.current)
    if (pts.length === 0 && anchorsRef.current.length > 0) pts.push(...anchorsRef.current)
    return pts
  }

  const finishSelection = async (e: { shiftKey: boolean; altKey: boolean }) => {
    const anchors = anchorsRef.current
    if (anchors.length < 3) {
      cancelSelection()
      return
    }
    // 마지막 앵커 → 첫 앵커 닫기 경로
    const closing = mode === 'magnet' && livewireRef.current
      ? livewireRef.current.path(
          anchors[anchors.length - 1][0], anchors[anchors.length - 1][1],
          anchors[0][0], anchors[0][1],
        )
      : [anchors[anchors.length - 1], anchors[0]]
    const boundary = [...boundaryPoints(false), ...closing]
    const st = useClassicStore.getState()
    const combine = e.shiftKey && st.aiSelMask ? 'add' : e.altKey && st.aiSelMask ? 'subtract' : 'replace'
    const mask = await polygonToMask(image, boundary, st.aiSelMask, combine)
    anchorsRef.current = []
    segmentsRef.current = []
    previewRef.current = null
    setTick((t) => t + 1)
    if (!mask) return
    const overlay = await maskToHighlightOverlay(mask)
    useClassicStore.getState().set({
      aiSelMask: mask,
      aiSelOverlay: overlay,
      aiSelLabel: mode === 'pen' ? '펜 선택' : '자석 선택',
      statusText: combine === 'add'
        ? '선택 영역 추가됨 — 계속 그리거나 생성/재질 적용하세요'
        : combine === 'subtract'
          ? '선택 영역에서 제외됨'
          : '영역 선택됨 — 프롬프트 입력 후 생성하면 이 영역만 변경됩니다 (계속 그리면 Shift=추가)',
    })
  }

  const cancelSelection = () => {
    anchorsRef.current = []
    segmentsRef.current = []
    previewRef.current = null
    setTick((t) => t + 1)
  }

  // 키보드: Enter=완료, Esc=취소, Backspace=마지막 점 삭제
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && anchorsRef.current.length >= 3) {
        e.preventDefault()
        void finishSelection({ shiftKey: e.shiftKey, altKey: e.altKey })
      } else if (e.key === 'Escape') {
        cancelSelection()
      } else if (e.key === 'Backspace' && anchorsRef.current.length > 0) {
        e.preventDefault()
        anchorsRef.current = anchorsRef.current.slice(0, -1)
        segmentsRef.current = segmentsRef.current.slice(0, -1)
        previewRef.current = null
        setTick((t) => t + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, mode])

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const pos = posFromEvent(e)
    if (!pos) return
    const anchors = anchorsRef.current
    // 첫 점 근처 클릭 = 닫기
    if (anchors.length >= 3) {
      const [fx0, fy0] = anchors[0]
      const cv = canvasRef.current
      const near = cv
        ? Math.hypot((pos[0] - fx0) * cv.clientWidth, (pos[1] - fy0) * cv.clientHeight) < 12
        : false
      if (near) {
        void finishSelection(e)
        return
      }
    }
    if (anchors.length > 0) segmentsRef.current = [...segmentsRef.current, segmentTo(pos)]
    anchorsRef.current = [...anchors, pos]
    previewRef.current = null
    setTick((t) => t + 1)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (anchorsRef.current.length >= 3) void finishSelection(e)
  }

  const lastPreviewRef = useRef<Pt | null>(null)
  const onMove = (e: React.MouseEvent) => {
    if (anchorsRef.current.length === 0) return
    const pos = posFromEvent(e)
    if (!pos) return
    const last = lastPreviewRef.current
    if (last && Math.abs(last[0] - pos[0]) < 0.003 && Math.abs(last[1] - pos[1]) < 0.003) return
    lastPreviewRef.current = pos
    previewRef.current = segmentTo(pos)
  }

  // 렌더 루프: 경로 + 앵커 + 프리뷰 (마칭 앤츠 대시)
  useEffect(() => {
    const draw = (t: number) => {
      rafRef.current = requestAnimationFrame(draw)
      const cv = canvasRef.current
      if (!cv) return
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (w === 0 || h === 0) return
      if (cv.width !== w || cv.height !== h) {
        cv.width = w
        cv.height = h
      }
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)

      const drawPolyline = (pts: Pt[], dashed: boolean) => {
        if (pts.length < 2) return
        ctx.beginPath()
        pts.forEach(([fx, fy], i) => {
          if (i === 0) ctx.moveTo(fx * w, fy * h)
          else ctx.lineTo(fx * w, fy * h)
        })
        ctx.lineWidth = 2
        ctx.setLineDash(dashed ? [6, 4] : [])
        ctx.lineDashOffset = dashed ? -(t / 40) % 10 : 0
        ctx.strokeStyle = '#00f0c8'
        ctx.shadowColor = 'rgba(0,0,0,0.7)'
        ctx.shadowBlur = 2
        ctx.stroke()
        ctx.setLineDash([])
        ctx.shadowBlur = 0
      }

      for (const seg of segmentsRef.current) drawPolyline(seg, false)
      if (previewRef.current) drawPolyline(previewRef.current, true)

      const anchors = anchorsRef.current
      anchors.forEach(([fx, fy], i) => {
        ctx.beginPath()
        ctx.arc(fx * w, fy * h, i === 0 ? 5 : 3.5, 0, Math.PI * 2)
        ctx.fillStyle = i === 0 ? '#ffffff' : '#00f0c8'
        ctx.strokeStyle = '#063f36'
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.stroke()
      })
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

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
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: 'crosshair' }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onMouseMove={onMove}
      />
    </>
  )
}
