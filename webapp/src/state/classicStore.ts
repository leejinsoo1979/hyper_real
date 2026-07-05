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

  // 영역 선택 (오브젝트 ID 마스크 기반)
  selectMode: boolean
  maskUri: string | null
  maskMap: { color: string; material: string }[]
  selectedColors: string[]
  resultMaskView: boolean

  // 씬별 미리보기 캐시 (탭 클릭 즉시 표시용 - 레거시 방식)
  scenePreviews: Record<string, string>
  previewOverride: string | null
  lastSceneClicked: string | null

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

  selectMode: false,
  maskUri: null,
  maskMap: [],
  selectedColors: [],
  resultMaskView: false,

  scenePreviews: {},
  previewOverride: null,
  lastSceneClicked: null,

  set: (partial) => set(partial),
}))
