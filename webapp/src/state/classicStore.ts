import { create } from 'zustand'

// ---------------------------------------------------------------------------
// 클래식 렌더 화면 상태 (레거시 루비 창 UI의 상태 그대로)
// ---------------------------------------------------------------------------

export type ClassicModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image'
export type ClassicSize = '1024' | '1536' | '1920'

interface ClassicState {
  timePreset: 'day' | 'evening' | 'night'
  lightsOn: boolean
  model: ClassicModel
  size: ClassicSize
  mirror: boolean

  // 이미지: frozenSource는 Convert/업로드로 고정된 소스 (mirror OFF 시 유지)
  frozenSource: string | null
  resultImage: string | null

  sourcePrompt: string
  sourceNegative: string
  resultPrompt: string
  resultNegative: string

  statusText: string
  rendering: boolean
  sourceLoading: boolean
  autoLoading: boolean

  set: (partial: Partial<ClassicState>) => void
}

export const useClassicStore = create<ClassicState>((set) => ({
  timePreset: 'day',
  lightsOn: true,
  model: 'gemini-2.5-flash-image',
  size: '1024',
  mirror: true,

  frozenSource: null,
  resultImage: null,

  sourcePrompt: '',
  sourceNegative: '',
  resultPrompt: '',
  resultNegative: '',

  statusText: 'Ready',
  rendering: false,
  sourceLoading: false,
  autoLoading: false,

  set: (partial) => set(partial),
}))
