import { SubPageShell, TEAL, goApp } from './shared'

// 랜딩 자산을 갤러리 샘플로 재활용
const ITEMS: { src: string; video?: boolean; tag: string; title: string }[] = [
  { src: '/landing/archviz.webp', tag: 'ArchViz', title: '실내 실사 렌더링' },
  { src: '/landing/versatile.webp', tag: 'Exterior', title: '고층 건물 외관' },
  { src: '/landing/model3d.webp', tag: '3D Model', title: '단일 이미지 → 3D' },
  { src: '/landing/engines.webp', tag: 'Engines', title: '멀티 엔진 비교' },
  { src: '/landing/privacy.webp', tag: 'Interior', title: '재질 변경 편집' },
  { src: '/landing/fashion.mp4', video: true, tag: 'Fashion', title: '패션 모델 생성' },
  { src: '/landing/effortless.mp4', video: true, tag: 'Motion', title: '이미지 → 영상' },
]

export function GalleryPage() {
  return (
    <SubPageShell
      active="Gallery"
      eyebrow="GALLERY"
      title={<>Lumanova로 만든<br /><span style={{ color: TEAL }}>렌더링 갤러리</span></>}
      subtitle="실제 작업 결과물의 일부입니다. 당신의 다음 작품도 여기에."
    >
      <div style={{ columnWidth: 340, columnGap: 16, maxWidth: 1100, marginInline: 'auto' }}>
        {ITEMS.map((it, i) => (
          <div key={i} className="group relative overflow-hidden" style={{ breakInside: 'avoid', marginBottom: 16, borderRadius: 14, border: '1px solid #1f1f28', background: '#0f0f15' }}>
            {it.video
              ? <video src={it.src} autoPlay muted loop playsInline style={{ width: '100%', display: 'block' }} />
              : <img src={it.src} alt={it.title} style={{ width: '100%', display: 'block' }} draggable={false} />}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between" style={{ padding: '12px 14px', background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.75))' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{it.title}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,201,167,0.18)', color: TEAL }}>{it.tag}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-14 text-center">
        <button onClick={goApp} style={{ padding: '15px 34px', borderRadius: 999, background: TEAL, color: '#06251f', fontSize: 15.5, fontWeight: 800 }}>직접 만들어보기 →</button>
      </div>
    </SubPageShell>
  )
}
