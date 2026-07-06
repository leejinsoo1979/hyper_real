import { useState } from 'react'
import { Camera, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useUIStore } from '../../state/uiStore'
import { selectScene, requestCapture, isBridgeOrigin, bridgeToolLabel } from '../../api/sketchupBridge'
import type { NodeData } from '../../types/node'

/**
 * 3D 툴 씬 전환 패널 (SketchUp 씬 / Blender 카메라).
 * 브릿지가 연결되어 있고 브릿지 출신 SOURCE 노드가 선택됐을 때만 표시.
 * 씬 클릭 → 브릿지로 전환 명령 → 새 캡처가 폴링으로 Source에 반영된다.
 */
export function SketchUpScenesPanel({ selectedNode }: { selectedNode: NodeData | null | undefined }) {
  const scenes = useUIStore((s) => s.sketchUpScenes)
  const status = useUIStore((s) => s.sketchUpStatus)
  const bridgeTool = useUIStore((s) => s.bridgeTool) // 라벨 반응성용 구독
  const [collapsed, setCollapsed] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  const isBridgeSource =
    selectedNode?.type === 'SOURCE' &&
    'origin' in selectedNode.params &&
    isBridgeOrigin(selectedNode.params.origin)

  if (status !== 'connected' || !isBridgeSource) return null
  const toolLabel = bridgeTool ? bridgeToolLabel() : 'SketchUp'

  const handleSelect = async (name: string) => {
    setSwitching(name)
    await selectScene(name)
    setTimeout(() => setSwitching(null), 1200)
  }

  const CollapseIcon = collapsed ? ChevronDown : ChevronUp

  return (
    <div style={{ borderBottom: '1px solid #222233' }}>
      <button
        className="flex w-full items-center gap-2.5 px-4"
        style={{ height: 46 }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Camera size={16} style={{ color: '#9a9aa6' }} />
        <span className="flex-1 text-left" style={{ color: '#ffffff', fontSize: 13.5, fontWeight: 600 }}>
          {toolLabel} scenes
        </span>
        <RefreshCw
          size={14}
          style={{ color: '#71717f' }}
          onClick={(e) => {
            e.stopPropagation()
            requestCapture()
          }}
        />
        <CollapseIcon size={16} style={{ color: '#71717f' }} />
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

    </div>
  )
}
