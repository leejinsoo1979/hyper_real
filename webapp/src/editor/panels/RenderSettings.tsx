import { useCallback, useState } from 'react'
import { Monitor, ChevronUp, ChevronDown } from 'lucide-react'
import type { NodeData, RenderParams, UpscaleParams, VideoParams } from '../../types/node'
import { useGraphStore } from '../../state/graphStore'

interface RenderSettingsProps {
  selectedNode: NodeData | null
}

// 실제 사용 모델을 라벨에 그대로 표기 (숨기지 말 것)
const RENDER_MODE_OPTIONS = [
  { value: 'RENDER:main', label: '1. Main renderer — Nanobanana (gemini-2.5-flash-image)' },
  { value: 'RENDER:experimental-exterior', label: '1P. Nanobanana Pro (gemini-3-pro-image)' },
  { value: 'MODIFIER', label: '2. Details editor' },
  { value: 'UPSCALE', label: '3. Creative upscaler' },
  { value: 'VIDEO', label: '4. Image to video' },
]

function getCurrentRenderModeValue(node: NodeData): string {
  if (node.type === 'RENDER') {
    return `RENDER:${(node.params as RenderParams).engine}`
  }
  return node.type
}

// 실물 VizMaker: 라벨 좌측 + 어두운 우측정렬 드롭다운 행
function RightAlignedRow({ label, value, options, onChange }: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <span style={{ color: '#ccccdd', fontSize: 13 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 150, height: 32, padding: '0 10px',
          background: '#1a1a24', border: '1px solid #2c2c3a', borderRadius: 8,
          color: '#e6e6ee', fontSize: 12,
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function SegmentedRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="mb-3">
      <div style={{ color: '#cccccc', fontSize: 13, marginBottom: 4 }}>{label}</div>
      <div
        className="flex overflow-hidden"
        style={{ backgroundColor: '#111118', border: '1px solid #333340', borderRadius: 6 }}
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="flex-1 py-1.5 transition-colors"
              style={{
                fontSize: 12,
                backgroundColor: active ? '#00c9a7' : 'transparent',
                color: active ? '#0a0a14' : '#888888',
                fontWeight: active ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SettingsDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value

  return (
    <div className="mb-3">
      <div style={{ color: '#cccccc', fontSize: 13, marginBottom: 4 }}>{label}</div>
      <div className="relative">
        <button
          className="flex w-full items-center justify-between px-3 transition-colors duration-150"
          style={{
            height: 36,
            backgroundColor: '#1e1e2a',
            border: '1px solid #333340',
            borderRadius: 6,
            color: '#cccccc',
            fontSize: 13,
          }}
          onClick={() => setOpen(!open)}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown size={14} style={{ color: '#888888', flexShrink: 0 }} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div
              className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-md py-1"
              style={{
                backgroundColor: '#1e1e2a',
                border: '1px solid #333340',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-100"
                  style={{ color: '#cccccc' }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = '#2a2a36')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.value === value && (
                    <div
                      style={{
                        width: 3,
                        height: 20,
                        backgroundColor: '#00c9a7',
                        borderRadius: 2,
                        marginLeft: -8,
                        marginRight: 5,
                      }}
                    />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SettingsSlider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  const percent = ((value - min) / (max - min)) * 100

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ color: '#cccccc', fontSize: 13 }}>{label}</span>
        <span style={{ color: '#ffffff', fontSize: 13 }}>{value.toFixed(2)}</span>
      </div>
      <div className="relative" style={{ height: 20 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          style={{ height: 20 }}
        />
        {/* Custom track */}
        <div
          className="pointer-events-none absolute top-1/2 w-full -translate-y-1/2"
          style={{
            height: 4,
            backgroundColor: '#333340',
            borderRadius: 2,
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              backgroundColor: '#00c9a7',
              borderRadius: 2,
            }}
          />
        </div>
        {/* Thumb */}
        <div
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${percent}%`,
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: '#00c9a7',
          }}
        />
      </div>
    </div>
  )
}

export function RenderSettings({ selectedNode }: RenderSettingsProps) {
  const [collapsed, setCollapsed] = useState(false)
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams)

  const handleRenderModeChange = useCallback(
    (value: string) => {
      if (!selectedNode) return
      // Render mode changes are informational only in the current node context
      // The actual node type is fixed; this dropdown changes the engine for RENDER nodes
      if (value.startsWith('RENDER:')) {
        const engine = value.split(':')[1] as RenderParams['engine']
        updateNodeParams(selectedNode.id, { engine })
      }
    },
    [selectedNode, updateNodeParams],
  )

  // Hide for SOURCE and COMPARE
  if (!selectedNode || selectedNode.type === 'SOURCE' || selectedNode.type === 'COMPARE') {
    return (
      <div style={{ borderBottom: '1px solid #222233' }}>
        <div
          className="flex items-center gap-2 px-4"
          style={{ height: 40 }}
        >
          <Monitor size={16} style={{ color: '#888888' }} />
          <span className="flex-1 text-sm" style={{ color: '#ffffff', fontWeight: 500 }}>
            Render settings
          </span>
          <ChevronUp size={16} style={{ color: '#888888' }} />
        </div>
        <div className="px-4 pb-3" style={{ color: '#555555', fontSize: 12 }}>
          {selectedNode ? 'Not applicable for this node' : 'Select a node to configure'}
        </div>
      </div>
    )
  }

  const CollapseIcon = collapsed ? ChevronDown : ChevronUp

  return (
    <div style={{ borderBottom: '1px solid #222233' }}>
      <button
        className="flex w-full items-center gap-2 px-4"
        style={{ height: 40 }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Monitor size={16} style={{ color: '#888888' }} />
        <span className="flex-1 text-left text-sm" style={{ color: '#ffffff', fontWeight: 500 }}>
          Render settings
        </span>
        <CollapseIcon size={16} style={{ color: '#888888' }} />
      </button>

      {!collapsed && (
        <div className="px-4 pb-3">
          {/* Render Mode dropdown (only for RENDER nodes) */}
          {selectedNode.type === 'RENDER' && (
            <>
              <SettingsDropdown
                label="Engine"
                value={getCurrentRenderModeValue(selectedNode)}
                options={RENDER_MODE_OPTIONS}
                onChange={handleRenderModeChange}
              />

              {/* 실물 VizMaker: Precise/Quality/Fast 칩 - 캡처/출력 해상도에 연결 */}
              <div className="mb-3 flex gap-1.5">
                {([['Precise', '1920'], ['Quality', '1536'], ['Fast', '1024']] as const).map(([label, res]) => {
                  const cur = ((selectedNode.params as RenderParams).resolution ?? '1024') === res
                  return (
                    <button
                      key={res}
                      onClick={() => updateNodeParams(selectedNode.id, { resolution: res })}
                      style={{
                        padding: '3px 12px', borderRadius: 999, fontSize: 11,
                        border: `1px solid ${cur ? '#00c9a7' : '#333344'}`,
                        background: cur ? 'rgba(0,201,167,0.12)' : 'transparent',
                        color: cur ? '#00c9a7' : '#888899',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {/* 실물 VizMaker: Priority / Resolution / Aspect ratio 행 (우측정렬 드롭다운) */}
              <RightAlignedRow label="Priority" value="Standard" options={['Standard']} onChange={() => {}} />
              <RightAlignedRow
                label="Resolution"
                value={{ '1024': '1K', '1536': '1.5K', '1920': '2K' }[(selectedNode.params as RenderParams).resolution ?? '1024'] ?? '1K'}
                options={['1K', '1.5K', '2K']}
                onChange={(v) => updateNodeParams(selectedNode.id, { resolution: { '1K': '1024', '1.5K': '1536', '2K': '1920' }[v] })}
              />
              <RightAlignedRow label="Aspect ratio" value="Original" options={['Original']} onChange={() => {}} />

              {/* 시간대 (구 플러그인 Day/Eve/Night 이식) */}
              <SegmentedRow
                label="Time"
                value={(selectedNode.params as RenderParams).timePreset ?? 'day'}
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'evening', label: 'Eve' },
                  { value: 'night', label: 'Night' },
                ]}
                onChange={(v) =>
                  updateNodeParams(selectedNode.id, { timePreset: v as RenderParams['timePreset'] })
                }
              />

              {/* 조명 (구 플러그인 Lights On/Off 이식) */}
              <SegmentedRow
                label="Lights"
                value={((selectedNode.params as RenderParams).lightsOn ?? true) ? 'on' : 'off'}
                options={[
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                ]}
                onChange={(v) => updateNodeParams(selectedNode.id, { lightsOn: v === 'on' })}
              />
            </>
          )}

          {/* Static label for non-RENDER nodes */}
          {selectedNode.type === 'MODIFIER' && (
            <div className="mb-3">
              <div style={{ color: '#cccccc', fontSize: 13, marginBottom: 4 }}>Render Mode</div>
              <div
                className="flex items-center px-3"
                style={{
                  height: 36,
                  backgroundColor: '#1e1e2a',
                  border: '1px solid #333340',
                  borderRadius: 6,
                  color: '#888888',
                  fontSize: 13,
                }}
              >
                2. Details editor
              </div>
            </div>
          )}

          {selectedNode.type === 'UPSCALE' && (
            <>
              <div className="mb-3">
                <div style={{ color: '#cccccc', fontSize: 13, marginBottom: 4 }}>Render Mode</div>
                <div
                  className="flex items-center px-3"
                  style={{
                    height: 36,
                    backgroundColor: '#1e1e2a',
                    border: '1px solid #333340',
                    borderRadius: 6,
                    color: '#888888',
                    fontSize: 13,
                  }}
                >
                  3. Creative upscaler
                </div>
              </div>

              <SettingsDropdown
                label="Upscale"
                value={String((selectedNode.params as UpscaleParams).scale)}
                options={[
                  { value: '2', label: '2x' },
                  { value: '4', label: '4x' },
                ]}
                onChange={(v) =>
                  updateNodeParams(selectedNode.id, { scale: parseInt(v) as 2 | 4 })
                }
              />

              <SettingsDropdown
                label="Optimized for"
                value={(selectedNode.params as UpscaleParams).optimizedFor}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'detail', label: 'Detail' },
                  { value: 'smooth', label: 'Smooth' },
                ]}
                onChange={(v) =>
                  updateNodeParams(selectedNode.id, {
                    optimizedFor: v as UpscaleParams['optimizedFor'],
                  })
                }
              />

              <SettingsSlider
                label="Creativity"
                value={(selectedNode.params as UpscaleParams).creativity}
                onChange={(v) => updateNodeParams(selectedNode.id, { creativity: v })}
              />
              <SettingsSlider
                label="Detail strength"
                value={(selectedNode.params as UpscaleParams).detailStrength}
                onChange={(v) => updateNodeParams(selectedNode.id, { detailStrength: v })}
              />
              <SettingsSlider
                label="Similarity"
                value={(selectedNode.params as UpscaleParams).similarity}
                onChange={(v) => updateNodeParams(selectedNode.id, { similarity: v })}
              />
              <SettingsSlider
                label="Prompt strength"
                value={(selectedNode.params as UpscaleParams).promptStrength}
                onChange={(v) => updateNodeParams(selectedNode.id, { promptStrength: v })}
              />
            </>
          )}

          {selectedNode.type === 'VIDEO' && (
            <>
              <div className="mb-3">
                <div style={{ color: '#cccccc', fontSize: 13, marginBottom: 4 }}>Render Mode</div>
                <div
                  className="flex items-center px-3"
                  style={{
                    height: 36,
                    backgroundColor: '#1e1e2a',
                    border: '1px solid #333340',
                    borderRadius: 6,
                    color: '#888888',
                    fontSize: 13,
                  }}
                >
                  4. Image to video
                </div>
              </div>

              <SettingsDropdown
                label="Engine"
                value={(selectedNode.params as VideoParams).engine}
                options={[
                  { value: 'kling', label: 'Kling v2.1' },
                  { value: 'seedance', label: 'Seedance' },
                  { value: 'sora', label: 'Sora' },
                  { value: 'veo', label: 'Veo' },
                ]}
                onChange={(v) =>
                  updateNodeParams(selectedNode.id, { engine: v as VideoParams['engine'] })
                }
              />

              <SettingsDropdown
                label="Video duration"
                value={String((selectedNode.params as VideoParams).duration)}
                options={[
                  { value: '5', label: '5 seconds' },
                  { value: '10', label: '10 seconds' },
                ]}
                onChange={(v) =>
                  updateNodeParams(selectedNode.id, {
                    duration: parseInt(v) as VideoParams['duration'],
                  })
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
