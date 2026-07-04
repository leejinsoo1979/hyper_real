import { useEffect, useState } from 'react'
import { useCreditStore } from '../../state/creditStore'
import { saasMode, apiMe } from '../../api/lumanovaApi'
import { getFirebaseAuth, useAuthUser } from '../../auth/firebase'
import { EmailAuthProvider, linkWithCredential, updatePassword } from 'firebase/auth'

/** 공용 심플 페이지 레이아웃 */
function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: '#111118' }}>
      <h1 style={{ color: '#ffffff', fontSize: 18, fontWeight: 600 }}>{title}</h1>
      <div className="mt-4 max-w-xl" style={{ color: '#888888', fontSize: 13, lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  )
}

export function AccountPage() {
  const localBalance = useCreditStore((s) => s.balance)
  const [me, setMe] = useState<{ email: string | null; balance: number } | null>(null)
  const [logs, setLogs] = useState<{ engine: string; cost: number; status: string; at: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const saas = saasMode()
  const user = useAuthUser()

  useEffect(() => {
    if (!saas || !user) return
    apiMe().then(setMe).catch((e) => setErr(String(e.message ?? e)))
    // 최근 사용 내역 (Firestore REST - 본인 로그만 규칙상 허용)
    user.getIdToken().then(async (token) => {
      try {
        const r = await fetch(
          `https://firestore.googleapis.com/v1/projects/lumanova-24e9b/databases/(default)/documents/users/${user.uid}/renderLogs?pageSize=50`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        const j = await r.json()
        const rows = (j.documents ?? []).map((d: { fields: Record<string, { stringValue?: string; integerValue?: string; timestampValue?: string }> }) => ({
          engine: d.fields.engine?.stringValue ?? '?',
          cost: Number(d.fields.cost?.integerValue ?? 0),
          status: d.fields.status?.stringValue ?? '?',
          at: d.fields.createdAt?.timestampValue ?? '',
        }))
        rows.sort((a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at))
        setLogs(rows.slice(0, 10))
      } catch { /* 내역은 부가 정보 */ }
    })
  }, [saas, user])

  const ENGINE_LABEL: Record<string, string> = {
    main: '렌더 (Nanobanana)', pro: 'Pro 렌더 (Nanobanana Pro)', auto_prompt: 'Auto 프롬프트',
  }

  if (!saas) {
    return (
      <PageShell title="Account">
        <div className="rounded p-4" style={{ backgroundColor: '#1a1a24', border: '1px solid #222233' }}>
          <div style={{ color: '#cccccc', fontSize: 13 }}>Credits (개발자 모드)</div>
          <div style={{ color: '#00c9a7', fontSize: 28, fontWeight: 700 }}>{localBalance}</div>
          <div className="mt-1" style={{ fontSize: 11, color: '#666666' }}>
            개발자 모드: 로그인 없이 로컬 키로 직접 호출합니다.
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <div className="flex flex-1 justify-center overflow-y-auto" style={{ background: '#0b0b0f', padding: '48px 24px' }}>
      <div className="w-full" style={{ maxWidth: 560 }}>
        {/* 프로필 카드 */}
        <div
          className="relative overflow-hidden rounded-2xl p-6"
          style={{
            background: 'linear-gradient(135deg, #14141c 0%, #101018 60%, #0e1a17 100%)',
            border: '1px solid #26262f',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="flex items-center justify-center overflow-hidden rounded-full" style={{ width: 64, height: 64, background: '#00c9a7', color: '#06251f', fontSize: 26, fontWeight: 800 }}>
              {user?.photoURL
                ? <img src={user.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                : (me?.email?.[0]?.toUpperCase() ?? '·')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate" style={{ color: '#ffffff', fontSize: 16, fontWeight: 700 }}>
                {user?.displayName || me?.email?.split('@')[0] || '...'}
              </div>
              <div className="truncate" style={{ color: '#8a8a96', fontSize: 12.5 }}>{me?.email ?? user?.email ?? ''}</div>
            </div>
            <button
              onClick={() => getFirebaseAuth()?.signOut()}
              style={{ height: 32, padding: '0 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', color: '#ff8888', border: '1px solid #3a2626' }}
            >
              로그아웃
            </button>
          </div>

          {/* 크레딧 */}
          <div className="mt-6 flex items-end justify-between rounded-xl p-4" style={{ background: 'rgba(0,201,167,0.06)', border: '1px solid rgba(0,201,167,0.25)' }}>
            <div>
              <div style={{ color: '#7ddcc9', fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>CREDITS</div>
              <div style={{ color: '#00e5be', fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>
                {me ? me.balance : '—'}
              </div>
            </div>
            <div className="text-right" style={{ fontSize: 11, color: '#8a8a96', lineHeight: 1.7 }}>
              렌더 <b style={{ color: '#cfcfda' }}>1</b> · Pro 렌더 <b style={{ color: '#cfcfda' }}>4</b> · Auto <b style={{ color: '#cfcfda' }}>1</b>
              <br />충전 문의: sbbc212@gmail.com
            </div>
          </div>
          {err && <div className="mt-2" style={{ color: '#ff6666', fontSize: 12 }}>{err}</div>}
        </div>

        {/* 데스크톱 앱 로그인용 비밀번호 */}
        <AppPasswordCard email={me?.email ?? user?.email ?? ''} />

        {/* 최근 사용 내역 */}
        <div className="mt-4 rounded-2xl p-5" style={{ background: '#12121a', border: '1px solid #22222c' }}>
          <div style={{ color: '#ffffff', fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>최근 사용 내역</div>
          {logs.length === 0 && <div style={{ color: '#55555f', fontSize: 12 }}>아직 사용 내역이 없습니다</div>}
          {logs.map((l, i) => (
            <div key={i} className="flex items-center justify-between" style={{ padding: '8px 0', borderTop: i ? '1px solid #1c1c26' : 'none' }}>
              <div>
                <span style={{ color: '#d8d8e0', fontSize: 12.5 }}>{ENGINE_LABEL[l.engine] ?? l.engine}</span>
                <span className="ml-2" style={{ fontSize: 10.5, color: l.status === 'ok' ? '#4cd6a8' : '#ff7777' }}>
                  {l.status === 'ok' ? '성공' : '실패'}
                </span>
              </div>
              <div className="text-right">
                <span style={{ color: '#9a9aa6', fontSize: 11 }}>{l.at ? new Date(l.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                <span className="ml-3" style={{ color: '#7ddcc9', fontSize: 12, fontWeight: 700 }}>-{l.cost}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TutorialPage() {
  return (
    <PageShell title="Tutorial">
      <p>기본 워크플로우:</p>
      <ol className="ml-5 mt-2 list-decimal space-y-1">
        <li>SketchUp에서 구도를 잡고 NanoBanana 아이콘을 눌러 뷰를 가져옵니다 (또는 이미지를 드래그).</li>
        <li>Source 노드를 선택하고 우측 프리셋에서 <b>View to render</b> → <b>Make</b>.</li>
        <li>같은 노드에서 Make를 반복하면 변형이 병렬로 생성됩니다.</li>
        <li>Draw 탭에서 화살표/색상 마킹, Ctrl+V로 레퍼런스 이미지를 붙여넣어 합성을 지시합니다.</li>
        <li>반복 수정으로 품질이 떨어지면 마지막에 View to render로 한 번 더 렌더해 복원합니다.</li>
        <li>완성본은 Upscale(2x/4x) 후 Image to video로 영상화할 수 있습니다.</li>
      </ol>
    </PageShell>
  )
}

export function SupportPage() {
  return (
    <PageShell title="Support">
      <p>
        문제가 발생하면 스크린샷과 함께 문의해주세요. 앱 버전과 SketchUp 버전을 알려주시면
        더 빠르게 해결할 수 있습니다.
      </p>
      <p className="mt-3" style={{ color: '#cccccc' }}>
        문의: <span style={{ color: '#00c9a7' }}>sbbc212@gmail.com</span>
      </p>
    </PageShell>
  )
}


// 구글 로그인 사용자용: 데스크톱 앱에서 쓸 비밀번호를 웹에서 1회 설정
function AppPasswordCard({ email }: { email: string }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const auth = getFirebaseAuth()
    const user = auth?.currentUser
    if (!user || pw.length < 6) return
    setBusy(true)
    setMsg(null)
    try {
      try {
        // 구글 전용 계정: 이메일/비밀번호 자격증명 연결
        await linkWithCredential(user, EmailAuthProvider.credential(email, pw))
      } catch (e) {
        const code = (e as { code?: string }).code ?? ''
        if (code.includes('provider-already-linked')) {
          await updatePassword(user, pw) // 이미 연결됨: 비밀번호 갱신
        } else {
          throw e
        }
      }
      setMsg({ ok: true, text: '설정 완료! 이제 데스크톱 앱에서 이 이메일 + 방금 만든 비밀번호로 로그인하세요 (최초 1회만, 이후 자동 유지)' })
      setPw('')
    } catch (e) {
      const code = (e as { code?: string }).code ?? String(e)
      setMsg({
        ok: false,
        text: code.includes('requires-recent-login')
          ? '보안을 위해 다시 로그인이 필요합니다. 로그아웃 후 재로그인하고 다시 시도하세요.'
          : `실패: ${code}`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl p-5" style={{ background: '#12121a', border: '1px solid #22222c' }}>
      <div style={{ color: '#ffffff', fontSize: 13.5, fontWeight: 700 }}>데스크톱 앱 로그인 비밀번호</div>
      <div className="mb-3 mt-1" style={{ fontSize: 11.5, color: '#8a8a96', lineHeight: 1.6 }}>
        설치형 Lumanova 앱은 크롬의 구글 자동로그인을 쓸 수 없습니다. 여기서 비밀번호를 한 번 만들어두면,
        앱에서 <b style={{ color: '#cfcfda' }}>{email}</b> + 이 비밀번호로 로그인됩니다 (같은 계정·같은 크레딧).
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="새 비밀번호 (6자 이상)"
          className="flex-1 rounded-lg px-3 outline-none"
          style={{ height: 38, background: '#0d0d15', border: '1px solid #26262f', color: '#fff', fontSize: 13 }}
        />
        <button
          onClick={save}
          disabled={busy || pw.length < 6}
          style={{
            height: 38, padding: '0 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
            background: '#00c9a7', color: '#06251f', opacity: busy || pw.length < 6 ? 0.45 : 1,
          }}
        >
          설정
        </button>
      </div>
      {msg && <div className="mt-2" style={{ fontSize: 11.5, color: msg.ok ? '#4cd6a8' : '#ff7777' }}>{msg.text}</div>}
    </div>
  )
}
