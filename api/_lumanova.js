// ---------------------------------------------------------------------------
// Lumanova SaaS 서버 공통 (Vercel Functions)
// - Firebase ID 토큰 검증: 구글 공개 JWKS 사용 (서비스 계정 불필요)
// - Firestore 접근: 사용자 본인 토큰으로 REST 호출 (보안 규칙이 감액-전용을 강제)
// - Gemini 호출: 서버 보유 GEMINI_API_KEY (클라이언트에 절대 노출 금지)
// ---------------------------------------------------------------------------
import { createRemoteJWKSet, jwtVerify } from 'jose'

const PROJECT_ID = 'lumanova-24e9b'
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com'),
)

export const COSTS = { main: 1, pro: 4, auto_prompt: 1 }

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

/** Authorization 헤더의 Firebase ID 토큰 검증. 실패 시 null. */
export async function verifyUser(req) {
  try {
    const auth = req.headers['authorization'] ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return null
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    })
    if (!payload.sub) return null
    return { uid: payload.sub, email: payload.email ?? null, token }
  } catch {
    return null
  }
}

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

export async function fsFetch(path, { method = 'GET', body, token, query = '' } = {}) {
  const res = await fetch(`${FS_BASE}${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

/** 잔액 조회. 문서가 없으면 가입 보너스 30으로 생성. */
export async function getBalance(user) {
  const doc = await fsFetch(`/credits/${user.uid}`, { token: user.token })
  if (doc.ok) {
    return Number(doc.json.fields?.balance?.integerValue ?? 0)
  }
  if (doc.status === 404) {
    const created = await fsFetch(`/credits?documentId=${user.uid}`, {
      method: 'POST',
      token: user.token,
      body: { fields: { balance: { integerValue: '30' } } },
    })
    if (created.ok) return 30
  }
  throw new Error(`credits read failed: ${doc.status}`)
}

/**
 * 크레딧 차감 (감액-전용 규칙이 서버·클라이언트 조작 모두 차단).
 * 성공 시 차감 후 잔액, 잔액 부족/규칙 거부 시 null.
 */
export async function spendCredits(user, cost) {
  const balance = await getBalance(user)
  if (balance < cost) return null
  const next = balance - cost
  const upd = await fsFetch(`/credits/${user.uid}`, {
    method: 'PATCH',
    token: user.token,
    query: '?updateMask.fieldPaths=balance',
    body: { fields: { balance: { integerValue: String(next) } } },
  })
  return upd.ok ? next : null
}

/** 사용 로그 기록 (실패해도 본 흐름은 막지 않음). */
export async function logRender(user, engine, cost, status, error = null) {
  const fields = {
    uid: { stringValue: user.uid },
    engine: { stringValue: engine },
    cost: { integerValue: String(cost) },
    status: { stringValue: status },
    createdAt: { timestampValue: new Date().toISOString() },
  }
  if (error) fields.error = { stringValue: String(error).slice(0, 500) }
  await fsFetch(`/users/${user.uid}/renderLogs`, {
    method: 'POST',
    token: user.token,
    body: { fields },
  }).catch(() => {})
}

// ── Gemini ──────────────────────────────────────────────────────────────────
// 프롬프트 공식/시스템 인스트럭션은 webapp geminiClient.ts와 동일 (수정 금지)

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

const MODEL_MAP = { main: 'gemini-2.5-flash-image', pro: 'gemini-3-pro-image' }
const TEXT_MODEL = 'gemini-2.5-flash'

function splitDataUri(image) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(image)
  if (m) return { mimeType: m[1], data: m[2] }
  return { mimeType: 'image/jpeg', data: image }
}

/** 이미지 렌더 (image-to-image). 반환: { image: dataUri } */
const MASK_INSTRUCTION = `\n\n[SELECTION MASK - CRITICAL]\nThe second image is a selection mask. WHITE areas = the ONLY region you may change. BLACK areas = must remain EXACTLY identical to the input image, pixel-faithful. Apply the requested change only inside the white region.`

export async function geminiRender({ engine, image, prompt, negativePrompt, mask = null }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('SERVER_NOT_CONFIGURED: GEMINI_API_KEY missing')
  const model = MODEL_MAP[engine] ?? MODEL_MAP.main

  let fullPrompt = prompt
  if (negativePrompt && negativePrompt.trim()) {
    fullPrompt += `\n\n[NEGATIVE - MUST AVOID]\n${negativePrompt.trim()}`
  }
  if (mask) fullPrompt += MASK_INSTRUCTION
  const { mimeType, data } = splitDataUri(image)
  const parts = [{ inlineData: { mimeType, data } }]
  if (mask) {
    const mk = splitDataUri(mask)
    parts.push({ inlineData: { mimeType: mk.mimeType, data: mk.data } })
  }
  parts.push({ text: fullPrompt })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    },
  )
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`GEMINI_${res.status}: ${json.error?.message ?? 'unknown'}`)
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part) throw new Error('GEMINI_NO_IMAGE')
  return { image: `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}` }
}

/** 텍스트 생성 (Auto 프롬프트). */
export async function geminiText({ image, instruction }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('SERVER_NOT_CONFIGURED: GEMINI_API_KEY missing')
  const { mimeType, data } = splitDataUri(image)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType, data } }, { text: instruction }] }],
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  )
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`GEMINI_${res.status}: ${json.error?.message ?? 'unknown'}`)
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text.trim()) throw new Error('GEMINI_EMPTY_TEXT')
  return { text }
}
