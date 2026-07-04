import { useEffect, useState } from 'react'
import { useCreditStore } from '../../state/creditStore'
import { saasMode, apiMe } from '../../api/lumanovaApi'
import { getFirebaseAuth } from '../../auth/firebase'

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
  const [err, setErr] = useState<string | null>(null)
  const saas = saasMode()

  useEffect(() => {
    if (!saas) return
    apiMe().then(setMe).catch((e) => setErr(String(e.message ?? e)))
  }, [saas])

  return (
    <PageShell title="Account">
      <div
        className="rounded p-4"
        style={{ backgroundColor: '#1a1a24', border: '1px solid #222233' }}
      >
        {saas ? (
          <>
            <div style={{ color: '#cccccc', fontSize: 13 }}>로그인 계정</div>
            <div style={{ color: '#ffffff', fontSize: 15, fontWeight: 600 }}>
              {me?.email ?? (err ? '조회 실패' : '불러오는 중...')}
            </div>
            <div className="mt-3" style={{ color: '#cccccc', fontSize: 13 }}>Credits</div>
            <div style={{ color: '#00c9a7', fontSize: 28, fontWeight: 700 }}>
              {me ? me.balance : '—'}
            </div>
            {err && <div style={{ color: '#ff6666', fontSize: 11 }}>{err}</div>}
            <div className="mt-1" style={{ fontSize: 11, color: '#666666' }}>
              렌더 1크레딧 / Pro 렌더 4크레딧 / Auto 프롬프트 1크레딧. 충전은 운영자에게 문의하세요.
            </div>
            <button
              className="mt-4"
              onClick={() => getFirebaseAuth()?.signOut()}
              style={{
                height: 34, padding: '0 18px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: '#2a1a1a', color: '#ff8888', border: '1px solid #442222',
              }}
            >
              로그아웃
            </button>
          </>
        ) : (
          <>
            <div style={{ color: '#cccccc', fontSize: 13 }}>Credits (개발자 모드)</div>
            <div style={{ color: '#00c9a7', fontSize: 28, fontWeight: 700 }}>{localBalance}</div>
            <div className="mt-1" style={{ fontSize: 11, color: '#666666' }}>
              개발자 모드: 로그인 없이 로컬 키로 직접 호출합니다.
            </div>
          </>
        )}
      </div>
    </PageShell>
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
