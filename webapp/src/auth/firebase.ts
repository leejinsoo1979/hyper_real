import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

// ---------------------------------------------------------------------------
// Firebase 클라이언트 (Lumanova SaaS)
// - VITE_FIREBASE_* 환경변수가 전부 있어야 활성화
// - 없으면 null 반환 → AuthGate가 개발 모드로 우회
// ---------------------------------------------------------------------------

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

let app: FirebaseApp | null = null

export function firebaseEnabled(): boolean {
  const bypass = String(import.meta.env.VITE_DEV_BYPASS_AUTH ?? '') === 'true'
  return !bypass && Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId)
}

export function getFirebaseAuth(): Auth | null {
  if (!firebaseEnabled()) return null
  if (!app) {
    app = initializeApp({
      apiKey: cfg.apiKey!,
      authDomain: cfg.authDomain!,
      projectId: cfg.projectId!,
      appId: cfg.appId!,
    })
  }
  return getAuth(app)
}

/** 서버 API 호출용 Bearer 토큰 (SaaS 모드가 아니면 null) */
export async function getIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth()
  if (!auth?.currentUser) return null
  return auth.currentUser.getIdToken()
}
