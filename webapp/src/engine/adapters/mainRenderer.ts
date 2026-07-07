import type { RenderInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'
import { callGemini, useMock } from '../geminiClient'
import { callOpenAIImage } from '../openaiClient'

// ── Mock (development) ─────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function renderMainMock(input: RenderInput): Promise<NodeResult> {
  await delay(2000)
  return {
    image: input.image,
    resolution: input.resolution,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Gemini (production) ────────────────────────────────────────────────────

const MASK_INSTRUCTION = `\n\n[SELECTION MASK - CRITICAL]\nThe second image is a selection mask. WHITE areas = the ONLY region you may change. BLACK areas = must remain EXACTLY identical to the input image, pixel-faithful. Apply the requested change only inside the white region.`

const MULTI_INPUT_INSTRUCTION = `\n\n[MULTIPLE INPUT IMAGES]\nThe first image is the PRIMARY base — preserve its composition, camera angle, and geometry. The additional images are references: use their materials, style, mood, or elements as described in the prompt when combining them into one result.`

async function renderMainGemini(input: RenderInput): Promise<NodeResult> {
  // Gemini에는 네거티브 파라미터가 없으므로 프롬프트에 AVOID 섹션으로 합성
  let fullPrompt = input.negativePrompt
    ? `${input.prompt}\n\n[NEGATIVE - MUST AVOID]\n${input.negativePrompt}`
    : input.prompt
  if (input.mask) fullPrompt += MASK_INSTRUCTION
  if (input.extraImages?.length) fullPrompt += MULTI_INPUT_INSTRUCTION

  const result = await callGemini({
    image: input.image,
    extraImages: input.extraImages,
    maskImage: input.mask ?? undefined,
    prompt: fullPrompt,
    engine: input.engine,
  })

  if (!result.image) {
    // 원본을 슬쩍 돌려주면 "렌더링이 안 된다"로 보인다 - 명시적으로 실패시킬 것
    throw new Error(
      result.text
        ? `AI가 이미지를 반환하지 않았습니다: ${result.text.slice(0, 200)}`
        : 'AI가 이미지를 반환하지 않았습니다',
    )
  }

  return {
    image: `data:image/png;base64,${result.image}`,
    resolution: input.resolution,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── OpenAI (gpt-image-1) ───────────────────────────────────────────────────

async function renderMainOpenAI(input: RenderInput): Promise<NodeResult> {
  let fullPrompt = input.negativePrompt
    ? `${input.prompt}\n\n[NEGATIVE - MUST AVOID]\n${input.negativePrompt}`
    : input.prompt
  if (input.mask) fullPrompt += MASK_INSTRUCTION
  if (input.extraImages?.length) fullPrompt += MULTI_INPUT_INSTRUCTION

  // OpenAI는 마스크 전용 파라미터 형식(투명영역)이 달라서 참조 이미지로 전달하고
  // 프롬프트 지시 + (클래식의) 픽셀 강제 합성으로 영역을 보장한다
  const extras = [...(input.mask ? [input.mask] : []), ...(input.extraImages ?? [])]
  const b64 = await callOpenAIImage({
    image: input.image,
    extraImages: extras.length > 0 ? extras : undefined,
    prompt: fullPrompt,
  })
  return {
    image: `data:image/png;base64,${b64}`,
    resolution: input.resolution,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Exported switcher ──────────────────────────────────────────────────────

// 정책(2026-07-06): 사용자 개별 API 키로만 렌더링한다.
// 서버 프록시(운영자 키 + 크레딧) 경로는 사용하지 않는다 — 서비스 운영 시 재도입 예정.
// 키가 없으면 geminiClient.getApiKey()가 Settings 등록 안내 에러를 던진다.
export async function renderMain(input: RenderInput): Promise<NodeResult> {
  if (useMock()) return renderMainMock(input)
  // 제공사 디스패치: 모델 id 접두사로 판별 (등록: engine/imageModels.ts)
  if (input.engine?.startsWith('gpt-')) return renderMainOpenAI(input)
  return renderMainGemini(input)
}
