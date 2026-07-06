// ---------------------------------------------------------------------------
// xAI (Grok Imagine) API 클라이언트 — 이미지 → 영상 생성
//
// 비동기 API: 생성 요청 → request_id 폴링 → 완료 시 영상 URL 반환
//   POST https://api.x.ai/v1/videos/generations  → { request_id }
//   GET  https://api.x.ai/v1/videos/{request_id} → { status, video: { url } }
// status: pending | done | failed | expired
// api.x.ai는 CORS(*)를 허용하므로 브라우저에서 직접 호출한다.
// ---------------------------------------------------------------------------

const XAI_KEY_STORAGE = 'vizmaker.xaiApiKey'
const XAI_BASE = 'https://api.x.ai/v1'
const XAI_VIDEO_MODEL = 'grok-imagine-video-1.5'
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 10 * 60 * 1000

export function getStoredXaiApiKey(): string | null {
  try {
    const v = localStorage.getItem(XAI_KEY_STORAGE)
    return v && v.trim().length > 0 ? v.trim() : null
  } catch {
    return null
  }
}

export function setStoredXaiApiKey(key: string): void {
  try {
    if (key.trim().length === 0) localStorage.removeItem(XAI_KEY_STORAGE)
    else localStorage.setItem(XAI_KEY_STORAGE, key.trim())
  } catch {
    // localStorage 접근 불가 환경은 무시
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 원본 이미지 문자열(raw base64 / data URI / http URL)을 API가 받는 형태로 정규화 */
function toImageUrl(image: string): string {
  if (image.startsWith('data:') || image.startsWith('http')) return image
  const mime =
    image.startsWith('iVBOR') ? 'image/png'
    : image.startsWith('/9j/') ? 'image/jpeg'
    : image.startsWith('UklGR') ? 'image/webp'
    : 'image/png'
  return `data:${mime};base64,${image}`
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text.slice(0, 300)
  } catch {
    return ''
  }
}

export interface GrokVideoOptions {
  image: string
  prompt: string
  duration: number
}

function buildVideoPrompt(prompt: string): string {
  const trimmed = prompt.trim()
  const direction = trimmed.length > 0
    ? trimmed
    : 'Generate a minimal premium camera drift with subtle parallax, natural exposure breathing, and maximum fidelity to the source image.'

  return `[CREATIVE DIRECTION]
${direction}

[SOURCE IMAGE PRESERVATION - CRITICAL]
- Treat the input image as the locked source frame.
- Preserve the exact subject identity, architecture, room layout, object placement, furniture, materials, colors, lighting direction, proportions, and camera framing.
- Do not add objects, remove objects, redesign the scene, change product details, alter logos/text, change human identity, or invent new background elements.

[CAMERA AND MOTION]
- Use professional stabilized camera movement appropriate to the selected template.
- Keep movement smooth, physically plausible, and restrained unless the creative direction explicitly asks for stronger motion.
- Add believable parallax, lens breathing, depth-of-field, exposure roll-off, and atmospheric motion only when they support the shot.
- Keep vertical architectural lines stable and preserve scale relationships.

[VIDEO QUALITY]
- Photorealistic premium commercial video quality.
- Smooth temporal consistency, clean edges, stable textures, realistic reflections, no frame-to-frame flicker.
- No melting, warping, object drift, geometry bending, extra limbs, duplicated objects, or perspective jumps.
- No added captions, watermarks, subtitles, UI, logos, or graphic overlays.`
}

/** Grok Imagine으로 이미지 → 영상 생성. 완료된 영상 URL을 반환한다. */
export async function generateGrokVideo(opts: GrokVideoOptions): Promise<string> {
  const key = getStoredXaiApiKey()
  if (!key) {
    throw new Error('xAI API Key가 없습니다. Settings → API Keys에서 Grok(xAI) 키를 저장하세요.')
  }

  const startRes = await fetch(`${XAI_BASE}/videos/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: XAI_VIDEO_MODEL,
      prompt: buildVideoPrompt(opts.prompt),
      image: { url: toImageUrl(opts.image) },
      duration: opts.duration,
    }),
  })
  if (!startRes.ok) {
    if (startRes.status === 401 || startRes.status === 403) {
      throw new Error(`xAI 영상 생성 권한 오류 (${startRes.status}). Settings의 Grok(xAI) API Key, Billing 충전, 영상 생성 모델 권한을 확인하세요. ${await readError(startRes)}`)
    }
    throw new Error(`xAI 영상 생성 요청 실패 (${startRes.status}): ${await readError(startRes)}`)
  }
  const started = (await startRes.json()) as { request_id?: string }
  if (!started.request_id) {
    throw new Error('xAI 응답에 request_id가 없습니다')
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    const res = await fetch(`${XAI_BASE}/videos/${started.request_id}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) {
      // 일시 오류(5xx)는 다음 폴링에서 재시도, 4xx는 즉시 중단
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`xAI 영상 상태 조회 실패 (${res.status}): ${await readError(res)}`)
      }
      continue
    }
    const data = (await res.json()) as {
      status?: string
      video?: { url?: string }
      error?: { code?: string; message?: string }
    }
    if (data.status === 'done') {
      if (!data.video?.url) throw new Error('xAI 응답에 영상 URL이 없습니다')
      return data.video.url
    }
    if (data.status === 'failed' || data.status === 'expired') {
      throw new Error(`xAI 영상 생성 실패 (${data.status}): ${data.error?.message ?? '원인 미상'}`)
    }
  }
  throw new Error('xAI 영상 생성 시간 초과 (10분)')
}
