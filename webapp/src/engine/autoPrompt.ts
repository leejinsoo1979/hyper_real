// ---------------------------------------------------------------------------
// Auto Prompt 엔진 — nano_banana_renderer/services/prompt_engine.rb 포팅
//
// 검증된 설계 (BRIEFING v2 §5):
//   - 3-Layer 구조: 구조 고정 → 씬 컨텍스트(이미지 분석) → 사용자 스타일
//   - 텍스트 모델(gemini-2.5-flash) + thinkingBudget 0 (geminiClient가 처리)
//   - 네거티브 파싱: 섹션 제목 변형([NEGATIVE PROMPT - ...]) 허용, 실패 시 기본값
// ---------------------------------------------------------------------------
import { callGemini, useMock } from './geminiClient'
import { useGraphStore } from '../state/graphStore'

export type TimePreset = 'day' | 'evening' | 'night'

// ── 조명 설명 (prompt_engine.rb build_lighting_description 포팅) ────────────

export function buildLightingDescription(time: TimePreset, lightsOn: boolean): string {
  const timeDesc =
    time === 'evening'
      ? 'warm evening sunset tones through windows'
      : time === 'night'
        ? 'dark exterior through windows, nighttime atmosphere'
        : 'bright natural daylight through windows'

  const lightDesc = lightsOn
    ? 'interior lights ON, warm artificial illumination'
    : 'artificial lights OFF, ambient light only'

  return `${timeDesc}, ${lightDesc}, soft shadows, global illumination, realistic light bounce`
}

// ── AI 인스트럭션 템플릿 (get_ai_instruction_template 포팅) ─────────────────
// 차이점: 웹앱은 SketchUp 재질 목록에 접근할 수 없으므로,
// 이미지에서 재질을 직접 분석하도록 지시한다.

function buildInstruction(styleHint: string, lightingDesc: string): string {
  return `[CRITICAL TASK]
You must generate a detailed photorealistic rendering prompt for this interior/architectural scene.
This is an IMAGE-TO-IMAGE transformation task. The goal is to convert a 3D model render into a professional photograph.

[ABSOLUTE CONSTRAINTS - MUST BE INCLUDED IN PROMPT]
1. PRESERVE EXACT COMPOSITION: Every wall, floor, ceiling, window, door must stay in the EXACT same position
2. NO ADDITIONS: Do NOT add any objects, furniture, mirrors, handles, plants, decorations, or accessories
3. NO REMOVALS: Do NOT remove anything that exists in the source image
4. SAME ROOM ONLY: The output must look like the SAME space photographed professionally

[SOURCE MATERIALS]
Analyze the visible surfaces in the input image (floor, walls, ceiling, furniture) and describe their materials precisely in the prompt. Keep every material type identical to the source.

[REQUIRED PROMPT STRUCTURE]
Generate a prompt following this EXACT format:

---START OF PROMPT---

[INPUT IMAGE PRESERVATION - CRITICAL]
Preserve the EXACT composition, camera angle, and object placement from the input image.
Do NOT add any new objects, furniture, mirrors, door handles, light switches, plants, rugs, or decorative items.
Do NOT remove any existing objects from the scene.
This is a strict image-to-image transformation, not a creative redesign.

[PHOTOREALISTIC TRANSFORMATION]
Transform this 3D render into a professional architectural photograph.
Style: ${styleHint}
Camera: Canon EOS R5 with 24mm f/2.8 lens, professional architectural photography
Quality: 8K resolution, sharp focus, professional color grading

[MATERIAL RENDERING - BASED ON SOURCE]
(Describe each visible surface's material. For EVERY material, demand photorealistic imperfections:
- Wood surfaces: visible grain texture, subtle scratches, natural wood imperfections
- Wall/plaster surfaces: realistic paint texture, subtle shadows, minor surface variations
- Stone/marble: realistic veining depth, slight surface wear, natural reflections
- Floor surfaces: realistic texture with wear patterns and reflections
- Glass surfaces: realistic reflections, subtle smudges, proper transparency
- Metal surfaces: realistic reflections, subtle fingerprints, appropriate finish
Never describe a surface as perfectly clean or flawless.)

[LIGHTING SETUP]
${lightingDesc}
- Soft natural shadows with realistic falloff
- Global illumination and realistic light bounce
- Subtle ambient occlusion in corners and edges

[PHOTO REALISM DETAILS]
- Natural lens characteristics: subtle vignette, minimal chromatic aberration
- Realistic depth of field with natural bokeh
- Film-like quality with subtle grain (ISO 200-400)
- Professional white balance and color temperature

[NEGATIVE PROMPT - MUST AVOID]
black outlines, visible edges, sketch lines, wireframe appearance, 3D render look, CGI appearance, computer graphics, clean perfect surfaces, uniform flat lighting, artificial plastic look, cartoon style, illustration, oversaturated, HDR artifacts

---END OF PROMPT---

[YOUR OUTPUT]
Generate ONLY the prompt content between the START/END markers.
Do NOT include any explanations, comments, or additional text.`
}

// ── 네거티브 기본값 (prompt_engine.rb와 동일) ────────────────────────────────

const DEFAULT_NEGATIVE =
  'adding new objects, extra furniture, plants, vases, decor, clutter, sketchup, wireframe, 3d model, cartoon, lines, edges, cgi, render artifacts, simplified textures, low quality, blurry, architectural changes, remodeling'

const REQUIRED_NEGATIVE_PREFIX =
  'adding new objects, extra furniture, plants, vases, decor, sketchup, wireframe, '

// ── 응답 파싱 (generate_auto_prompt 파싱 로직 포팅) ─────────────────────────

export interface AutoPromptResult {
  prompt: string
  negativePrompt: string
}

export function parseAutoPromptResponse(raw: string): AutoPromptResult {
  // [STRICT / [INPUT / [OUTPUT / [ABSOLUTE 로 시작하는 부분부터 사용
  const startMatch = raw.match(/(\*?\*?\[STRICT|\[INPUT|\[OUTPUT|\[ABSOLUTE)/)
  let clean = startMatch ? raw.slice(startMatch.index!) : raw
  // END 마커 제거
  clean = clean.replace(/---\s*END OF PROMPT\s*---[\s\S]*$/i, '').trim()

  let mainPrompt = clean
  let negativePrompt = ''

  // 섹션 제목 변형 허용: [NEGATIVE], [NEGATIVE PROMPT - MUST AVOID] 등
  const negMatch = clean.match(/\[NEGATIVE[^\]]*\]\s*([\s\S]+)/i)
  if (negMatch) {
    negativePrompt = negMatch[1].replace(/---[\s\S]*$/, '').trim()
    mainPrompt = clean.replace(/\[NEGATIVE[^\]]*\][\s\S]*$/i, '').trim()
  }

  if (negativePrompt.length === 0) {
    negativePrompt = DEFAULT_NEGATIVE
  }
  if (!negativePrompt.toLowerCase().includes('adding new objects')) {
    negativePrompt = REQUIRED_NEGATIVE_PREFIX + negativePrompt
  }

  return { prompt: mainPrompt, negativePrompt }
}

// ── 상류 이미지 찾기 ─────────────────────────────────────────────────────────

export function getUpstreamImage(nodeId: string): string | null {
  const { nodes, edges } = useGraphStore.getState()
  const incoming = edges.find((e) => e.to === nodeId)
  if (!incoming) return null
  const upstream = nodes.find((n) => n.id === incoming.from)
  if (!upstream) return null
  const resultImage = upstream.result?.image
  if (resultImage) return resultImage
  if ('image' in upstream.params && typeof upstream.params.image === 'string') {
    return upstream.params.image || null
  }
  return null
}

// ── 메인 진입점 ──────────────────────────────────────────────────────────────

export interface GenerateAutoPromptOptions {
  image: string
  style?: string
  timePreset: TimePreset
  lightsOn: boolean
  signal?: AbortSignal
}

export async function generateAutoPrompt(
  opts: GenerateAutoPromptOptions,
): Promise<AutoPromptResult> {
  const styleHint = opts.style?.trim() || 'modern luxury interior'
  const lighting = buildLightingDescription(opts.timePreset, opts.lightsOn)

  // API Key 없는 mock 모드: 흐름 검증용 고정 결과
  if (useMock()) {
    await new Promise((r) => setTimeout(r, 1500))
    if (opts.signal?.aborted) throw new Error('Cancelled by user')
    return {
      prompt: `[INPUT IMAGE PRESERVATION - CRITICAL]\nPreserve the EXACT composition from the input image. (mock)\n\n[PHOTOREALISTIC TRANSFORMATION]\nStyle: ${styleHint}\n\n[LIGHTING SETUP]\n${lighting}`,
      negativePrompt: DEFAULT_NEGATIVE,
    }
  }

  const instruction = buildInstruction(styleHint, lighting)
  const result = await callGemini({
    image: opts.image,
    prompt: instruction,
    responseModalities: ['TEXT'], // 텍스트 모델 + thinking OFF 경로
    systemInstruction:
      'You are a prompt engineer for photorealistic architectural rendering. Follow the requested output format exactly.',
    signal: opts.signal,
  })

  if (!result.text || result.text.trim().length === 0) {
    throw new Error('프롬프트 생성 실패: AI 응답이 비어 있습니다')
  }

  return parseAutoPromptResponse(result.text)
}
