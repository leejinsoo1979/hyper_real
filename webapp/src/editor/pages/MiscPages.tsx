import { useEffect, useState } from 'react'
import { useCreditStore } from '../../state/creditStore'
import { saasMode, apiMe } from '../../api/lumanovaApi'
import { getFirebaseAuth, useAuthUser } from '../../auth/firebase'

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
  const saas = saasMode()
  const user = useAuthUser()

  useEffect(() => {
    if (!saas || !user) return
    apiMe().then(setMe).catch(() => {})
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
      } catch { /* 부가 정보 */ }
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
        </div>
      </PageShell>
    )
  }

  // 실물 VizMaker 디자인 언어: 좌측 정렬 페이지 제목 + 전체폭 섹션 행
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#0d0d11', padding: '36px 48px' }}>
      <h1 style={{ color: '#ffffff', fontSize: 26, fontWeight: 700, marginBottom: 24 }}>Account</h1>

      <Section title="프로필">
        <div className="flex items-center gap-4">
          <span className="flex items-center justify-center overflow-hidden rounded-full" style={{ width: 52, height: 52, background: '#00c9a7', color: '#06251f', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              : (me?.email?.[0]?.toUpperCase() ?? '·')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate" style={{ color: '#ffffff', fontSize: 15, fontWeight: 600 }}>
              {user?.displayName || me?.email?.split('@')[0] || '...'}
            </div>
            <div className="truncate" style={{ color: '#8a8a96', fontSize: 12.5 }}>{me?.email ?? user?.email ?? ''}</div>
          </div>
          <button
            onClick={() => getFirebaseAuth()?.signOut()}
            style={{ height: 32, padding: '0 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'transparent', color: '#ff8888', border: '1px solid #3a2626', flexShrink: 0 }}
          >
            로그아웃
          </button>
        </div>
      </Section>

      <Section title="크레딧">
        <div className="flex items-end justify-between">
          <div style={{ color: '#00e5be', fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>
            {me ? me.balance.toLocaleString() : <span style={{ fontSize: 14, color: '#4da896', fontWeight: 500 }}>불러오는 중...</span>}
          </div>
          <div className="text-right" style={{ fontSize: 11.5, color: '#8a8a96', lineHeight: 1.7 }}>
            렌더 <b style={{ color: '#cfcfda' }}>1</b> · Pro 렌더 <b style={{ color: '#cfcfda' }}>4</b> · Auto <b style={{ color: '#cfcfda' }}>1</b> 크레딧
          </div>
        </div>
      </Section>

      <Section title="최근 사용 내역">
        {logs.length === 0 && <div style={{ color: '#55555f', fontSize: 12.5 }}>아직 사용 내역이 없습니다</div>}
        {logs.map((l, i) => (
          <div key={i} className="flex items-center justify-between" style={{ padding: '9px 0', borderTop: i ? '1px solid #22222a' : 'none' }}>
            <div>
              <span style={{ color: '#d8d8e0', fontSize: 12.5 }}>{ENGINE_LABEL[l.engine] ?? l.engine}</span>
              <span className="ml-2" style={{ fontSize: 10.5, color: l.status === 'ok' ? '#4cd6a8' : '#ff7777' }}>
                {l.status === 'ok' ? '성공' : '실패'}
              </span>
            </div>
            <div>
              <span style={{ color: '#9a9aa6', fontSize: 11 }}>{l.at ? new Date(l.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              <span className="ml-3" style={{ color: '#7ddcc9', fontSize: 12, fontWeight: 700 }}>-{l.cost}</span>
            </div>
          </div>
        ))}
      </Section>
    </div>
  )
}

// 실물 스타일 섹션 행: 전체폭, 헤더(제목) + 본문
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#17171d', border: '1px solid #24242c', borderRadius: 10, marginBottom: 14 }}>
      <div style={{ padding: '13px 20px', borderBottom: '1px solid #22222a', color: '#e8e8ee', fontSize: 13.5, fontWeight: 600 }}>
        {title}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

// 실물 스타일 페이지 컨테이너 (대형 제목 + 섹션 카드) — Account와 동일 언어
function SectionPage({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#0d0d11', padding: '36px 48px' }}>
      <h1 style={{ color: '#ffffff', fontSize: 26, fontWeight: 700, marginBottom: subtitle ? 6 : 24 }}>{title}</h1>
      {subtitle && <p style={{ color: '#8a8a96', fontSize: 13.5, marginBottom: 24 }}>{subtitle}</p>}
      <div style={{ maxWidth: 860 }}>{children}</div>
    </div>
  )
}

const TEAL = '#00c9a7'

export function TutorialPage() {
  const steps = [
    { n: 1, t: 'SketchUp 뷰 가져오기', d: 'SketchUp에서 구도를 잡고 Lumanova 아이콘을 눌러 현재 뷰를 앱으로 보냅니다. 또는 이미지를 직접 드래그해 불러올 수 있습니다.' },
    { n: 2, t: '프롬프트 작성 & 렌더', d: 'Auto 버튼으로 프롬프트를 자동 생성하거나 직접 입력한 뒤 ⚡로 렌더링합니다. 벽·가구의 형상은 그대로 유지되고 재질·조명·분위기만 실사화됩니다.' },
    { n: 3, t: '영역 선택 정밀 편집', d: 'RESULT의 [마스크 패스] 탭에서 바꿀 부위를 클릭해 선택하고, 2차 프롬프트로 그 부위만 재질을 변경하거나 오브젝트를 제거합니다.' },
    { n: 4, t: '보정 & 내보내기', d: '슬라이더로 밝기·대비·채도를 로컬 보정(API 호출 없음)한 뒤 PNG로 저장합니다. 히스토리에서 언제든 다시 불러올 수 있습니다.' },
  ]
  const tips = [
    '카메라 조작은 WASD 이동 · QE 높이 · ZX 회전 단축키를 씁니다.',
    'Mirror를 켜면 SketchUp 화면이 실시간으로 앱에 미러링됩니다.',
    '낮/저녁/밤과 조명 On/Off로 같은 구도의 다양한 분위기를 만듭니다.',
    'Convert로 고품질(최대 1920px) 캡처를 고정한 뒤 렌더하면 결과가 더 선명합니다.',
  ]
  return (
    <SectionPage title="Tutorial" subtitle="Lumanova로 실사 렌더링을 시작하는 4단계입니다.">
      <Section title="기본 워크플로우">
        <div className="flex flex-col gap-4">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-4">
              <span className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, flexShrink: 0, background: 'rgba(0,201,167,0.14)', color: TEAL, fontSize: 14, fontWeight: 800 }}>{s.n}</span>
              <div>
                <div style={{ color: '#e8e8ee', fontSize: 14, fontWeight: 700 }}>{s.t}</div>
                <div style={{ marginTop: 4, color: '#9a9aa6', fontSize: 13, lineHeight: 1.65 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="유용한 팁">
        <ul className="flex flex-col gap-2.5">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-2.5" style={{ color: '#b8b8c2', fontSize: 13, lineHeight: 1.55 }}>
              <span style={{ color: TEAL, flexShrink: 0 }}>▸</span>{t}
            </li>
          ))}
        </ul>
      </Section>
    </SectionPage>
  )
}

export function SupportPage() {
  const faqs = [
    { q: '렌더링이 실제 형상을 바꿔버려요.', a: 'Lumanova는 형상을 고정하고 재질·조명만 바꾸도록 설계돼 있습니다. 그래도 변형이 크면 [마스크 패스]로 특정 부위만 선택해 편집하세요 — 선택 영역 밖은 원본으로 자동 복원됩니다.' },
    { q: '크레딧은 어떻게 충전하나요?', a: '가입 시 무료 크레딧이 지급됩니다. 추가 충전은 준비 중이며, 본인 Gemini API 키를 Settings에 입력하면 크레딧 차감 없이 사용할 수 있습니다.' },
    { q: 'SketchUp이 연결되지 않아요.', a: 'SketchUp을 실행하고 Lumanova 플러그인이 설치돼 있는지 확인하세요. 상단 상태 표시가 “Connected”면 정상입니다. 안 되면 SketchUp을 재시작하세요.' },
  ]
  return (
    <SectionPage title="Support" subtitle="도움이 필요하신가요? 아래에서 빠르게 해결하세요.">
      <Section title="문의 채널">
        <div className="flex flex-col gap-3">
          <ContactRow label="이메일" value="sbbc212@gmail.com" href="mailto:sbbc212@gmail.com" />
          <ContactRow label="SketchUp 플러그인" value="Lumanova_v1.0.6.rbz" href="/api/download-rbz" download />
          <ContactRow label="Blender 플러그인" value="lumanova_bridge.py" href="/downloads/lumanova_bridge.py" download />
        </div>
        <p style={{ marginTop: 14, fontSize: 11.5, color: '#6a6a74', lineHeight: 1.6 }}>
          문의 시 앱 버전(1.0.5)과 SketchUp 버전, 스크린샷을 함께 보내주시면 더 빠르게 도와드릴 수 있습니다.
        </p>
      </Section>
      <Section title="자주 묻는 질문">
        <div className="flex flex-col">
          {faqs.map((f, i) => (
            <div key={i} style={{ padding: '14px 0', borderTop: i ? '1px solid #22222a' : 'none' }}>
              <div style={{ color: '#e8e8ee', fontSize: 13.5, fontWeight: 700 }}>Q. {f.q}</div>
              <div style={{ marginTop: 6, color: '#9a9aa6', fontSize: 12.5, lineHeight: 1.65 }}>{f.a}</div>
            </div>
          ))}
        </div>
      </Section>
    </SectionPage>
  )
}

function ContactRow({ label, value, href, download }: { label: string; value: string; href: string; download?: boolean }) {
  return (
    <a
      href={href}
      download={download}
      className="flex items-center justify-between"
      style={{ padding: '12px 16px', borderRadius: 8, background: '#111117', border: '1px solid #22222c', textDecoration: 'none' }}
    >
      <span style={{ color: '#8a8a96', fontSize: 12.5 }}>{label}</span>
      <span style={{ color: TEAL, fontSize: 13, fontWeight: 600 }}>{value} →</span>
    </a>
  )
}
