import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { Play } from 'lucide-react'
import { BaseNode } from './BaseNode'
import type { NodeStatus, VideoParams } from '../../types/node'

type VideoNodeData = {
  status: NodeStatus
  params: VideoParams
  resultImage: string | null
  error: string | null
}

type VideoNodeType = Node<VideoNodeData, 'VIDEO'>

export const VideoNode = memo(function VideoNode({ data, selected }: NodeProps<VideoNodeType>) {
  const prompt = data.params.prompt || ''
  const label2 = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt

  const playOverlay = data.resultImage ? (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 36,
          height: 36,
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}
      >
        <Play size={18} color="#ffffff" fill="#ffffff" />
      </div>
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
