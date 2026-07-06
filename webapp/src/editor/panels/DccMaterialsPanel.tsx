import { useState } from 'react'
import { ChevronDown, ChevronUp, Palette } from 'lucide-react'
import { useUIStore, type DccMaterialInfo } from '../../state/uiStore'

function colorToCss(color: number[] | undefined): string {
  if (!color || color.length < 3) return '#777777'
  const [r, g, b] = color
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

function materialSummary(material: DccMaterialInfo): string {
  const parts = [
    `Rough ${Number(material.roughness ?? 0).toFixed(2)}`,
    `Metal ${Number(material.metallic ?? 0).toFixed(2)}`,
  ]
  if (material.alpha < 1) parts.push(`Alpha ${Number(material.alpha).toFixed(2)}`)
  const textureCount = Object.values(material.textures ?? {}).reduce((sum, paths) => sum + paths.length, 0)
  if (textureCount > 0) parts.push(`${textureCount} texture${textureCount > 1 ? 's' : ''}`)
  return parts.join(' · ')
}

export function DccMaterialsPanel() {
  const bridgeTool = useUIStore((s) => s.bridgeTool)
  const materials = useUIStore((s) => s.bridgeMaterials)
  const [collapsed, setCollapsed] = useState(false)

  if (bridgeTool !== 'blender' || materials.length === 0) return null
  const CollapseIcon = collapsed ? ChevronDown : ChevronUp

  return (
    <div style={{ borderBottom: '1px solid #222233' }}>
      <button
        className="flex w-full items-center gap-2.5 px-4"
        style={{ height: 46 }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Palette size={16} style={{ color: '#9a9aa6' }} />
        <span className="flex-1 text-left" style={{ color: '#ffffff', fontSize: 13.5, fontWeight: 600 }}>
          Blender materials
        </span>
        <span style={{ color: '#71717f', fontSize: 12 }}>{materials.length}</span>
        <CollapseIcon size={16} style={{ color: '#71717f' }} />
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          <div className="flex flex-col gap-2">
            {materials.slice(0, 12).map((material) => (
              <div
                key={material.name}
                style={{
                  padding: '10px 11px',
                  borderRadius: 9,
                  background: '#1c1c25',
                  border: '1px solid #2c2c37',
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 12,
                      height: 12,
                      background: colorToCss(material.baseColor),
                      border: '1px solid rgba(255,255,255,.2)',
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate" style={{ color: '#e6e6ee', fontSize: 12.5, fontWeight: 700 }}>
                    {material.name}
                  </span>
                  <span style={{ color: '#71717f', fontSize: 10.5 }}>{material.shader}</span>
                </div>
                <div className="mt-1 truncate" style={{ color: '#8a8a96', fontSize: 11.5 }}>
                  {materialSummary(material)}
                </div>
                {material.objectNames.length > 0 && (
                  <div className="mt-1 truncate" style={{ color: '#666672', fontSize: 11 }}>
                    Objects: {material.objectNames.slice(0, 4).join(', ')}
                    {material.objectNames.length > 4 ? ` +${material.objectNames.length - 4}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
          {materials.length > 12 && (
            <div className="mt-2" style={{ color: '#666672', fontSize: 11.5 }}>
              Showing 12 of {materials.length} materials
            </div>
          )}
        </div>
      )}
    </div>
  )
}
