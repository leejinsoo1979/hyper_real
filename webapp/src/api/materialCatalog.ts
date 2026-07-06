import { firebaseEnabled, getIdToken } from '../auth/firebase'
import type { MaterialAsset } from '../data/materialLibrary'

const PRODUCTION_API_BASE = 'https://hyper-real-3vvh.vercel.app'
const API_BASE = window.location.host.endsWith('vercel.app') ? '' : PRODUCTION_API_BASE

export async function apiMaterialCatalog(): Promise<MaterialAsset[] | null> {
  if (!firebaseEnabled()) return null
  const token = await getIdToken()
  if (!token) return null
  const res = await fetch(`${API_BASE}/api/material-catalog`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => ({}))
  return Array.isArray(json.materials) ? json.materials as MaterialAsset[] : null
}
