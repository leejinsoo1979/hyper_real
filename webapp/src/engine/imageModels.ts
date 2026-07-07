// ---------------------------------------------------------------------------
// 이미지 생성 모델 레지스트리
//
// Settings에 해당 제공사의 API 키가 저장되어 있을 때만 그 모델이
// 렌더 화면 MODEL 드롭다운에 나타난다.
// 새 제공사 추가 방법: ① 클라이언트 파일 작성(예: openaiClient.ts)
// ② 아래 MODELS에 항목 추가 ③ mainRenderer의 디스패치에 분기 추가
// ---------------------------------------------------------------------------

import { getStoredApiKey } from './geminiClient'
import { getStoredOpenAIApiKey } from './openaiClient'

export interface ImageModelInfo {
  /** 모델 식별자 (classicStore.model 값이자 렌더 디스패치 키) */
  id: string
  /** 드롭다운 표시 이름 */
  label: string
  provider: 'gemini' | 'openai'
  /** 이 제공사 키가 저장되어 있는가 (없으면 드롭다운에서 숨김) */
  hasKey: () => boolean
}

const MODELS: ImageModelInfo[] = [
  { id: 'gemini-2.5-flash-image', label: 'Nanobanana (Flash 2.5)', provider: 'gemini', hasKey: () => !!getStoredApiKey() },
  { id: 'gemini-3-pro-image', label: 'Nanobanana Pro (Gemini 3)', provider: 'gemini', hasKey: () => !!getStoredApiKey() },
  { id: 'gpt-image-1', label: 'GPT Image (OpenAI)', provider: 'openai', hasKey: () => !!getStoredOpenAIApiKey() },
]

/** 키가 등록된 제공사의 모델 목록. Gemini 모델은 항상 표시(필수 키라 안내 겸). */
export function availableImageModels(): ImageModelInfo[] {
  return MODELS.filter((m) => m.provider === 'gemini' || m.hasKey())
}

export function imageModelInfo(id: string): ImageModelInfo | undefined {
  return MODELS.find((m) => m.id === id)
}
