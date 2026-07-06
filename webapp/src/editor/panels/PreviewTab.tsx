import { useCallback, useRef, useState } from 'react'
import type { NodeData } from '../../types/node'

interface PreviewTabProps {
  selectedNode: NodeData | null
}

export function PreviewTab({ selectedNode }: PreviewTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const image = selectedNode?.result?.image ?? null
  const resolution = selectedNode?.result?.resolution ?? null
  const rawVideo = selectedNode?.result?.video ?? null
  const video = rawVideo && rawVideo !== 'mock-video-url' ? rawVideo : null

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((prev) => {
      const next = prev - e.deltaY * 0.001
      return Math.max(0.1, Math.min(5, next))
    })
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      setIsDragging(true)
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      }
    },
    [pan],
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.x),
        y: dragStart.current.panY + (e.clientY - dragStart.current.y),
      })
    },
    [isDragging],
  )

  const onMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  if (!selectedNode) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: 200, color: '#555555', fontSize: 13 }}
      >
        No image selected
      </div>
    )
  }

  if (video) {
    return (
      <div style={{ minHeight: 200, background: '#101018' }}>
        <video
          src={video}
          controls
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster={image ?? undefined}
          className="w-full"
          style={{ display: 'block', background: '#08080d' }}
        />
        <div className="flex items-center justify-between gap-3" style={{ padding: '7px 8px' }}>
          <span className="truncate" style={{ fontSize: 11, color: '#777784' }}>
            Video result
          </span>
          <a href={video} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#00c9a7' }}>
            새 탭에서 열기 / 저장
          </a>
        </div>
      </div>
    )
  }

  if (!image) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: 200, color: '#555555', fontSize: 13 }}
      >
        No result yet
      </div>
    )
  }

  const zoomPercent = Math.round(zoom * 100)

  return (
    <div
      ref={containerRef}
      className="relative select-none overflow-hidden"
      style={{
        minHeight: 200,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Image */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 100ms ease-out',
        }}
      >
        <img
          src={image}
          alt=""
          className="w-full"
          draggable={false}
        />
      </div>

      {/* Zoom & Resolution overlay */}
      <div className="absolute right-2 top-2 flex flex-col items-end gap-0.5">
        <span
          style={{
            fontSize: 12,
            color: '#00c9a7',
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderRadius: 10,
            padding: '1px 8px',
          }}
        >
          {zoomPercent}%
        </span>
        {resolution && (
          <span
            style={{
              fontSize: 10,
              color: '#666666',
            }}
          >
            {resolution}
          </span>
        )}
      </div>
    </div>
  )
}
