import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Lumanova 랜딩 페이지 — VizMaker(vizmaker.vizacademy.co.uk) 레이아웃 클론
// 브랜드/문구/색상은 Lumanova로 각색 (틸 #00c9a7)
// 구조: Hero → Download → 기능 8종(대형 헤드라인 + 우측 설명 + 배경 미디어)
//        스크롤 등장(fade/slide) → Footer
// ---------------------------------------------------------------------------

const TEAL = '#00c9a7'
const APP_URL = '/app'

// 스크롤 진입 시 페이드/슬라이드로 등장
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, shown }
}

function LumanovaMark({ size = 96 }: { size?: number }) {
  // VizMaker 원형 로고(∨∨) 오마주 — 링 + 이중 셰브론
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <circle cx="50" cy="50" r="44" stroke={TEAL} strokeWidth="4" />
      <path d="M28 40 L50 56 L72 40" stroke={TEAL} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 54 L50 70 L72 54" stroke={TEAL} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// 기능 섹션: 대형 흐린 헤드라인 + 우측 설명 + 좌우 배치 미디어
function Feature({
  title, subtitle, body, media, align = 'right', extra,
}: {
  title: string
  subtitle: string
  body?: string
  media: React.ReactNode
  align?: 'left' | 'right'
  extra?: React.ReactNode
}) {
  const { ref, shown } = useReveal<HTMLDivElement>()
  const right = align === 'right'
  return (
    <section
      ref={ref}
      className="relative flex min-h-[90vh] items-center overflow-hidden"
      style={{ padding: '80px 6vw' }}
    >
      {/* 배경 미디어 (한쪽으로 치우침) */}
      <div
        className="pointer-events-none absolute inset-y-0 flex items-center"
        style={{
          [right ? 'left' : 'right']: 0,
          width: '58%',
          opacity: shown ? 1 : 0,
          transform: shown ? 'translateX(0)' : `translateX(${right ? '-' : ''}40px)`,
          transition: 'opacity 1s ease, transform 1.1s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <div className="h-full w-full overflow-hidden" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {media}
        </div>
      </div>

      {/* 텍스트 (미디어 반대편) */}
      <div
        className="relative z-10 w-full"
        style={{ maxWidth: 620, marginLeft: right ? 'auto' : 0, textAlign: right ? 'right' : 'left' }}
      >
        <h2
          style={{
            fontSize: 'clamp(48px, 7vw, 104px)', fontWeight: 800, lineHeight: 1,
            color: 'rgba(255,255,255,0.09)', letterSpacing: '-0.02em',
            opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(24px)',
            transition: 'opacity .9s ease, transform .9s ease',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            marginTop: 10, fontSize: 'clamp(18px, 2vw, 26px)', fontWeight: 600, color: '#fff',
            opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(16px)',
            transition: 'opacity 1s ease .12s, transform 1s ease .12s',
          }}
        >
          {subtitle}
        </p>
        {body && (
          <p
            style={{
              marginTop: 14, fontSize: 15, lineHeight: 1.7, color: '#9a9aa6', maxWidth: 460,
              marginLeft: right ? 'auto' : 0,
              opacity: shown ? 1 : 0, transition: 'opacity 1.1s ease .2s',
            }}
          >
            {body}
          </p>
        )}
        {extra}
      </div>
    </section>
  )
}

function MediaImg({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}
      draggable={false}
    />
  )
}

function MediaVideo({ src }: { src: string }) {
  return (
    <video
      src={src}
      autoPlay muted loop playsInline
      style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}
    />
  )
}

export function LandingPage() {
  const goApp = () => { window.location.href = APP_URL }

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', overflowX: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* ── 상단 네비 ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
        style={{ padding: '18px 6vw', background: 'linear-gradient(180deg, rgba(0,0,0,.7), rgba(0,0,0,0))' }}
      >
        <div className="flex items-center gap-2.5">
          <LumanovaMark size={30} />
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em' }}>Lumanova</span>
        </div>
        <button
          onClick={goApp}
          style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${TEAL}`, color: TEAL, fontSize: 13.5, fontWeight: 700, background: 'transparent' }}
        >
          로그인
        </button>
      </header>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center" style={{ minHeight: '100vh', padding: '0 6vw' }}>
        <video
          src="/landing/hero.mp4"
          autoPlay muted loop playsInline
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ objectFit: 'cover', opacity: 0.35 }}
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 100%)' }} />
        <div className="relative z-10 flex flex-col items-center">
          <LumanovaMark size={110} />
          <h1 style={{ marginTop: 26, fontSize: 'clamp(56px, 9vw, 120px)', fontWeight: 800, lineHeight: 1, color: TEAL, letterSpacing: '-0.03em' }}>
            Lumanova
          </h1>
          <p style={{ marginTop: 18, fontSize: 'clamp(18px, 2.4vw, 30px)', fontWeight: 500, color: '#eaeaf0' }}>
            당신의 아이디어를, 즉시 렌더링
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={goApp}
              style={{ padding: '15px 34px', borderRadius: 12, background: TEAL, color: '#06251f', fontSize: 16, fontWeight: 800 }}
            >
              Start
            </button>
            <a
              href="/downloads/NanoBananaRenderer_v1.0.5.rbz"
              download
              style={{ padding: '15px 30px', borderRadius: 12, border: '1px solid #333', color: '#ddd', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
            >
              SketchUp 플러그인 (.rbz)
            </a>
          </div>
        </div>
      </section>

      {/* ── Download / 통합 CAD ── */}
      <DownloadSection goApp={goApp} />

      {/* ── 기능 8종 ── */}
      <Feature
        title="ArchViz" subtitle="실사 건축 렌더링을 생성하세요" align="right"
        media={<MediaImg src="/landing/archviz.webp" alt="ArchViz" />}
      />
      <Feature
        title="Best AI Engines" subtitle="모든 것이 한곳에" align="left"
        body="여러 최상위 AI 엔진을 한 화면에서 골라 쓰세요. 씬에 맞는 최적의 렌더 품질을 선택할 수 있습니다."
        media={<MediaImg src="/landing/engines.webp" alt="AI Engines" />}
      />
      <Feature
        title="Fashion" subtitle="모델을 생성하고, 디자인을 선보이세요" align="right"
        media={<MediaVideo src="/landing/fashion.mp4" />}
      />
      <Feature
        title="100% Privacy" subtitle="당신의 프로젝트는 보호받아야 합니다" align="left"
        body="내장된 프라이빗 모드는 원본 파일·생성 결과·프롬프트가 오직 당신의 컴퓨터에만 남도록 보장합니다."
        media={<MediaImg src="/landing/privacy.webp" alt="Privacy" />}
      />
      <Feature
        title="Versatile" subtitle="건축가, 디자이너, 아티스트를 위해" align="right"
        media={<MediaImg src="/landing/versatile.webp" alt="Versatile" />}
      />
      <Feature
        title="Create 3D Models" subtitle="단 한 장의 이미지로" align="left"
        media={<MediaImg src="/landing/model3d.webp" alt="3D Models" />}
      />
      <Feature
        title="Effortless" subtitle="빠르고 간편하게" align="right"
        media={<MediaVideo src="/landing/effortless.mp4" />}
      />

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #1a1a22', padding: '48px 6vw 40px' }}>
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <LumanovaMark size={28} />
              <span style={{ fontSize: 17, fontWeight: 800 }}>Lumanova</span>
            </div>
            <p style={{ marginTop: 12, fontSize: 13, color: '#71717c' }}>당신의 아이디어를, 즉시 렌더링</p>
          </div>
          <div className="flex gap-3">
            <button onClick={goApp} style={{ padding: '11px 22px', borderRadius: 9, background: TEAL, color: '#06251f', fontSize: 13.5, fontWeight: 700 }}>
              Start
            </button>
            <a href="/downloads/NanoBananaRenderer_v1.0.5.rbz" download style={{ padding: '11px 22px', borderRadius: 9, border: '1px solid #2c2c38', color: '#ccc', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>
              플러그인 다운로드
            </a>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4" style={{ borderTop: '1px solid #16161d', paddingTop: 20, fontSize: 12, color: '#5d5d68' }}>
          <span>© Lumanova 2026 — All Rights Reserved</span>
          <span className="flex gap-5">
            <a href="#" style={{ color: '#8a8a95' }}>Privacy Policy</a>
            <a href="#" style={{ color: '#8a8a95' }}>Terms &amp; Conditions</a>
          </span>
        </div>
      </footer>
    </div>
  )
}

function DownloadSection({ goApp }: { goApp: () => void }) {
  const { ref, shown } = useReveal<HTMLDivElement>()
  return (
    <section ref={ref} className="relative flex flex-col items-center justify-center text-center" style={{ minHeight: '80vh', padding: '80px 6vw' }}>
      <div style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(24px)', transition: 'opacity .9s ease, transform .9s ease' }}>
        <h2 style={{ fontSize: 'clamp(48px, 8vw, 96px)', fontWeight: 800, color: TEAL, lineHeight: 1 }}>Download</h2>
        <p style={{ marginTop: 12, fontSize: 'clamp(16px, 2vw, 22px)', color: '#eaeaf0' }}>데스크톱 앱을 무료로 받으세요</p>

        <p style={{ marginTop: 34, fontSize: 13.5, color: '#8a8a95' }}>완전히 통합되는 CAD</p>
        <p style={{ marginTop: 6, fontSize: 15, fontWeight: 600, color: '#ddd' }}>
          3ds Max · Revit · SketchUp · Archicad · Rhino · Unreal Engine
        </p>
        <img src="/landing/softwares.png" alt="Integrated CAD" style={{ marginTop: 22, maxWidth: 460, width: '80%', opacity: 0.9 }} />

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button onClick={goApp} style={{ padding: '14px 32px', borderRadius: 12, background: TEAL, color: '#06251f', fontSize: 15.5, fontWeight: 800 }}>
            웹에서 바로 시작
          </button>
          <a href="/downloads/NanoBananaRenderer_v1.0.5.rbz" download style={{ padding: '14px 28px', borderRadius: 12, border: '1px solid #333', color: '#ddd', fontSize: 14.5, fontWeight: 600, textDecoration: 'none' }}>
            SketchUp 플러그인 받기
          </a>
        </div>
      </div>
    </section>
  )
}
