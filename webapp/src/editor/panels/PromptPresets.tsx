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
      className="flex flex-col items-center justify-center gap-2 p-2 transition-colors duration-150"
      style={{
        backgroundColor: isSelected ? 'rgba(0,201,167,0.08)' : '#1c1c25',
        border: isSelected ? '1px solid #00c9a7' : '1px solid #26262f',
        borderRadius: 10,
        color: isSelected ? '#00c9a7' : '#a9a9b4',
        minHeight: 88,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = '#242430'
          e.currentTarget.style.borderColor = '#3a3a48'
          e.currentTarget.style.color = '#ffffff'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = '#1c1c25'
          e.currentTarget.style.borderColor = '#26262f'
          e.currentTarget.style.color = '#a9a9b4'
        }
      }}
      onClick={onClick}
    >
      <div style={{ width: 36, height: 36 }} className="flex items-center justify-center">
        {getPresetIcon(preset.id, 30)}
      </div>
      <span
        className="w-full truncate text-center"
        style={{ fontSize: 11, color: isSelected ? '#00c9a7' : '#c5c5d0' }}
      >
        {preset.name}
      </span>
    </button>
  )
}

function VideoPresetRow({
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
      onClick={onClick}
      className="w-full text-left transition-colors duration-150"
      style={{
        padding: '10px 11px',
        borderRadius: 8,
        background: isSelected ? 'rgba(0,201,167,0.11)' : '#1c1c25',
        border: isSelected ? '1px solid rgba(0,201,167,0.58)' : '1px solid #26262f',
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex items-center justify-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: isSelected ? 'rgba(0,201,167,0.14)' : '#15151d',
            color: isSelected ? '#00c9a7' : '#a9a9b4',
            flex: '0 0 auto',
          }}
        >
          {getPresetIcon(preset.id, 18)}
        </div>
        <div className="min-w-0 flex-1">
          <div style={{ color: isSelected ? '#dffdf8' : '#f0f0f5', fontSize: 12.5, fontWeight: 800 }}>
            {preset.name}
          </div>
          <div
            className="mt-1 overflow-hidden"
            style={{
              color: '#8f95a3',
              fontSize: 11,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {preset.visualConstraints}
          </div>
        </div>
      </div>
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
  const isVideoNode = selectedNode?.type === 'VIDEO'

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
        <div className="flex items-center gap-2.5 px-4" style={{ height: 46 }}>
          <ClipboardList size={16} style={{ color: '#9a9aa6' }} />
          <span className="flex-1" style={{ color: '#ffffff', fontSize: 13.5, fontWeight: 600 }}>
            Prompt Presets
          </span>
          <ChevronUp size={16} style={{ color: '#71717f' }} />
        </div>
        <div className="px-4 pb-4" style={{ color: '#5a5a66', fontSize: 12 }}>
          {selectedNode ? 'Not applicable for this node' : 'Select a node to see presets'}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 실물 VizMaker: Prompt Presets | My Presets 2등분 셀 탭 */}
      <div
        className="flex w-full items-stretch"
        style={{ height: 44, borderTop: '1px solid #222233', borderBottom: '1px solid #222233' }}
      >
        {(['Prompt Presets', 'My Presets'] as const).map((t, i) => {
          const isActive = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex flex-1 items-center justify-center gap-2 transition-colors duration-150"
              style={{
                fontSize: 12.5,
                color: isActive ? '#ffffff' : '#71717f',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? '#242430' : 'transparent',
                borderLeft: i > 0 ? '1px solid #222233' : 'none',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#b8b8c4' }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#71717f' }}
            >
              <ClipboardList size={14} />
              {t}
            </button>
          )
        })}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center"
          style={{ width: 40, borderLeft: '1px solid #222233', color: '#71717f' }}
        >
          <CollapseIcon size={15} />
        </button>
      </div>

      {!collapsed && tab === 'Prompt Presets' && isVideoNode && (
        <div className="grid gap-2 px-4 py-4">
          {presets.map((preset) => (
            <VideoPresetRow
              key={preset.id}
              preset={preset}
              isSelected={selectedPresetId === preset.id}
              onClick={() => handlePresetClick(preset)}
            />
          ))}
        </div>
      )}

      {!collapsed && tab === 'Prompt Presets' && !isVideoNode && (
        <div className="grid grid-cols-3 gap-2 px-4 py-4">
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
        <div className="px-4 py-4">
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
