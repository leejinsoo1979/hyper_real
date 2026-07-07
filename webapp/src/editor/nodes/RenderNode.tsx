import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { NodeStatus, RenderParams } from '../../types/node'

type RenderNodeData = {
  status: NodeStatus
  params: RenderParams
  resultImage: string | null
}

type RenderNodeType = Node<RenderNodeData, 'RENDER'>

function getRenderLabel(engine: RenderParams['engine']): string {
  switch (engine) {
    case 'main':
      return 'Nanobanana'
    case 'experimental-exterior':
      return 'Nanobanana Pro'
    case 'experimental-interior':
      return 'Nanobanana Pro'
    default:
      // 제공사 모델 id 직접 지정 (예: gpt-image-1 → GPT Image)
      return engine.startsWith('gpt-') ? 'GPT Image' : engine
  }
}

export const RenderNode = memo(function RenderNode({ data, selected }: NodeProps<RenderNodeType>) {
  const label1 = getRenderLabel(data.params.engine)
  const prompt = data.params.prompt || ''
  const label2 = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt

  return (
    <BaseNode
      selected={selected}
      status={data.status}
      thumbnail={data.resultImage}
      label1={label1}
      label2={label2}
      hasInput={true}
      hasOutput={true}
    />
  )
})
