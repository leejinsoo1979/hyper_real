import { useCallback, useState, type ReactNode } from 'react'
import { ClipboardList, ChevronUp, ChevronDown } from 'lucide-react'
import {
  Snowflake, Leaf, Sun, Moon, Users, Car, Flower2, Sprout, TreePine,
  Search, Link,
} from 'lucide-react'
import type { NodeData } from '../../types/node'
import type { PromptPreset } from '../../types/preset'
import { getPresetsForNodeType } from '../../presets'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import {
  ScreenToRenderIcon,
  ImageToSketchIcon,
  TopViewIcon,
  SideViewIcon,
  AnotherViewIcon,
  EnhanceRealismIcon,
  MakeBrighterIcon,
  AxonometryIcon,
  TechnicalDrawingsIcon,
  LogoIcon,
  AddBlurredPeopleIcon,
  AddBlurredCarsIcon,
  ZoomInVideoIcon,
  MoveForwardIcon,
  OrbitIcon,
  PanLeftIcon,
  UpscaleIcon,
} from './PresetIcons'

// Map custom SVG icons by preset id
function getPresetIcon(presetId: string, size: number): ReactNode {
  const cls = ''
  const style = { width: size, height: size }

  switch (presetId) {
    // Render
    case 'screen-to-render':
      return <ScreenToRenderIcon className={cls} {...style} />
    case 'image-to-sketch':
      return <ImageToSketchIcon className={cls} {...style} />
    case 'top-view':
      return <TopViewIcon className={cls} {...style} />
    case 'side-view':
      return <SideViewIcon className={cls} {...style} />
    case 'another-view':
      return <AnotherViewIcon className={cls} {...style} />

    // Modifier - custom SVGs
    case 'enhance-realism':
      return <EnhanceRealismIcon className={cls} {...style} />
    case 'volumetric-rays':
      return <Sun size={size} />
    case 'make-brighter':
      return <MakeBrighterIcon className={cls} {...style} />
    case 'closeup':
      return <Search size={size} />
    case 'axonometry':
      return <AxonometryIcon className={cls} {...style} />
    case 'winter':
      return <Snowflake size={size} />
    case 'autumn':
      return <Leaf size={size} />
    case 'technical-drawings':
      return <TechnicalDrawingsIcon className={cls} {...style} />
    case 'logo':
      return <LogoIcon className={cls} {...style} />
    case 'day-to-night':
      return <Sun size={size * 0.6} style={{ display: 'inline', marginRight: 2 }} />
    case 'night-to-day':
      return <Moon size={size * 0.6} style={{ display: 'inline', marginRight: 2 }} />
    case 'add-people':
      return <Users size={size} />
    case 'add-blurred-people':
      return <AddBlurredPeopleIcon className={cls} {...style} />
    case 'add-blurred-cars':
      return <AddBlurredCarsIcon className={cls} {...style} />
    case 'add-cars':
      return <Car size={size} />
    case 'add-flowers':
      return <Flower2 size={size} />
    case 'add-grass':
      return <Sprout size={size} />
    case 'add-trees':
      return <TreePine size={size} />

    // Upscale
    case 'upscale':
      return <UpscaleIcon className={cls} {...style} />

    // Video
    case 'zoom-in-video':
      return <ZoomInVideoIcon className={cls} {...style} />
    case 'move-forward':
      return <MoveForwardIcon className={cls} {...style} />
    case 'orbit':
      return <OrbitIcon className={cls} {...style} />
    case 'pan-left':
      return <PanLeftIcon className={cls} {...style} />

    default:
      return <Link size={size} />
  }
}

interface PromptPresetsProps {
  selectedNode: NodeData | null
}

function PresetCard({
  preset,
  isSelected,
  onClick,
}: {
  preset: PromptPreset
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      className="flex flex-col items-center justify-center gap-1.5 rounded-lg p-2 transition-colors duration-150"
      style={{
        backgroundColor: '#1e1e2a',
        border: isSelected ? '1px solid #00c9a7' : '1px solid transparent',
        color: '#aaaaaa',
        minHeight: 80,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#2a2a36'
        e.currentTarget.style.color = '#ffffff'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#1e1e2a'
        e.currentTarget.style.color = isSelected ? '#ffffff' : '#aaaaaa'
      }}
      onClick={onClick}
    >
      <div style={{ width: 40, height: 40 }} className="flex items-center justify-center">
        {getPresetIcon(preset.id, 32)}
      </div>
      <span
        className="w-full truncate text-center"
        style={{ fontSize: 11, color: '#cccccc' }}
      >
        {preset.name}
      </span>
    </button>
  )
}

export function PromptPresets({ selectedNode }: PromptPresetsProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<'Prompt Presets' | 'My Presets'>('Prompt Presets')
  const [myPresets, setMyPresets] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('vizmaker.myPresets') ?? '[]') } catch { return [] }
  })

  const persistMyPresets = (list: string[]) => {
    setMyPresets(list)
    localStorage.setItem('vizmaker.myPresets', JSON.stringify(list))
  }
  const saveMyPreset = () => {
    const cur = useUIStore.getState().promptText.trim()
    if (!cur) return
    if (!myPresets.includes(cur)) persistMyPresets([cur, ...myPresets].slice(0, 30))
  }
  const applyMyPreset = (text: string) => {
    useUIStore.getState().setPromptText(text)
  }
  const removeMyPreset = (i: number) => {
    persistMyPresets(myPresets.filter((_, idx) => idx !== i))
  }
  const setPromptText = useUIStore((s) => s.setPromptText)
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  const presets = selectedNode ? getPresetsForNodeType(selectedNode.type) : []

  const handlePresetClick = useCallback(
    (preset: PromptPreset) => {
      if (!selectedNode) return

      setSelectedPresetId(preset.id)
      // Fill prompt bar
      setPromptText(preset.basePrompt)
      // Update node params with preset prompt and presetId
      if ('prompt' in selectedNode.params) {
        updateNodeParams(selectedNode.id, {
          prompt: preset.basePrompt,
          presetId: preset.id,
        })
      }
    },
    [selectedNode, setPromptText, updateNodeParams],
  )

  const CollapseIcon = collapsed ? ChevronDown : ChevronUp

  if (!selectedNode || selectedNode.type === 'SOURCE' || selectedNode.type === 'COMPARE') {
    return (
      <div>
        <div className="flex items-center gap-2 px-4" style={{ height: 40 }}>
          <ClipboardList size={16} style={{ color: '#888888' }} />
          <span className="flex-1 text-sm" style={{ color: '#ffffff', fontWeight: 500 }}>
            Prompt Presets
          </span>
          <ChevronUp size={16} style={{ color: '#888888' }} />
        </div>
        <div className="px-4 pb-3" style={{ color: '#555555', fontSize: 12 }}>
          {selectedNode ? 'Not applicable for this node' : 'Select a node to see presets'}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex w-full items-center gap-2 px-4" style={{ height: 40 }}>
        <ClipboardList size={16} style={{ color: '#888888' }} />
        {/* 실물 VizMaker: Prompt Presets | My Presets 탭 */}
        {(['Prompt Presets', 'My Presets'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="text-sm"
            style={{
              color: tab === t ? '#ffffff' : '#666677',
              fontWeight: tab === t ? 600 : 400,
              borderBottom: tab === t ? '2px solid #00c9a7' : '2px solid transparent',
              paddingBottom: 2,
            }}
          >
            {t}
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={() => setCollapsed(!collapsed)}>
          <CollapseIcon size={16} style={{ color: '#888888' }} />
        </button>
      </div>

      {!collapsed && tab === 'Prompt Presets' && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          {presets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedPresetId === preset.id}
              onClick={() => handlePresetClick(preset)}
            />
          ))}
        </div>
      )}

      {!collapsed && tab === 'My Presets' && (
        <div className="px-4 pb-4">
          <button
            onClick={saveMyPreset}
            className="mb-2 w-full"
            style={{
              height: 30, borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: '1px dashed #333344', color: '#00c9a7', background: 'transparent',
            }}
          >
            + 현재 프롬프트를 프리셋으로 저장
          </button>
          {myPresets.length === 0 && (
            <div style={{ color: '#555566', fontSize: 11 }}>저장된 프리셋이 없습니다</div>
          )}
          {myPresets.map((mp, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-2">
              <button
                onClick={() => applyMyPreset(mp)}
                className="flex-1 truncate text-left"
                title={mp}
                style={{
                  padding: '7px 10px', borderRadius: 6, fontSize: 11,
                  background: '#1a1a24', color: '#ccccdd', border: '1px solid #2a2a36',
                }}
              >
                {mp.slice(0, 60)}
              </button>
              <button onClick={() => removeMyPreset(i)} title="삭제" style={{ color: '#663333', fontSize: 13 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
