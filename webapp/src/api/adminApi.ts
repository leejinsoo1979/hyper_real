import { getIdToken } from '../auth/firebase'
import type { MaterialAsset } from '../data/materialLibrary'

const PRODUCTION_API_BASE = 'https://hyper-real-3vvh.vercel.app'
const API_BASE = window.location.host.endsWith('vercel.app') ? '' : PRODUCTION_API_BASE

async function adminCall<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getIdToken()
  if (!token) throw new Error('관리자 로그인이 필요합니다')
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${json.error ?? res.status}`)
  return json as T
}

export interface AdminMaterial extends MaterialAsset {
  active: boolean
  baseColorPath?: string
  roughnessPath?: string
  normalPath?: string
  createdAt?: string
  updatedAt?: string
}

export interface AdminUser {
  uid: string
  email: string
  balance: number
  plan: string
  createdAt?: string
  updatedAt?: string
}

export async function apiAdminMe(): Promise<{ ok: boolean; email: string; uid: string; role: string }> {
  return adminCall('/api/admin-me')
}

export async function apiAdminMaterials(): Promise<{ items: AdminMaterial[] }> {
  return adminCall('/api/admin-materials')
}

export async function apiSaveAdminMaterial(material: AdminMaterial): Promise<{ ok: boolean; item: AdminMaterial }> {
  return adminCall('/api/admin-materials', { method: 'POST', body: material })
}

export async function apiDeleteAdminMaterial(id: string): Promise<{ ok: boolean }> {
  return adminCall(`/api/admin-materials?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiAdminUsers(): Promise<{ users: AdminUser[] }> {
  return adminCall('/api/admin-users')
}

export async function apiSaveAdminUser(user: AdminUser): Promise<{ ok: boolean; user: AdminUser }> {
  return adminCall('/api/admin-users', { method: 'PATCH', body: user })
}
