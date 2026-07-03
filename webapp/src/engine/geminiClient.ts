// ---------------------------------------------------------------------------
// Gemini API Client
//
// Design inspired by nano_banana_renderer/services/api_client.rb:
//   - Typed error hierarchy (not a 1:1 translation)
//   - Exponential back-off retry on transient failures
//   - System instruction for composition preservation
//   - MIME detection from base64 prefix
// ---------------------------------------------------------------------------

// ── Error hierarchy ────────────────────────────────────────────────────────

export class GeminiError extends Error {
  status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

export class AuthError extends GeminiError {
  constructor(message = 'Invalid or missing API key') {
    super(message, 401)
    this.name = 'AuthError'
  }
}

export class RateLimitError extends GeminiError {
  constructor(message = 'Rate limit exceeded — try again later') {
    super(message, 429)
    this.name = 'RateLimitError'
  }
}

export class ContentFilterError extends GeminiError {
  reason: string
  constructor(reason: string) {
    super(`Content blocked: ${reason}`)
    this.name = 'ContentFilterError'
    this.reason = reason
    this.status = 200 // response was 200, just filtered
  }
}

export class ServerError extends GeminiError {
  constructor(status: number) {
    super(`Gemini server error (${status})`)
    this.name = 'ServerError'
    this.status = status
  }
}

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
// gemini-2.0-* 계열은 2026-07 Google이 폐기함(404) — BRIEFING.md §5 참조
const DEFAULT_MODEL = 'gemini-2.5-flash-image' // Nanobanana
const TEXT_MODEL = 'gemini-2.5-flash' // 텍스트 분석/프롬프트 생성 전용
const MAX_RETRIES = 2
const REQUEST_TIMEOUT_MS = 120_000

// Maps engine field value → actual Gemini API model identifier
const ENGINE_MODEL_MAP: Record<string, string> = {
  main: 'gemini-2.5-flash-image', // Nanobanana
  'experimental-exterior': 'gemini-3-pro-image', // Nanobanana Pro
  'experimental-interior': 'gemini-3-pro-image',
}

// Scene-composition-preserving system instruction.
// Ensures AI only changes textures/lighting, never layout or objects.
// 플러그인 api_client.rb LOCKED_SYSTEM_INSTRUCTION과 동일 (실전 검증본)
const SYSTEM_INSTRUCTION = `You are an image-to-image transformation tool, NOT a creative image generator.

ABSOLUTE REQUIREMENTS:
1. The output image MUST have the EXACT SAME composition as the input image
2. Every object in the input MUST appear in the output at the EXACT SAME position and size
3. The camera angle, perspective, and framing MUST be identical
4. You are ONLY allowed to change textures and lighting - NOTHING else
5. DO NOT add ANY new objects (no plants, rugs, mirrors, decorations, furniture)
6. DO NOT remove ANY existing objects
7. DO NOT move, resize, or rotate ANY objects

Your task is TEXTURE ENHANCEMENT only:
- Convert flat 3D surfaces to photorealistic materials
- Add realistic lighting and shadows
- Make it look like a real photograph of the SAME scene

If you change the composition or add/remove objects, you have FAILED the task.`

// ── Helpers ────────────────────────────────────────────────────────────────

// Settings 페이지에서 저장하는 API Key (Electron 배포에서는 .env가 없으므로 이 경로가 기본)
const API_KEY_STORAGE = 'vizmaker.geminiApiKey'

export function getStoredApiKey(): string | null {
  try {
    const v = localStorage.getItem(API_KEY_STORAGE)
    return v && v.trim().length > 0 ? v.trim() : null
  } catch {
    return null
  }
}

export function setStoredApiKey(key: string): void {
  try {
    if (key.trim().length === 0) localStorage.removeItem(API_KEY_STORAGE)
    else localStorage.setItem(API_KEY_STORAGE, key.trim())
  } catch {
    // storage unavailable — ignore
  }
}

function resolveApiKey(): string | null {
  const stored = getStoredApiKey()
  if (stored) return stored
  const env = import.meta.env.VITE_GEMINI_API_KEY
  return env && env.trim().length > 0 ? env.trim() : null
}

export function useMock(): boolean {
  const flag = import.meta.env.VITE_USE_MOCK
  if (flag === 'true' || flag === '1') return true
  // No API key → fall back to mock silently
  return resolveApiKey() === null
}

function getApiKey(): string {
  const key = resolveApiKey()
  if (!key) {
    throw new AuthError('API key is not set — Settings에서 입력하세요')
  }
  return key
}

function resolveModel(engine?: string): string {
  // 1) Explicit env override
  const envModel = import.meta.env.VITE_GEMINI_MODEL
  if (envModel && envModel.trim().length > 0) return envModel.trim()

  // 2) Engine → model mapping
  if (engine && engine in ENGINE_MODEL_MAP) return ENGINE_MODEL_MAP[engine]

  // 3) Default
  return DEFAULT_MODEL
}

/** Detect MIME type from the first few chars of raw base64 data. */
function detectMimeType(base64: string): string {
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('R0lGOD')) return 'image/gif'
  if (base64.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

/** Strip `data:…;base64,` prefix and return raw base64 + detected mimeType. */
function stripDataUri(input: string): { base64: string; mimeType: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/)
  if (match) return { mimeType: match[1], base64: match[2] }
  return { mimeType: detectMimeType(input), base64: input }
}

/** Exponential back-off: 1 s, 2 s, 4 s … */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 16_000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Core API call ──────────────────────────────────────────────────────────

export interface GeminiResult {
  image: string | null // raw base64 (no data-URI prefix)
  text: string | null
}

export interface CallGeminiOptions {
  image: string // data URI or raw base64
  prompt: string
  engine?: string // maps to model
  systemInstruction?: string // override default
  responseModalities?: ('TEXT' | 'IMAGE')[]
  signal?: AbortSignal // caller-side cancellation (e.g. cancel button)
}

export async function callGemini(
  opts: CallGeminiOptions,
): Promise<GeminiResult> {
  const apiKey = getApiKey()
  const sysText = opts.systemInstruction ?? SYSTEM_INSTRUCTION
  const modalities = opts.responseModalities ?? ['TEXT', 'IMAGE']
  const textOnly = modalities.length === 1 && modalities[0] === 'TEXT'
  // 텍스트 분석은 이미지 모델이 아닌 텍스트 모델 사용
  const model = textOnly ? TEXT_MODEL : resolveModel(opts.engine)
  const { base64, mimeType } = stripDataUri(opts.image)

  const generationConfig: Record<string, unknown> = {
    responseModalities: modalities,
  }
  if (textOnly) {
    // gemini-2.5-flash는 thinking이 기본 ON — 분석 용도에는 불필요하고 매우 느려짐 (50초+ → 수초)
    generationConfig['thinkingConfig'] = { thinkingBudget: 0 }
  }

  const body = {
    system_instruction: { parts: [{ text: sysText }] },
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: opts.prompt },
        ],
      },
    ],
    generationConfig,
  }

  return sendWithRetry(model, apiKey, body, 0, opts.signal)
}

// ── HTTP layer with retry ──────────────────────────────────────────────────

async function sendWithRetry(
  model: string,
  apiKey: string,
  body: unknown,
  attempt: number,
  callerSignal?: AbortSignal,
): Promise<GeminiResult> {
  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onCallerAbort = () => controller.abort()
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
  if (callerSignal?.aborted) controller.abort()

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    // 사용자 취소는 재시도하지 않고 즉시 전파
    if (callerSignal?.aborted) {
      throw new GeminiError('Cancelled by user')
    }
    // Network error or abort (timeout)
    if (attempt < MAX_RETRIES) {
      await sleep(backoffMs(attempt))
      return sendWithRetry(model, apiKey, body, attempt + 1, callerSignal)
    }
    throw new GeminiError(
      `Request failed after ${MAX_RETRIES + 1} attempts: ${String(err)}`,
    )
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }

  // ── Status-based error handling ──
  switch (res.status) {
    case 200:
      return parseResponse(await res.json())

    case 401:
    case 403:
      throw new AuthError()

    case 429: {
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt))
        return sendWithRetry(model, apiKey, body, attempt + 1, callerSignal)
      }
      throw new RateLimitError()
    }

    default:
      if (res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt))
          return sendWithRetry(model, apiKey, body, attempt + 1, callerSignal)
        }
        throw new ServerError(res.status)
      }
      throw new GeminiError(
        `Unexpected response ${res.status}: ${await res.text()}`,
        res.status,
      )
  }
}

// ── Response parsing ───────────────────────────────────────────────────────

function parseResponse(data: Record<string, unknown>): GeminiResult {
  const candidates = data['candidates'] as
    | Array<{ content?: { parts?: Array<Record<string, unknown>> } }>
    | undefined

  if (!candidates || candidates.length === 0) {
    // Check for safety filter
    const feedback = data['promptFeedback'] as
      | { blockReason?: string }
      | undefined
    if (feedback?.blockReason) {
      throw new ContentFilterError(feedback.blockReason)
    }
    return { image: null, text: null }
  }

  const parts = candidates[0]?.content?.parts
  if (!parts) return { image: null, text: null }

  const result: GeminiResult = { image: null, text: null }

  for (const part of parts) {
    if (typeof part['text'] === 'string') {
      result.text = part['text'] as string
    }
    const inline = part['inlineData'] as
      | { data?: string }
      | undefined
    if (inline?.data) {
      result.image = inline.data
    }
  }

  return result
}
