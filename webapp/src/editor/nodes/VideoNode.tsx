import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { Play } from 'lucide-react'
import { BaseNode } from './BaseNode'
import type { NodeStatus, VideoParams } from '../../types/node'

type VideoNodeData = {
  status: NodeStatus
  params: VideoParams
  resultImage: string | null
  resultVideo: string | null
  error: string | null
  onOpenPreview?: () => void
}

type VideoNodeType = Node<VideoNodeData, 'VIDEO'>

export const VideoNode = memo(function VideoNode({ data, selected }: NodeProps<VideoNodeType>) {
  const prompt = data.params.prompt || ''
  const label2 = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt

  const playOverlay = data.resultVideo ? (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.08)' }}>
      <style>{`
        .video-node-play {
          transform: scale(1);
          transition: transform 140ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
        }
        .video-node-play:hover {
          transform: scale(1.08);
          background-color: rgba(0, 201, 167, 0.92) !important;
          border-color: rgba(143, 255, 232, 0.82) !important;
          box-shadow: 0 0 0 5px rgba(0,201,167,.16), 0 16px 30px rgba(0,0,0,.48) !important;
        }
        .video-node-play:active {
          transform: scale(.98);
        }
      `}</style>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          data.onOpenPreview?.()
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
        title="Play video"
        className="video-node-play pointer-events-auto flex items-center justify-center rounded-full"
        style={{
          width: 42,
          height: 42,
          backgroundColor: 'rgba(0,0,0,0.62)',
          border: '1px solid rgba(255,255,255,.18)',
          boxShadow: '0 10px 22px rgba(0,0,0,.42)',
          cursor: 'pointer',
        }}
      >
        <Play size={18} color="#ffffff" fill="#ffffff" />
      </button>
    </div>
  ) : null

  return (
    <BaseNode
      selected={selected}
      status={data.status}
      thumbnail={data.resultImage}
      label1="4. Image to video"
      label2={label2 || undefined}
      hasInput={true}
      hasOutput={true}
      inputPortName="image"
      secondInputPortName="endFrame"
      overlay={playOverlay}
      error={data.error}
    />
  )
})
