import { SubPageShell, TEAL, goApp } from './shared'

const FEATURES = [
  { t: '실사 렌더링', d: 'SketchUp 뷰를 몇 초 만에 사진 같은 이미지로. 벽·가구의 형상과 위치는 그대로 유지하고 재질·조명·분위기만 바꿉니다.' },
  { t: '다중 AI 엔진', d: 'Nano Banana · Flux · GPT · Magnific · Kling 등 최상위 엔진을 한 화면에서 선택해 씬에 맞는 최적 품질을 얻습니다.' },
  { t: '영역 선택 편집', d: '오브젝트 ID 마스크로 원하는 부위를 클릭 선택. 선택 영역만 재질을 바꾸고 나머지는 원본을 100% 유지합니다.' },
  { t: '실시간 미러링', d: 'SketchUp 뷰포트가 앱에 실시간 스트리밍됩니다. 카메라를 움직이면 즉시 반영돼 구도를 바로 잡습니다.' },
  { t: '낮/밤·조명 제어', d: 'Day/Evening/Night와 조명 On/Off로 같은 구도의 다양한 분위기를 즉시 생성합니다.' },
  { t: '로컬 보정', d: '밝기·대비·채도 등은 API 호출 없이 브라우저에서 즉시 보정. 크레딧 소모 없이 마무리합니다.' },
  { t: '3D 모델 생성', d: '단 한 장의 이미지에서 3D 모델을 만들어 워크플로우를 확장합니다.' },
  { t: '100% 프라이버시', d: '프라이빗 모드에서는 원본·결과·프롬프트가 오직 당신의 컴퓨터에만 남습니다.' },
  { t: '히스토리', d: '모든 렌더가 히스토리에 저장됩니다. 언제든 다시 불러와 이어서 작업하세요.' },
]

export function FeaturesPage() {
  return (
    <SubPageShell
      active="Features"
      eyebrow="FEATURES"
      title={<>렌더링에 필요한<br /><span style={{ color: TEAL }}>모든 것</span></>}
      subtitle="아이디어에서 완성작까지, Lumanova 하나로 끝냅니다."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style={{ maxWidth: 1100, marginInline: 'auto' }}>
        {FEATURES.map((f) => (
          <div key={f.t} style={{ padding: '26px 24px', borderRadius: 16, background: '#121219', border: '1px solid #22222c' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,201,167,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEAL, fontSize: 18, fontWeight: 800 }}>◇</div>
            <h3 style={{ marginTop: 18, fontSize: 16, fontWeight: 700, color: '#fff' }}>{f.t}</h3>
            <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.65, color: '#9a9aa6' }}>{f.d}</p>
          </div>
        ))}
      </div>
      <div className="mt-14 text-center">
        <button onClick={goApp} className="lumanova-neon-pill" style={{ padding: '15px 34px', fontSize: 15.5, fontWeight: 850 }}>Get start →</button>
      </div>
    </SubPageShell>
  )
}
