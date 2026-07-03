import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { NodeStatus } from '../../types/node'

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

const borderColorMap: Record<NodeStatus, string> = {
  idle: '#444444',
  queued: '#f0ad4e',
  running: '#00d4aa',
  done: '#ffffff',
  error: '#ff4444',
  cancelled: '#444444',
  blocked: '#44444466',
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
  const borderColor = borderColorMap[status]
  const isBlocked = status === 'blocked'

  return (
    <div
      className="relative"
      style={{
        width: 160,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        border: selected ? '2px dashed #ffffff' : `1px solid ${borderColor}`,
        opacity: isBlocked ? 0.5 : 1,
        transition: 'border-color 300ms, opacity 300ms',
      }}
    >
      {/* Input Handle */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          id={inputPortName}
          style={{
            width: 8,
            height: 8,
            background: '#333333',
            border: '2px solid #888888',
            top: 60,
          }}
        />
      )}

      {/* Second Input Handle (for Compare / Video endFrame) */}
      {secondInputPortName && (
        <Handle
          type="target"
          position={Position.Left}
          id={secondInputPortName}
          style={{
            width: 8,
            height: 8,
            background: '#333333',
            border: '2px solid #888888',
            top: 100,
          }}
        />
      )}

      {/* Thumbnail Area — 캡처(16:9)와 동일 비율로 잘림 없이 표시 */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          backgroundColor: thumbnail ? '#ffffff' : '#1a1a24',
        }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div style={{ color: '#333340', fontSize: 11 }}>No image</div>
        )}

        {/* Running spinner */}
        {status === 'running' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 size={24} color="#00d4aa" className="animate-spin" />
          </div>
        )}

        {/* Error icon */}
        {status === 'error' && (
          <div className="absolute right-2 top-2">
            <AlertTriangle size={16} color="#ff4444" />
          </div>
        )}

        {/* Custom overlay (e.g. video play button) */}
        {overlay}
      </div>

      {/* Label Area */}
      <div
        className="px-2 py-1.5"
        style={{ backgroundColor: '#1a1a24' }}
      >
        <div
          className="truncate"
          style={{ color: '#cccccc', fontSize: 11, lineHeight: '14px' }}
        >
          {label1}
        </div>
        {label2 && (
          <div
            className="truncate"
            style={{ color: '#888888', fontSize: 10, lineHeight: '13px' }}
          >
            {label2}
          </div>
        )}
      </div>

      {/* Output Handle */}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id={outputPortName}
          style={{
            width: 8,
            height: 8,
            background: '#333333',
            border: '2px solid #888888',
            top: 60,
          }}
        />
      )}
    </div>
  )
})
