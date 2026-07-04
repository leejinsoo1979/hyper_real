import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { NodeStatus } from '../../types/node'

// ---------------------------------------------------------------------------
// 실물 VizMaker 노드 카드 클론 (docs/reference/vizmaker-ui/ 기준)
// - 이미지가 곧 카드 본체 (라운드, cover)
// - 라벨은 카드 '밖' 아래 중앙: 굵은 제목 + 회색 프롬프트 요약 2줄
// - 포트는 이미지 중앙 높이의 작은 점
// ---------------------------------------------------------------------------

const CARD_W = 240
const IMG_H = Math.round((CARD_W * 9) / 16) // 135

interface BaseNodeProps {
  selected: boolean
  status: NodeStatus
  thumbnail: string | null
  label1: string
  label2?: string
  hasInput: boolean
  hasOutput: boolean
  outputPortName?: string
  inputPortName?: string
  secondInputPortName?: string
  overlay?: ReactNode
}

function frameBorder(status: NodeStatus, selected: boolean): string {
  if (selected) return '2px solid #00c9a7'
  if (status === 'error') return '1px solid #ff4444'
  if (status === 'running') return '1px solid #00c9a7'
  if (status === 'queued') return '1px solid #f0ad4e'
  return '1px solid #2a2a32'
}

// 실물 VizMaker: 연결점은 작은 라운드-사각 칩
const portStyle: React.CSSProperties = {
  width: 13,
  height: 13,
  borderRadius: 4,
  background: '#23232c',
  border: '1px solid #3f3f4a',
}

export const BaseNode = memo(function BaseNode({
  selected,
  status,
  thumbnail,
  label1,
  label2,
  hasInput,
  hasOutput,
  outputPortName = 'image',
  inputPortName = 'image',
  secondInputPortName,
  overlay,
}: BaseNodeProps) {
  const isBlocked = status === 'blocked'

  return (
    <div className="relative" style={{ width: CARD_W, opacity: isBlocked ? 0.45 : 1, transition: 'opacity 300ms' }}>
      {hasInput && (
        <Handle type="target" position={Position.Left} id={inputPortName} style={{ ...portStyle, top: IMG_H / 2 }} />
      )}
      {secondInputPortName && (
        <Handle type="target" position={Position.Left} id={secondInputPortName} style={{ ...portStyle, top: IMG_H / 2 + 34 }} />
      )}

      {/* 이미지 = 카드 본체 */}
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          width: '100%',
          height: IMG_H,
          borderRadius: 10,
          background: '#15151d',
          border: frameBorder(status, selected),
          boxShadow: selected ? '0 0 0 4px rgba(0,201,167,0.12), 0 6px 18px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.45)',
          transition: 'border-color 200ms, box-shadow 200ms',
        }}
      >
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span style={{ color: '#3a3a46', fontSize: 11 }}>No image</span>
        )}

        {status === 'running' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(10,10,14,0.45)' }}>
            <Loader2 size={26} color="#00c9a7" className="animate-spin" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute right-2 top-2">
            <AlertTriangle size={15} color="#ff4444" />
          </div>
        )}
        {overlay}
      </div>

      {/* 라벨: 카드 밖 아래 중앙 (실물 스타일) */}
      <div style={{ marginTop: 8, textAlign: 'center', padding: '0 6px' }}>
        <div className="truncate" style={{ color: '#f2f2f5', fontSize: 12.5, fontWeight: 700, lineHeight: '16px' }}>
          {label1}
        </div>
        {label2 && (
          <div
            style={{
              color: '#8a8a94',
              fontSize: 10.5,
              lineHeight: '14px',
              marginTop: 2,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {label2}
          </div>
        )}
      </div>

      {hasOutput && (
        <Handle type="source" position={Position.Right} id={outputPortName} style={{ ...portStyle, top: IMG_H / 2 }} />
      )}
    </div>
  )
})
