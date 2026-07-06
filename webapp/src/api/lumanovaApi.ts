import { firebaseEnabled, getIdToken } from '../auth/firebase'

// ---------------------------------------------------------------------------
// Lumanova SaaS 서버 API 클라이언트
// - SaaS 모드(firebaseEnabled)일 때만 사용. 개발 모드는 기존 로컬 키 직접 호출.
// - Electron(file://)에서는 배포 도메인으로, 웹에서는 동일 오리진으로 호출.
// ---------------------------------------------------------------------------

const PRODUCTION_API_BASE = 'https://hyper-real-3vvh.vercel.app'

const API_BASE = window.location.host.endsWith('vercel.app')
  ? ''
  : PRODUCTION_API_BASE

export function saasMode(): boolean {
  return firebaseEnabled()
}

export class InsufficientCreditsError extends Error {
  balance: number
  constructor(balance: number) {
    super(`크레딧이 부족합니다 (잔액 ${balance})`)
    this.balance = balance
  }
}

async function call(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const token = await getIdToken()
  if (!token) throw new Error('로그인이 필요합니다')
  const res = await fetch(`${API_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.status === 402) throw new InsufficientCreditsError(Number(json.balance ?? 0))
  if (!res.ok) throw new Error(`${json.error ?? res.status}: ${json.detail ?? ''}`)
  return json
}

/** 서버 렌더 프록시. 반환: { image, balance } */
export async function apiRender(opts: {
  engine: 'main' | 'pro'
  image: string
  prompt: string
  negativePrompt?: string
  mask?: string
}): Promise<{ image: string; balance: number }> {
  const r = await call('/api/render', opts)
  return { image: String(r.image), balance: Number(r.balance) }
}

/** 서버 Auto 프롬프트. 반환: { text, balance } */
export async function apiAutoPrompt(opts: { image: string; instruction: string }): Promise<{ text: string; balance: number }> {
  const r = await call('/api/auto-prompt', opts)
  return { text: String(r.text), balance: Number(r.balance) }
}

/** 내 정보 (이메일/잔액). */
export async function apiMe(): Promise<{ email: string | null; balance: number }> {
  const r = await call('/api/me')
  return { email: (r.email as string) ?? null, balance: Number(r.balance) }
}

export interface HistoryItemDTO {
  id: string
  clientId: string
  engine: string
  cost: number
  status: string
  kind: string
  prompt: string
  thumbnail: string
  sourceThumbnail: string
  createdAt: string
}

export async function apiHistory(limit = 50): Promise<{ items: HistoryItemDTO[] }> {
  const r = await call(`/api/history?limit=${limit}`)
  return { items: (r.items as HistoryItemDTO[] | undefined) ?? [] }
}

export async function apiSaveHistory(opts: {
  clientId?: string
  thumbnail: string
  sourceThumbnail?: string
  prompt?: string
  engine?: string
  cost?: number
  createdAt?: string
}): Promise<{ ok: boolean; id: string }> {
  const r = await call('/api/history', opts)
  return { ok: Boolean(r.ok), id: String(r.id ?? '') }
}
