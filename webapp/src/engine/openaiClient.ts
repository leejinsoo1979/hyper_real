// ---------------------------------------------------------------------------
// OpenAI 이미지 API 클라이언트 — gpt-image-1 (이미지 → 이미지 편집/렌더)
//
// POST https://api.openai.com/v1/images/edits (multipart)
//   image[]  : 기본 이미지 + 참조 이미지들 (gpt-image-1은 다중 입력 지원)
//   prompt   : 지시문 (Gemini와 동일한 프롬프트를 그대로 사용)
//   quality  : high, size: auto (입력 종횡비 따라감)
// 응답: { data: [{ b64_json }] }
// api.openai.com은 CORS를 허용하므로 개인 키 정책(클라이언트 직접 호출)에 부합.
// ---------------------------------------------------------------------------

const OPENAI_KEY_STORAGE = 'vizmaker.openaiApiKey'
const OPENAI_BASE = 'https://api.openai.com/v1'
const REQUEST_TIMEOUT_MS = 180_000

export function getStoredOpenAIApiKey(): string | null {
  try {
    const v = localStorage.getItem(OPENAI_KEY_STORAGE)
    return v && v.trim().length > 0 ? v.trim() : null
  } catch {
    return null
  }
}

export function setStoredOpenAIApiKey(key: string): void {
  try {
    if (key.trim().length === 0) localStorage.removeItem(OPENAI_KEY_STORAGE)
    else localStorage.setItem(OPENAI_KEY_STORAGE, key.trim())
  } catch {
    // localStorage 접근 불가 환경은 무시
  }
}

/** data URI / raw base64 → Blob (multipart 파일 파트용) */
function toBlob(image: string): Blob {
  let mime = 'image/png'
  let b64 = image
  if (image.startsWith('data:')) {
    const comma = image.indexOf(',')
    mime = image.slice(5, image.indexOf(';')) || 'image/png'
    b64 = image.slice(comma + 1)
  } else if (image.startsWith('/9j/')) {
    mime = 'image/jpeg'
  }
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export interface OpenAIImageOptions {
  image: string
  extraImages?: string[]
  prompt: string
  signal?: AbortSignal
}

/** gpt-image-1 이미지 편집 호출. base64(PNG)를 반환한다. */
export async function callOpenAIImage(opts: OpenAIImageOptions): Promise<string> {
  const key = getStoredOpenAIApiKey()
  if (!key) {
    throw new Error('OpenAI API Key가 없습니다. Settings → API Keys에서 OpenAI 키를 저장하세요.')
  }

  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('prompt', opts.prompt.slice(0, 32_000))
  form.append('quality', 'high')
  form.append('size', 'auto') // 입력 이미지 종횡비를 따라감 (우리 소스는 16:9)
  form.append('n', '1')
  form.append('image[]', toBlob(opts.image), 'input.png')
  for (const [i, extra] of (opts.extraImages ?? []).entries()) {
    form.append('image[]', toBlob(extra), `ref-${i + 1}.png`)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  opts.signal?.addEventListener('abort', () => controller.abort())

  try {
    const res = await fetch(`${OPENAI_BASE}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) {
      let detail = ''
      try {
        const err = (await res.json()) as { error?: { message?: string } }
        detail = err.error?.message ?? ''
      } catch { /* 본문 없음 */ }
      if (res.status === 401) throw new Error(`OpenAI 인증 실패 (401). Settings의 OpenAI API Key를 확인하세요. ${detail}`)
      if (res.status === 403) throw new Error(`OpenAI 권한 오류 (403). gpt-image-1 사용은 조직 인증(Verify Organization)이 필요할 수 있습니다. ${detail}`)
      if (res.status === 429) throw new Error(`OpenAI 사용량 한도 초과 (429). Billing 크레딧을 확인하세요. ${detail}`)
      throw new Error(`OpenAI 이미지 생성 실패 (${res.status}): ${detail}`)
    }
    const data = (await res.json()) as { data?: { b64_json?: string }[] }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) throw new Error('OpenAI 응답에 이미지가 없습니다')
    return b64
  } finally {
    clearTimeout(timer)
  }
}
