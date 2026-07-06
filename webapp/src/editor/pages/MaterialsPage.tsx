import { useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import { useGraphStore } from '../../state/graphStore'
import { useUIStore } from '../../state/uiStore'
import { loadSourceMaterials, materialTextureUri, type SourceMaterial } from '../../api/sketchupBridge'

type MaterialCategory = {
  id: string
  name: string
}

type MaterialAsset = {
  id: string
  name: string
  category: string
  colors: string[]
  prompt: string
}

const categories: MaterialCategory[] = [
  { id: 'Glass', name: 'Glass' },
  { id: 'Metal', name: 'Metal' },
  { id: 'Concrete', name: 'Concrete' },
  { id: 'Wood', name: 'Wood' },
  { id: 'Stones', name: 'Stones' },
  { id: 'Brick', name: 'Brick' },
  { id: 'Ground', name: 'Ground' },
  { id: 'Plastic', name: 'Plastic' },
  { id: 'Wall coverings', name: 'Wall coverings' },
  { id: 'Roof coverings', name: 'Roof coverings' },
  { id: 'Ceilings', name: 'Ceilings' },
  { id: 'Grids', name: 'Grids' },
  { id: 'Marble and granite', name: 'Marble and granite' },
  { id: 'Tiles', name: 'Tiles' },
]

const materials: MaterialAsset[] = [
  { id: 'clear-glass-01', name: 'Clear glass 01', category: 'Glass', colors: ['#d9f0f7', '#8ab5c4', '#f7ffff'], prompt: 'transparent clear architectural glass with subtle blue tint and realistic reflections' },
  { id: 'frosted-glass-01', name: 'Frosted glass 01', category: 'Glass', colors: ['#cfd8dc', '#eef4f5', '#8fa1aa'], prompt: 'frosted translucent glass with soft matte surface and diffused reflections' },
  { id: 'brushed-brass-01', name: 'Brushed brass 01', category: 'Metal', colors: ['#8c642b', '#d0a24a', '#5f431f'], prompt: 'brushed brass metal with warm golden tone, satin reflection, fine linear grain' },
  { id: 'black-steel-01', name: 'Black steel 01', category: 'Metal', colors: ['#0f1112', '#2b2f31', '#555b5e'], prompt: 'matte black powder coated steel with subtle edge highlights' },
  { id: 'raw-concrete-01', name: 'Raw concrete 01', category: 'Concrete', colors: ['#77736b', '#a19d92', '#4d4b46'], prompt: 'raw architectural concrete, matte surface, subtle trowel marks, realistic mineral texture' },
  { id: 'microcement-01', name: 'Microcement 01', category: 'Concrete', colors: ['#9a9488', '#c4beb2', '#6f6a62'], prompt: 'seamless warm grey microcement with smooth matte finish and handcrafted tonal variation' },
  { id: 'oak-herringbone-01', name: 'Oak herringbone 01', category: 'Wood', colors: ['#8a5f34', '#c79b62', '#6e4525'], prompt: 'herringbone oak wood flooring, warm natural tone, matte finish, visible grain' },
  { id: 'dark-walnut-01', name: 'Dark walnut 01', category: 'Wood', colors: ['#2b1810', '#5a351f', '#8a5b37'], prompt: 'dark walnut wood veneer, satin finish, deep brown natural grain, high-end wall panel' },
  { id: 'travertine-01', name: 'Travertine 01', category: 'Stones', colors: ['#b69b79', '#d5c1a0', '#8e765b'], prompt: 'natural travertine stone, honed beige surface, subtle horizontal pores and veins' },
  { id: 'limestone-01', name: 'Limestone 01', category: 'Stones', colors: ['#a69a85', '#d2c7b2', '#7b725f'], prompt: 'natural limestone stone, soft beige grey color, honed matte mineral surface' },
  { id: 'clean-brick-01', name: 'Clean brick 01', category: 'Brick', colors: ['#8b3f2d', '#c56f54', '#f0c5aa'], prompt: 'clean red brick wall material, regular mortar joints, crisp masonry texture' },
  { id: 'clean-brick-02', name: 'Clean brick 02', category: 'Brick', colors: ['#9a4b36', '#d98d6b', '#f4d3bd'], prompt: 'clean warm brick material with light mortar joints and realistic masonry pattern' },
  { id: 'clean-brick-03', name: 'Clean brick 03', category: 'Brick', colors: ['#7e3d2d', '#b85f43', '#e6b193'], prompt: 'clean dark red brick wall with tight mortar lines and even masonry rhythm' },
  { id: 'dirty-brick-01', name: 'Dirty brick 01', category: 'Brick', colors: ['#b96e5b', '#f1dfd6', '#6b4a42'], prompt: 'weathered dirty brick wall, faded red clay, white worn mortar, aged exterior masonry' },
  { id: 'dirty-brick-02', name: 'Dirty brick 02', category: 'Brick', colors: ['#b67a64', '#d9b7a6', '#5e5d64'], prompt: 'aged dirty brick with grey weathering, uneven clay tones, exterior wall material' },
  { id: 'painted-brick-01', name: 'Painted brick 01', category: 'Brick', colors: ['#ebe7df', '#cfc8bd', '#9d9488'], prompt: 'painted white brick wall, visible brick relief, matte worn paint finish' },
  { id: 'rough-brick-01', name: 'Rough brick 01', category: 'Brick', colors: ['#6d3a32', '#9a5648', '#33414a'], prompt: 'rough aged brick, uneven clay tones, dark weathering, realistic exterior texture' },
  { id: 'round-brick-01', name: 'Round brick 01', category: 'Brick', colors: ['#b7b5ae', '#dedbd1', '#78736d'], prompt: 'rounded light brick pattern, soft grey mortar, decorative masonry surface' },
  { id: 'grass-ground-01', name: 'Grass ground 01', category: 'Ground', colors: ['#284a24', '#5f8a3a', '#1d2b18'], prompt: 'natural grass ground material, dense green landscape texture, outdoor site surface' },
  { id: 'gravel-ground-01', name: 'Gravel ground 01', category: 'Ground', colors: ['#6f6a61', '#aaa092', '#3d3a35'], prompt: 'fine gravel ground surface, mixed grey stones, realistic outdoor path material' },
  { id: 'white-plastic-01', name: 'White plastic 01', category: 'Plastic', colors: ['#f1f0ea', '#c8c8c2', '#ffffff'], prompt: 'matte white plastic, smooth manufactured surface, subtle soft reflections' },
  { id: 'black-plastic-01', name: 'Black plastic 01', category: 'Plastic', colors: ['#121212', '#363638', '#050505'], prompt: 'satin black plastic, smooth modern surface, controlled soft reflection' },
  { id: 'linen-wall-01', name: 'Linen wall 01', category: 'Wall coverings', colors: ['#b7aa98', '#e0d5c5', '#8f8372'], prompt: 'natural linen wall covering, soft woven texture, warm neutral beige textile surface' },
  { id: 'wallpaper-01', name: 'Wallpaper 01', category: 'Wall coverings', colors: ['#5d6470', '#c1b8a9', '#2d3137'], prompt: 'premium patterned wallpaper, subtle decorative lines, matte interior wall covering' },
  { id: 'slate-roof-01', name: 'Slate roof 01', category: 'Roof coverings', colors: ['#31363a', '#596167', '#191c1e'], prompt: 'dark slate roof covering, overlapping shingles, realistic exterior roofing material' },
  { id: 'clay-roof-01', name: 'Clay roof 01', category: 'Roof coverings', colors: ['#7f3521', '#c2643c', '#4a1d12'], prompt: 'terracotta clay roof tiles, curved overlapping pattern, warm exterior roofing material' },
  { id: 'acoustic-ceiling-01', name: 'Acoustic ceiling 01', category: 'Ceilings', colors: ['#d8d5cd', '#f0eee8', '#a5a198'], prompt: 'white acoustic ceiling panels, fine perforated texture, clean commercial interior finish' },
  { id: 'linear-ceiling-01', name: 'Linear ceiling 01', category: 'Ceilings', colors: ['#b08a5f', '#d2b083', '#6d4b2f'], prompt: 'linear wood slat ceiling, warm timber strips, modern architectural ceiling finish' },
  { id: 'metal-grid-01', name: 'Metal grid 01', category: 'Grids', colors: ['#22272b', '#707982', '#111315'], prompt: 'dark metal grid mesh, regular square pattern, industrial architectural screen material' },
  { id: 'white-grid-01', name: 'White grid 01', category: 'Grids', colors: ['#d9d9d3', '#ffffff', '#9d9d98'], prompt: 'white architectural grid panel, clean regular divisions, bright interior screen surface' },
  { id: 'calacatta-01', name: 'Calacatta 01', category: 'Marble and granite', colors: ['#f2eee7', '#c9c0b6', '#8f867c'], prompt: 'Calacatta white marble, polished surface, soft grey veining, luxury stone slab' },
  { id: 'black-granite-01', name: 'Black granite 01', category: 'Marble and granite', colors: ['#111111', '#4b4b4b', '#88847c'], prompt: 'polished black granite, subtle mineral speckles, high-end stone countertop material' },
  { id: 'terracotta-tile-01', name: 'Terracotta tile 01', category: 'Tiles', colors: ['#9c4e2c', '#c76f42', '#6f321e'], prompt: 'handmade terracotta ceramic tile, warm clay color, slight irregularity, matte rustic finish' },
  { id: 'green-zellige-01', name: 'Green zellige 01', category: 'Tiles', colors: ['#16493e', '#2f7965', '#0d2d26'], prompt: 'glossy green zellige tile, handmade ceramic, uneven surface reflections, artisanal wall finish' },
]

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
      const queryMatch = !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.prompt.toLowerCase().includes(q)
      return categoryMatch && queryMatch
    })
  }, [query, selectedCategory])
  const searchActive = query.trim().length > 0

  const createModifierWithPrompt = (prompt: string, presetId: string) => {
    setPromptText(prompt)
    const selected = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
    const modifierId = createNode('MODIFIER', {
      x: selected ? selected.position.x + 340 : 220,
      y: selected ? selected.position.y : 220,
    })
    updateNodeParams(modifierId, { prompt, presetId, mask: null, maskLayers: [] })
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
    setSelectedMaterialId(asset.id)
    createModifierWithPrompt(
      `Replace the selected or masked surface material with ${asset.prompt}. Preserve the original geometry, camera, lighting, object positions, and all unmasked areas exactly.`,
      asset.id,
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
                <span
                  className="rounded-full"
                  style={{
                    width: 60,
                    height: 60,
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.34)',
                    ...swatchStyle(asset),
                  }}
                />
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
