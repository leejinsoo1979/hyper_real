import type { RenderInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'
import { callGemini, useMock } from '../geminiClient'

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

async function renderMainGemini(input: RenderInput): Promise<NodeResult> {
  // Gemini에는 네거티브 파라미터가 없으므로 프롬프트에 AVOID 섹션으로 합성
  const fullPrompt = input.negativePrompt
    ? `${input.prompt}\n\n[NEGATIVE - MUST AVOID]\n${input.negativePrompt}`
    : input.prompt

  const result = await callGemini({
    image: input.image,
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

// ── Exported switcher ──────────────────────────────────────────────────────

export async function renderMain(input: RenderInput): Promise<NodeResult> {
  return useMock() ? renderMainMock(input) : renderMainGemini(input)
}
