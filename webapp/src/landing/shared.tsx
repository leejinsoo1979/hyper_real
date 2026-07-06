import { useEffect, useState } from 'react'

// 랜딩/서브 페이지 공용 요소 (로고, 네비, 푸터, 색상)
export const TEAL = '#00c9a7'
export const goApp = () => { window.location.href = '/app' }
export const nav = (path: string) => { window.location.href = path }

const MENU: { label: string; path: string }[] = [
  { label: 'Features', path: '/features' },
  { label: 'Gallery', path: '/gallery' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Docs', path: '/docs' },
]

export function Logo({ size = 30 }: { size?: number }) {
  return <img src="/landing/logo-circle.png" alt="Lumanova" width={size} height={size} style={{ objectFit: 'contain', display: 'block' }} />
}

export function Nav({ active }: { active?: string }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between"
      style={{
        padding: '16px 5vw',
        background: scrolled ? 'rgba(8,8,11,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'background .3s, border-color .3s',
      }}
    >
      <button onClick={() => nav('/')} className="flex items-center gap-2.5" style={{ background: 'none' }}>
        <Logo size={30} />
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: '#fff' }}>Lumanova</span>
      </button>
      <nav className="hidden items-center gap-8 md:flex" style={{ fontSize: 14 }}>
        {MENU.map((m) => (
          <button
            key={m.label}
            onClick={() => nav(m.path)}
            className="transition-colors"
            style={{ background: 'none', color: active === m.label ? TEAL : '#b8b8c2', fontWeight: active === m.label ? 700 : 400 }}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-4">
        <button onClick={goApp} className="hidden sm:block" style={{ fontSize: 14, color: '#d9d9e2', background: 'none' }}>Log in</button>
        <button onClick={goApp} className="lumanova-neon-pill" style={{ padding: '9px 20px', fontSize: 13.5, fontWeight: 800 }}>
          Get Started
        </button>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #16161d', padding: '48px 5vw 40px', background: '#0b0b0f' }}>
      <div className="flex flex-wrap items-start justify-between gap-8">
        <div>
          <button onClick={() => nav('/')} className="flex items-center gap-2.5" style={{ background: 'none' }}>
            <Logo size={26} /><span style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Lumanova</span>
          </button>
          <p style={{ marginTop: 12, fontSize: 13, color: '#71717c', maxWidth: 260 }}>AI 기술로 상상을 현실로 만드는 차세대 렌더링 플랫폼.</p>
        </div>
        <div className="flex flex-wrap gap-14" style={{ fontSize: 13.5 }}>
          {[
            { h: 'Product', items: [['Features', '/features'], ['Gallery', '/gallery'], ['Pricing', '/pricing']] },
            { h: 'Resources', items: [['Docs', '/docs'], ['Blender 플러그인', '/downloads/lumanova_bridge.py'], ['Discord', '#']] },
            { h: 'Company', items: [['U:ABLE', 'https://www.uable.co.kr'], ['Contact', 'mailto:sbbc212@gmail.com'], ['Privacy', '#']] },
          ].map((col) => (
            <div key={col.h}>
              <p style={{ color: '#e6e6ee', fontWeight: 700, marginBottom: 12 }}>{col.h}</p>
              {col.items.map(([label, href]) => (
                <a key={label} href={href} className="block" style={{ color: '#8a8a95', marginBottom: 8, textDecoration: 'none' }}>{label}</a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4" style={{ borderTop: '1px solid #16161d', paddingTop: 20, fontSize: 12, color: '#5d5d68' }}>
        <span>
          © 2026 <a href="https://www.uable.co.kr" target="_blank" rel="noreferrer" style={{ color: '#8a8a95', textDecoration: 'none' }}>U:ABLE</a> — Lumanova, All Rights Reserved
        </span>
        <span className="flex gap-5"><a href="#" style={{ color: '#8a8a95' }}>Privacy Policy</a><a href="#" style={{ color: '#8a8a95' }}>Terms &amp; Conditions</a></span>
      </div>
    </footer>
  )
}

// 서브 페이지 공용 셸: 네비 + 히어로 헤더 + 본문 + 푸터
export function SubPageShell({ active, eyebrow, title, subtitle, children }: {
  active: string; eyebrow: string; title: React.ReactNode; subtitle: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', overflowX: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Nav active={active} />
      <section className="relative" style={{ padding: '160px 5vw 60px', textAlign: 'center' }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(0,201,167,0.10), rgba(0,0,0,0) 60%)' }} />
        <div className="relative">
          <p style={{ fontSize: 12, letterSpacing: '0.12em', color: TEAL, fontWeight: 700 }}>{eyebrow}</p>
          <h1 style={{ marginTop: 14, fontSize: 'clamp(38px, 5.5vw, 66px)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em' }}>{title}</h1>
          <p style={{ marginTop: 18, fontSize: 'clamp(15px, 1.6vw, 18px)', color: '#a9a9b6', maxWidth: 560, marginInline: 'auto', lineHeight: 1.65 }}>{subtitle}</p>
        </div>
      </section>
      <main style={{ padding: '20px 5vw 100px' }}>{children}</main>
      <Footer />
    </div>
  )
}
