import { useEffect, useState } from 'react'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, type Auth, type User } from 'firebase/auth'

// ---------------------------------------------------------------------------
// Firebase 클라이언트 (Lumanova SaaS)
// - VITE_FIREBASE_* 환경변수가 전부 있어야 활성화
// - 없으면 null 반환 → AuthGate가 개발 모드로 우회
// ---------------------------------------------------------------------------

// Firebase 클라이언트 config는 공개값 (비밀 아님 - 보안은 Firestore 규칙이 담당)
const cfg = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? 'AIzaSyDBVMni4oSxCOtCXEjtZ6WbrnKRQXOGMt0',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? 'lumanova-24e9b.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'lumanova-24e9b',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? '1:1004103656505:web:62ac15a749077e2b8799e8',
}

const DEFAULT_ADMIN_EMAILS = ['uablejs@gmail.com', 'sbbc212@gmail.com']

export function adminEmails(): string[] {
  const envEmails = String(import.meta.env.VITE_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...DEFAULT_ADMIN_EMAILS, ...envEmails])]
}

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && adminEmails().includes(email.toLowerCase()))
}

let app: FirebaseApp | null = null

/**
 * SaaS(로그인+크레딧) 모드 스위치.
 * - VITE_SAAS=true          → SaaS 모드 ON (배포에서 이 env 하나로 전환)
 * - VITE_DEV_BYPASS_AUTH=false → 로컬 개발에서 SaaS 테스트용
 * - 기본값                   → 기존 개발자 모드 (로그인 없음)
 */
export function firebaseEnabled(): boolean {
  const saasOn = String(import.meta.env.VITE_SAAS ?? '') === 'true'
    || String(import.meta.env.VITE_DEV_BYPASS_AUTH ?? '') === 'false'
  return saasOn && Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId)
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


/** 현재 로그인 사용자 (SaaS 모드 아니면 항상 null). */
export function useAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(() => getFirebaseAuth()?.currentUser ?? null)
  useEffect(() => {
    const auth = getFirebaseAuth()
    if (!auth) return
    return onAuthStateChanged(auth, setUser)
  }, [])
  return user
}
