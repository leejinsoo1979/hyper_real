import { create } from 'zustand'

// ---------------------------------------------------------------------------
// 클래식 렌더 화면 상태 (레거시 루비 창 UI의 상태 그대로)
// ---------------------------------------------------------------------------

export type ClassicModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image' | 'gpt-image-1'
export type ClassicSize = '1024' | '1536' | '1920'

/** 스포이드로 지정한 재질 교체: 어떤 재질을 → 무엇으로 바꿀지 */
export interface MaterialSwap {
  /** 소스 모델의 재질 이름 (ID 마스크에서 식별) */
  material: string
  replacement:
    | { kind: 'library'; name: string; prompt: string; referenceImage?: string | null }
    | { kind: 'image'; name: string; image: string } // 로컬 업로드 (data URI)
  /** 업로드 이미지 스포이드: 같은 재질 전체 영역 마스크 (흰색=교체 대상, SAM 추출) */
  mask?: string | null
}

interface ClassicState {
  timePreset: 'day' | 'evening' | 'night'
  lightsOn: boolean
  model: ClassicModel
  size: ClassicSize
  mirror: boolean

  // 이미지: frozenSource는 Convert/업로드로 고정된 소스 (mirror OFF 시 유지)
  frozenSource: string | null
  resultImage: string | null
  // 마지막 렌더에 입력으로 쓰인 이미지 (확대 보기의 Compare 슬라이더 쌍)
  renderSourceImage: string | null

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

  // 소스 툴바 + 재질 교체 (스포이드로 재질 지정 → 생성 시 적용)
  sourceTool: 'none' | 'eyedropper' | 'pencil' | 'magic' | 'magnet'
  materialSwaps: MaterialSwap[]
  /** 매직툴로 선택한 재질 영역(마스크 색). 있으면 1차 생성이 이 영역만 편집 */
  sourceSelectedColors: string[]
  /** 업로드 이미지 AI 매직 선택 처리 중 */
  aiMagicBusy: boolean
  /** 업로드 이미지 매직툴: AI(Gemini) 세그멘테이션 선택 마스크 (흰색=편집 영역) */
  aiSelMask: string | null
  /** aiSelMask의 화면 표시용 하이라이트 오버레이 PNG */
  aiSelOverlay: string | null
  /** aiSelMask 객체 라벨 (표시용) */
  aiSelLabel: string | null
  /** aiSelMask가 어느 패널 이미지 기준인지 (생성 시 해당 패널 렌더에만 적용) */
  aiSelFor: 'src' | 'res'
  /** 업로드 이미지 매직툴: 브라우저 SAM(실시간 hover 인식) 준비 상태 */
  samStatus: 'idle' | 'loading' | 'ready' | 'error'

  /** 구조 고정: 렌더 시 깊이맵을 함께 보내 형상·카메라를 강제 유지 */
  depthLock: boolean
  /** frozenSource가 브릿지 캡처(Convert)에서 왔는지 — 업로드면 깊이맵 캡처 불가 */
  frozenFromBridge: boolean
  /** RESULT 패널 툴 (스포이드/매직 — 2차 생성 대상 지정) */
  resultTool: 'none' | 'eyedropper' | 'pencil' | 'magic' | 'magnet'
  /** 스타일 참조 이미지 (색·재질·조명 분위기만 참조, data URI) */
  styleRef: string | null
  /** RESULT 선택 영역에 적용할 재질 (매직 선택 + 라이브러리/로컬 이미지) */
  regionMaterial: MaterialSwap['replacement'] | null

  // 씬별 미리보기 캐시 (탭 클릭 즉시 표시용 - 레거시 방식)
  scenePreviews: Record<string, string>
  previewOverride: string | null
  lastSceneClicked: string | null

  set: (partial: Partial<ClassicState>) => void
}

export const useClassicStore = create<ClassicState>((set) => ({
  timePreset: 'day',
  lightsOn: true,
  model: 'gemini-3-pro-image',
  size: '1024',
  mirror: true,

  frozenSource: null,
  resultImage: null,
  renderSourceImage: null,

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

  sourceTool: 'none',
  materialSwaps: [],
  sourceSelectedColors: [],
  aiMagicBusy: false,
  aiSelMask: null,
  aiSelOverlay: null,
  aiSelLabel: null,
  aiSelFor: 'src',
  samStatus: 'idle',

  depthLock: true,
  frozenFromBridge: false,
  resultTool: 'none',
  styleRef: null,
  regionMaterial: null,

  scenePreviews: {},
  previewOverride: null,
  lastSceneClicked: null,

  set: (partial) => set(partial),
}))

// 개발 모드 전용: E2E 테스트에서 스토어 조작용 (프로덕션 번들엔 미포함)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __classicStore?: typeof useClassicStore }).__classicStore = useClassicStore
}
