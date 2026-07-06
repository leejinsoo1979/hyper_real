import { useEffect, useRef, useState } from 'react'
import { Nav, Footer as SiteFooter } from './shared'

// ---------------------------------------------------------------------------
// Lumanova 랜딩 페이지 — 프리미엄 SaaS 스타일
// 검정 배경 + 틸(#00c9a7) 액센트. 히어로 / Trusted / 기능 그리드 / 제품 프리뷰 /
// 기능 상세(스크롤 등장) / CTA / 푸터
// ---------------------------------------------------------------------------

const TEAL = '#00c9a7'
const APP_URL = '/app'
const goApp = () => { window.location.href = APP_URL }

function useReveal<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return { ref, shown }
}

function Logo({ size = 30 }: { size?: number }) {
  // LN 모노그램 원형 마크 (사용자 지정 로고)
  return <img src="/landing/logo-circle.png" alt="Lumanova" width={size} height={size} style={{ objectFit: 'contain', display: 'block' }} />
}

// ── 히어로 ──
function Hero() {
  return (
    <section className="relative flex items-center overflow-hidden" style={{ minHeight: '100vh', padding: '0 5vw' }}>
      {/* 우측 결정체 배경 영상 */}
      <div className="pointer-events-none absolute inset-y-0 right-0" style={{ width: '58%' }}>
        <video src="/landing/hero.mp4" autoPlay muted loop playsInline className="h-full w-full" style={{ objectFit: 'cover' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, #000 8%, rgba(0,0,0,0.2) 55%, rgba(0,0,0,0) 100%)' }} />
      </div>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 100% 0%, rgba(0,201,167,0.10), rgba(0,0,0,0) 55%)' }} />

      <div className="relative z-10" style={{ maxWidth: 620 }}>
        <span
          className="inline-block"
          style={{ padding: '6px 14px', borderRadius: 999, border: `1px solid rgba(0,201,167,0.4)`, color: TEAL, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em' }}
        >
          AI-POWERED RENDERING
        </span>
        <h1 style={{ marginTop: 30, fontSize: 'clamp(48px, 6.5vw, 92px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
          <span style={{ color: '#fff' }}>Render Beyond</span><br />
          <span style={{ color: TEAL }}>Imagination</span>
        </h1>
        <p style={{ marginTop: 30, fontSize: 'clamp(16px, 1.6vw, 19px)', lineHeight: 1.7, color: '#a9a9b6', maxWidth: 460 }}>
          Lumanova는 AI 기술로 상상을 현실로 만드는<br />차세대 렌더링 플랫폼입니다.
        </p>
        <div className="flex flex-wrap items-center gap-4" style={{ marginTop: 44 }}>
          <button
            onClick={goApp}
            className="lumanova-neon-pill flex items-center gap-2"
            style={{ padding: '16px 32px', fontSize: 15.5, fontWeight: 850 }}
          >
            Get start <span style={{ fontSize: 17 }}>→</span>
          </button>
          <a
            href="/api/download-rbz"
            download
            className="flex items-center gap-2"
            style={{ padding: '16px 28px', borderRadius: 999, border: '1px solid #333', color: '#e6e6ee', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
          >
            앱 다운로드 <span style={{ fontSize: 14 }}>↓</span>
          </a>
        </div>
        <div className="flex items-center gap-2.5" style={{ marginTop: 56, color: '#7a7a86', fontSize: 13 }}>
          <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 999, border: '1px solid #333', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>↓</span>
          Scroll to explore
        </div>
      </div>
    </section>
  )
}

// ── Trusted by ──
function TrustedBy() {
  const brands = ['IDEO', 'ARUP', 'Zaha Hadid Architects', 'd5', 'KPF', 'Aedas', 'studio mk27']
  return (
    <section style={{ padding: '48px 5vw 56px', borderTop: '1px solid #16161d', borderBottom: '1px solid #16161d', background: '#0b0b0f' }}>
      <p style={{ fontSize: 11.5, letterSpacing: '0.14em', color: '#63636e', fontWeight: 600 }}>TRUSTED BY CREATORS AT</p>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        {brands.map((b) => (
          <span key={b} style={{ fontSize: 'clamp(16px, 1.7vw, 22px)', fontWeight: 700, color: '#4c4c56', letterSpacing: '-0.01em' }}>{b}</span>
        ))}
      </div>
    </section>
  )
}

// ── 기능 그리드 ──
function FeatureGrid() {
  const { ref, shown } = useReveal<HTMLDivElement>()
  const cards = [
    { icon: 'sparkle', title: '초고속 렌더링', body: '몇 초 만에 고품질\n결과물 생성' },
    { icon: 'cube', title: '강력한 AI 엔진', body: '딥러닝 기반 이미지\n품질 향상' },
    { icon: 'layers', title: '직관적인 워크플로우', body: '간단한 입력으로\n완벽한 결과' },
    { icon: 'cloud', title: '클라우드 기반', body: '어디서든 빠르고\n안정적으로' },
  ]
  return (
    <section ref={ref} style={{ padding: '90px 5vw' }}>
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(260px,380px)_1fr]">
        <div style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(20px)', transition: 'opacity .8s, transform .8s' }}>
          <p style={{ fontSize: 12, letterSpacing: '0.12em', color: TEAL, fontWeight: 700 }}>POWERFUL BY AI</p>
          <h2 style={{ marginTop: 14, fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 800, lineHeight: 1.15, color: '#fff' }}>
            AI가 만드는<br />압도적인 결과물
          </h2>
          <p style={{ marginTop: 16, fontSize: 15.5, lineHeight: 1.7, color: '#9a9aa6' }}>
            복잡한 과정 없이, 아이디어만으로<br />새로운 시각을 경험하세요.
          </p>
          <button
            onClick={goApp}
            className="mt-7 flex items-center gap-2"
            style={{ padding: '11px 22px', borderRadius: 10, border: '1px solid #2c2c38', color: '#e6e6ee', fontSize: 14, fontWeight: 600 }}
          >
            모든 기능 보기 <span>→</span>
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c, i) => (
            <div
              key={c.title}
              style={{
                padding: '28px 22px', borderRadius: 16, background: '#131319', border: '1px solid #22222c',
                opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(24px)',
                transition: `opacity .7s ${0.1 + i * 0.08}s, transform .7s ${0.1 + i * 0.08}s`,
              }}
            >
              <FeatureIcon name={c.icon} />
              <h3 style={{ marginTop: 20, fontSize: 15.5, fontWeight: 700, color: '#fff' }}>{c.title}</h3>
              <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: '#8a8a95', whiteSpace: 'pre-line' }}>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureIcon({ name }: { name: string }) {
  const common = { width: 30, height: 30, fill: 'none', stroke: TEAL, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'sparkle') return (<svg viewBox="0 0 24 24" {...common}><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /><path d="M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z" /></svg>)
  if (name === 'cube') return (<svg viewBox="0 0 24 24" {...common}><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M12 12l9-5M12 12v10M12 12L3 7" /></svg>)
  if (name === 'layers') return (<svg viewBox="0 0 24 24" {...common}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 16l9 5 9-5" /></svg>)
  return (<svg viewBox="0 0 24 24" {...common}><path d="M18 10a4 4 0 00-7.7-1.5A3.5 3.5 0 106 15h11a3.5 3.5 0 001-6.9z" /></svg>)
}

// ── 제품 프리뷰 (앱 UI 목업 CSS 재현) ──
function ProductPreview() {
  const { ref, shown } = useReveal<HTMLDivElement>()
  return (
    <section ref={ref} id="gallery" style={{ padding: '90px 5vw', background: 'linear-gradient(180deg, #000, #0b0b12)' }}>
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(260px,360px)_1fr]">
        <div style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(20px)', transition: 'opacity .8s, transform .8s' }}>
          <p style={{ fontSize: 12, letterSpacing: '0.1em', color: TEAL, fontWeight: 700 }}>DESIGN. GENERATE. PERFECTION.</p>
          <h2 style={{ marginTop: 14, fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 800, lineHeight: 1.18, color: '#fff' }}>
            직관적인 인터페이스<br />완벽한 제어
          </h2>
          <p style={{ marginTop: 16, fontSize: 15.5, lineHeight: 1.7, color: '#9a9aa6' }}>
            간단한 입력, 세밀한 조정,<br />그리고 놀라운 결과.
          </p>
        </div>
        <div style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateX(30px)', transition: 'opacity 1s, transform 1s' }}>
          <AppMockup />
        </div>
      </div>
    </section>
  )
}

function AppMockup() {
  const railItems = ['Home', 'Create', 'Assets', 'Gallery', 'Models']
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #24242e', background: '#0f0f15', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }}>
      <div className="flex" style={{ height: 'clamp(300px, 34vw, 440px)' }}>
        {/* 좌측 레일 */}
        <div className="hidden sm:flex" style={{ width: 168, flexShrink: 0, flexDirection: 'column', background: '#0b0b10', borderRight: '1px solid #1c1c26', padding: '16px 12px' }}>
          <div className="flex items-center gap-2" style={{ padding: '4px 6px 16px' }}>
            <Logo size={18} /><span style={{ fontSize: 13, fontWeight: 700 }}>Lumanova</span>
          </div>
          {railItems.map((n, i) => (
            <div key={n} className="flex items-center gap-2.5" style={{
              padding: '9px 10px', borderRadius: 8, marginBottom: 3, fontSize: 12.5,
              background: i === 1 ? 'rgba(0,201,167,0.12)' : 'transparent',
              color: i === 1 ? TEAL : '#8a8a95', fontWeight: i === 1 ? 600 : 500,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: i === 1 ? TEAL : '#3a3a44' }} />{n}
            </div>
          ))}
        </div>
        {/* 중앙 씬 */}
        <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="flex-1" style={{ background: 'linear-gradient(135deg, #2a2a2e, #16161a)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: '10% 12%', borderRadius: 8, background: 'linear-gradient(160deg, #4a4a50, #26262b)', boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)' }} />
          </div>
          <div className="flex items-center gap-2" style={{ padding: '10px 12px', borderTop: '1px solid #1c1c26' }}>
            <div className="flex-1" style={{ height: 30, borderRadius: 7, background: '#16161d', border: '1px solid #26262f', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11.5, color: '#6a6a74' }}>
              Describe your image…
            </div>
            <div style={{ height: 30, padding: '0 16px', borderRadius: 7, background: TEAL, color: '#06251f', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center' }}>Generate</div>
          </div>
        </div>
        {/* 우측 설정 */}
        <div className="hidden lg:block" style={{ width: 172, flexShrink: 0, background: '#0b0b10', borderLeft: '1px solid #1c1c26', padding: '16px 14px', fontSize: 11 }}>
          <MockRow label="Model" value="Luma Nova v1.0" />
          <p style={{ marginTop: 14, color: '#6a6a74' }}>Aspect Ratio</p>
          <div className="mt-2 flex gap-1.5">
            {['1:1', '16:9', '4:3', '3:4'].map((r, i) => (
              <span key={r} style={{ padding: '4px 8px', borderRadius: 5, fontSize: 10.5, background: i === 1 ? TEAL : '#17171e', color: i === 1 ? '#06251f' : '#8a8a95', fontWeight: 600 }}>{r}</span>
            ))}
          </div>
          <p style={{ marginTop: 14, color: '#6a6a74' }}>Resolution</p>
          <div className="mt-2 flex gap-1.5">
            {['2K', '4K'].map((r, i) => (
              <span key={r} style={{ padding: '4px 10px', borderRadius: 5, fontSize: 10.5, background: i === 0 ? TEAL : '#17171e', color: i === 0 ? '#06251f' : '#8a8a95', fontWeight: 600 }}>{r}</span>
            ))}
          </div>
          <p style={{ marginTop: 14, color: '#6a6a74' }}>Style</p>
          <div className="mt-2 flex gap-1.5">
            {['Realistic', 'Concept'].map((r, i) => (
              <span key={r} style={{ padding: '4px 10px', borderRadius: 5, fontSize: 10.5, border: `1px solid ${i === 0 ? TEAL : '#26262f'}`, color: i === 0 ? TEAL : '#8a8a95', fontWeight: 600 }}>{r}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MockRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: '#6a6a74' }}>{label}</p>
      <div className="mt-1.5 flex items-center justify-between" style={{ padding: '6px 10px', borderRadius: 6, background: '#17171e', border: '1px solid #26262f', color: '#d9d9e2', fontSize: 10.5 }}>
        {value} <span style={{ color: '#6a6a74' }}>▾</span>
      </div>
    </div>
  )
}

// ── 기능 상세 (스크롤 등장, 미디어 좌우 교차) ──
function FeatureRow({ title, subtitle, body, media, align }: {
  title: string; subtitle: string; body?: string; media: React.ReactNode; align: 'left' | 'right'
}) {
  const { ref, shown } = useReveal<HTMLDivElement>(0.25)
  const right = align === 'right'
  return (
    <section ref={ref} className="grid items-center gap-10 lg:grid-cols-2" style={{ padding: '70px 5vw' }}>
      <div style={{
        order: right ? 2 : 1,
        opacity: shown ? 1 : 0, transform: shown ? 'none' : `translateX(${right ? '' : '-'}30px)`,
        transition: 'opacity 1s, transform 1s',
      }}>
        {media}
      </div>
      <div style={{ order: right ? 1 : 2, opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(20px)', transition: 'opacity .9s .1s, transform .9s .1s' }}>
        <h3 style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 800, color: '#fff', lineHeight: 1.15 }}>{title}</h3>
        <p style={{ marginTop: 12, fontSize: 17, fontWeight: 600, color: TEAL }}>{subtitle}</p>
        {body && <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.7, color: '#9a9aa6', maxWidth: 440 }}>{body}</p>}
      </div>
    </section>
  )
}

function Media({ src, video }: { src: string; video?: boolean }) {
  const style = { width: '100%', borderRadius: 14, boxShadow: '0 30px 70px rgba(0,0,0,0.5)', objectFit: 'cover' as const, maxHeight: 420 }
  return video
    ? <video src={src} autoPlay muted loop playsInline style={style} />
    : <img src={src} alt="" style={style} draggable={false} />
}

// ── CTA ──
function CTA() {
  const { ref, shown } = useReveal<HTMLDivElement>()
  return (
    <section ref={ref} style={{ padding: '110px 5vw', textAlign: 'center' }}>
      <div style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(24px)', transition: 'opacity .9s, transform .9s' }}>
        <h2 style={{ fontSize: 'clamp(34px, 5vw, 62px)', fontWeight: 800, lineHeight: 1.08, color: '#fff', letterSpacing: '-0.02em' }}>
          지금 바로<br /><span style={{ color: TEAL }}>렌더링을 시작하세요</span>
        </h2>
        <p style={{ marginTop: 18, fontSize: 16.5, color: '#a9a9b6' }}>가입하면 무료 크레딧을 드립니다. 카드 등록은 필요 없습니다.</p>
        <button onClick={goApp} className="lumanova-neon-pill" style={{ marginTop: 34, padding: '16px 40px', fontSize: 16.5, fontWeight: 850 }}>
          Get start →
        </button>
      </div>
    </section>
  )
}

export function LandingPage() {
  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', overflowX: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Nav />
      <Hero />
      <TrustedBy />
      <FeatureGrid />
      <ProductPreview />
      <FeatureRow title="ArchViz" subtitle="실사 건축 렌더링을 생성하세요" align="right" media={<Media src="/landing/archviz.webp" />} />
      <FeatureRow title="Best AI Engines" subtitle="모든 것이 한곳에" body="여러 최상위 AI 엔진을 한 화면에서 골라 쓰세요. 씬에 맞는 최적의 렌더 품질을 선택할 수 있습니다." align="left" media={<Media src="/landing/engines.webp" />} />
      <FeatureRow title="100% Privacy" subtitle="당신의 프로젝트는 보호받아야 합니다" body="내장된 프라이빗 모드는 원본 파일·생성 결과·프롬프트가 오직 당신의 컴퓨터에만 남도록 보장합니다." align="right" media={<Media src="/landing/privacy.webp" />} />
      <FeatureRow title="Create 3D Models" subtitle="단 한 장의 이미지로" align="left" media={<Media src="/landing/model3d.webp" />} />
      <CTA />
      <SiteFooter />
    </div>
  )
}
