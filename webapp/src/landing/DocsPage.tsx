import { useState } from 'react'
import { SubPageShell, TEAL, goApp } from './shared'

interface DocItem {
  h: string
  p: string
  download?: { href: string; label: string }
  link?: { href: string; label: string }
}

const SECTIONS: { id: string; label: string; body: DocItem[] }[] = [
  {
    id: 'install', label: '설치하기',
    body: [
      {
        h: 'SketchUp 플러그인 (2021~2025)',
        p: '아래 버튼으로 rbz 파일을 받은 뒤 — SketchUp의 창(Window) → Extension Manager → Install Extension → 받은 rbz 선택 → SketchUp 재시작. 재시작하면 툴바에 Lumanova 아이콘이 나타납니다.',
        download: { href: '/downloads/Lumanova_v1.0.7.rbz', label: 'SketchUp 플러그인 다운로드 (.rbz)' },
      },
      {
        h: 'Blender 애드온 (4.2~4.5)',
        p: 'Blender의 Edit → Preferences → Add-ons → Install from Disk → 받은 py 선택 → 목록에서 Lumanova Bridge 체크 활성화.',
        download: { href: '/downloads/lumanova_bridge.py', label: 'Blender 애드온 다운로드 (.py)' },
      },
      {
        h: 'Rhino 스크립트 (Rhino 8 · 실험적)',
        p: 'Rhino 명령줄에 ScriptEditor 입력 → 받은 py 파일 열기 → 실행. Rhino를 닫을 때까지 브릿지가 유지됩니다.',
        download: { href: '/downloads/lumanova_bridge_rhino.py', label: 'Rhino 스크립트 다운로드 (.py)' },
      },
      {
        h: '연결 확인',
        p: '플러그인이 설치된 3D 툴을 실행한 상태에서 앱을 열면 자동으로 연결됩니다. 앱 상단의 상태 점이 초록색이면 연결 완료입니다. 여러 툴이 동시에 켜져 있으면 SketchUp이 우선 연결됩니다.',
      },
    ],
  },
  {
    id: 'apikeys', label: 'API 키 발급 · 등록',
    body: [
      {
        h: '어떤 키가 필요한가요?',
        p: '이미지 렌더링에는 본인 Gemini 키가, 이미지 → 영상 생성(Grok Imagine)에는 본인 xAI 키가 필요합니다. 두 키 모두 발급은 몇 분이면 끝나고, 사용량은 각자 본인 계정으로 청구됩니다.',
      },
      {
        h: 'Gemini 키 발급 (이미지 렌더링 · 필수)',
        p: '① Google AI Studio에 접속해 Google 계정으로 로그인 → ② "API 키 만들기(Create API key)" 클릭 (프로젝트가 없으면 자동 생성) → ③ AIza…로 시작하는 키 복사. 무료 등급으로도 렌더링을 시작할 수 있습니다.',
        link: { href: 'https://aistudio.google.com/apikey', label: 'Google AI Studio 열기' },
      },
      {
        h: 'xAI Grok 키 발급 (영상 생성 · 필수)',
        p: '① xAI Console(console.x.ai)에 가입/로그인 → ② 좌측 API Keys 메뉴에서 "Create API key" 클릭 → ③ xai-…로 시작하는 키 복사 (생성 직후 한 번만 표시되니 바로 복사하세요) → ④ Billing 메뉴에서 결제 수단을 등록하고 크레딧을 충전합니다. 영상 생성 비용은 해상도에 따라 대략 초당 $0.05~0.07이며 본인 xAI 계정으로 청구됩니다.',
        link: { href: 'https://console.x.ai', label: 'xAI Console 열기' },
      },
      {
        h: '앱에 등록하기',
        p: '앱 좌측 하단 Settings → API Keys 섹션에서 해당 입력란에 키를 붙여넣고 저장을 누르면 끝입니다. 키는 사용하는 컴퓨터(브라우저)에만 저장되고 서버로 전송되지 않으며, 컴퓨터를 바꾸면 다시 등록해야 합니다. 각 입력란 아래의 "발급 방법" 버튼으로 이 단계를 앱 안에서도 볼 수 있습니다.',
      },
    ],
  },
  {
    id: 'start', label: '시작하기',
    body: [
      { h: '뷰 가져오기', p: 'SketchUp에서 구도를 잡고 Lumanova 아이콘을 눌러 현재 뷰를 앱으로 보냅니다. 또는 이미지를 직접 드래그해 불러올 수 있습니다.' },
      { h: '프롬프트 & 렌더', p: 'Auto로 프롬프트를 자동 생성하거나 직접 입력한 뒤 ⚡로 렌더링합니다. 형상은 유지되고 재질·조명만 실사화됩니다.' },
    ],
  },
  {
    id: 'edit', label: '정밀 편집',
    body: [
      { h: '영역 선택', p: 'RESULT의 [마스크 패스] 탭에서 바꿀 부위를 클릭해 선택합니다. 선택 부위만 밝게 표시됩니다.' },
      { h: '부위별 재질 변경', p: '선택 상태에서 2차 프롬프트를 입력하고 ⚡를 누르면 그 부위만 바뀌고 나머지는 원본이 그대로 유지됩니다.' },
    ],
  },
  {
    id: 'shortcuts', label: '단축키',
    body: [
      { h: '카메라', p: 'WASD 이동 · QE 높이 · ZX 회전. Mirror를 켜면 SketchUp 화면이 실시간 미러링됩니다.' },
      { h: '실행 취소', p: 'Cmd/Ctrl + Z 취소, Cmd/Ctrl + Shift + Z 다시 실행.' },
    ],
  },
]

export function DocsPage() {
  const [active, setActive] = useState('install')
  const sec = SECTIONS.find((s) => s.id === active)!
  return (
    <SubPageShell
      active="Docs"
      eyebrow="DOCS"
      title={<>문서 &amp; <span style={{ color: TEAL }}>가이드</span></>}
      subtitle="설치부터 정밀 편집까지, 몇 분이면 시작할 수 있습니다."
    >
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]" style={{ maxWidth: 1000, marginInline: 'auto' }}>
        <aside>
          <div className="flex flex-col gap-1" style={{ position: 'sticky', top: 100 }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className="text-left"
                style={{
                  padding: '9px 14px', borderRadius: 8, fontSize: 13.5, fontWeight: active === s.id ? 700 : 500,
                  background: active === s.id ? 'rgba(0,201,167,0.1)' : 'transparent',
                  color: active === s.id ? TEAL : '#9a9aa6',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </aside>
        <div style={{ padding: '28px 30px', borderRadius: 16, background: '#121219', border: '1px solid #22222c' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 22 }}>{sec.label}</h2>
          <div className="flex flex-col gap-7">
            {sec.body.map((b, i) => (
              <div key={i}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e8e8ee' }}>{b.h}</h3>
                <p style={{ marginTop: 7, fontSize: 14, lineHeight: 1.7, color: '#9a9aa6' }}>{b.p}</p>
                {b.download && (
                  <a href={b.download.href} download className="mt-3 inline-block" style={{ padding: '10px 18px', borderRadius: 9, background: TEAL, color: '#06251f', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                    {b.download.label} ↓
                  </a>
                )}
                {b.link && (
                  <a href={b.link.href} target="_blank" rel="noreferrer" className="mt-3 inline-block" style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${TEAL}`, color: TEAL, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                    {b.link.label} ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-14 text-center">
        <button onClick={goApp} className="lumanova-neon-pill" style={{ padding: '15px 34px', fontSize: 15.5, fontWeight: 850 }}>앱 열기 →</button>
      </div>
    </SubPageShell>
  )
}
