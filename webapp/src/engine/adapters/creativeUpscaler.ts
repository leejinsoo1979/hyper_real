import type { UpscaleInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'
import { callGemini, useMock } from '../geminiClient'

// ── Mock (development) ─────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function upscaleCreativeMock(input: UpscaleInput): Promise<NodeResult> {
  await delay(3000)
  return {
    image: input.image,
    resolution: `${input.scale}x upscaled`,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Gemini (production) ────────────────────────────────────────────────────
// Krea 스타일 실사 업스케일: Nano Banana Pro(gemini-3-pro-image)에
// 2K/4K 출력을 직접 요청하면서 동일 구도 재생성 + 마이크로 디테일 강화.
// (기존 구현은 출력 해상도를 요청하지 않아 결과가 그대로 1K였음)
// 슬라이더 → 지시문 매핑: creativity(재해석 허용), detailStrength(질감 강화),
// similarity(원본 고정 강도), promptStrength(사용자 프롬프트 가중치)

function level(v: number): 'off' | 'low' | 'mid' | 'high' {
  if (v <= 0.05) return 'off'
  if (v < 0.35) return 'low'
  if (v < 0.7) return 'mid'
  return 'high'
}

function buildUpscalePrompt(input: UpscaleInput, size: '2K' | '4K'): string {
  const lines: string[] = [
    `[PHOTOREAL UPSCALE ${input.scale}x → ${size}]`,
    `Re-render this exact image at ${size} resolution as a flawless, hyper-realistic photograph shot on a full-frame camera.`,
  ]

  // similarity: 원본 고정 강도 (기본도 강하게, high면 픽셀 수준 요구)
  const sim = level(input.similarity)
  lines.push(
    sim === 'high'
      ? '[FIDELITY - ABSOLUTE] Every object, edge, color and light must match the original pixel-for-pixel. Zero deviation allowed.'
      : '[FIDELITY] Keep the composition, camera angle, geometry, object placement, colors and lighting identical to the original.',
  )

  // creativity: 재해석 허용 범위
  const cre = level(input.creativity)
  if (cre === 'off' || cre === 'low') {
    lines.push('[CREATIVITY: MINIMAL] Do not invent, add, remove or restyle anything. Only resolve existing detail more sharply.')
  } else if (cre === 'mid') {
    lines.push('[CREATIVITY: MODERATE] You may subtly enrich material realism (wood grain, fabric weave, stone veining, metal reflections) where the original is blurry, without changing any object.')
  } else {
    lines.push('[CREATIVITY: HIGH] Reimagine ambiguous or low-detail areas with richer photorealistic materials and lighting nuance, while keeping composition and objects in place.')
  }

  // detailStrength: 질감/마이크로 디테일 강화 강도
  const det = level(input.detailStrength)
  if (det !== 'off') {
    const strength = det === 'high' ? 'aggressively' : det === 'mid' ? 'clearly' : 'gently'
    lines.push(`[DETAIL ENHANCEMENT] ${strength.charAt(0).toUpperCase() + strength.slice(1)} enhance micro-textures: surface grain, fabric threads, reflections, soft shadows, natural light falloff, crisp edges.`)
  }

  // optimizedFor 모드
  const opt = input.optimizedFor === 'detail'
    ? 'Prioritize maximum texture detail and sharpness.'
    : input.optimizedFor === 'smooth'
      ? 'Prioritize clean, noise-free smooth surfaces and gradients; avoid over-sharpening.'
      : 'Balance sharpness and natural smoothness.'
  lines.push(`[MODE] ${opt}`)

  // 사용자 프롬프트 (promptStrength 가중치)
  const userPrompt = input.prompt?.trim()
  if (userPrompt && userPrompt.toLowerCase() !== 'upscale') {
    const ps = level(input.promptStrength)
    lines.push(
      ps === 'high'
        ? `[USER DIRECTION - PRIORITIZE] ${userPrompt}`
        : `[USER DIRECTION] ${userPrompt}`,
    )
  }

  lines.push('[OUTPUT] Noise-free, artifact-free, DSLR-grade photorealism. No text, no watermark, no border.')
  return lines.join('\n')
}

async function upscaleCreativeGemini(input: UpscaleInput): Promise<NodeResult> {
  const size: '2K' | '4K' = input.scale >= 4 ? '4K' : '2K'

  const sysInstruction =
    'You are a professional photographic upscaler (like Krea/Magnific enhance). ' +
    'Your ONLY job is to re-render the given image at a higher resolution with photorealistic detail. ' +
    'The output must read as the same photograph, just captured with a far better camera.'

  const result = await callGemini({
    image: input.image,
    prompt: buildUpscalePrompt(input, size),
    systemInstruction: sysInstruction,
    imageSize: size, // gemini-3-pro-image 고해상도 출력 (2K/4K)
  })

  const outputImage = result.image
    ? `data:image/png;base64,${result.image}`
    : input.image

  return {
    image: outputImage,
    resolution: `${size} (${input.scale}x)`,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Exported switcher ──────────────────────────────────────────────────────

export async function upscaleCreative(input: UpscaleInput): Promise<NodeResult> {
  return useMock() ? upscaleCreativeMock(input) : upscaleCreativeGemini(input)
}
