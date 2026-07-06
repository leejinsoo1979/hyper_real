import { useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import { useGraphStore } from '../../state/graphStore'
import { useUIStore } from '../../state/uiStore'
import { loadSourceMaterials, materialTextureUri, type SourceMaterial } from '../../api/sketchupBridge'
import {
  categories,
  materialReferenceUrl,
  materialThumbnailUrl,
  materials,
  type MaterialAsset,
} from '../../data/materialLibrary'

function CategoryIcon({ category }: { category: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5">
      {category === 'Glass' && <><rect x="11" y="7" width="18" height="26" /><path d="M15 17l8-8M16 25l12-12M23 28l5-5" /></>}
      {category === 'Metal' && <><rect x="10" y="8" width="20" height="24" /><path d="M14 14c2-3 5-3 7 0s5 3 7 0M14 21c2-3 5-3 7 0s5 3 7 0M14 28c2-3 5-3 7 0s5 3 7 0" /></>}
      {category === 'Concrete' && <><rect x="9" y="7" width="22" height="26" /><path d="M14 13h.1M20 13h.1M26 13h.1M14 20h.1M20 20h.1M26 20h.1M14 27h.1M20 27h.1M26 27h.1" /></>}
      {category === 'Wood' && <><rect x="10" y="6" width="20" height="28" /><path d="M15 7c5 7-4 11 2 26M22 7c-4 8 6 12 0 26M28 7c-2 8 3 13 0 26" /></>}
      {category === 'Stones' && <><path d="M7 16l8-5 9 2 9 6-2 8-10 4-11-3-5-7 2-5Z" /><path d="M9 26l11-7 12 2M15 11l5 8" /></>}
      {category === 'Brick' && <><rect x="8" y="9" width="24" height="22" /><path d="M8 16h24M8 23h24M15 9v7M25 16v7M15 23v8" /></>}
      {category === 'Ground' && <><path d="M6 26h28M10 21h13M7 31h16M17 26c0-8 8-8 8-16" /></>}
      {category === 'Plastic' && <><rect x="10" y="7" width="20" height="26" /><path d="M15 8c8 7 5 13 12 25M23 8c-5 8 5 13-2 25" /></>}
      {category === 'Wall coverings' && <><rect x="10" y="6" width="20" height="28" /><path d="M15 31V14l10-7v24M15 19h10M19 11v8" /></>}
      {category === 'Roof coverings' && <><path d="M8 30c0-8 5-8 5-16 0 8 6 8 6 16 0-8 6-8 6-16 0 8 6 8 6 16" /><path d="M8 14h24M8 22h24" /></>}
      {category === 'Ceilings' && <><path d="M7 11h26M7 16h26M20 16v10" /><path d="M14 28a6 6 0 0 1 12 0" /></>}
      {category === 'Grids' && <><rect x="8" y="8" width="24" height="24" /><path d="M8 16h24M8 24h24M16 8v24M24 8v24" /></>}
      {category === 'Marble and granite' && <><rect x="8" y="8" width="24" height="24" /><path d="M13 30c9-7 4-14 16-20M11 16c7 0 7-7 16-7M19 32c0-9 9-9 11-17" /></>}
      {category === 'Tiles' && <><rect x="8" y="8" width="24" height="24" /><path d="M8 18h24M18 8v24M25 25l7 7 7-7-7-7-7 7Z" /></>}
    </svg>
  )
}

function swatchStyle(asset: MaterialAsset): React.CSSProperties {
  const [a, b, c] = asset.colors
  const grid = ['Brick', 'Tiles', 'Grids'].includes(asset.category)
    ? ', repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0 1px, transparent 1px 15px), repeating-linear-gradient(90deg, rgba(0,0,0,.24) 0 1px, transparent 1px 22px)'
    : ', repeating-linear-gradient(110deg, rgba(255,255,255,.12) 0 1px, transparent 1px 12px)'

  return {
    backgroundImage: `radial-gradient(circle at 35% 28%, ${b}, ${a} 42%, ${c} 100%)${grid}`,
  }
}

function MaterialPreview({ asset }: { asset: MaterialAsset }) {
  const [failed, setFailed] = useState(false)
  const thumbnail = failed ? null : materialThumbnailUrl(asset)

  return (
    <span
      className="relative overflow-hidden rounded-full"
      style={{
        width: 60,
        height: 60,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.34)',
        ...swatchStyle(asset),
      }}
    >
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

export function MaterialsPage({ open }: { open: boolean }) {
  const [activeTab, setActiveTab] = useState<'library' | 'source'>('library')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)
  const [sourceMaterials, setSourceMaterials] = useState<SourceMaterial[] | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const bridgeStatus = useUIStore((s) => s.sketchUpStatus)
  const nodes = useGraphStore((s) => s.nodes)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const createNode = useGraphStore((s) => s.createNode)
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams)
  const addEdge = useGraphStore((s) => s.addEdge)
  const selectNode = useGraphStore((s) => s.selectNode)
  const setPromptText = useUIStore((s) => s.setPromptText)

  const refreshSourceMaterials = async () => {
    if (sourceLoading) return
    setSourceLoading(true)
    setSourceError(null)
    const list = await loadSourceMaterials()
    setSourceLoading(false)
    if (list === null) {
      setSourceError(bridgeStatus === 'connected'
        ? '재질을 가져오지 못했습니다. 3D 툴의 플러그인이 최신인지 확인하세요.'
        : '3D 툴이 연결돼 있지 않습니다.')
      return
    }
    setSourceMaterials(list)
  }

  const openSourceTab = () => {
    setActiveTab('source')
    if (sourceMaterials === null) void refreshSourceMaterials()
  }

  const visibleMaterials = useMemo(() => {
    const q = query.trim().toLowerCase()
    return materials.filter((m) => {
      const categoryMatch = selectedCategory ? m.category === selectedCategory : true
      const queryMatch = !q
        || m.name.toLowerCase().includes(q)
        || m.category.toLowerCase().includes(q)
        || m.prompt.toLowerCase().includes(q)
        || m.tags.some((tag) => tag.toLowerCase().includes(q))
      return categoryMatch && queryMatch
    })
  }, [query, selectedCategory])
  const searchActive = query.trim().length > 0

  const createModifierWithPrompt = (prompt: string, presetId: string, materialReferences?: string[]) => {
    setPromptText(prompt)
    const selected = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
    const modifierId = createNode('MODIFIER', {
      x: selected ? selected.position.x + 340 : 220,
      y: selected ? selected.position.y : 220,
    })
    updateNodeParams(modifierId, { prompt, presetId, mask: null, maskLayers: [], materialReferences })
    if (selected) {
      addEdge({
        id: uuid(),
        from: selected.id,
        fromPort: 'image',
        to: modifierId,
        toPort: 'image',
      })
    }
    selectNode(modifierId)
  }

  const applyMaterial = (asset: MaterialAsset) => {
    const referenceUrl = materialReferenceUrl(asset)
    setSelectedMaterialId(asset.id)
    createModifierWithPrompt(
      `Replace the selected or masked surface material with ${asset.prompt}. Preserve the original geometry, camera, lighting, object positions, and all unmasked areas exactly.${referenceUrl ? ' Use the provided material reference image for color, grain, pattern scale, roughness, and reflectivity.' : ''}`,
      asset.id,
      referenceUrl ? [referenceUrl] : undefined,
    )
  }

  const applySourceMaterial = (m: SourceMaterial) => {
    const id = `source:${m.name}`
    setSelectedMaterialId(id)
    createModifierWithPrompt(
      `Replace the selected or masked surface material to match the 3D model's original material "${m.name}" (base color ${m.color}), rendered photorealistically with natural texture detail. Preserve the original geometry, camera, lighting, object positions, and all unmasked areas exactly.`,
      id,
    )
  }

  return (
      <aside
        className="h-full"
        aria-hidden={!open}
        style={{
          position: 'absolute',
          left: 76,
          top: 0,
          bottom: 0,
          zIndex: 30,
          width: open ? 258 : 0,
          minWidth: 0,
          overflow: 'hidden',
          background: '#1f1f23',
          borderRight: open ? '1px solid #121214' : '0 solid transparent',
          boxShadow: open ? '18px 0 28px rgba(0,0,0,.22)' : 'none',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'width 220ms cubic-bezier(.2,.8,.2,1), border-right-width 220ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms cubic-bezier(.2,.8,.2,1)',
          willChange: 'width',
        }}
      >
        <style>{`
          .material-library-scroll {
            scrollbar-width: thin;
            scrollbar-color: #383842 transparent;
          }
          .material-library-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .material-library-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .material-library-scroll::-webkit-scrollbar-thumb {
            background: #383842;
            border-radius: 999px;
            border: 1px solid #1f1f23;
          }
          .material-library-scroll::-webkit-scrollbar-thumb:hover {
            background: #4a4a56;
          }
          .material-library-scroll::-webkit-scrollbar-corner {
            background: transparent;
          }
        `}</style>
        <div
          className="material-library-scroll h-full overflow-y-auto"
          style={{ width: 258, minWidth: 258, overscrollBehavior: 'contain' }}
        >
        {/* 상단 탭: 라이브러리 / 소스(3D 툴에서 불러온 재질) */}
        <div className="grid grid-cols-2" style={{ borderBottom: '1px solid #2a2a31' }}>
          {([['library', 'Library'], ['source', '소스']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={key === 'source' ? openSourceTab : () => setActiveTab('library')}
              style={{
                height: 38, fontSize: 12.5,
                fontWeight: activeTab === key ? 700 : 500,
                color: activeTab === key ? '#ffffff' : '#77777f',
                background: activeTab === key ? '#26262c' : 'transparent',
                borderBottom: activeTab === key ? '2px solid #00c9a7' : '2px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'source' ? (
          <div style={{ padding: '12px 14px 24px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <span style={{ color: '#9b9ba1', fontSize: 12 }}>
                {sourceMaterials ? `모델 재질 ${sourceMaterials.length}개` : '모델 재질'}
              </span>
              <button
                onClick={() => void refreshSourceMaterials()}
                disabled={sourceLoading}
                className="flex items-center gap-1"
                style={{ color: '#8a8a94', fontSize: 11.5 }}
                title="3D 툴에서 재질 다시 불러오기"
              >
                <RefreshCw size={12} className={sourceLoading ? 'animate-spin' : ''} />
                새로고침
              </button>
            </div>

            {sourceLoading && (
              <div className="flex flex-col items-center gap-2" style={{ padding: '40px 0', color: '#77777f', fontSize: 12 }}>
                <Loader2 size={22} className="animate-spin" style={{ color: '#00c9a7' }} />
                재질 불러오는 중...
              </div>
            )}

            {!sourceLoading && sourceError && (
              <div className="text-center" style={{ padding: '32px 8px', color: '#8a6a6a', fontSize: 12, lineHeight: 1.7 }}>
                {sourceError}
              </div>
            )}

            {!sourceLoading && !sourceError && sourceMaterials && sourceMaterials.length === 0 && (
              <div className="text-center" style={{ padding: '32px 8px', color: '#77777f', fontSize: 12 }}>
                모델에 재질이 없습니다
              </div>
            )}

            {!sourceLoading && sourceMaterials && sourceMaterials.length > 0 && (
              <div className="grid grid-cols-2" style={{ gap: '16px 16px' }}>
                {sourceMaterials.map((m) => {
                  const id = `source:${m.name}`
                  const texUri = materialTextureUri(m)
                  return (
                    <button
                      key={id}
                      onClick={() => applySourceMaterial(m)}
                      className="relative flex flex-col items-center rounded"
                      style={{
                        minHeight: 104,
                        padding: '7px 4px',
                        color: selectedMaterialId === id ? '#ffffff' : '#9d9da3',
                        border: selectedMaterialId === id ? '1px solid #8b8b94' : '1px solid transparent',
                        background: selectedMaterialId === id ? '#242429' : 'transparent',
                      }}
                      title={`Apply ${m.name}`}
                    >
                      <span
                        className="rounded-full"
                        style={{
                          width: 60,
                          height: 60,
                          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.34)',
                          background: texUri ? `center / cover url(${texUri})` : m.color,
                        }}
                      />
                      <span className="mt-2 w-full truncate text-center" style={{ fontSize: 12, fontWeight: 600 }}>
                        {m.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
        <>
        <div
          className="flex items-center"
          style={{
            height: 42,
            padding: '0 14px',
            borderBottom: '1px solid #2a2a31',
          }}
        >
          {selectedCategory ? (
            <button
              onClick={() => { setSelectedCategory(null); setQuery('') }}
              className="flex min-w-0 items-center gap-2 text-left"
              style={{ color: '#d7d7dd', fontSize: 13, fontWeight: 600 }}
              title="Back to material categories"
            >
              <span style={{ color: '#8e8e97', fontSize: 18, lineHeight: 1 }}>‹</span>
              <span className="truncate">{selectedCategory}</span>
            </button>
          ) : (
            <div className="truncate" style={{ color: '#9b9ba1', fontSize: 12 }}>
              Library &gt; Materials
            </div>
          )}
        </div>
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid #292930',
            background: '#1f1f23',
          }}
        >
          <div
            className="flex items-center"
            style={{
              height: 34,
              gap: 8,
              padding: '0 10px 0 11px',
              borderRadius: 999,
              background: '#151519',
              border: '1px solid #31313a',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.035), 0 1px 2px rgba(0,0,0,.18)',
            }}
          >
            <Search size={13} color={searchActive ? '#9c9ca8' : '#64646e'} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={selectedCategory ? `Search ${selectedCategory}` : 'Search materials'}
              className="min-w-0 flex-1 bg-transparent outline-none"
              style={{ color: '#d8d8de', fontSize: 12 }}
            />
            {searchActive && (
              <button
                onClick={() => setQuery('')}
                className="flex items-center justify-center rounded-full"
                style={{ width: 18, height: 18, color: '#777784', background: '#24242b' }}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {!selectedCategory && !searchActive ? (
          <div className="grid grid-cols-2" style={{ gap: '18px 16px', padding: '20px 15px 24px' }}>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => { setSelectedCategory(category.id); setQuery('') }}
                className="flex flex-col items-center justify-center rounded-md"
                style={{ height: 90, color: '#9d9da3' }}
              >
                <span style={{ width: 44, height: 44, color: '#85858b' }}>
                  <CategoryIcon category={category.id} />
                </span>
                <span className="mt-2 text-center" style={{ maxWidth: 118, fontSize: 14, lineHeight: 1.2 }}>{category.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2" style={{ gap: '16px 16px', padding: '17px 14px 24px' }}>
            {visibleMaterials.map((asset) => (
              <button
                key={asset.id}
                onClick={() => applyMaterial(asset)}
                className="relative flex flex-col items-center rounded"
                style={{
                  minHeight: 104,
                  padding: '7px 4px',
                  color: selectedMaterialId === asset.id ? '#ffffff' : '#9d9da3',
                  border: selectedMaterialId === asset.id ? '1px solid #8b8b94' : '1px solid transparent',
                  background: selectedMaterialId === asset.id ? '#242429' : 'transparent',
                }}
                title={`Apply ${asset.name}`}
              >
                {selectedMaterialId === asset.id && (
                  <span className="absolute left-1 top-1" style={{ color: '#b9b9bf', fontSize: 15 }}>♡</span>
                )}
                <MaterialPreview asset={asset} />
                <span className="mt-2 w-full truncate text-center" style={{ fontSize: 12, fontWeight: 600 }}>
                  {asset.name}
                </span>
              </button>
            ))}
          </div>
        )}
        </>
        )}
        </div>
      </aside>
  )
}
