import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, ImagePlus, Zap, Loader2, SlidersHorizontal, Download, Pencil, Pipette, Wand2, X } from 'lucide-react'
import { useClassicStore, type ClassicModel, type ClassicSize, type MaterialSwap } from '../../state/classicStore'
import { materialReferenceUrl, materialThumbnailUrl, materials as libraryMaterials, type MaterialAsset } from '../../data/materialLibrary'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { useHistoryStore } from '../../state/historyStore'
import { selectScene, requestCapture, addScene, sendCamera, fetchSourceOnce, captureMask, isBridgeOrigin, bridgeToolLabel, captureDepth, getCachedSourceMaterials, loadMaterialDetail, loadSourceMaterials, materialTextureUri } from '../../api/sketchupBridge'
import { generateAutoPrompt, buildLightingDescription } from '../../engine/autoPrompt'
import { renderMain } from '../../engine/adapters/mainRenderer'
import { maskToHighlightOverlay, segmentObjectAtPoint } from '../../engine/segmentPoint'
import { EditOverlay } from '../panels/EditOverlay'
import { ImageLightbox } from '../panels/ImageLightbox'
import type { NodeData } from '../../types/node'
import type { EdgeData } from '../../types/graph'

// ---------------------------------------------------------------------------
// 클래식 렌더 화면 — 레거시 루비 창(main_dialog.html) UI의 충실한 재현
// 디자인 수치는 레거시 main-base.css / main-render.css 원본 값 사용
// ---------------------------------------------------------------------------

// ── 레거시 디자인 토큰 (main-base.css에서 추출) ──────────────────────────────
const C = {
  bg: '#0a0a0a',
  sidebar: '#141414',
  border: '#333333',
  input: '#0a0a0a',
  panelBg: '#0d0d0d',
  panelLabel: '#1a1a1a',
  promptBg: '#111111',
  textarea: '#1a1a1a',
  accent: '#00c9a7', // 앱 공통 액센트 (틸) - 화면마다 색 튀지 않게 통일
  text: '#e0e0e0',
  dim: '#666666',
  label: '#666666',
}

function saveClassicRenderHistory(opts: {
  sourceImage: string
  resultImage: string
  prompt: string
  negativePrompt: string
  engine: 'main' | 'experimental-interior'
  resolution: string
  timePreset: 'day' | 'evening' | 'night'
  lightsOn: boolean
}) {
  const now = new Date().toISOString()
  const sourceId = `classic-source-${Date.now()}`
  const renderId = `classic-render-${Date.now()}`
  const nodes: NodeData[] = [
    {
      id: sourceId,
      type: 'SOURCE',
      position: { x: 80, y: 180 },
      status: 'done',
      params: {
        origin: 'sketchup',
        image: opts.sourceImage,
        cameraLocked: true,
        sceneMeta: null,
      },
      result: { image: opts.sourceImage, timestamp: now, cacheKey: '' },
      cost: 0,
      version: '1.0.0',
    },
    {
      id: renderId,
      type: 'RENDER',
      position: { x: 420, y: 180 },
      status: 'done',
      params: {
        engine: opts.engine,
        prompt: opts.prompt,
        negativePrompt: opts.negativePrompt,
        presetId: null,
        seed: null,
        resolution: opts.resolution,
        timePreset: opts.timePreset,
        lightsOn: opts.lightsOn,
      },
      result: { image: opts.resultImage, resolution: opts.resolution, timestamp: now, cacheKey: '' },
      cost: opts.engine === 'experimental-interior' ? 4 : 1,
      version: '1.0.0',
    },
  ]
  const edges: EdgeData[] = [{
    id: `classic-edge-${Date.now()}`,
    from: sourceId,
    fromPort: 'image',
    to: renderId,
    toPort: 'image',
  }]
  useHistoryStore.getState().saveSnapshot(nodes, edges, nodes[1].cost)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </span>
  )
}

function Segmented({ options, value, onChange }: {
  options: { v: string; l: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex" style={{ background: C.input, borderRadius: 6, padding: 3, border: `1px solid ${C.border}` }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className="flex-1 transition-colors"
          style={{
            padding: '5px 4px', fontSize: 11, fontWeight: 500, borderRadius: 4,
            background: value === o.v ? '#333333' : 'transparent',
            color: value === o.v ? '#ffffff' : C.dim,
          }}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

function CamKey({ k, title, onClick, active }: { k: string; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 22, height: 22, fontSize: 9, fontWeight: 600, borderRadius: 4,
        background: active ? C.accent : '#1e1e1e', color: active ? '#0a0a14' : '#999',
        border: `1px solid ${C.border}`,
      }}
    >
      {k}
    </button>
  )
}

declare global {
  interface Window {
    vizmakerNative?: { getSketchUpSourceId: () => Promise<string | null>; setSketchUpTitleHint: (t: string) => void }
  }
}

// 스포이드 커서 (핫스팟 = 촉 끝 좌하단). 흰 외곽선 + 검정 본선이라 밝고 어두운 배경 모두에서 보인다
// 표준 커서 크기(~18px)로 렌더링 — 24px + 두꺼운 외곽선은 커서로는 과대
const EYEDROPPER_CURSOR = (() => {
  const paths = '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">`
    + `<g stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
    + `<g stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
    + '</svg>'
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 1 17, crosshair`
})()

// ── 이미지 단독 스포이드 (브릿지 마스크 없이) ────────────────────────────────
// 업로드 이미지/미연결 상태에선 ID 마스크가 없으므로 클릭 지점을 좌표 기반
// 의사 재질('@point:fx,fy')로 저장하고, 생성 시 그 지점에 원을 그린 사본을
// 참조 이미지로 보내 "표시된 표면만 교체"를 지시한다.
const POINT_MATERIAL_PREFIX = '@point:'

function parsePointMaterial(material: string): { fx: number; fy: number } | null {
  if (!material.startsWith(POINT_MATERIAL_PREFIX)) return null
  const [fx, fy] = material.slice(POINT_MATERIAL_PREFIX.length).split(',').map(Number)
  return Number.isFinite(fx) && Number.isFinite(fy) ? { fx, fy } : null
}

function swapMaterialLabel(material: string): string {
  const p = parsePointMaterial(material)
  return p ? `지점 (${Math.round(p.fx * 100)}%, ${Math.round(p.fy * 100)}%)` : material
}

async function markPointOnImage(image: string, fx: number, fy: number): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('image load failed'))
      i.src = image.startsWith('data:') || image.startsWith('http') ? image : `data:image/png;base64,${image}`
    })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const x = fx * c.width
    const y = fy * c.height
    const r = Math.max(14, Math.min(c.width, c.height) * 0.05)
    ctx.lineWidth = Math.max(4, r * 0.22)
    ctx.strokeStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.lineWidth = Math.max(2.5, r * 0.13)
    ctx.strokeStyle = '#ff2d2d'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────

export function RenderClassicPage() {
  const s = useClassicStore()
  const scenes = useUIStore((st) => st.sketchUpScenes)
  const status = useUIStore((st) => st.sketchUpStatus)
  const nodes = useGraphStore((st) => st.nodes)
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<{ src: 'prompt' | 'negative'; res: 'prompt' | 'negative' }>({ src: 'prompt', res: 'prompt' })
  const abortRef = useRef<AbortController | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const viewport = useUIStore((st) => st.sketchUpViewport)
  const bridgeTool = useUIStore((st) => st.bridgeTool) // 노드 탐색 + 라벨 반응성
  const toolLabel = bridgeToolLabel() // 미연결이면 '3D 툴' (SketchUp 전용 아님)

  // 3D 툴 미러 이미지 (브릿지가 그래프의 소스 노드에 주입 — 연결 툴에 따라 origin이 다름)
  // 툴을 오간 경우 소스 노드가 툴별로 존재할 수 있으므로 현재 연결 툴의 노드를 우선한다
  const liveNode =
    nodes.find((n) => n.type === 'SOURCE' && 'origin' in n.params && n.params.origin === bridgeTool)
    ?? nodes.find((n) => n.type === 'SOURCE' && 'origin' in n.params && isBridgeOrigin(n.params.origin))
  const liveImage = liveNode?.result?.image ?? (liveNode && 'image' in liveNode.params ? (liveNode.params as { image: string }).image : null)
  const sourceImage = s.previewOverride ?? (s.mirror ? (liveImage ?? s.frozenSource) : (s.frozenSource ?? liveImage))

  // 카메라 조작 = 다시 구도 잡는 중: 고정 캡처를 풀고 미러를 재개해 변화가 바로 보이게 한다
  const camCommand = useCallback((action: Parameters<typeof sendCamera>[0], value?: string) => {
    // 카메라가 바뀌면 이전 뷰의 재질 마스크/선택은 어긋나므로 함께 무효화
    useClassicStore.getState().set({
      mirror: true, frozenSource: null, previewOverride: null, sourceLoading: true,
      maskUri: null, maskMap: [], sourceSelectedColors: [],
    })
    sendCamera(action, value)
  }, [])

  // ── 스포이드 재질 교체 ──────────────────────────────────────────────────
  const [pickedMaterial, setPickedMaterial] = useState<string | null>(null)
  const [regionPickOpen, setRegionPickOpen] = useState(false)

  // 업로드 이미지 매직툴: 클릭 지점의 객체 영역을 Gemini 세그멘테이션으로 선택
  const handleAiMagicPick = useCallback(async (fx: number, fy: number) => {
    const st = useClassicStore.getState()
    if (st.sourceTool !== 'magic' || st.aiMagicBusy) return
    const image = st.previewOverride ?? st.frozenSource
    if (!image) return
    st.set({ aiMagicBusy: true, statusText: '매직: AI가 클릭한 객체 영역을 인식하는 중...' })
    try {
      const seg = await segmentObjectAtPoint(image, fx, fy)
      if (!seg) {
        useClassicStore.getState().set({ aiMagicBusy: false, statusText: '매직: 영역을 인식하지 못했습니다 — 객체 중앙을 다시 클릭해보세요' })
        return
      }
      const overlay = await maskToHighlightOverlay(seg.mask)
      useClassicStore.getState().set({
        aiMagicBusy: false,
        aiSelMask: seg.mask,
        aiSelOverlay: overlay,
        aiSelLabel: seg.label,
        statusText: `매직: "${seg.label}" 영역 선택됨 — 프롬프트 입력 후 생성하면 이 영역만 변경됩니다`,
      })
    } catch (err) {
      useClassicStore.getState().set({ aiMagicBusy: false, statusText: `매직 영역 인식 실패: ${err instanceof Error ? err.message : err}` })
    }
  }, [])

  // 소스 이미지 클릭(비율 좌표) → ID 마스크 픽셀 색 → 재질 이름
  // 업로드 이미지/브릿지 미연결이면 좌표 기반 지점 선택으로 폴백 (마스크 불필요)
  const handleSourcePick = useCallback(async (fx: number, fy: number) => {
    const st = useClassicStore.getState()
    if (st.sourceTool !== 'eyedropper' && st.resultTool !== 'eyedropper') return

    const uploadedSource = Boolean(st.frozenSource) && !st.frozenFromBridge
    if (uploadedSource || useUIStore.getState().sketchUpStatus !== 'connected') {
      setPickedMaterial(`${POINT_MATERIAL_PREFIX}${fx.toFixed(4)},${fy.toFixed(4)}`)
      st.set({ statusText: '지점 선택됨 — 교체할 재질을 고르세요 (생성 시 해당 표면에 적용)' })
      return
    }

    let maskUri = st.maskUri
    let maskMap = st.maskMap
    if (!maskUri || maskMap.length === 0) {
      st.set({ statusText: '재질 마스크 캡처 중...' })
      const m = await captureMask()
      if (!m) {
        // 마스크 캡처 실패 시에도 지점 선택으로 폴백 (스포이드가 죽지 않게)
        setPickedMaterial(`${POINT_MATERIAL_PREFIX}${fx.toFixed(4)},${fy.toFixed(4)}`)
        useClassicStore.getState().set({ statusText: '지점 선택됨 — 교체할 재질을 고르세요' })
        return
      }
      maskUri = m.uri
      maskMap = m.map
      useClassicStore.getState().set({ maskUri, maskMap })
    }

    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => resolve(null)
      i.src = maskUri!
    })
    if (!img) return
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(
      Math.min(c.width - 1, Math.floor(fx * c.width)),
      Math.min(c.height - 1, Math.floor(fy * c.height)),
      1, 1,
    ).data

    // 근사 매칭 (±3 — MaskSelectOverlay와 동일 기준)
    const entry = maskMap.find((m) => {
      const r = parseInt(m.color.slice(1, 3), 16)
      const g = parseInt(m.color.slice(3, 5), 16)
      const b = parseInt(m.color.slice(5, 7), 16)
      return Math.abs(d[0] - r) <= 3 && Math.abs(d[1] - g) <= 3 && Math.abs(d[2] - b) <= 3
    })
    if (!entry) {
      useClassicStore.getState().set({ statusText: '해당 지점의 재질을 인식하지 못했습니다 (배경/하늘일 수 있음)' })
      return
    }

    setPickedMaterial(entry.material)
  }, [])

  const addSwap = useCallback((replacement: MaterialSwap['replacement']) => {
    if (!pickedMaterial) return
    const st = useClassicStore.getState()
    st.set({
      materialSwaps: [
        ...st.materialSwaps.filter((sw) => sw.material !== pickedMaterial),
        { material: pickedMaterial, replacement },
      ],
      sourceTool: 'none',
      resultTool: 'none',
      statusText: `재질 교체 지정: ${pickedMaterial} → ${replacement.name} (생성 시 적용됩니다)`,
    })
    setPickedMaterial(null)
  }, [pickedMaterial])


  // ── 실시간 미러링 (Electron: SketchUp 창을 30fps 스트림으로) ──
  useEffect(() => {
    if (!window.vizmakerNative || !s.mirror || status !== 'connected') {
      setLiveStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return null })
      return
    }
    // 모델 창 제목을 알기 전에는 스트림을 시작하지 않는다 (다른 창 오탐 방지)
    const hint = viewport?.title
    if (!hint) {
      setLiveStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return null })
      return
    }
    let cancelled = false
    window.vizmakerNative.setSketchUpTitleHint(hint)
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        setLiveStream(stream)
      })
      .catch(() => {
        // 화면 기록 권한 없음 등 - 폴링 미러로 폴백
        setLiveStream(null)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.mirror, status, viewport?.title])

  useEffect(() => {
    if (videoRef.current && liveStream) videoRef.current.srcObject = liveStream
  }, [liveStream])

  // 주의: 스트림 프레임(SketchUp 창 캡처)에는 툴바/패널 UI가 포함되므로
  // AI 입력으로는 절대 쓰지 않는다. 생성 입력은 항상 브릿지의 클린 뷰포트 캡처.

  // 새 소스 이미지 도착: 씬 프리뷰 캐시에 저장하고 즉시표시 상태 해제
  useEffect(() => {
    if (!liveImage) return
    const st = useClassicStore.getState()
    const activeScene = useUIStore.getState().sketchUpScenes.find((sc) => sc.active)?.name
    const key = st.lastSceneClicked ?? activeScene
    // 미러 중 새 캡처 = 카메라/뷰가 바뀜 → 이전 뷰의 재질 마스크는 이제 어긋난다.
    // 무효화하고, 매직툴이 켜져 있으면 새 뷰 기준으로 즉시 재캡처한다.
    const viewChanged = st.mirror && st.maskUri !== null
    st.set({
      sourceLoading: false,
      previewOverride: null,
      lastSceneClicked: null,
      ...(key ? { scenePreviews: { ...st.scenePreviews, [key]: liveImage } } : {}),
      ...(viewChanged ? { maskUri: null, maskMap: [], sourceSelectedColors: [] } : {}),
    })
    if (viewChanged && (st.sourceTool === 'magic' || st.resultTool === 'magic')) {
      useClassicStore.getState().set({ statusText: '뷰 변경 감지 — 재질 마스크 재캡처 중...' })
      void captureMask().then((m) => {
        useClassicStore.getState().set(m
          ? { maskUri: m.uri, maskMap: m.map, statusText: '매직: 새 뷰 기준으로 준비됨' }
          : { statusText: '재질 마스크 재캡처 실패 - 3D 툴 연결을 확인하세요' })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveImage])

  // 로딩 5초 안전장치 (이미지가 안 와도 오버레이가 영원히 남지 않게)
  useEffect(() => {
    if (!s.sourceLoading) return
    const t = setTimeout(() => useClassicStore.getState().set({ sourceLoading: false }), 5000)
    return () => clearTimeout(t)
  }, [s.sourceLoading])

  // 렌더링 경과 시간 (하드코딩 추정치 대신 실제 초 카운트)
  useEffect(() => {
    if (!s.rendering) { setElapsed(0); return }
    const t0 = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(t)
  }, [s.rendering])

  // ── 키보드 단축키 (레거시: WASD 이동 | QE 높이 | ZX 회전) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return
      const map: Record<string, [Parameters<typeof sendCamera>[0], string]> = {
        w: ['move', 'forward'], a: ['move', 'left'], s: ['move', 'back'], d: ['move', 'right'],
        q: ['move', 'up'], e: ['move', 'down'], z: ['rotate', 'left'], x: ['rotate', 'right'],
      }
      const m = map[e.key.toLowerCase()]
      if (m) camCommand(m[0], m[1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── 동작 ──
  // Convert: 고품질 캡처를 '새 이미지 도착 확인'까지 기다렸다가 고정 표시 (레거시 동작)
  const doConvert = useCallback(async () => {
    s.set({ statusText: `Convert 중... (고품질 ${s.size}px 캡처)`, sourceLoading: true })
    const before = await fetchSourceOnce()
    await requestCapture(s.size)
    const t0 = Date.now()
    const poll = async () => {
      const now = await fetchSourceOnce()
      if (now && now.sig !== before?.sig) {
        // 새 고화질 캡처 도착: 미러 정지 + 정지 이미지 고정 (렌더/Auto의 입력)
        useClassicStore.getState().set({
          frozenSource: now.uri,
          frozenFromBridge: true,
          mirror: false,
          sourceLoading: false,
          statusText: `고품질 캡처 완료 (${s.size}px) - Auto로 프롬프트 생성하세요. Mirror를 켜면 실시간으로 복귀`,
        })
        // 같은 카메라로 마스크 패스도 즉시 캡처해 소스와 쌍으로 고정
        // (렌더 완료 시점에 찍으면 렌더 도중 씬이 바뀌었을 때 다른 뷰가 찍힌다)
        captureMask().then((m) => {
          useClassicStore.getState().set({ maskUri: m?.uri ?? null, maskMap: m?.map ?? [] })
        })
        return
      }
      if (Date.now() - t0 < 10_000) setTimeout(poll, 450)
      else useClassicStore.getState().set({ sourceLoading: false, statusText: `Convert 실패 - ${bridgeToolLabel()} 연결 확인` })
    }
    setTimeout(poll, 600)
  }, [s])

  const doAuto = useCallback(async () => {
    if (s.autoLoading) { abortRef.current?.abort(); return }
    // 생성 입력은 클린 뷰포트 캡처만 (스트림 화면엔 SketchUp UI가 섞임)
    const autoInput = s.frozenSource ?? liveImage
    if (!autoInput) { s.set({ statusText: '먼저 Convert 하거나 이미지를 불러오세요' }); return }
    const controller = new AbortController()
    abortRef.current = controller
    s.set({ autoLoading: true, statusText: 'Auto 프롬프트 생성 중...' })
    const watchdog = setTimeout(() => controller.abort(), 120_000)
    try {
      const r = await generateAutoPrompt({
        image: autoInput,
        timePreset: s.timePreset,
        lightsOn: s.lightsOn,
        signal: controller.signal,
      })
      useClassicStore.getState().set({
        sourcePrompt: r.prompt, sourceNegative: r.negativePrompt,
        statusText: 'Auto 프롬프트 생성 완료 - ⚡로 렌더링하세요',
      })
    } catch (err) {
      if (!controller.signal.aborted) {
        useClassicStore.getState().set({ statusText: `프롬프트 생성 실패: ${err instanceof Error ? err.message : err}` })
      } else {
        useClassicStore.getState().set({ statusText: 'Auto 프롬프트 취소됨' })
      }
    } finally {
      clearTimeout(watchdog)
      useClassicStore.getState().set({ autoLoading: false })
    }
  }, [s, sourceImage, liveImage])

  const doRender = useCallback(async (which: 'src' | 'res') => {
    const st = useClassicStore.getState()
    // 생성 입력은 항상 클린 뷰포트 캡처 (Convert 고정본 > 브릿지 미러 최신본)
    const input = which === 'src' ? (st.frozenSource ?? liveImage) : (st.resultImage ?? sourceImage)
    const prompt = which === 'src' ? st.sourcePrompt : st.resultPrompt
    const negative = which === 'src' ? st.sourceNegative : st.resultNegative
    if (!input) { st.set({ statusText: '소스 이미지가 없습니다' }); return }
    const regionFlow = which === 'res' && !!st.regionMaterial && st.selectedColors.length > 0
    const effectivePrompt = prompt.trim()
      || (regionFlow ? 'Apply the specified material to the selected region while keeping everything else identical.' : '')
    if (!effectivePrompt) { st.set({ statusText: '프롬프트를 입력하거나 Auto로 생성하세요' }); return }

    const lighting = buildLightingDescription(st.timePreset, st.lightsOn)
    // 영역 선택이 있으면 흑백 선택 마스크 생성 (흰색=변경 허용 영역)
    // 마스크는 RESULT와 쌍이므로 2차 생성('res')에만 적용한다
    let selMask: string | null = null
    if (which === 'res' && st.maskUri && st.selectedColors.length > 0) {
      selMask = await buildSelectionMask(st.maskUri, st.selectedColors)
    } else if (which === 'src' && st.maskUri && st.sourceSelectedColors.length > 0) {
      // 매직툴 선택: 1차 생성도 선택 영역만 편집 (영역 밖은 원본 픽셀 유지)
      selMask = await buildSelectionMask(st.maskUri, st.sourceSelectedColors)
    } else if (which === 'src' && st.aiSelMask) {
      // 업로드 이미지 매직툴: Gemini 세그멘테이션 마스크 (동일 파이프라인)
      selMask = st.aiSelMask
    }
    st.set({
      rendering: true,
      statusText: selMask ? '선택 영역만 편집 렌더링 중...' : '렌더링 중...',
      resultMaskView: false,
    })
    // 미러(라이브) 입력으로 렌더하는 경우: 지금 카메라가 곧 입력 화면이므로
    // 렌더와 병행해서 같은 카메라의 마스크를 캡처해 쌍으로 만든다
    // (Convert를 거쳤다면 doConvert에서 이미 쌍으로 캡처됨)
    if (which === 'src' && !st.frozenSource) {
      captureMask().then((m) => {
        useClassicStore.getState().set({ maskUri: m?.uri ?? null, maskMap: m?.map ?? [] })
      })
    }
    const engine = st.model === 'gemini-3-pro-image' ? 'experimental-interior' : 'main'

    // ── 추가 입력 이미지 조립: [깊이맵] + [스타일 참조] + [재질 교체 참조] ──
    // 순서 고정: 프롬프트에서 "image N"으로 지칭하므로 배열 순서와 일치해야 한다
    const extraImages: string[] = []
    let promptSuffix = ''

    // 구조 고정: 브릿지 뷰가 입력일 때만 깊이맵 캡처 (업로드 이미지엔 미적용)
    const bridgeInput = !st.frozenSource || st.frozenFromBridge
    if (which === 'src' && st.depthLock && bridgeInput && useUIStore.getState().sketchUpStatus === 'connected') {
      st.set({ statusText: '깊이맵 캡처 중... (구조 고정)' })
      let depth = await captureDepth()
      // 유효성 검증: 명암 변화가 거의 없는 맵(전부 검정/흰색)은 구조 정보가 없어
      // 오히려 AI가 "빈 공간"으로 오해하고 가구를 지어낸다 → 폐기하고 깊이 없이 진행
      if (depth) {
        const valid = await new Promise<boolean>((resolve) => {
          const img = new Image()
          img.onload = () => {
            try {
              const c = document.createElement('canvas')
              c.width = 64
              c.height = 36
              const cx = c.getContext('2d', { willReadFrequently: true })!
              cx.drawImage(img, 0, 0, 64, 36)
              const d = cx.getImageData(0, 0, 64, 36).data
              let min = 255
              let max = 0
              for (let i = 0; i < d.length; i += 4) {
                const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
                if (lum < min) min = lum
                if (lum > max) max = lum
              }
              resolve(max - min >= 24)
            } catch { resolve(false) }
          }
          img.onerror = () => resolve(false)
          img.src = depth!
        })
        if (!valid) {
          console.warn('[render] 깊이맵이 균일함(정보 없음) — 폐기하고 깊이 없이 렌더')
          depth = null
        }
      }
      if (depth) {
        extraImages.push(depth)
        // 명암 방향: SketchUp 안개 근사 = 밝음이 가까움 / Blender Mist = 밝음이 멂
        const convention = useUIStore.getState().bridgeTool === 'blender'
          ? 'brighter = farther from camera'
          : 'brighter = closer to camera'
        promptSuffix += `\n\n[GEOMETRY LOCK - DEPTH MAP]\nImage ${extraImages.length + 1} is a depth map of the EXACT same view (${convention}). Treat it as the authoritative 3D structure: keep the camera position, wall/furniture geometry, and object placement pixel-identical to it. Never add, remove, move, or resize any object. Only change materials, textures, lighting, and atmosphere.`
      } else {
        st.set({ statusText: '깊이맵 캡처 실패 — 구조 고정 없이 진행합니다' })
      }
    }

    // 스타일 참조: 색·재질·조명 분위기만 (형상/오브젝트 복사 금지)
    if (st.styleRef) {
      extraImages.push(st.styleRef)
      promptSuffix += `\n\n[STYLE REFERENCE]\nImage ${extraImages.length + 1} is a style reference for aesthetics ONLY. Borrow its color palette, material feel, lighting mood, and atmosphere. ABSOLUTELY DO NOT copy any objects, furniture, layout, faces, logos, or composition from it.`
    }

    // 선택 영역 재질: 매직 선택 영역에 라이브러리/로컬 재질 적용 (2차 전용)
    if (regionFlow && st.regionMaterial) {
      if (st.regionMaterial.kind === 'image') {
        extraImages.push(st.regionMaterial.image)
        promptSuffix += `\n\n[REGION MATERIAL]\nApply the material shown in image ${extraImages.length + 1} ("${st.regionMaterial.name}") to the editable (masked) region: match its texture, color, pattern scale, and finish. Everything outside the region must stay untouched.`
      } else {
        promptSuffix += `\n\n[REGION MATERIAL]\nChange the editable (masked) region's material to: ${st.regionMaterial.prompt}. Everything outside the region must stay untouched.`
      }
    }

    // 스포이드 재질 교체: 지정된 재질을 사용자가 고른 재질로 (1차·2차 공통)
    // '@point:' 의사 재질(이미지 단독 모드)은 지점에 원을 그린 사본을 함께 보내 위치를 지시한다
    if (st.materialSwaps.length > 0) {
      const lines: string[] = []
      let hasPointMarker = false
      for (const sw of st.materialSwaps) {
        const point = parsePointMaterial(sw.material)
        let target = `every surface using the material "${sw.material}"`
        if (point) {
          const marked = await markPointOnImage(input, point.fx, point.fy)
          if (marked) {
            extraImages.push(marked)
            hasPointMarker = true
            target = `the entire continuous surface/object at the location circled in red in image ${extraImages.length + 1}`
          } else {
            target = `the entire continuous surface located at about ${Math.round(point.fx * 100)}% from the left and ${Math.round(point.fy * 100)}% from the top of the image`
          }
        }
        if (sw.replacement.kind === 'library') {
          lines.push(`- Replace ${target} with: ${sw.replacement.prompt}.`)
        } else {
          extraImages.push(sw.replacement.image)
          lines.push(`- Replace ${target} with the material shown in image ${extraImages.length + 1} ("${sw.replacement.name}"). Match its texture, color, and finish.`)
        }
      }
      promptSuffix += `\n\n[MATERIAL SWAP - APPLY EXACTLY]\n${lines.join('\n')}\nAll other materials must stay unchanged.${hasPointMarker ? ' Never draw the red circle marker in the output.' : ''}`
    }

    try {
      const result = await renderMain({
        engine,
        image: input,
        extraImages: extraImages.length > 0 ? extraImages : undefined,
        prompt: `${effectivePrompt}\n\n[LIGHTING]\n${lighting}${promptSuffix}`,
        systemPrompt: '',
        negativePrompt: negative,
        seed: null,
        resolution: st.size,
        mask: selMask,
      })
      if (!result.image) throw new Error('렌더링 결과 이미지가 없습니다')
      // 선택 영역 편집: AI가 마스크 밖까지 바꿔버리는 것을 원천 차단 -
      // 선택 영역 밖은 원본 픽셀로 되돌려 합성한다 (선택 부위만 변경 100% 보장)
      let finalImage = result.image
      if (selMask) {
        finalImage = (await compositeMasked(input, result.image, selMask)) ?? result.image
      }
      useClassicStore.getState().set({
        resultImage: finalImage,
        renderSourceImage: input,
        rendering: false,
        statusText: selMask
          ? '선택 부위만 적용 완료 (나머지 영역은 원본 유지)'
          : '렌더링 완료 - RESULT의 [마스크 패스] 탭에서 부위를 선택할 수 있습니다',
        // 마스크 적용 렌더가 끝나면 선택 소진 (다음 렌더에 의도치 않게 재적용 방지)
        ...(selMask ? { selectedColors: [], regionMaterial: null, aiSelMask: null, aiSelOverlay: null, aiSelLabel: null } : {}),
      })
      saveClassicRenderHistory({
        sourceImage: input,
        resultImage: finalImage,
        prompt,
        negativePrompt: negative,
        engine,
        resolution: st.size,
        timePreset: st.timePreset,
        lightsOn: st.lightsOn,
      })
    } catch (err) {
      useClassicStore.getState().set({
        rendering: false,
        statusText: `렌더링 실패: ${err instanceof Error ? err.message : err}`,
      })
    }
  }, [sourceImage, liveImage])

  const doExport = useCallback(() => {
    const img = useClassicStore.getState().resultImage
    if (!img) return
    const a = document.createElement('a')
    a.href = img
    a.download = `lumanova-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`
    a.click()
  }, [])

  const onUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => useClassicStore.getState().set({ frozenSource: String(reader.result), frozenFromBridge: false, mirror: false, statusText: '이미지 로드됨' })
    reader.readAsDataURL(f)
    e.target.value = ''
  }, [])

  // ── 레이아웃 ──
  return (
    <div className="flex flex-1 overflow-hidden" style={{ background: C.bg, color: C.text, fontSize: 12 }}>
      {/* ══ 좌측 컨트롤 사이드바 (레거시 .sidebar 200px) ══ */}
      <aside className="flex flex-col" style={{ width: 200, minWidth: 200, background: C.sidebar, borderRight: `1px solid ${C.border}` }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: '#9a9aa6' }}>
          RENDER
        </div>

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto" style={{ padding: '10px 12px', minHeight: 0 }}>
          <div className="flex flex-col gap-1">
            <SectionLabel>Time</SectionLabel>
            <Segmented
              options={[{ v: 'day', l: 'Day' }, { v: 'evening', l: 'Eve' }, { v: 'night', l: 'Night' }]}
              value={s.timePreset}
              onChange={(v) => s.set({ timePreset: v as typeof s.timePreset })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Lights</SectionLabel>
            <Segmented
              options={[{ v: 'on', l: 'On' }, { v: 'off', l: 'Off' }]}
              value={s.lightsOn ? 'on' : 'off'}
              onChange={(v) => s.set({ lightsOn: v === 'on' })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Model</SectionLabel>
            <select
              value={s.model}
              onChange={(e) => s.set({ model: e.target.value as ClassicModel })}
              style={{
                width: '100%', padding: '6px 10px', background: C.input,
                border: `1px solid ${C.border}`, borderRadius: 6, color: '#ccc', fontSize: 11,
              }}
            >
              <option value="gemini-2.5-flash-image">Nanobanana (Flash 2.5)</option>
              <option value="gemini-3-pro-image">Nanobanana Pro (Gemini 3)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Size</SectionLabel>
            <Segmented
              options={[{ v: '1024', l: '속도' }, { v: '1536', l: '밸런스' }, { v: '1920', l: '고품질' }]}
              value={s.size}
              onChange={(v) => s.set({ size: v as ClassicSize })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Structure</SectionLabel>
            <button
              onClick={() => s.set({
                depthLock: !s.depthLock,
                statusText: !s.depthLock
                  ? '구조 고정 ON — 렌더 시 깊이맵으로 형상·카메라를 강제 유지합니다'
                  : '구조 고정 OFF',
              })}
              className="flex items-center justify-between"
              title="렌더 시 뷰포트 깊이맵을 함께 보내 벽·가구·카메라가 절대 변형되지 않게 합니다"
              style={{
                padding: '8px 10px', borderRadius: 6,
                background: C.input, border: `1px solid ${s.depthLock ? '#1f5952' : C.border}`,
              }}
            >
              <span className="flex flex-col items-start" style={{ gap: 1 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: s.depthLock ? '#e8fffb' : '#9a9aa1' }}>
                  구조 고정 <span style={{ fontSize: 9.5, color: s.depthLock ? '#35e5cf' : C.dim }}>Depth</span>
                </span>
                <span style={{ fontSize: 9, color: C.dim }}>형상·카메라 변형 방지</span>
              </span>
              <span
                className="relative"
                style={{
                  width: 30, height: 17, borderRadius: 999, flexShrink: 0,
                  background: s.depthLock ? C.accent : '#2a2a2a',
                  transition: 'background 160ms',
                }}
              >
                <span
                  className="absolute"
                  style={{
                    top: 2, left: s.depthLock ? 15 : 2, width: 13, height: 13, borderRadius: 999,
                    background: '#ffffff', transition: 'left 160ms',
                    boxShadow: '0 1px 3px rgba(0,0,0,.4)',
                  }}
                />
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Style</SectionLabel>
            <StyleRefSlot
              image={s.styleRef}
              onPick={(img) => s.set({
                styleRef: img,
                statusText: img ? '스타일 참조 등록 — 색·재질·조명 분위기만 참조합니다 (형상 복사 안 함)' : '스타일 참조 제거됨',
              })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Camera</SectionLabel>
            <div className="flex gap-1.5">
              <button
                onClick={() => s.set({ mirror: !s.mirror, statusText: s.mirror ? '미러링 중지' : '미러링 시작' })}
                className="flex-1"
                style={{
                  height: 27, borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: s.mirror ? C.accent : '#1e1e1e',
                  color: s.mirror ? '#0a0a14' : '#999', border: `1px solid ${s.mirror ? C.accent : C.border}`,
                }}
              >
                {s.mirror ? 'Mirror ON' : 'Mirror'}
              </button>
              <button
                title="2점 투시 자동 보정"
                onClick={() => { s.set({ sourceLoading: true }); camCommand('two_point') }}
                style={{ width: 27, height: 27, borderRadius: 6, background: '#1e1e1e', border: `1px solid ${C.border}`, color: '#999', fontSize: 12 }}
              >
                ⊞
              </button>
            </div>

            {/* WASD / QE / ZX */}
            <div className="mt-1 flex items-start justify-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <CamKey k="W" title="전진 (W)" onClick={() => camCommand('move', 'forward')} />
                <div className="flex gap-1">
                  <CamKey k="A" title="왼쪽 (A)" onClick={() => camCommand('move', 'left')} />
                  <CamKey k="S" title="후진 (S)" onClick={() => camCommand('move', 'back')} />
                  <CamKey k="D" title="오른쪽 (D)" onClick={() => camCommand('move', 'right')} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <CamKey k="Q" title="위로 (Q)" onClick={() => camCommand('move', 'up')} />
                <CamKey k="E" title="아래로 (E)" onClick={() => camCommand('move', 'down')} />
              </div>
              <div className="flex flex-col gap-1">
                <CamKey k="Z" title="좌회전 (Z)" onClick={() => camCommand('rotate', 'left')} />
                <CamKey k="X" title="우회전 (X)" onClick={() => camCommand('rotate', 'right')} />
              </div>
            </div>
            <div className="text-center" style={{ fontSize: 9, color: '#555' }}>
              WASD 이동 | QE 높이 | ZX 회전
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Height</SectionLabel>
            <Segmented
              options={[{ v: 'standing', l: '서기' }, { v: 'seated', l: '앉기' }, { v: 'low_angle', l: '낮음' }]}
              value=""
              onChange={(v) => { s.set({ sourceLoading: true }); camCommand('height', v) }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>FOV</SectionLabel>
            <Segmented
              options={[{ v: 'wide', l: '광각' }, { v: 'standard', l: '표준' }, { v: 'telephoto', l: '망원' }]}
              value=""
              onChange={(v) => { s.set({ sourceLoading: true }); camCommand('fov', v) }}
            />
          </div>
        </div>

        {/* 액션: Convert 버튼 + Edit/Export 아이콘 한 줄 통합 */}
        <div className="flex gap-1.5" style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={doConvert}
            className="flex-1"
            style={{ height: 32, borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#222', color: '#ddd', border: `1px solid ${C.border}` }}
          >
            Convert
          </button>
          <button
            onClick={() => setEditOpen(true)}
            disabled={!s.resultImage}
            title="이미지 보정 (밝기/대비/채도 등)"
            className="flex items-center justify-center"
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: s.resultImage ? '#222' : '#1a1a1a',
              color: s.resultImage ? '#ddd' : '#444',
              border: `1px solid ${s.resultImage ? C.border : '#2a2a2a'}`,
            }}
          >
            <SlidersHorizontal size={14} />
          </button>
          <button
            onClick={doExport}
            disabled={!s.resultImage}
            title="결과 이미지 저장"
            className="flex items-center justify-center"
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: s.resultImage ? '#222' : '#1a1a1a',
              color: s.resultImage ? '#ddd' : '#444',
              border: `1px solid ${s.resultImage ? C.border : '#2a2a2a'}`,
            }}
          >
            <Download size={14} />
          </button>
        </div>

        {/* 연결 상태 (레거시 .sidebar-footer) */}
        <div className="flex items-center gap-2" style={{ padding: '6px 16px', borderTop: `1px solid ${C.border}` }}>
          <span style={{
            width: 8, height: 8, borderRadius: 4,
            background: status === 'connected' ? '#4caf50' : '#f44336',
          }} />
          <span style={{ fontSize: 11, color: '#888' }}>
            {status === 'connected' ? 'Connected' : 'Offline'}
          </span>
        </div>
      </aside>

      {/* ══ 중앙: 씬 탭 + SOURCE/RESULT 패널 ══ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 씬 탭 */}
        <div className="flex items-center gap-1 overflow-x-auto" style={{ padding: '6px 8px 0' }}>
          {scenes.map((sc) => (
            <button
              key={sc.name}
              onClick={() => {
                const cached = s.scenePreviews[sc.name] ?? null
                s.set({
                  previewOverride: cached,      // 캐시가 있으면 즉시 그 씬 이미지 표시
                  sourceLoading: !cached,       // 캐시 없을 때만 스피너
                  lastSceneClicked: sc.name,
                })
                selectScene(sc.name)
              }}
              style={{
                padding: '7px 16px', fontSize: 11, whiteSpace: 'nowrap',
                borderRadius: '6px 6px 0 0',
                background: sc.active ? '#2a2a2a' : '#161616',
                color: sc.active ? '#fff' : '#777',
                border: `1px solid ${C.border}`, borderBottom: 'none',
              }}
            >
              {sc.name}
            </button>
          ))}
          <button
            title="현재 뷰를 씬으로 추가"
            onClick={() => addScene()}
            style={{
              padding: '7px 12px', fontSize: 12, borderRadius: '6px 6px 0 0',
              background: '#161616', color: '#777', border: `1px solid ${C.border}`, borderBottom: 'none',
            }}
          >
            +
          </button>
        </div>

        {/* 패널 영역 */}
        <div className="flex flex-1 gap-px overflow-hidden" style={{ background: C.border, borderTop: `1px solid ${C.border}` }}>
          {/* SOURCE */}
          <Panel
            label="SOURCE"
            active
            image={sourceImage}
            emptyText={`${toolLabel} 연결 대기 중... (또는 이미지 버튼으로 불러오기)`}
            emptyContent={<SourceDropZone onBrowse={() => fileRef.current?.click()} />}
            loading={s.sourceLoading && !liveStream}
            loadingText={`${toolLabel} 화면 불러오는 중...`}
            video={liveStream ? videoRef : null}
            videoViewport={viewport}
            tab={tab.src}
            onTab={(t) => setTab((p) => ({ ...p, src: t }))}
            prompt={s.sourcePrompt}
            negative={s.sourceNegative}
            onPrompt={(v) => s.set({ sourcePrompt: v })}
            onNegative={(v) => s.set({ sourceNegative: v })}
            promptPlaceholder="직접 입력하거나 Auto 버튼으로 자동 생성하세요."
            headerRight={
              <button
                onClick={doAuto}
                className="flex items-center gap-1"
                style={{
                  padding: '3px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  background: s.autoLoading ? '#1a1a1a' : '#00c9a7',
                  color: s.autoLoading ? '#bbb' : '#06251f',
                  border: s.autoLoading ? '1px solid #333' : '1px solid transparent',
                }}
              >
                {s.autoLoading ? <><Loader2 size={11} className="animate-spin" style={{ color: '#00c9a7' }} /> 취소</> : 'Auto'}
              </button>
            }
            actions={
              <>
                <PanelAction title="이미지 불러오기" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={16} />
                </PanelAction>
                <PanelAction title="렌더링 실행" onClick={() => doRender('src')} disabled={s.rendering}>
                  {s.rendering ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                </PanelAction>
              </>
            }
            imageToolbar={
              <SourceToolbar
                tool={s.sourceTool}
                onTool={(t) => {
                  s.set({
                    sourceTool: t,
                    statusText:
                      t === 'eyedropper' ? '스포이드: 소스 이미지에서 바꿀 재질을 클릭하세요'
                      : t === 'magic' ? '매직: 영역에 마우스를 올리면 테두리가 표시되고, 클릭하면 선택됩니다'
                      : 'Ready',
                  })
                  if (t !== 'eyedropper') setPickedMaterial(null)
                  // 매직툴: 브릿지 뷰면 재질 ID 마스크 캡처, 업로드/미연결이면 AI 세그멘테이션 모드
                  if (t === 'magic' && !useClassicStore.getState().maskUri) {
                    const cur = useClassicStore.getState()
                    const uploaded = Boolean(cur.frozenSource) && !cur.frozenFromBridge
                    if (uploaded || useUIStore.getState().sketchUpStatus !== 'connected') {
                      s.set({ statusText: '매직: 변경할 객체를 클릭하세요 (AI가 영역을 인식합니다)' })
                      return
                    }
                    s.set({ statusText: '매직: 재질 마스크 캡처 중...' })
                    void captureMask().then((m) => {
                      useClassicStore.getState().set(m
                        ? { maskUri: m.uri, maskMap: m.map, statusText: '매직: 영역에 마우스를 올리면 테두리가 표시되고, 클릭하면 선택됩니다' }
                        : { statusText: '매직: 변경할 객체를 클릭하세요 (AI가 영역을 인식합니다)' })
                    })
                  }
                }}
              />
            }
            imageOverlay={
              s.sourceTool === 'magic' && s.maskUri ? <MagicSelectOverlay />
              : s.sourceTool === 'magic' && s.aiSelOverlay ? <img src={s.aiSelOverlay} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
              : undefined
            }
            onImagePick={
              s.sourceTool === 'eyedropper' ? handleSourcePick
              : s.sourceTool === 'magic' && !s.maskUri ? handleAiMagicPick
              : undefined
            }
            imageFooter={(s.materialSwaps.length > 0 || s.sourceSelectedColors.length > 0 || s.aiSelMask || s.aiMagicBusy) ? (
              <div className="flex flex-wrap gap-1.5">
                {s.aiMagicBusy && (
                  <span
                    className="flex items-center gap-1.5"
                    style={{
                      padding: '4px 10px', borderRadius: 999, fontSize: 11,
                      background: 'rgba(8,12,12,0.82)', color: '#9adcd2',
                      border: '1px solid #1f5952', backdropFilter: 'blur(3px)',
                    }}
                  >
                    <Wand2 size={11} className="animate-pulse" />
                    AI 영역 인식 중...
                  </span>
                )}
                {s.aiSelMask && (
                  <span
                    className="flex items-center gap-1.5"
                    style={{
                      padding: '4px 10px', borderRadius: 999, fontSize: 11,
                      background: 'rgba(8,12,12,0.82)', color: '#7df0dd',
                      border: '1px solid #1f5952', backdropFilter: 'blur(3px)',
                    }}
                  >
                    <Wand2 size={11} />
                    AI 선택: {s.aiSelLabel ?? '영역'} — 생성 시 이 부분만 변경
                    <button
                      title="선택 해제"
                      onClick={() => s.set({ aiSelMask: null, aiSelOverlay: null, aiSelLabel: null })}
                      style={{ color: '#7ba8a0', display: 'flex' }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}
                {s.sourceSelectedColors.length > 0 && (
                  <RegionLayerList
                    colors={s.sourceSelectedColors}
                    maskMap={s.maskMap}
                    onRemove={(color) => s.set({ sourceSelectedColors: s.sourceSelectedColors.filter((c) => c !== color) })}
                  />
                )}
                {s.materialSwaps.map((sw) => (
                  <span
                    key={sw.material}
                    className="flex items-center gap-1.5"
                    style={{
                      padding: '4px 10px', borderRadius: 999, fontSize: 11,
                      background: 'rgba(8,12,12,0.82)', color: '#35e5cf',
                      border: '1px solid #1f5952', backdropFilter: 'blur(3px)',
                    }}
                  >
                    {swapMaterialLabel(sw.material)} → {sw.replacement.name}
                    <button
                      title="교체 취소"
                      onClick={() => s.set({ materialSwaps: s.materialSwaps.filter((x) => x.material !== sw.material) })}
                      style={{ color: '#7ba8a0', display: 'flex' }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          />

          {/* RESULT 1 */}
          <Panel
            label="RESULT 1"
            labelRight={s.resultImage ? (
              <>
                <button title="이미지 보정 (밝기/대비/채도 등)" onClick={() => setEditOpen(true)} style={{ color: '#999' }} className="hover:text-white">
                  <SlidersHorizontal size={12} />
                </button>
                <button title="이미지 저장" onClick={doExport} style={{ color: '#999' }} className="hover:text-white">
                  <Download size={12} />
                </button>
              </>
            ) : undefined}
            image={s.resultMaskView && s.maskUri ? s.maskUri : s.resultImage}
            imageOverlay={
              s.resultMaskView && s.maskUri && s.resultImage ? <MaskSelectOverlay />
              : s.resultTool === 'magic' && s.maskUri && s.resultImage ? <MagicSelectOverlay colorsKey="selectedColors" />
              : null
            }
            imageToolbar={s.resultImage ? (
              <SourceToolbar
                tool={s.resultTool}
                onTool={(t) => {
                  s.set({
                    resultTool: t,
                    statusText:
                      t === 'eyedropper' ? '스포이드: 결과 이미지에서 바꿀 재질을 클릭하세요'
                      : t === 'magic' ? '매직: 영역에 마우스를 올리면 테두리가 표시되고, 클릭하면 선택됩니다 (2차 생성 대상)'
                      : 'Ready',
                  })
                  if (t !== 'eyedropper') setPickedMaterial(null)
                  if (t === 'magic' && !useClassicStore.getState().maskUri) {
                    s.set({ statusText: '매직: 재질 마스크 캡처 중...' })
                    void captureMask().then((m) => {
                      useClassicStore.getState().set(m
                        ? { maskUri: m.uri, maskMap: m.map, statusText: '매직: 영역에 마우스를 올리면 테두리가 표시되고, 클릭하면 선택됩니다' }
                        : { statusText: '재질 마스크 캡처 실패 - 3D 툴 연결을 확인하세요', resultTool: 'none' })
                    })
                  }
                }}
              />
            ) : undefined}
            onImagePick={s.resultTool === 'eyedropper' && !s.resultMaskView ? handleSourcePick : undefined}
            imageFooter={s.selectedColors.length > 0 && s.resultImage ? (
              <div className="flex flex-wrap gap-1.5">
                <RegionLayerList
                  colors={s.selectedColors}
                  maskMap={s.maskMap}
                  onRemove={(color) => {
                    const next = s.selectedColors.filter((c) => c !== color)
                    s.set({ selectedColors: next, ...(next.length === 0 ? { regionMaterial: null } : {}) })
                  }}
                />
                {s.regionMaterial ? (
                  <span
                    className="flex items-center gap-1.5"
                    style={{
                      padding: '4px 10px', borderRadius: 999, fontSize: 11,
                      background: 'rgba(8,12,12,0.82)', color: '#35e5cf',
                      border: '1px solid #1f5952', backdropFilter: 'blur(3px)',
                    }}
                  >
                    영역 재질: {s.regionMaterial.name}
                    <button
                      title="재질 지정 해제"
                      onClick={() => s.set({ regionMaterial: null })}
                      style={{ color: '#7ba8a0', display: 'flex' }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setRegionPickOpen(true)}
                    className="flex items-center gap-1.5"
                    title="선택 영역에 적용할 재질을 라이브러리/로컬에서 선택"
                    style={{
                      padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: '#00c9a7', color: '#06251f',
                    }}
                  >
                    <ImagePlus size={11} />
                    재질 적용
                  </button>
                )}
              </div>
            ) : undefined}
            viewTabs={s.resultImage && s.maskUri ? {
              items: [
                { key: 'render', label: '렌더' },
                { key: 'mask', label: '마스크 패스' },
              ],
              active: s.resultMaskView ? 'mask' : 'render',
              onSelect: (k) => s.set({ resultMaskView: k === 'mask' }),
            } : undefined}
            emptyText={s.rendering ? '렌더링 중...' : 'Ready'}
            loading={s.rendering}
            loadingText={`렌더링 중... ${elapsed}초`}
            tab={tab.res}
            onTab={(t) => setTab((p) => ({ ...p, res: t }))}
            prompt={s.resultPrompt}
            negative={s.resultNegative}
            onPrompt={(v) => s.set({ resultPrompt: v })}
            onNegative={(v) => s.set({ resultNegative: v })}
            promptPlaceholder="렌더링 완료 후 2차 생성용 프롬프트를 입력하세요."
            onView={s.resultImage && !s.resultMaskView ? () => setViewerOpen(true) : undefined}
            actions={
              <PanelAction title="2차 생성 (결과 이미지 기반)" onClick={() => doRender('res')} disabled={s.rendering || !s.resultImage}>
                {s.rendering ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              </PanelAction>
            }
          />
        </div>

        {/* 하단 상태바 */}
        <div className="flex items-center" style={{ height: 26, padding: '0 12px', borderTop: `1px solid ${C.border}`, fontSize: 11, color: '#777' }}>
          {s.rendering ? `렌더링 중... ${elapsed}초` : s.statusText}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />

      {pickedMaterial && (
        <MaterialSwapDialog
          material={pickedMaterial}
          onApply={addSwap}
          onClose={() => setPickedMaterial(null)}
        />
      )}

      {regionPickOpen && (
        <MaterialSwapDialog
          material={null}
          regionCount={s.selectedColors.length}
          onApply={(replacement) => {
            s.set({
              regionMaterial: replacement,
              statusText: `선택 영역 재질 지정: ${replacement.name} — 2차 생성(⚡)하면 적용됩니다`,
            })
            setRegionPickOpen(false)
          }}
          onClose={() => setRegionPickOpen(false)}
        />
      )}

      {editOpen && s.resultImage && (
        <EditOverlay
          image={s.resultImage}
          onApply={(img) => {
            s.set({ resultImage: img, statusText: '보정 적용됨' })
            setEditOpen(false)
          }}
          onClose={() => setEditOpen(false)}
        />
      )}

      {viewerOpen && s.resultImage && (
        <ImageLightbox
          image={s.resultImage}
          compareImage={s.renderSourceImage}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  )
}

// ── 스타일 참조 슬롯 (렌더 설정 사이드바) ────────────────────────────────────
function StyleRefSlot({ image, onPick }: { image: string | null; onPick: (img: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hover, setHover] = useState(false)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onPick(String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderRadius: 6 }}
    >
      <button
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-1"
        title={image ? '클릭해서 다른 이미지로 교체' : '스타일 참조 이미지 업로드 — 색·재질·조명 분위기만 참조 (형상은 복사하지 않음)'}
        style={{
          height: 64,
          borderRadius: 6,
          background: image ? `center / cover url(${image})` : C.input,
          border: image ? '1px solid #1f5952' : `1px dashed ${C.border}`,
          color: C.dim,
        }}
      >
        {!image && (
          <>
            <ImagePlus size={15} style={{ color: '#7a7a82' }} />
            <span style={{ fontSize: 9.5 }}>스타일 참조 이미지</span>
          </>
        )}
        {image && hover && (
          <span
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 10.5, fontWeight: 600 }}
          >
            클릭해서 교체
          </span>
        )}
      </button>
      {image && (
        <button
          title="스타일 참조 제거"
          onClick={(e) => { e.stopPropagation(); onPick(null) }}
          className="absolute flex items-center justify-center rounded-full"
          style={{ top: 4, right: 4, width: 18, height: 18, background: 'rgba(10,10,14,0.85)', color: '#ddd' }}
        >
          <X size={11} />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  )
}

function regionLabel(color: string, maskMap: { color: string; material: string }[], index: number) {
  const exact = maskMap.find((m) => m.color.toLowerCase() === color.toLowerCase())
  if (exact?.material) return exact.material

  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  let best: string | null = null
  let bestD = 60 * 60
  for (const m of maskMap) {
    const mr = parseInt(m.color.slice(1, 3), 16)
    const mg = parseInt(m.color.slice(3, 5), 16)
    const mb = parseInt(m.color.slice(5, 7), 16)
    const d = (r - mr) ** 2 + (g - mg) ** 2 + (b - mb) ** 2
    if (d < bestD) {
      bestD = d
      best = m.material
    }
  }
  return best ?? `선택 영역 ${index + 1}`
}

function RegionLayerList({
  colors,
  maskMap,
  onRemove,
}: {
  colors: string[]
  maskMap: { color: string; material: string }[]
  onRemove: (color: string) => void
}) {
  return (
    <>
      {colors.map((color, index) => (
        <span
          key={color}
          className="flex items-center gap-1.5"
          style={{
            padding: '4px 9px',
            borderRadius: 999,
            fontSize: 11,
            background: 'rgba(8,12,12,0.82)',
            color: '#dffdf8',
            border: '1px solid #1f5952',
            backdropFilter: 'blur(3px)',
            maxWidth: 240,
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 3, background: color, border: '1px solid rgba(255,255,255,0.6)', flex: '0 0 auto' }} />
          <span style={{ color: '#7df0dd', fontWeight: 850, flex: '0 0 auto' }}>Layer {index + 1}</span>
          <span className="truncate" style={{ minWidth: 0 }}>{regionLabel(color, maskMap, index)}</span>
          <button title="이 레이어 선택 해제" onClick={() => onRemove(color)} style={{ color: '#7ba8a0', display: 'flex', flex: '0 0 auto' }}>
            <X size={11} />
          </button>
        </span>
      ))}
    </>
  )
}

// ── 소스 툴바 (스포이드 · 연필 · 매직) ───────────────────────────────────────

function SourceToolbar({ tool, onTool }: {
  tool: 'none' | 'eyedropper' | 'pencil' | 'magic'
  onTool: (t: 'none' | 'eyedropper' | 'pencil' | 'magic') => void
}) {
  const btn = (key: 'eyedropper' | 'pencil' | 'magic', icon: React.ReactNode, title: string, ready: boolean) => (
    <button
      key={key}
      title={ready ? title : `${title} (준비 중)`}
      onClick={() => {
        if (!ready) return
        onTool(tool === key ? 'none' : key)
      }}
      className="flex items-center justify-center rounded-md"
      style={{
        width: 30, height: 30,
        background: tool === key ? C.accent : 'transparent',
        color: tool === key ? '#06251f' : ready ? '#b9b9c2' : '#4a4a52',
        cursor: ready ? 'pointer' : 'not-allowed',
      }}
    >
      {icon}
    </button>
  )
  return (
    <div
      className="flex items-center gap-0.5"
      style={{
        padding: 3, borderRadius: 8, background: 'rgba(10,12,14,0.82)',
        border: '1px solid #2a2a32', backdropFilter: 'blur(4px)',
      }}
    >
      {btn('eyedropper', <Pipette size={15} />, '스포이드 — 클릭한 표면의 재질을 찾아 교체 재질을 지정', true)}
      {btn('pencil', <Pencil size={15} />, '연필 — 영역 마킹', false)}
      {btn('magic', <Wand2 size={15} />, '매직 — 호버로 재질 영역 미리보고 클릭으로 선택', true)}
    </div>
  )
}

// ── 재질 교체 다이얼로그 (스포이드로 재질 선택 후) ───────────────────────────
// 좌: 스포이드로 찍은 원본 재질 / 우: 사용자가 고른 교체 재질 → [적용]

function SwapPreviewBox({ title, name, thumb, color, empty, loading }: {
  title: string
  name: string | null
  thumb?: string | null
  color?: string | null
  empty?: string
  loading?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div style={{ color: '#8a8a96', fontSize: 11 }}>{title}</div>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          width: 132, height: 96, borderRadius: 10,
          background: thumb ? `center / cover url(${thumb})` : (color ?? '#101018'),
          border: '1px solid #2c2c36',
        }}
      >
        {!thumb && !color && (
          loading
            ? <Loader2 size={18} className="animate-spin" style={{ color: '#00c9a7' }} />
            : <span className="px-2 text-center" style={{ color: '#55555f', fontSize: 11, lineHeight: 1.5 }}>{empty ?? ''}</span>
        )}
      </div>
      <div className="w-full truncate text-center" style={{ color: name ? '#fff' : '#55555f', fontSize: 12.5, fontWeight: 700 }}>
        {name ?? '미선택'}
      </div>
    </div>
  )
}

function MaterialSwapDialog({ material, regionCount, onApply, onClose }: {
  /** 스포이드로 찍은 재질 이름. null이면 '선택 영역' 모드 (매직 선택에 재질 적용) */
  material: string | null
  regionCount?: number
  onApply: (replacement: MaterialSwap['replacement']) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState<MaterialSwap['replacement'] | null>(null)
  const [replacementPreview, setReplacementPreview] = useState<{ thumb: string | null; color: string | null }>({ thumb: null, color: null })
  const [sourcePreview, setSourcePreview] = useState<{ thumb: string | null; color: string | null }>({ thumb: null, color: null })
  const [sourceLoading, setSourceLoading] = useState(true)
  const uploadRef = useRef<HTMLInputElement>(null)

  // 스포이드로 찍은 재질의 "실제" 텍스처를 가져온다:
  // 1) 일괄 추출 캐시에 텍스처가 있으면 즉시 사용
  // 2) 없으면(용량 예산으로 생략된 경우) 그 재질 하나만 브릿지에서 상세 추출
  // "A 외 2" / "A / B" 병합 라벨은 첫 재질 이름으로 조회한다
  useEffect(() => {
    if (material === null || material.startsWith(POINT_MATERIAL_PREFIX)) { setSourceLoading(false); return }
    let cancelled = false
    const lookupName = material.includes(' 외 ') ? material.split(' 외 ')[0] : material.split(' / ')[0]
    void (async () => {
      const cached = await getCachedSourceMaterials()
      let found = cached?.find((m) => m.name === lookupName) ?? null
      if (!found?.texture) {
        const detail = await loadMaterialDetail(lookupName)
        if (detail) found = detail
      }
      // 상세 추출 미지원(구버전 브릿지) + 캐시 없음 → 전체 재질 로드로 폴백
      if (!found) {
        const all = await loadSourceMaterials()
        found = all?.find((m) => m.name === lookupName) ?? null
      }
      if (cancelled) return
      setSourceLoading(false)
      if (found) setSourcePreview({ thumb: materialTextureUri(found), color: found.color })
    })()
    return () => { cancelled = true }
  }, [material])

  const pickLibrary = (asset: MaterialAsset) => {
    const referenceImage = materialReferenceUrl(asset)
    const thumbnail = materialThumbnailUrl(asset)
    setReplacement({ kind: 'library', name: asset.name, prompt: asset.prompt, referenceImage })
    setReplacementPreview({
      thumb: thumbnail,
      color: `radial-gradient(circle at 35% 30%, ${asset.colors[1]}, ${asset.colors[0]} 45%, ${asset.colors[2]})` as string,
    })
  }

  const onUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const image = String(reader.result)
      setReplacement({ kind: 'image', name: file.name.replace(/\.[^.]+$/, ''), image })
      setReplacementPreview({ thumb: image, color: null })
    }
    reader.readAsDataURL(file)
  }

  const q = query.trim().toLowerCase()
  const list = q
    ? libraryMaterials.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.prompt.toLowerCase().includes(q) || m.tags.some((tag) => tag.toLowerCase().includes(q)))
    : libraryMaterials

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 120, background: 'rgba(5,5,10,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxHeight: '82vh', borderRadius: 12, overflow: 'hidden',
          background: '#15151d', border: '1px solid #2a2a34', boxShadow: '0 24px 70px rgba(0,0,0,.5)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="flex items-center justify-between" style={{ padding: '13px 18px', borderBottom: '1px solid #24242c' }}>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>재질 교체</span>
          <button onClick={onClose} style={{ color: '#8a8a96' }}><X size={18} /></button>
        </div>

        {/* 좌: 원본 재질 → 우: 교체 재질 */}
        <div className="flex items-center gap-3" style={{ padding: '16px 22px', borderBottom: '1px solid #20202a' }}>
          {material !== null ? (
            <SwapPreviewBox title="스포이드로 선택한 재질" name={swapMaterialLabel(material)} thumb={sourcePreview.thumb} color={sourcePreview.color} loading={sourceLoading} />
          ) : (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div style={{ color: '#8a8a96', fontSize: 11 }}>적용 대상</div>
              <div
                className="flex items-center justify-center"
                style={{ width: 132, height: 96, borderRadius: 10, background: '#12201d', border: '1px solid #1f5952' }}
              >
                <Wand2 size={26} style={{ color: '#35e5cf' }} />
              </div>
              <div className="w-full truncate text-center" style={{ color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
                매직 선택 영역 {regionCount ?? 0}개
              </div>
            </div>
          )}
          <span style={{ color: '#00c9a7', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>→</span>
          <SwapPreviewBox
            title="교체할 재질"
            name={replacement?.name ?? null}
            thumb={replacementPreview.thumb}
            color={replacementPreview.color}
            empty="아래에서 선택"
          />
        </div>

        <div className="flex items-center gap-2" style={{ padding: '12px 18px' }}>
          <button
            onClick={() => uploadRef.current?.click()}
            className="flex items-center gap-1.5"
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, flexShrink: 0,
              background: '#1e1e28', color: '#e6e6ee', border: '1px solid #34343e',
            }}
          >
            <ImagePlus size={13} />
            로컬 이미지
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="라이브러리 검색..."
            className="min-w-0 flex-1 rounded-lg px-3 outline-none"
            style={{ height: 34, background: '#0d0d15', border: '1px solid #26262f', color: '#fff', fontSize: 12 }}
          />
        </div>

        <div className="grid grid-cols-4 gap-2 overflow-y-auto" style={{ padding: '0 18px 14px', minHeight: 120 }}>
          {list.map((asset) => {
            const active = replacement?.kind === 'library' && replacement.name === asset.name
            return (
              <button
                key={asset.id}
                onClick={() => pickLibrary(asset)}
                className="flex flex-col items-center rounded-lg"
                style={{
                  padding: '9px 5px',
                  background: active ? '#153a34' : '#1a1a22',
                  border: active ? '1px solid #00c9a7' : '1px solid #26262f',
                }}
                title={asset.prompt}
              >
                <span
                  className="rounded-full"
                  style={{
                    width: 40, height: 40,
                    background: materialThumbnailUrl(asset)
                      ? `center / cover url(${materialThumbnailUrl(asset)})`
                      : `radial-gradient(circle at 35% 30%, ${asset.colors[1]}, ${asset.colors[0]} 45%, ${asset.colors[2]})`,
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)',
                  }}
                />
                <span className="mt-1.5 w-full truncate text-center" style={{ fontSize: 10, color: active ? '#7df0dd' : '#c4c4cc', fontWeight: 600 }}>
                  {asset.name}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-2" style={{ padding: '12px 18px', borderTop: '1px solid #24242c' }}>
          <button
            onClick={onClose}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: '#1e1e28', color: '#c8c8d0' }}
          >
            취소
          </button>
          <button
            onClick={() => replacement && onApply(replacement)}
            disabled={!replacement}
            style={{
              height: 36, padding: '0 20px', borderRadius: 8, fontSize: 12.5, fontWeight: 800,
              background: replacement ? '#00c9a7' : '#1c1c26',
              color: replacement ? '#06251f' : '#55555f',
              cursor: replacement ? 'pointer' : 'not-allowed',
            }}
          >
            적용
          </button>
        </div>

        <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={onUploadFile} />
      </div>
    </div>
  )
}

// ── 패널 컴포넌트 (레거시 .image-panel) ──────────────────────────────────────

function PanelAction({ children, title, onClick, disabled, active }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; active?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center"
      style={{
        width: 40, height: 40, borderRadius: 8,
        background: active ? C.accent : '#1e1e1e',
        border: `1px solid ${active ? C.accent : C.border}`,
        color: disabled ? '#444' : active ? '#06251f' : '#ccc',
      }}
    >
      {children}
    </button>
  )
}

function SourceDropZone({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center" style={{ transform: 'translateY(-4px)' }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          border: '2px dashed rgba(170,170,178,.44)',
          borderRadius: 11,
          color: '#6f6f78',
        }}
      >
        <ImagePlus size={26} strokeWidth={1.6} />
      </div>
      <div className="mt-3 text-center" style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 1.25, letterSpacing: 0 }}>
        Drag and drop an image to get started, or
      </div>
      <button
        onClick={onBrowse}
        className="mt-3 flex items-center justify-center gap-2 rounded-lg transition-colors duration-150"
        style={{
          minWidth: 124,
          height: 40,
          backgroundColor: C.accent,
          color: '#ffffff',
          fontSize: 15,
          fontWeight: 600,
          boxShadow: '0 12px 28px rgba(0,201,167,.16)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#00ddb8')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.accent)}
      >
        <ImagePlus size={18} strokeWidth={1.8} />
        Browse
      </button>
    </div>
  )
}

function Panel({ label, labelRight, active, image, emptyText, emptyContent, loading, loadingText, video, videoViewport, imageOverlay, viewTabs, tab, onTab, prompt, negative, onPrompt, onNegative, promptPlaceholder, headerRight, actions, onView, imageToolbar, onImagePick, imageFooter }: {
  label: string
  labelRight?: React.ReactNode
  active?: boolean
  image: string | null
  emptyText: string
  emptyContent?: React.ReactNode
  loading?: boolean
  loadingText?: string
  video?: React.RefObject<HTMLVideoElement | null> | null
  videoViewport?: { w: number; h: number; sf: number } | null
  imageOverlay?: React.ReactNode
  viewTabs?: { items: { key: string; label: string }[]; active: string; onSelect: (key: string) => void }
  tab: 'prompt' | 'negative'
  onTab: (t: 'prompt' | 'negative') => void
  prompt: string
  negative: string
  onPrompt: (v: string) => void
  onNegative: (v: string) => void
  promptPlaceholder: string
  headerRight?: React.ReactNode
  actions?: React.ReactNode
  /** 지정하면 이미지 호버 시 중앙에 View 버튼 표시 → 클릭 시 확대 보기 */
  onView?: () => void
  /** 이미지 영역 좌상단 툴바 (스포이드 등) */
  imageToolbar?: React.ReactNode
  /** 이미지 클릭 시 이미지 내 비율 좌표(0~1)로 콜백 — 지정되면 십자 커서 */
  onImagePick?: (fx: number, fy: number, imageSrc: string) => void
  /** 이미지 영역 하단 오버레이 (재질 교체 칩 등) */
  imageFooter?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: '#111111' }}>
      {/* 헤더 (SOURCE 활성 = 파랑) */}
      <div
        className="flex items-center justify-between"
        style={{
          height: 24, padding: '0 12px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
          background: active ? C.accent : C.panelLabel,
          color: active ? '#0a0a14' : '#555',
        }}
      >
        <span className="flex items-center gap-3">
          {label}
          {viewTabs && (
            <span className="flex items-center" style={{ gap: 2 }}>
              {viewTabs.items.map((t) => (
                <button
                  key={t.key}
                  onClick={() => viewTabs.onSelect(t.key)}
                  style={{
                    padding: '2px 10px', fontSize: 9.5, fontWeight: 700, borderRadius: 4,
                    background: viewTabs.active === t.key ? (active ? 'rgba(0,0,0,0.35)' : C.accent) : 'transparent',
                    color: viewTabs.active === t.key ? (active ? '#fff' : '#06251f') : (active ? 'rgba(0,0,0,0.55)' : '#888'),
                  }}
                >
                  {t.label}
                </button>
              ))}
            </span>
          )}
        </span>
        {labelRight && <span className="flex items-center gap-2">{labelRight}</span>}
      </div>

      {/* 이미지 영역: 남는 세로 공간을 모두 사용 */}
      <div className="relative flex flex-1 items-center justify-center" style={{ width: '100%', background: C.panelBg, minHeight: 0 }}>
        {video ? (
          <CroppedVideo videoRef={video} viewport={videoViewport ?? null} />
        ) : image && imageOverlay ? (
          // 오버레이(클릭 선택)는 이미지의 실제 표시 영역과 정확히 겹쳐야 한다
          // - 컨테이너 전체가 아니라 이미지 비율 박스 안에 이미지+캔버스를 함께 넣는다
          <AspectFitBox src={image}>{imageOverlay}</AspectFitBox>
        ) : image ? (
          <div className="group relative flex h-full w-full items-center justify-center">
            <img
              src={image}
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
              style={onImagePick ? { cursor: EYEDROPPER_CURSOR } : undefined}
              onClick={onImagePick ? (e) => {
                // object-contain 레터박스를 제외한 이미지 내부 비율 좌표 계산
                const el = e.currentTarget
                const r = el.getBoundingClientRect()
                const scale = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight)
                const iw = el.naturalWidth * scale
                const ih = el.naturalHeight * scale
                const x = e.clientX - r.left - (r.width - iw) / 2
                const y = e.clientY - r.top - (r.height - ih) / 2
                if (x < 0 || y < 0 || x > iw || y > ih) return
                onImagePick(x / iw, y / ih, el.src)
              } : undefined}
            />
            {onView && (
              <button
                onClick={onView}
                title="크게 보기"
                className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                style={{
                  padding: '9px 24px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
                  background: 'rgba(8,10,12,0.78)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(4px)',
                }}
              >
                <Eye size={14} />
                View
              </button>
            )}
          </div>
        ) : emptyContent ? (
          emptyContent
        ) : (
          <span style={{ color: '#444', fontSize: 12 }}>{emptyText}</span>
        )}
        {imageToolbar && (
          <div className="absolute" style={{ left: 12, top: 12, zIndex: 12 }}>{imageToolbar}</div>
        )}
        {imageFooter && (
          <div className="absolute" style={{ left: 12, right: 12, bottom: 12, zIndex: 12 }}>{imageFooter}</div>
        )}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: 'rgba(10,10,10,0.75)' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: C.accent }} />
            <span style={{ fontSize: 11, color: '#aaa' }}>{loadingText ?? '렌더링 중... (20~60초)'}</span>
          </div>
        )}
      </div>

      {/* Prompt / Negative 탭 */}
      <div className="flex items-center" style={{ background: '#0a0a0a', borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => onTab('prompt')}
          className="flex-1"
          style={{
            padding: '8px 0', fontSize: 11, color: tab === 'prompt' ? '#fff' : '#666',
            borderBottom: tab === 'prompt' ? `2px solid ${C.accent}` : '2px solid transparent',
          }}
        >
          Prompt
        </button>
        <button
          onClick={() => onTab('negative')}
          className="flex-1"
          style={{
            padding: '8px 0', fontSize: 11, color: tab === 'negative' ? '#ff5555' : '#884444',
            borderBottom: tab === 'negative' ? '2px solid #ff5555' : '2px solid transparent',
          }}
        >
          Negative
        </button>
        {headerRight && <div style={{ padding: '0 8px' }}>{headerRight}</div>}
      </div>

      {/* 텍스트영역 + 액션버튼 */}
      <div className="flex gap-2 overflow-hidden" style={{ padding: 10, background: C.promptBg, height: 150, flexShrink: 0 }}>
        <textarea
          value={tab === 'prompt' ? prompt : negative}
          onChange={(e) => (tab === 'prompt' ? onPrompt(e.target.value) : onNegative(e.target.value))}
          placeholder={tab === 'prompt' ? promptPlaceholder : '네거티브 프롬프트 (Auto가 자동 생성)'}
          className="flex-1 resize-none outline-none"
          style={{
            background: C.textarea, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '10px 12px', fontSize: 12, color: tab === 'negative' ? '#ff9999' : '#ddd', lineHeight: 1.5,
          }}
        />
        {actions && <div className="flex flex-col gap-2">{actions}</div>}
      </div>
    </div>
  )
}


// SketchUp 창 스트림에서 3D 뷰포트 영역만 잘라 표시 (메뉴/툴바 제거)
function CroppedVideo({ videoRef, viewport }: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  viewport: { w: number; h: number; sf: number } | null
}) {
  const [dims, setDims] = useState<{ W: number; H: number } | null>(null)

  // 크롭 계산: 뷰포트(물리 픽셀) 기준, 좌측 정렬 + 하단 상태바 제외
  let crop: { w: number; h: number; top: number } | null = null
  if (dims && viewport && viewport.w <= dims.W && viewport.h < dims.H) {
    const w = viewport.w
    const h = viewport.h
    // 하단 상태바(측정 박스 포함) 실측 약 31pt - 살짝 넉넉히 잘라 흰 띠 제거
    const statusBar = Math.round(31 * viewport.sf)
    const top = Math.max(0, dims.H - h - statusBar)
    // 상태바를 넉넉히 자른 만큼 표시 높이도 보정
    crop = { w, h: Math.min(h, dims.H - top - statusBar), top }
  }

  return (
    // 표시 박스를 크롭 영역과 같은 비율로 맞춰 상태바/툴바가 비어져 나오지 않게 한다
    <div
      className="relative m-auto overflow-hidden"
      style={crop ? { width: '100%', aspectRatio: `${crop.w} / ${crop.h}`, maxHeight: '100%' } : { width: '100%', height: '100%' }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onLoadedMetadata={(e) => setDims({ W: e.currentTarget.videoWidth, H: e.currentTarget.videoHeight })}
        className={crop ? 'absolute' : 'h-full w-full object-contain'}
        style={crop && dims ? {
          width: `${(dims.W / crop.w) * 100}%`,
          maxWidth: 'none',
          left: 0,
          top: `${-(crop.top / crop.h) * 100}%`,
        } : undefined}
      />
    </div>
  )
}


// 이미지 비율에 맞춘 컨테인 박스: 이미지와 오버레이(캔버스)가 픽셀 단위로 정확히 겹친다
// (object-contain 이미지 위에 inset-0 캔버스를 얹으면 레터박스만큼 어긋난다)
function AspectFitBox({ src, children }: { src: string; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    setNat(null)
    const img = new Image()
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
  }, [src])

  useEffect(() => {
    if (!nat) return
    const container = wrapRef.current?.parentElement
    if (!container) return
    const compute = () => {
      const scale = Math.min(container.clientWidth / nat.w, container.clientHeight / nat.h)
      setDims({ w: Math.floor(nat.w * scale), h: Math.floor(nat.h * scale) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(container)
    return () => ro.disconnect()
  }, [nat])

  return (
    <div ref={wrapRef} className="relative" style={dims ? { width: dims.w, height: dims.h } : undefined}>
      {dims && <img src={src} alt="" className="absolute inset-0 h-full w-full" draggable={false} />}
      {dims && children}
    </div>
  )
}

// ── 매직툴 오버레이: 호버 = 재질 영역 외곽선 글로우 미리보기 / 클릭 = 선택 토글 ──
function MagicSelectOverlay({ colorsKey = 'sourceSelectedColors' }: { colorsKey?: 'sourceSelectedColors' | 'selectedColors' }) {
  const maskUri = useClassicStore((st) => st.maskUri)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskDataRef = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null)
  const edgeCacheRef = useRef<Map<string, { edge: HTMLCanvasElement; fill: HTMLCanvasElement }>>(new Map())
  const hoverRef = useRef<string | null>(null)
  const rafRef = useRef<number>(0)

  // 마스크 픽셀 데이터 준비
  useEffect(() => {
    if (!maskUri) return
    edgeCacheRef.current.clear()
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      maskDataRef.current = {
        data: ctx.getImageData(0, 0, c.width, c.height).data,
        w: c.width,
        h: c.height,
      }
    }
    img.src = maskUri
  }, [maskUri])

  const colorAtEvent = (e: React.MouseEvent): string | null => {
    const cv = canvasRef.current
    const md = maskDataRef.current
    if (!cv || !md) return null
    const r = cv.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * md.w)
    const y = Math.floor(((e.clientY - r.top) / r.height) * md.h)
    if (x < 0 || y < 0 || x >= md.w || y >= md.h) return null
    const i = (y * md.w + x) * 4
    // 검정(#000)은 배경 처리
    if (md.data[i] < 8 && md.data[i + 1] < 8 && md.data[i + 2] < 8) return null
    return `#${[md.data[i], md.data[i + 1], md.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }

  // 재질 색 → 외곽선/채움 비트맵 (색별 1회 계산 후 캐시)
  const regionCanvases = (hex: string) => {
    const cached = edgeCacheRef.current.get(hex)
    if (cached) return cached
    const md = maskDataRef.current
    if (!md) return null
    const { data, w, h } = md
    const tr = parseInt(hex.slice(1, 3), 16)
    const tg = parseInt(hex.slice(3, 5), 16)
    const tb = parseInt(hex.slice(5, 7), 16)
    const inR = new Uint8Array(w * h)
    for (let p = 0; p < w * h; p++) {
      const i = p * 4
      if (Math.abs(data[i] - tr) <= 3 && Math.abs(data[i + 1] - tg) <= 3 && Math.abs(data[i + 2] - tb) <= 3) inR[p] = 1
    }
    const edgeImg = new ImageData(w, h)
    const fillImg = new ImageData(w, h)
    for (let p = 0; p < w * h; p++) {
      if (!inR[p]) continue
      const x = p % w
      const y = (p / w) | 0
      fillImg.data[p * 4 + 3] = 255
      const isEdge =
        x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
        !inR[p - 1] || !inR[p + 1] || !inR[p - w] || !inR[p + w]
      if (isEdge) edgeImg.data[p * 4 + 3] = 255
    }
    const make = (imgData: ImageData) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      ctx.putImageData(imgData, 0, 0)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = '#00f0c8'
      ctx.fillRect(0, 0, w, h)
      return c
    }
    const entry = { edge: make(edgeImg), fill: make(fillImg) }
    edgeCacheRef.current.set(hex, entry)
    return entry
  }

  // 렌더 루프: 글로우 + 흐르는 스트라이프(마칭 앤츠) 애니메이션
  useEffect(() => {
    const stripe = document.createElement('canvas')
    stripe.width = 16
    stripe.height = 16
    {
      const sctx = stripe.getContext('2d')!
      sctx.strokeStyle = 'rgba(255,255,255,0.95)'
      sctx.lineWidth = 4
      for (let o = -16; o <= 32; o += 8) {
        sctx.beginPath()
        sctx.moveTo(o, 16)
        sctx.lineTo(o + 16, 0)
        sctx.stroke()
      }
    }

    const draw = (t: number) => {
      rafRef.current = requestAnimationFrame(draw)
      const cv = canvasRef.current
      const md = maskDataRef.current
      if (!cv || !md) return
      if (cv.width !== md.w) { cv.width = md.w; cv.height = md.h }
      const ctx = cv.getContext('2d')!
      ctx.clearRect(0, 0, md.w, md.h)

      const sel = useClassicStore.getState()[colorsKey]
      const pulse = 0.72 + 0.28 * Math.sin(t / 320)

      // 선택 확정 영역: 은은한 채움 + 또렷한 외곽선
      for (const hex of sel) {
        const rc = regionCanvases(hex)
        if (!rc) continue
        ctx.globalAlpha = 0.16
        ctx.drawImage(rc.fill, 0, 0)
        ctx.globalAlpha = 0.95
        ctx.drawImage(rc.edge, 0, 0)
      }

      // 호버 미리보기: 글로우 + 흐르는 라인
      const hov = hoverRef.current
      if (hov && !sel.includes(hov)) {
        const rc = regionCanvases(hov)
        if (rc) {
          ctx.save()
          ctx.filter = 'blur(7px)'
          ctx.globalAlpha = 0.55 * pulse
          ctx.drawImage(rc.edge, 0, 0)
          ctx.filter = 'blur(2.5px)'
          ctx.globalAlpha = 0.85 * pulse
          ctx.drawImage(rc.edge, 0, 0)
          ctx.restore()
          ctx.globalAlpha = 1
          ctx.drawImage(rc.edge, 0, 0)
          const ants = document.createElement('canvas')
          ants.width = md.w
          ants.height = md.h
          const actx = ants.getContext('2d')!
          actx.drawImage(rc.edge, 0, 0)
          actx.globalCompositeOperation = 'source-in'
          const offset = (t / 40) % 16
          actx.save()
          actx.translate(-offset, offset)
          actx.fillStyle = actx.createPattern(stripe, 'repeat')!
          actx.fillRect(-16, -16, md.w + 32, md.h + 32)
          actx.restore()
          ctx.globalAlpha = 0.9
          ctx.drawImage(ants, 0, 0)
        }
      }
      ctx.globalAlpha = 1
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const onMove = (e: React.MouseEvent) => { hoverRef.current = colorAtEvent(e) }
  const onLeave = () => { hoverRef.current = null }
  const onClick = (e: React.MouseEvent) => {
    const hex = colorAtEvent(e)
    if (!hex) return
    const st = useClassicStore.getState()
    const cur = st[colorsKey]
    const next = cur.includes(hex) ? cur.filter((c) => c !== hex) : [...cur, hex]
    const statusText = next.length > 0
      ? `매직: 선택 레이어 ${next.length}개 — 프롬프트 입력 후 선택 레이어만 변경됩니다`
      : '매직: 선택 해제됨'
    if (colorsKey === 'sourceSelectedColors') st.set({ sourceSelectedColors: next, statusText })
    else st.set({ selectedColors: next, statusText })
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ cursor: 'crosshair' }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
    />
  )
}

// ── 클릭 영역 선택 오버레이 (오브젝트 ID 마스크 기반) ─────────────────────────
// 호버: 해당 재질 영역 하이라이트 / 클릭: 선택 토글 (여러 영역 가능)
function MaskSelectOverlay() {
  const s = useClassicStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskImgRef = useRef<HTMLImageElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hoverColor, setHoverColor] = useState<string | null>(null)

  // 마스크 이미지 로드 -> 픽셀 접근용 캔버스
  useEffect(() => {
    if (!s.maskUri) return
    const img = new Image()
    img.onload = () => {
      maskImgRef.current = img
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0)
      maskCanvasRef.current = c
      redraw(s.selectedColors, null)
    }
    img.src = s.maskUri
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.maskUri])

  const colorAt = (clientX: number, clientY: number): string | null => {
    const cv = canvasRef.current
    const mc = maskCanvasRef.current
    if (!cv || !mc) return null
    const r = cv.getBoundingClientRect()
    const x = Math.floor(((clientX - r.left) / r.width) * mc.width)
    const y = Math.floor(((clientY - r.top) / r.height) * mc.height)
    if (x < 0 || y < 0 || x >= mc.width || y >= mc.height) return null
    const d = mc.getContext('2d')!.getImageData(x, y, 1, 1).data
    return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }

  // 근사 매칭 (재질 단위 마스크: 색이 비슷한 다른 재질과 섞이지 않게 좁은 허용오차)
  const near = (a: number, b: number) => Math.abs(a - b) <= 3
  const matches = (d: Uint8ClampedArray, i: number, hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), bl = parseInt(hex.slice(5, 7), 16)
    return near(d[i], r) && near(d[i + 1], g) && near(d[i + 2], bl)
  }

  // 선택 표시: 어떤 마스크 색 위에서도 확실히 보이도록
  // - 선택 있음: 선택 부위만 원색 그대로(밝게) + 흰 테두리, 나머지는 어둡게 덮음
  // - 선택 없음: 호버 부위만 흰색 하이라이트
  const redraw = (selected: string[], hover: string | null) => {
    const cv = canvasRef.current
    const mc = maskCanvasRef.current
    if (!cv || !mc) return
    const W = mc.width, H = mc.height
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const src = mc.getContext('2d')!.getImageData(0, 0, W, H)
    const out = ctx.createImageData(W, H)
    const n = W * H
    const sel = new Uint8Array(n)
    const hov = new Uint8Array(n)
    for (let p = 0; p < n; p++) {
      const i = p * 4
      if (selected.length && selected.some((c) => matches(src.data, i, c))) sel[p] = 1
      if (hover && matches(src.data, i, hover)) hov[p] = 1
    }
    for (let p = 0; p < n; p++) {
      const i = p * 4
      if (selected.length === 0) {
        if (hov[p]) { out.data[i] = 255; out.data[i + 1] = 255; out.data[i + 2] = 255; out.data[i + 3] = 90 }
        continue
      }
      if (sel[p]) {
        // 선택 부위: 경계엔 흰 테두리, 내부는 덮지 않음(원색 그대로 밝게 보임)
        const x = p % W, y = (p / W) | 0
        const edge = (x > 0 && !sel[p - 1]) || (x < W - 1 && !sel[p + 1]) ||
                     (y > 0 && !sel[p - W]) || (y < H - 1 && !sel[p + W])
        if (edge) { out.data[i] = 255; out.data[i + 1] = 255; out.data[i + 2] = 255; out.data[i + 3] = 255 }
      } else {
        // 비선택 부위: 어둡게 (호버 중인 부위는 덜 어둡게 - 다음 선택 미리보기)
        out.data[i] = 0; out.data[i + 1] = 0; out.data[i + 2] = 0
        out.data[i + 3] = hov[p] ? 70 : 150
      }
    }
    ctx.putImageData(out, 0, 0)
  }

  useEffect(() => { redraw(s.selectedColors, hoverColor) }, [s.selectedColors, hoverColor]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedNames = s.selectedColors.map((c, i) => regionLabel(c, s.maskMap, i))

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-pointer"
        style={{ imageRendering: 'pixelated' }}
        onMouseMove={(e) => setHoverColor(colorAt(e.clientX, e.clientY))}
        onMouseLeave={() => setHoverColor(null)}
        onClick={(e) => {
          const c = colorAt(e.clientX, e.clientY)
          if (!c) return
          const st = useClassicStore.getState()
          const cur = st.selectedColors
          st.set({ selectedColors: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] })
        }}
      />
      {/* 선택된 재질 칩 */}
      <div className="absolute left-2 top-2 flex flex-wrap gap-1" style={{ maxWidth: '80%' }}>
        {selectedNames.map((n, i) => (
          <span key={s.selectedColors[i]} className="flex items-center gap-1" style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10.5, background: 'rgba(0,201,167,0.9)', color: '#06251f', fontWeight: 700 }}>
            Layer {i + 1}: {n}
            <button onClick={() => {
              const st = useClassicStore.getState()
              st.set({ selectedColors: st.selectedColors.filter((c) => c !== st.selectedColors[i]) })
            }}><X size={10} /></button>
          </span>
        ))}
        {selectedNames.length === 0 && (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10.5, background: 'rgba(0,0,0,0.6)', color: '#ccc' }}>
            바꿀 부위를 클릭하세요 (여러 곳 가능)
          </span>
        )}
      </div>
    </>
  )
}

// 선택 영역 -> 흑백 마스크 PNG (AI 입력용: 흰색=선택)
// 선택 픽셀을 몇 px 팽창(dilate)시켜, 마스크 캡처와 렌더 캡처 사이의 미세 정렬 오차로
// 경계에서 인접 재질이 새어나오는 것을 방지한다.
export function buildSelectionMask(maskUri: string, colors: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const src = ctx.getImageData(0, 0, W, H)
      const near = (a: number, b: number) => Math.abs(a - b) <= 3
      const targets = colors.map((hex) => [
        parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
      ])
      // 1) 원본 선택 비트맵
      const sel = new Uint8Array(W * H)
      for (let p = 0; p < W * H; p++) {
        const i = p * 4
        if (targets.some(([r, g, b]) => near(src.data[i], r) && near(src.data[i + 1], g) && near(src.data[i + 2], b))) {
          sel[p] = 1
        }
      }
      // 2) 팽창 (radius px): 선택 경계를 바깥으로 넓혀 이음새 누출 제거
      const R = 3
      const out = new Uint8Array(W * H)
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!sel[y * W + x]) continue
          out[y * W + x] = 1
          for (let dy = -R; dy <= R; dy++) {
            const ny = y + dy
            if (ny < 0 || ny >= H) continue
            for (let dx = -R; dx <= R; dx++) {
              const nx = x + dx
              if (nx < 0 || nx >= W) continue
              if (dx * dx + dy * dy <= R * R) out[ny * W + nx] = 1
            }
          }
        }
      }
      // 3) 흑백 PNG 출력
      for (let p = 0; p < W * H; p++) {
        const i = p * 4, v = out[p] ? 255 : 0
        src.data[i] = v; src.data[i + 1] = v; src.data[i + 2] = v; src.data[i + 3] = 255
      }
      ctx.putImageData(src, 0, 0)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = maskUri
  })
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function compositeMasked(baseImage: string, editedImage: string, maskImage: string): Promise<string | null> {
  const [base, edited, mask] = await Promise.all([
    loadImageElement(baseImage),
    loadImageElement(editedImage),
    loadImageElement(maskImage),
  ])
  if (!base || !edited || !mask) return null

  const canvas = document.createElement('canvas')
  canvas.width = edited.naturalWidth || base.naturalWidth
  canvas.height = edited.naturalHeight || base.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(base, 0, 0, canvas.width, canvas.height)
  const baseData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(edited, 0, 0, canvas.width, canvas.height)
  const editedData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height)
  const maskData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < baseData.data.length; i += 4) {
    const maskValue = maskData.data[i]
    if (maskValue > 127) {
      baseData.data[i] = editedData.data[i]
      baseData.data[i + 1] = editedData.data[i + 1]
      baseData.data[i + 2] = editedData.data[i + 2]
      baseData.data[i + 3] = editedData.data[i + 3]
    }
  }

  ctx.putImageData(baseData, 0, 0)
  return canvas.toDataURL('image/png')
}
