import { useState } from 'react'
import { Camera, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useUIStore } from '../../state/uiStore'
import { selectScene, requestCapture, sendCamera } from '../../api/sketchupBridge'
import type { NodeData } from '../../types/node'

/**
 * SketchUp 씬 전환 패널.
 * SketchUp이 연결되어 있고 sketchup 출신 SOURCE 노드가 선택됐을 때만 표시.
 * 씬 클릭 → 브릿지로 전환 명령 → 새 캡처가 폴링으로 Source에 반영된다.
 */
export function SketchUpScenesPanel({ selectedNode }: { selectedNode: NodeData | null | undefined }) {
  const scenes = useUIStore((s) => s.sketchUpScenes)
  const status = useUIStore((s) => s.sketchUpStatus)
  const [collapsed, setCollapsed] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  const isSketchUpSource =
    selectedNode?.type === 'SOURCE' &&
    'origin' in selectedNode.params &&
    selectedNode.params.origin === 'sketchup'

  if (status !== 'connected' || !isSketchUpSource) return null

  const handleSelect = async (name: string) => {
    setSwitching(name)
    await selectScene(name)
    setTimeout(() => setSwitching(null), 1200)
  }

  const CollapseIcon = collapsed ? ChevronDown : ChevronUp

  return (
    <div style={{ borderBottom: '1px solid #222233' }}>
      <button
        className="flex w-full items-center gap-2 px-4"
        style={{ height: 40 }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Camera size={16} style={{ color: '#888888' }} />
        <span className="flex-1 text-left text-sm" style={{ color: '#ffffff', fontWeight: 500 }}>
          SketchUp scenes
        </span>
        <RefreshCw
          size={14}
          style={{ color: '#888888' }}
          onClick={(e) => {
            e.stopPropagation()
            requestCapture()
          }}
        />
        <CollapseIcon size={16} style={{ color: '#888888' }} />
      </button>

      {!collapsed && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {scenes.length === 0 && (
            <span style={{ color: '#555555', fontSize: 12 }}>
              모델에 저장된 씬이 없습니다
            </span>
          )}
          {scenes.map((scene) => {
            const isActive = scene.active
            const isSwitching = switching === scene.name
            return (
              <button
                key={scene.name}
                onClick={() => handleSelect(scene.name)}
                className="rounded px-2.5 py-1 transition-colors"
                style={{
                  fontSize: 12,
                  backgroundColor: isActive ? '#00c9a7' : '#1a1a24',
                  color: isActive ? '#0a0a14' : '#cccccc',
                  border: `1px solid ${isActive ? '#00c9a7' : '#333344'}`,
                  opacity: isSwitching ? 0.5 : 1,
                }}
              >
                {isSwitching ? '…' : scene.name}
              </button>
            )
          })}
        </div>
      )}

      {/* 카메라 제어 (레거시 플러그인 기능 통합) */}
      {!collapsed && <CameraControls />}
    </div>
  )
}

// ── 카메라 제어 (구 플러그인의 WASD/QE/ZX + 높이/FOV/2점투시) ────────────────

function CamBtn({ label, title, onClick, wide }: { label: string; title: string; onClick: () => void; wide?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded transition-colors"
      style={{
        width: wide ? 'auto' : 26,
        height: 24,
        padding: wide ? '0 10px' : 0,
        fontSize: 11,
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

function SegRow({ options, onPick }: { options: { v: string; l: string }[]; onPick: (v: string) => void }) {
  return (
    <div
      className="flex flex-1 overflow-hidden rounded"
      style={{ backgroundColor: '#111118', border: '1px solid #333344' }}
    >
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onPick(o.v)}
          className="flex-1 py-1 transition-colors"
          style={{ fontSize: 11, color: '#999999', backgroundColor: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#0a0a14'; e.currentTarget.style.backgroundColor = '#00c9a7' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#999999'; e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

function CameraControls() {
  return (
    <div className="px-4 pb-3">
      <div style={{ color: '#888888', fontSize: 11, marginBottom: 6 }}>Camera</div>

      {/* 이동/회전/상하 */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col items-center gap-1">
          <CamBtn label="W" title="전진" onClick={() => sendCamera('move', 'forward')} />
          <div className="flex gap-1">
            <CamBtn label="A" title="왼쪽" onClick={() => sendCamera('move', 'left')} />
            <CamBtn label="S" title="후진" onClick={() => sendCamera('move', 'back')} />
            <CamBtn label="D" title="오른쪽" onClick={() => sendCamera('move', 'right')} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <CamBtn label="↑" title="위로" onClick={() => sendCamera('move', 'up')} />
          <CamBtn label="↓" title="아래로" onClick={() => sendCamera('move', 'down')} />
        </div>
        <div className="flex flex-col gap-1">
          <CamBtn label="⟲" title="좌회전" onClick={() => sendCamera('rotate', 'left')} />
          <CamBtn label="⟳" title="우회전" onClick={() => sendCamera('rotate', 'right')} />
        </div>
        <CamBtn label="2점 투시" title="수직선 보정 (2점 투시)" wide onClick={() => sendCamera('two_point')} />
      </div>

      {/* 높이 프리셋 */}
      <div className="mt-2 flex items-center gap-2">
        <span style={{ color: '#666677', fontSize: 11, width: 38 }}>Height</span>
        <SegRow
          options={[{ v: 'standing', l: '서기' }, { v: 'seated', l: '앉기' }, { v: 'low_angle', l: '낮음' }]}
          onPick={(v) => sendCamera('height', v)}
        />
      </div>

      {/* FOV 프리셋 */}
      <div className="mt-1.5 flex items-center gap-2">
        <span style={{ color: '#666677', fontSize: 11, width: 38 }}>FOV</span>
        <SegRow
          options={[{ v: 'wide', l: '광각' }, { v: 'standard', l: '표준' }, { v: 'telephoto', l: '망원' }]}
          onPick={(v) => sendCamera('fov', v)}
        />
      </div>
    </div>
  )
}
