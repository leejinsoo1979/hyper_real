import { SubPageShell, TEAL, goApp } from './shared'

const PLANS = [
  {
    name: 'Free',
    price: '₩0',
    per: '가입 시',
    desc: '지금 바로 시작해보세요.',
    credits: '가입 보너스 30 크레딧',
    features: ['모든 AI 엔진 사용', '영역 선택 정밀 편집', '실시간 미러링', '히스토리 저장', '커뮤니티 지원'],
    cta: 'Get start',
    highlight: false,
  },
  {
    name: 'BYOK',
    price: '₩0',
    per: '+ 본인 API 키',
    desc: '크레딧 없이 무제한으로.',
    credits: '크레딧 차감 없음',
    features: ['본인 Gemini 키로 직접 호출', '크레딧 소모 0', '모든 Free 기능 포함', '사용량 제한 없음', '우선 지원'],
    cta: '설정에서 키 등록',
    highlight: true,
  },
  {
    name: 'Pro',
    price: 'Coming soon',
    per: '',
    desc: '팀과 대량 작업을 위해.',
    credits: '대량 크레딧 패키지',
    features: ['크레딧 대량 충전', 'Pro 엔진 우선 처리', '팀 공유 워크스페이스', '전용 지원', '결제/청구서'],
    cta: '알림 받기',
    highlight: false,
  },
]

export function PricingPage() {
  return (
    <SubPageShell
      active="Pricing"
      eyebrow="PRICING"
      title={<>필요한 만큼만,<br /><span style={{ color: TEAL }}>합리적으로</span></>}
      subtitle="가입하면 무료 크레딧을 드립니다. 카드 등록은 필요 없습니다."
    >
      <div className="grid gap-5 lg:grid-cols-3" style={{ maxWidth: 1000, marginInline: 'auto' }}>
        {PLANS.map((p) => (
          <div
            key={p.name}
            style={{
              padding: '32px 26px', borderRadius: 18,
              background: p.highlight ? 'linear-gradient(180deg, #0f2620, #0d1a17)' : '#121219',
              border: `1px solid ${p.highlight ? 'rgba(0,201,167,0.5)' : '#22222c'}`,
              position: 'relative',
            }}
          >
            {p.highlight && (
              <span style={{ position: 'absolute', top: 16, right: 16, fontSize: 10.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: TEAL, color: '#06251f' }}>추천</span>
            )}
            <div style={{ fontSize: 15, fontWeight: 800, color: p.highlight ? TEAL : '#fff' }}>{p.name}</div>
            <div className="mt-3 flex items-end gap-2">
              <span style={{ fontSize: 30, fontWeight: 800, color: '#fff' }}>{p.price}</span>
              {p.per && <span style={{ fontSize: 13, color: '#8a8a95', marginBottom: 5 }}>{p.per}</span>}
            </div>
            <p style={{ marginTop: 8, fontSize: 13, color: '#9a9aa6' }}>{p.desc}</p>
            <div style={{ marginTop: 14, padding: '9px 12px', borderRadius: 8, background: 'rgba(0,201,167,0.08)', color: TEAL, fontSize: 12.5, fontWeight: 700 }}>{p.credits}</div>
            <ul className="mt-5 flex flex-col gap-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5" style={{ fontSize: 13, color: '#c8c8d2' }}>
                  <span style={{ color: TEAL, flexShrink: 0 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={goApp}
              className={p.highlight ? 'lumanova-neon-pill mt-7 w-full' : 'mt-7 w-full'}
              style={{
                padding: '13px 0',
                fontSize: 14,
                ...(p.highlight
                  ? { borderRadius: 999, fontWeight: 850 }
                  : { borderRadius: 10, fontWeight: 700, background: 'transparent', color: '#e6e6ee', border: '1px solid #2c2c38' }),
              }}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-12 text-center" style={{ fontSize: 12.5, color: '#6a6a74' }}>
        렌더 1크레딧 · Pro 렌더 4크레딧 · Auto 프롬프트 1크레딧
      </div>
    </SubPageShell>
  )
}
