import type { MaskLayer, NodeResult } from './node'

export interface EngineAdapter {
  id: string
  type: 'image' | 'video' | 'upscale'
  execute(input: EngineInput): Promise<NodeResult>
}

export interface RenderInput {
  engine: string
  image: string
  /** 추가 입력 이미지 (그룹 소스 생성 — 여러 노드를 입력으로 연결한 경우) */
  extraImages?: string[]
  prompt: string
  systemPrompt: string
  negativePrompt: string
  seed: number | null
  resolution: string
  /** 선택 영역 마스크 (흰색=변경 허용). 있으면 해당 영역만 편집 */
  mask?: string | null
}

export interface ModifierInput {
  image: string
  prompt: string
  systemPrompt: string
  negativePrompt: string
  mask: string | null
  maskLayers: MaskLayer[]
  materialReferences?: string[]
}

export interface UpscaleInput {
  image: string
  scale: number
  optimizedFor: string
  creativity: number
  detailStrength: number
  similarity: number
  promptStrength: number
  prompt: string
}

export interface VideoInput {
  engine: string
  image: string
  endFrame: string | null
  duration: number
  prompt: string
}

export type EngineInput = RenderInput | ModifierInput | UpscaleInput | VideoInput
