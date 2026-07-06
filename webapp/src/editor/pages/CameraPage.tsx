import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { selectScene, requestCapture, sendCamera, isBridgeOrigin } from '../../api/sketchupBridge'

// ---------------------------------------------------------------------------
// Camera 페이지 — 구 나노바나나 플러그인의 카메라/씬 제어 전용 화면
// 좌: 실시간 프리뷰(SketchUp 미러) / 우: 씬 + 카메라 컨트롤
// ---------------------------------------------------------------------------

function CamBtn({ label, title, onClick, wide }: { label: string; title: string; onClick: () => void; wide?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md transition-colors"
      style={{
        width: wide ? '100%' : 40,
        height: 36,
        fontSize: 13,
        backgroundColor: '#1a1a24',
        color: '#cccccc',
        border: '1px solid #333344',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#00c9a7')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333344')}
    >
      {label}
    </button>
  )
}

function SegRow({ label, options, onPick }: { label: string; options: { v: string; l: string }[]; onPick: (v: string) => void }) {
  return (
    <div>
      <div style={{ color: '#888888', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div className="flex overflow-hidden rounded-md" style={{ backgroundColor: '#111118', border: '1px solid #333344' }}>
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onPick(o.v)}
            className="flex-1 py-2 transition-colors"
            style={{ fontSize: 12, color: '#aaaaaa', backgroundColor: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#0a0a14'; e.currentTarget.style.backgroundColor = '#00c9a7' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#aaaaaa'; e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CameraPage() {
  const status = useUIStore((s) => s.sketchUpStatus)
  const scenes = useUIStore((s) => s.sketchUpScenes)
  const bridgeTool = useUIStore((s) => s.bridgeTool)
  const nodes = useGraphStore((s) => s.nodes)
  const [switching, setSwitching] = useState<string | null>(null)

  // 브릿지(3D 툴) 소스 노드의 최신 캡처 = 실시간 프리뷰 (현재 연결 툴 우선)
  const sketchupNode =
    nodes.find((n) => n.type === 'SOURCE' && 'origin' in n.params && n.params.origin === bridgeTool)
    ?? nodes.find((n) => n.type === 'SOURCE' && 'origin' in n.params && isBridgeOrigin(n.params.origin))
  const preview =
    sketchupNode?.result?.image ??
    (sketchupNode && 'image' in sketchupNode.params ? (sketchupNode.params as { image: string }).image : null)

  const handleScene = async (name: string) => {
    setSwitching(name)
    await selectScene(name)
    setTimeout(() => setSwitching(null), 1200)
  }

  if (status !== 'connected') {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ backgroundColor: '#111118' }}>
        <div className="text-center" style={{ color: '#666677', fontSize: 13, lineHeight: 1.8 }}>
          SketchUp이 연결되어 있지 않습니다.<br />
          SketchUp을 실행하면 (플러그인 설치 필요) 자동으로 연결됩니다.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden" style={{ backgroundColor: '#111118' }}>
      {/* 실시간 프리뷰 */}
      <div className="flex flex-1 items-center justify-center p-6">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="max-h-full max-w-full rounded-lg"
            style={{ border: '1px solid #222233', objectFit: 'contain' }}
            draggable={false}
          />
        ) : (
          <div style={{ color: '#555566', fontSize: 13 }}>SketchUp 화면 수신 대기 중...</div>
        )}
      </div>

      {/* 제어 컬럼 */}
      <div
        className="flex flex-col gap-5 overflow-y-auto p-5"
        style={{ width: 300, minWidth: 300, backgroundColor: '#15151f', borderLeft: '1px solid #222233' }}
      >
        {/* 씬 */}
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 600 }}>Scenes</span>
            <button title="즉시 재캡처" onClick={() => requestCapture()}>
              <RefreshCw size={14} style={{ color: '#888888' }} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scenes.length === 0 && (
              <span style={{ color: '#555566', fontSize: 12 }}>모델에 저장된 씬이 없습니다</span>
            )}
            {scenes.map((sc) => (
              <button
                key={sc.name}
                onClick={() => handleScene(sc.name)}
                className="rounded px-2.5 py-1.5"
                style={{
                  fontSize: 12,
                  backgroundColor: sc.active ? '#00c9a7' : '#1a1a24',
                  color: sc.active ? '#0a0a14' : '#cccccc',
                  border: `1px solid ${sc.active ? '#00c9a7' : '#333344'}`,
                  opacity: switching === sc.name ? 0.5 : 1,
                }}
              >
                {switching === sc.name ? '…' : sc.name}
              </button>
            ))}
          </div>
        </div>

        {/* 이동 */}
        <div>
          <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Move</div>
          <div className="flex flex-col items-center gap-1.5">
            <CamBtn label="W" title="전진" onClick={() => sendCamera('move', 'forward')} />
            <div className="flex gap-1.5">
              <CamBtn label="A" title="왼쪽" onClick={() => sendCamera('move', 'left')} />
              <CamBtn label="S" title="후진" onClick={() => sendCamera('move', 'back')} />
              <CamBtn label="D" title="오른쪽" onClick={() => sendCamera('move', 'right')} />
            </div>
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            <CamBtn label="↑" title="카메라 위로" onClick={() => sendCamera('move', 'up')} />
            <CamBtn label="↓" title="카메라 아래로" onClick={() => sendCamera('move', 'down')} />
            <CamBtn label="⟲" title="좌회전" onClick={() => sendCamera('rotate', 'left')} />
            <CamBtn label="⟳" title="우회전" onClick={() => sendCamera('rotate', 'right')} />
          </div>
        </div>

        {/* 프리셋 */}
        <SegRow
          label="Height"
          options={[{ v: 'standing', l: '서기' }, { v: 'seated', l: '앉기' }, { v: 'low_angle', l: '낮음' }]}
          onPick={(v) => sendCamera('height', v)}
        />
        <SegRow
          label="FOV"
          options={[{ v: 'wide', l: '광각' }, { v: 'standard', l: '표준' }, { v: 'telephoto', l: '망원' }]}
          onPick={(v) => sendCamera('fov', v)}
        />

        <CamBtn label="2점 투시 보정" title="수직선을 곧게 펴는 2점 투시 적용" wide onClick={() => sendCamera('two_point')} />
      </div>
    </div>
  )
}
