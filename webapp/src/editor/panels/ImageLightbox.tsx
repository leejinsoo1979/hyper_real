import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronsLeftRight, X } from 'lucide-react'

/**
 * 전체화면 이미지 확대 보기 (실물 Lumanova의 Enlarge).
 * - Images 모드: 휠 = 줌, 드래그 = 이동, 더블클릭 = 리셋
 * - Compare 모드(compareImage 제공 시): 좌우 드래그 슬라이더로 소스↔결과 비교
 * - ESC/X = 닫기
 */
export function ImageLightbox({ image, compareImage, onClose }: {
  image: string
  compareImage?: string | null
  onClose: () => void
}) {
  const [mode, setMode] = useState<'images' | 'compare'>('images')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  // Compare 슬라이더 (0~1 = 경계선의 가로 위치)
  const [split, setSplit] = useState(0.5)
  const splitDragRef = useRef(false)
  const compareBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.min(6, Math.max(0.2, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    },
    [pan],
  )

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) })
  }, [])

  const endDrag = useCallback(() => {
    dragRef.current = null
  }, [])

  const reset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const updateSplit = useCallback((e: React.MouseEvent) => {
    const box = compareBoxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    setSplit(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
  }, [])

  const comparing = mode === 'compare' && !!compareImage

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 200, backgroundColor: 'rgba(5, 5, 12, 0.95)' }}
      onWheel={comparing ? undefined : onWheel}
      onMouseDown={comparing ? undefined : onMouseDown}
      onMouseMove={comparing ? undefined : onMouseMove}
      onMouseUp={comparing ? undefined : endDrag}
      onMouseLeave={comparing ? undefined : endDrag}
      onDoubleClick={comparing ? undefined : reset}
    >
      {comparing ? (
        /* ── Compare: 좌 = 소스, 우 = 결과, 경계선 드래그 ── */
        <div
          ref={compareBoxRef}
          className="relative"
          style={{ cursor: 'ew-resize', userSelect: 'none' }}
          onMouseDown={(e) => {
            e.stopPropagation()
            splitDragRef.current = true
            updateSplit(e)
          }}
          onMouseMove={(e) => {
            if (splitDragRef.current) updateSplit(e)
          }}
          onMouseUp={() => { splitDragRef.current = false }}
          onMouseLeave={() => { splitDragRef.current = false }}
        >
          <img
            src={image}
            alt=""
            draggable={false}
            style={{ maxWidth: '94vw', maxHeight: '88vh', display: 'block' }}
          />
          <img
            src={compareImage!}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full"
            style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
          />
          {/* 경계선 + 핸들 */}
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: `${split * 100}%`, width: 2, marginLeft: -1, background: '#ffffff', boxShadow: '0 0 6px rgba(0,0,0,0.6)' }}
          />
          <div
            className="pointer-events-none absolute flex items-center justify-center rounded-full"
            style={{
              left: `${split * 100}%`, top: '50%', width: 38, height: 38,
              transform: 'translate(-50%, -50%)',
              background: '#ffffff', color: '#14141c', boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            }}
          >
            <ChevronsLeftRight size={18} />
          </div>
        </div>
      ) : (
        <img
          src={image}
          alt=""
          draggable={false}
          style={{
            maxWidth: '92vw',
            maxHeight: '92vh',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            cursor: dragRef.current ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        />
      )}

      {/* 상단 중앙: Images / Compare 토글 (비교 이미지가 있을 때만) */}
      {compareImage && (
        <div
          className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center rounded-full"
          style={{ background: '#15151e', border: '1px solid #2c2c38', padding: 3 }}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {([['images', 'Images'], ['compare', 'Compare']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className="rounded-full"
              style={{
                padding: '7px 20px', fontSize: 13, fontWeight: 700,
                background: mode === key ? '#ffffff' : 'transparent',
                color: mode === key ? '#14141c' : '#9a9aa6',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 하단 안내 */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded px-3 py-1"
        style={{ backgroundColor: '#1a1a24', color: '#cccccc', fontSize: 12 }}
      >
        {comparing
          ? '드래그: 소스 ↔ 결과 비교 · ESC: 닫기'
          : `${Math.round(zoom * 100)}% — 휠: 줌 · 드래그: 이동 · 더블클릭: 원래대로 · ESC: 닫기`}
      </div>

      {/* 닫기 */}
      <button
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: '#1a1a24', color: '#ffffff' }}
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <X size={18} />
      </button>
    </div>
  )
}
