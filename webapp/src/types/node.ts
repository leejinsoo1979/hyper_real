export type NodeType = 'SOURCE' | 'RENDER' | 'MODIFIER' | 'UPSCALE' | 'VIDEO' | 'COMPARE'

export type NodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'cancelled' | 'blocked'

export type MaskColor = 'red' | 'green' | 'blue' | 'yellow'

export type MaskAction = 'add' | 'remove' | 'replace' | 'style'

export interface MaskLayer {
  color: MaskColor
  action: MaskAction
  description: string
}

export interface SceneMeta {
  modelName: string
  fov: number
  eye: [number, number, number]
  target: [number, number, number]
  up: [number, number, number]
  shadow: boolean
  style: string
  sceneId: string
}

export interface SourceParams {
  origin: 'sketchup' | 'upload' | 'paste'
  image: string
  cameraLocked: boolean
  sceneMeta: SceneMeta | null
}

export interface RenderParams {
  engine: 'main' | 'experimental-exterior' | 'experimental-interior'
  prompt: string
  negativePrompt: string
  presetId: string | null
  seed: number | null
  resolution: string
  timePreset: 'day' | 'evening' | 'night'
  lightsOn: boolean
}

export interface ModifierParams {
  prompt: string
  presetId: string | null
  mask: string | null
  maskLayers: MaskLayer[]
}

export interface UpscaleParams {
  scale: 2 | 4
  optimizedFor: 'standard' | 'detail' | 'smooth'
  creativity: number
  detailStrength: number
  similarity: number
  promptStrength: number
  prompt: string
}

export interface VideoParams {
  // 실물 VizMaker 엔진 4종 (docs/VIDEO_ANALYSIS.md §6)
  engine: 'kling' | 'seedance' | 'sora' | 'veo'
  duration: 5 | 10
  prompt: string
  endFrameImage: string | null
}

export interface CompareParams {
  mode: 'slider' | 'side_by_side'
}

export type NodeParams =
  | SourceParams
  | RenderParams
  | ModifierParams
  | UpscaleParams
  | VideoParams
  | CompareParams

export interface NodeResult {
  image?: string
  video?: string
  resolution?: string
  timestamp: string
  cacheKey: string
}

export interface NodeData {
  id: string
  type: NodeType
  position: { x: number; y: number }
  status: NodeStatus
  params: NodeParams
  result: NodeResult | null
  cost: number
  version: string
}
