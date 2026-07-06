export type MaterialCategory = {
  id: string
  name: string
}

export type PbrMapSet = {
  baseColor?: string
  roughness?: string
  normal?: string
  metallic?: string
  displacement?: string
}

export type MaterialAsset = {
  id: string
  name: string
  category: string
  tags: string[]
  colors: string[]
  prompt: string
  thumbnailPath?: string
  referencePath?: string
  pbr?: PbrMapSet
}

const MATERIAL_CDN_BASE = (import.meta.env.VITE_MATERIAL_CDN_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

export function resolveMaterialAssetUrl(path?: string): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  if (!MATERIAL_CDN_BASE) return null
  return `${MATERIAL_CDN_BASE}/${path.replace(/^\//, '')}`
}

export function materialThumbnailUrl(asset: MaterialAsset): string | null {
  return resolveMaterialAssetUrl(asset.thumbnailPath)
}

export function materialReferenceUrl(asset: MaterialAsset): string | null {
  return resolveMaterialAssetUrl(asset.referencePath ?? asset.thumbnailPath)
}

export const categories: MaterialCategory[] = [
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

function asset(
  id: string,
  name: string,
  category: string,
  colors: string[],
  prompt: string,
  tags: string[],
): MaterialAsset {
  return {
    id,
    name,
    category,
    colors,
    prompt,
    tags,
    thumbnailPath: `thumbs/${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${id}.webp`,
    referencePath: `references/${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${id}.webp`,
    pbr: {
      baseColor: `pbr/${id}/basecolor.webp`,
      roughness: `pbr/${id}/roughness.webp`,
      normal: `pbr/${id}/normal.webp`,
    },
  }
}

export const materials: MaterialAsset[] = [
  asset('clear-glass-01', 'Clear glass 01', 'Glass', ['#d9f0f7', '#8ab5c4', '#f7ffff'], 'transparent clear architectural glass with subtle blue tint and realistic reflections', ['transparent', 'blue tint', 'reflective', 'window']),
  asset('frosted-glass-01', 'Frosted glass 01', 'Glass', ['#cfd8dc', '#eef4f5', '#8fa1aa'], 'frosted translucent glass with soft matte surface and diffused reflections', ['translucent', 'privacy', 'matte', 'diffused']),
  asset('brushed-brass-01', 'Brushed brass 01', 'Metal', ['#8c642b', '#d0a24a', '#5f431f'], 'brushed brass metal with warm golden tone, satin reflection, fine linear grain', ['brass', 'gold', 'satin', 'linear grain']),
  asset('black-steel-01', 'Black steel 01', 'Metal', ['#0f1112', '#2b2f31', '#555b5e'], 'matte black powder coated steel with subtle edge highlights', ['black', 'steel', 'matte', 'powder coated']),
  asset('raw-concrete-01', 'Raw concrete 01', 'Concrete', ['#77736b', '#a19d92', '#4d4b46'], 'raw architectural concrete, matte surface, subtle trowel marks, realistic mineral texture', ['raw', 'mineral', 'matte', 'trowel']),
  asset('microcement-01', 'Microcement 01', 'Concrete', ['#9a9488', '#c4beb2', '#6f6a62'], 'seamless warm grey microcement with smooth matte finish and handcrafted tonal variation', ['seamless', 'warm grey', 'smooth', 'handcrafted']),
  asset('oak-herringbone-01', 'Oak herringbone 01', 'Wood', ['#8a5f34', '#c79b62', '#6e4525'], 'herringbone oak wood flooring, warm natural tone, matte finish, visible grain', ['oak', 'herringbone', 'flooring', 'warm']),
  asset('dark-walnut-01', 'Dark walnut 01', 'Wood', ['#2b1810', '#5a351f', '#8a5b37'], 'dark walnut wood veneer, satin finish, deep brown natural grain, high-end wall panel', ['walnut', 'veneer', 'dark', 'panel']),
  asset('travertine-01', 'Travertine 01', 'Stones', ['#b69b79', '#d5c1a0', '#8e765b'], 'natural travertine stone, honed beige surface, subtle horizontal pores and veins', ['travertine', 'beige', 'honed', 'pores']),
  asset('limestone-01', 'Limestone 01', 'Stones', ['#a69a85', '#d2c7b2', '#7b725f'], 'natural limestone stone, soft beige grey color, honed matte mineral surface', ['limestone', 'beige grey', 'honed', 'stone']),
  asset('clean-brick-01', 'Clean brick 01', 'Brick', ['#8b3f2d', '#c56f54', '#f0c5aa'], 'clean red brick wall material, regular mortar joints, crisp masonry texture', ['red brick', 'mortar', 'masonry', 'clean']),
  asset('clean-brick-02', 'Clean brick 02', 'Brick', ['#9a4b36', '#d98d6b', '#f4d3bd'], 'clean warm brick material with light mortar joints and realistic masonry pattern', ['warm brick', 'light mortar', 'masonry']),
  asset('clean-brick-03', 'Clean brick 03', 'Brick', ['#7e3d2d', '#b85f43', '#e6b193'], 'clean dark red brick wall with tight mortar lines and even masonry rhythm', ['dark red', 'tight mortar', 'brick']),
  asset('dirty-brick-01', 'Dirty brick 01', 'Brick', ['#b96e5b', '#f1dfd6', '#6b4a42'], 'weathered dirty brick wall, faded red clay, white worn mortar, aged exterior masonry', ['weathered', 'dirty', 'aged', 'exterior']),
  asset('dirty-brick-02', 'Dirty brick 02', 'Brick', ['#b67a64', '#d9b7a6', '#5e5d64'], 'aged dirty brick with grey weathering, uneven clay tones, exterior wall material', ['aged', 'grey weathering', 'uneven', 'clay']),
  asset('painted-brick-01', 'Painted brick 01', 'Brick', ['#ebe7df', '#cfc8bd', '#9d9488'], 'painted white brick wall, visible brick relief, matte worn paint finish', ['white', 'painted', 'relief', 'worn']),
  asset('rough-brick-01', 'Rough brick 01', 'Brick', ['#6d3a32', '#9a5648', '#33414a'], 'rough aged brick, uneven clay tones, dark weathering, realistic exterior texture', ['rough', 'aged', 'dark weathering']),
  asset('round-brick-01', 'Round brick 01', 'Brick', ['#b7b5ae', '#dedbd1', '#78736d'], 'rounded light brick pattern, soft grey mortar, decorative masonry surface', ['rounded', 'light brick', 'decorative']),
  asset('grass-ground-01', 'Grass ground 01', 'Ground', ['#284a24', '#5f8a3a', '#1d2b18'], 'natural grass ground material, dense green landscape texture, outdoor site surface', ['grass', 'landscape', 'outdoor']),
  asset('gravel-ground-01', 'Gravel ground 01', 'Ground', ['#6f6a61', '#aaa092', '#3d3a35'], 'fine gravel ground surface, mixed grey stones, realistic outdoor path material', ['gravel', 'path', 'grey stones']),
  asset('white-plastic-01', 'White plastic 01', 'Plastic', ['#f1f0ea', '#c8c8c2', '#ffffff'], 'matte white plastic, smooth manufactured surface, subtle soft reflections', ['white', 'plastic', 'smooth']),
  asset('black-plastic-01', 'Black plastic 01', 'Plastic', ['#121212', '#363638', '#050505'], 'satin black plastic, smooth modern surface, controlled soft reflection', ['black', 'plastic', 'satin']),
  asset('linen-wall-01', 'Linen wall 01', 'Wall coverings', ['#b7aa98', '#e0d5c5', '#8f8372'], 'natural linen wall covering, soft woven texture, warm neutral beige textile surface', ['linen', 'woven', 'wall', 'beige']),
  asset('wallpaper-01', 'Wallpaper 01', 'Wall coverings', ['#5d6470', '#c1b8a9', '#2d3137'], 'premium patterned wallpaper, subtle decorative lines, matte interior wall covering', ['wallpaper', 'patterned', 'decorative']),
  asset('slate-roof-01', 'Slate roof 01', 'Roof coverings', ['#31363a', '#596167', '#191c1e'], 'dark slate roof covering, overlapping shingles, realistic exterior roofing material', ['slate', 'roof', 'shingles']),
  asset('clay-roof-01', 'Clay roof 01', 'Roof coverings', ['#7f3521', '#c2643c', '#4a1d12'], 'terracotta clay roof tiles, curved overlapping pattern, warm exterior roofing material', ['clay', 'terracotta', 'roof']),
  asset('acoustic-ceiling-01', 'Acoustic ceiling 01', 'Ceilings', ['#d8d5cd', '#f0eee8', '#a5a198'], 'white acoustic ceiling panels, fine perforated texture, clean commercial interior finish', ['acoustic', 'ceiling', 'perforated']),
  asset('linear-ceiling-01', 'Linear ceiling 01', 'Ceilings', ['#b08a5f', '#d2b083', '#6d4b2f'], 'linear wood slat ceiling, warm timber strips, modern architectural ceiling finish', ['linear', 'wood slat', 'ceiling']),
  asset('metal-grid-01', 'Metal grid 01', 'Grids', ['#22272b', '#707982', '#111315'], 'dark metal grid mesh, regular square pattern, industrial architectural screen material', ['metal', 'grid', 'mesh']),
  asset('white-grid-01', 'White grid 01', 'Grids', ['#d9d9d3', '#ffffff', '#9d9d98'], 'white architectural grid panel, clean regular divisions, bright interior screen surface', ['white', 'grid', 'screen']),
  asset('calacatta-01', 'Calacatta 01', 'Marble and granite', ['#f2eee7', '#c9c0b6', '#8f867c'], 'Calacatta white marble, polished surface, soft grey veining, luxury stone slab', ['calacatta', 'marble', 'polished']),
  asset('black-granite-01', 'Black granite 01', 'Marble and granite', ['#111111', '#4b4b4b', '#88847c'], 'polished black granite, subtle mineral speckles, high-end stone countertop material', ['black', 'granite', 'polished']),
  asset('terracotta-tile-01', 'Terracotta tile 01', 'Tiles', ['#9c4e2c', '#c76f42', '#6f321e'], 'handmade terracotta ceramic tile, warm clay color, slight irregularity, matte rustic finish', ['terracotta', 'tile', 'handmade']),
  asset('green-zellige-01', 'Green zellige 01', 'Tiles', ['#16493e', '#2f7965', '#0d2d26'], 'glossy green zellige tile, handmade ceramic, uneven surface reflections, artisanal wall finish', ['zellige', 'green', 'glossy']),
]
