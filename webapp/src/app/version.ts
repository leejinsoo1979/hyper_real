export const APP_VERSION = '1.0.6'
export const UPDATE_MANIFEST_URL = 'https://hyper-real-3vvh.vercel.app/latest.json'

export interface UpdateManifest {
  version: string
  releasedAt?: string
  title?: string
  notes?: string[]
  downloadUrl?: string
}

export function isNewerVersion(remote: string, current: string): boolean {
  const remoteParts = remote.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const currentParts = current.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(remoteParts.length, currentParts.length)

  for (let i = 0; i < length; i += 1) {
    const r = remoteParts[i] ?? 0
    const c = currentParts[i] ?? 0
    if (r > c) return true
    if (r < c) return false
  }

  return false
}
