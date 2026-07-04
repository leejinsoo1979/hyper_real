import { useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, type User,
} from 'firebase/auth'
import { Loader2 } from 'lucide-react'
import { firebaseEnabled, getFirebaseAuth } from './firebase'

// ---------------------------------------------------------------------------
// 인증 게이트 — SaaS 모드에서만 로그인 요구. 개발 모드(VITE_DEV_BYPASS_AUTH)는 통과.
// ---------------------------------------------------------------------------

export function AuthGate({ children }: { children: ReactNode }) {
  const enabled = firebaseEnabled()
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!enabled)

  useEffect(() => {
    if (!enabled) return
    const auth = getFirebaseAuth()!
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setReady(true)
    })
  }, [enabled])

  if (!enabled) return <>{children}</>
  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: '#0b0b0f' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#00c9a7' }} />
      </div>
    )
  }
  if (!user) return <LoginScreen />
  return <>{children}</>
}

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const auth = getFirebaseAuth()!
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, password)
      else await createUserWithEmailAndPassword(auth, email, password)
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      setError(
        code.includes('invalid-credential') || code.includes('wrong-password') ? '이메일 또는 비밀번호가 올바르지 않습니다'
        : code.includes('email-already-in-use') ? '이미 가입된 이메일입니다'
        : code.includes('weak-password') ? '비밀번호는 6자 이상이어야 합니다'
        : code.includes('invalid-email') ? '이메일 형식이 올바르지 않습니다'
        : `오류: ${code || e}`,
      )
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    const auth = getFirebaseAuth()!
    setError(null)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (e) {
      setError(`Google 로그인 실패: ${(e as { code?: string }).code ?? e}`)
    }
  }

  const input: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 14px', borderRadius: 8,
    background: '#15151d', border: '1px solid #2a2a36', color: '#fff', fontSize: 14,
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3" style={{ background: '#0b0b0f' }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: 1, marginBottom: 4 }}>
        Lumanova
      </div>
      <div style={{ color: '#777788', fontSize: 13, marginBottom: 16 }}>
        AI 실사 렌더링 워크스페이스
      </div>

      <div className="flex w-80 flex-col gap-2.5">
        <input style={input} type="email" placeholder="이메일" value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <input style={input} type="password" placeholder="비밀번호" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {error && <div style={{ color: '#ff6666', fontSize: 12 }}>{error}</div>}
        <button
          onClick={submit}
          disabled={busy || !email || password.length < 6}
          className="flex items-center justify-center gap-2"
          style={{
            height: 42, borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: '#00c9a7', color: '#06251f', opacity: busy || !email || password.length < 6 ? 0.5 : 1,
          }}
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {mode === 'login' ? '로그인' : '가입하기'}
        </button>
        <button onClick={google} style={{ height: 42, borderRadius: 8, fontSize: 13, background: '#1c1c26', color: '#ddd', border: '1px solid #2e2e3a' }}>
          Google로 계속하기
        </button>
        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
          style={{ color: '#8a8a96', fontSize: 12, marginTop: 4 }}
        >
          {mode === 'login' ? '계정이 없으신가요? 가입하기' : '이미 계정이 있나요? 로그인'}
        </button>
      </div>
    </div>
  )
}
