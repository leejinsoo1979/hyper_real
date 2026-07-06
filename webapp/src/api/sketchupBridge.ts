import { useGraphStore } from '../state/graphStore'
import { getStoredApiKey, setStoredApiKey } from '../engine/geminiClient'
import { useUIStore, type DccMaterialInfo } from '../state/uiStore'
import type { SceneMeta } from '../types/node'

// ---------------------------------------------------------------------------
// Types matching SKETCHUP.md JSON payload (kept for future expansion)
// ---------------------------------------------------------------------------

export interface SketchUpCameraMeta {
  eye: [number, number, number]
  target: [number, number, number]
  up: [number, number, number]
  fov: number
  perspective: boolean
  aspectRatio: number
}

export interface SketchUpSceneMeta {
  modelName: string
  sceneId: string | null
  style: string
  shadow: boolean
  shadowTime: string
}

export interface SketchUpRenderingMeta {
  edgeDisplay: number
  faceStyle: number
  backgroundColor: [number, number, number]
}

export interface SketchUpMeta {
  camera: SketchUpCameraMeta
  scene: SketchUpSceneMeta
  rendering: SketchUpRenderingMeta
}

export interface CapturePayload {
  source: 'sketchup'
  image: string // base64 (no data-URI prefix)
  meta: SketchUpMeta
  timestamp: string // ISO-8601
}

// ---------------------------------------------------------------------------
// Ruby WEBrick server response types (actual API at localhost:9876)
// ---------------------------------------------------------------------------

/** GET /api/ping → { status: 'ok', app: 'Lumanova Bridge', tool?, ip, port } */
interface PingResponse {
  status: string
  app?: string
  tool?: string
  ip?: string
  port?: number
}

/** GET /api/data → { source: base64|null, rendered: base64|null, timestamp: number } */
interface DataResponse {
  source: string | null
  rendered: string | null
  timestamp: number // unix seconds
}

/** GET /api/scenes → { scenes: [{ name, active }], timestamp } */
export interface SketchUpScene {
  name: string
  active: boolean
}

interface ScenesResponse {
  scenes: SketchUpScene[]
  timestamp: number
}

interface DccMaterialsResponse {
  source?: string
  materials?: DccMaterialInfo[]
  timestamp: number
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// 툴별 고정 포트. 웹앱은 모든 포트를 스캔해 살아있는 브릿지에 붙는다.
// 여러 툴이 동시에 켜져 있으면 먼저 응답한(목록 순) 브릿지가 연결된다.
const BRIDGE_PORTS = [9876, 9877, 9878] // SketchUp / Blender / Rhino
const POLL_INTERVAL_MS = 2000
const REQUEST_TIMEOUT_MS = 3500

/** 현재 연결된 브릿지 주소. 연결 전이나 끊긴 뒤에는 재스캔한다. */
let bridgeBaseUrl: string | null = null

function bridgeUrl(path: string): string {
  return `${bridgeBaseUrl ?? `http://localhost:${BRIDGE_PORTS[0]}`}${path}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSceneMeta(): SceneMeta {
  const tool = useUIStore.getState().bridgeTool ?? 'sketchup'
  return {
    modelName: tool[0].toUpperCase() + tool.slice(1),
    sceneId: '',
    fov: 35,
    eye: [0, 0, 0],
    target: [0, 0, 0],
    up: [0, 0, 1],
    shadow: false,
    style: 'default',
  }
}

function toDataUri(base64: string): string {
  if (base64.startsWith('data:')) return base64
  const mime = base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${base64}`
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Bridge API
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null
/** Track previous source base64 to detect actual image changes */
let lastSourceHash: string | null = null

async function pingPort(port: number): Promise<PingResponse | null> {
  try {
    const res = await fetchWithTimeout(`http://localhost:${port}/api/ping`)
    if (!res.ok) return null
    const data: PingResponse = await res.json()
    return data.status === 'ok' ? data : null
  } catch {
    return null
  }
}

/**
 * 연결 확인 + 브릿지 자동 탐색.
 * 연결돼 있으면 그 브릿지만 ping, 끊겨 있으면 전체 포트를 동시에 스캔한다.
 */
async function ping(): Promise<boolean> {
  const ui = useUIStore.getState()

  if (bridgeBaseUrl) {
    const current = await pingPort(Number(new URL(bridgeBaseUrl).port))
    if (current) return true
    bridgeBaseUrl = null // 끊김 — 다음 스캔에서 다른 툴로 넘어갈 수 있게
  }

  for (const port of BRIDGE_PORTS) {
    const found = await pingPort(port)
    if (!found) continue
    bridgeBaseUrl = `http://localhost:${port}`
    // 구버전 SketchUp 브릿지는 tool 필드가 없다 → sketchup으로 간주
    ui.setBridgeTool(found.tool ?? 'sketchup')
    lastSourceHash = null // 새 브릿지의 첫 캡처를 즉시 반영
    return true
  }

  ui.setBridgeTool(null)
  return false
}

/**
 * Fetch the latest SketchUp capture from Ruby server.
 * Ruby endpoint: GET /api/data → { source: base64, rendered: base64, timestamp: unix }
 * Returns the source image base64 if it has changed since the last poll.
 */
async function fetchCapture(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(bridgeUrl('/api/data'))
    if (!res.ok) return null

    const data: DataResponse = await res.json()
    const vp = (data as { viewport?: { w: number; h: number; sf?: number; title?: string | null } }).viewport
    if (vp && vp.w > 0) useUIStore.getState().setSketchUpViewport({ w: vp.w, h: vp.h, sf: vp.sf ?? 1, title: vp.title ?? null })
    if (!data.source) return null

    // Deduplicate: compare first 100 chars of base64 to detect actual changes
    const hash = data.source.slice(0, 100)
    if (hash === lastSourceHash) return null

    lastSourceHash = hash
    return data.source
  } catch {
    return null
  }
}

/** 현재 소스 이미지를 1회 직접 조회 (dedup 캐시 무시). Convert 완료 감지용. */
export async function fetchSourceOnce(): Promise<{ uri: string; sig: string } | null> {
  try {
    const res = await fetchWithTimeout(bridgeUrl('/api/data'))
    if (!res.ok) return null
    const data: DataResponse = await res.json()
    if (!data.source) return null
    return { uri: toDataUri(data.source), sig: `${data.source.length}:${data.source.slice(0, 80)}` }
  } catch {
    return null
  }
}

/** 플러그인에 저장된 API Key를 자동으로 받아와 등록 (사용자 재입력 불필요). */
async function syncApiKeyFromBridge(): Promise<void> {
  if (getStoredApiKey()) return // 이미 있으면 유지
  try {
    const res = await fetchWithTimeout(bridgeUrl('/api/apikey'))
    if (!res.ok) return
    const data: { apiKey?: string } = await res.json()
    if (data.apiKey && data.apiKey.trim().length > 0) {
      setStoredApiKey(data.apiKey)
      console.log('[Bridge] SketchUp 플러그인에서 API Key 자동 등록됨')
    }
  } catch {
    // 브릿지가 구버전이거나 키가 없으면 조용히 넘어감
  }
}

// ── 모델 재질 가져오기 (Materials 페이지 소스 탭) ───────────────────────────
// SketchUp 브릿지: { name, color:'#hex', texture: base64 }
// Blender 브릿지:  DccMaterialInfo { name, baseColor:[r,g,b,a], textures: 경로 }
// 두 형식을 표시용 공통 형식(SourceMaterial)으로 정규화한다.

export interface SourceMaterial {
  name: string
  color: string           // '#rrggbb'
  texture: string | null  // base64 (텍스처 없거나 용량 초과 시 null)
}

interface RawMaterialsResponse {
  materials: Array<Record<string, unknown>>
  timestamp: number
}

function floatToHex(v: unknown): string {
  const n = Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 255)
  return n.toString(16).padStart(2, '0')
}

function normalizeMaterial(raw: Record<string, unknown>): SourceMaterial | null {
  const name = typeof raw.name === 'string' ? raw.name : null
  if (!name) return null
  if (typeof raw.color === 'string') {
    return { name, color: raw.color, texture: typeof raw.texture === 'string' ? raw.texture : null }
  }
  if (Array.isArray(raw.baseColor)) {
    const [r, g, b] = raw.baseColor
    return { name, color: `#${floatToHex(r)}${floatToHex(g)}${floatToHex(b)}`, texture: null }
  }
  return { name, color: '#888888', texture: null }
}

async function fetchMaterialsOnce(): Promise<{ materials: SourceMaterial[]; timestamp: number } | null> {
  try {
    const res = await fetchWithTimeout(bridgeUrl('/api/materials'))
    if (!res.ok) return null // 404 = 구버전 브릿지 (재질 기능 없음)
    const data: RawMaterialsResponse = await res.json()
    return {
      materials: (data.materials ?? []).map(normalizeMaterial).filter((m): m is SourceMaterial => m !== null),
      timestamp: data.timestamp ?? 0,
    }
  } catch {
    return null
  }
}

/** 데이터 URI로 변환된 텍스처 (표시용). */
export function materialTextureUri(m: SourceMaterial): string | null {
  return m.texture ? toDataUri(m.texture) : null
}

/**
 * 연결된 3D 툴의 모델 재질을 추출해 온다. 브릿지에 load_materials 명령을 보내고
 * 캐시 timestamp가 갱신될 때까지 폴링한다 (Blender는 주기 갱신이라 명령은 무시됨).
 * null = 실패/미지원 브릿지.
 */
export async function loadSourceMaterials(): Promise<SourceMaterial[] | null> {
  const before = await fetchMaterialsOnce()
  if (!(await sendCommand({ type: 'load_materials' }))) return null
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const now = await fetchMaterialsOnce()
    if (now && now.timestamp !== (before?.timestamp ?? 0) && now.materials.length > 0) {
      return now.materials
    }
  }
  // 갱신 감지 실패 시 마지막 캐시라도 반환 (구버전 브릿지는 null)
  const last = await fetchMaterialsOnce()
  return last?.materials?.length ? last.materials : null
}

/** SketchUp의 저장된 씬 목록 조회. null = 일시적 실패 (기존 목록 유지해야 함). */
export async function getScenes(): Promise<SketchUpScene[] | null> {
  try {
    const res = await fetchWithTimeout(bridgeUrl('/api/scenes'))
    if (!res.ok) return null
    const data: ScenesResponse = await res.json()
    return data.scenes ?? []
  } catch {
    return null
  }
}

async function getMaterials(): Promise<DccMaterialInfo[] | null> {
  try {
    const res = await fetchWithTimeout(bridgeUrl('/api/materials'))
    if (!res.ok) return null
    const data: DccMaterialsResponse = await res.json()
    return Array.isArray(data.materials) ? data.materials : []
  } catch {
    return null
  }
}

/** 앱 → SketchUp 명령 전송 (씬 전환, 카메라, 즉시 캡처). */
async function sendCommand(cmd: Record<string, unknown>): Promise<boolean> {
  try {
    // Content-Type: text/plain = CORS 단순 요청 -> OPTIONS 프리플라이트가 발생하지 않음.
    // (WEBrick ProcHandler가 OPTIONS를 405로 응답하는 문제를 브라우저에서 원천 회피.
    //  Ruby 쪽은 req.body를 JSON.parse 하므로 Content-Type과 무관하게 동작)
    const res = await fetchWithTimeout(bridgeUrl('/api/command'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(cmd),
    })
    return res.ok
  } catch {
    return false
  }
}

// 낙관적 씬 고정: SketchUp이 전환을 마칠 때까지(수 초) 폴링이 옛 활성 씬으로
// 탭을 되돌리지 않도록, 서버가 전환을 확인하거나 유예가 끝날 때까지 고정한다.
let pendingScene: { name: string; until: number } | null = null

/** SketchUp 씬 전환. 탭 하이라이트는 즉시(낙관적) 반영, 캡처는 연속 폴링으로 수신. */
export async function selectScene(name: string): Promise<boolean> {
  // 낙관적 UI: 서버 응답을 기다리지 않고 active 탭 즉시 갱신
  const ui = useUIStore.getState()
  ui.setSketchUpScenes(ui.sketchUpScenes.map((s) => ({ ...s, active: s.name === name })))
  pendingScene = { name, until: Date.now() + 8000 }

  const ok = await sendCommand({ type: 'select_scene', name })
  if (ok) {
    lastSourceHash = null
    // 전환 직후 새 캡처를 빠르게 연속 수신 (0.5s / 1.2s / 2.5s)
    setTimeout(pollOnce, 500)
    setTimeout(pollOnce, 1200)
    setTimeout(pollOnce, 2500)
  }
  return ok
}

/** 카메라 제어 (이동/회전/높이/FOV/2점투시) — 실행 후 새 캡처가 자동 반영된다. */
export async function sendCamera(
  action: 'move' | 'rotate' | 'height' | 'fov' | 'two_point',
  value?: string,
): Promise<boolean> {
  const ok = await sendCommand({ type: 'camera', action, value })
  if (ok) {
    lastSourceHash = null
    setTimeout(pollOnce, 500)
    setTimeout(pollOnce, 1100)
  }
  return ok
}

/** 현재 뷰 즉시 재캡처 요청. size: '1024'|'1536'|'1920' = 고품질 Convert 캡처. */
export async function requestCapture(size?: string): Promise<boolean> {
  const ok = await sendCommand(size ? { type: 'capture', size } : { type: 'capture' })
  if (ok) {
    lastSourceHash = null
    setTimeout(pollOnce, 900)
  }
  return ok
}

export interface MaskData {
  uri: string
  map: { color: string; material: string }[]
}

/** 오브젝트 ID 마스크 캡처 요청 후 수신 (클릭 선택용).
 *  주의: 오래된 마스크로 폴백하지 않는다 - 다른 뷰의 마스크가 렌더와 어긋나는 사고 방지. */
export async function captureMask(): Promise<MaskData | null> {
  const before = await fetchMaskOnce()
  const sent = await sendCommand({ type: 'capture_mask' })
  if (!sent) return null
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const now = await fetchMaskOnce()
    if (now && (!before || now.timestamp !== before.timestamp)) {
      return vivifyMask(toDataUri(now.mask), now.map)
    }
  }
  return null
}

// 마스크 재배색: SketchUp이 주는 재질 평균색(칙칙하고 서로 비슷할 수 있음)을
// 재질별 쨍한 고유색으로 바꿔 칠한다 (CG 오브젝트 ID 패스 룩).
// 매핑에 없는 픽셀(하늘/배경)은 검정. 평균색이 완전히 같은 재질들은 하나로 병합 표기.
async function vivifyMask(
  uri: string,
  map: { color: string; material: string }[],
): Promise<MaskData | null> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => resolve(null)
    i.src = uri
  })
  if (!img) return { uri, map }

  // 원본색 -> {비비드색, 재질명(병합)} 배정 (황금각 색상환: 서로 뚜렷이 구분)
  const groups = new Map<string, string[]>()
  for (const m of map) {
    const k = m.color.toLowerCase()
    const g = groups.get(k)
    if (g) g.push(m.material)
    else groups.set(k, [m.material])
  }
  const vivid = (i: number): [number, number, number] => {
    const h = (i * 137.508) % 360
    const s = 1 - 0.22 * (Math.floor(i / 3) % 2)
    const v = 1 - 0.25 * (Math.floor(i / 2) % 2)
    const c = v * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const mm = v - c
    const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    return [Math.round((r1 + mm) * 255), Math.round((g1 + mm) * 255), Math.round((b1 + mm) * 255)]
  }
  const origins: [number, number, number][] = []
  const vivids: [number, number, number][] = []
  const newMap: { color: string; material: string }[] = []
  let idx = 0
  for (const [orig, names] of groups) {
    const [r, g, b] = vivid(idx++)
    origins.push([parseInt(orig.slice(1, 3), 16), parseInt(orig.slice(3, 5), 16), parseInt(orig.slice(5, 7), 16)])
    vivids.push([r, g, b])
    newMap.push({
      color: `#${[r, g, b].map((v2) => v2.toString(16).padStart(2, '0')).join('')}`,
      material: names.length > 2 ? `${names[0]} 외 ${names.length - 1}` : names.join(' / '),
    })
  }

  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height)

  // 최근접 재질색 매칭: 화면 명암(면 방향 셰이딩)으로 픽셀색이 재질색에서
  // 어긋나는 것을 허용. 너무 먼 색(하늘/배경/가장자리)은 검정 처리.
  const cache = new Map<number, number>() // 양자화 픽셀색 -> 그룹 인덱스(-1=배경)
  const MAX_D2 = 90 * 90
  for (let i = 0; i < d.data.length; i += 4) {
    const pr = d.data[i], pg = d.data[i + 1], pb = d.data[i + 2]
    const key = ((pr >> 2) << 12) | ((pg >> 2) << 6) | (pb >> 2)
    let gi = cache.get(key)
    if (gi === undefined) {
      let best = -1
      let bestD = MAX_D2
      for (let j = 0; j < origins.length; j++) {
        const dr = pr - origins[j][0], dg = pg - origins[j][1], db = pb - origins[j][2]
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestD) { bestD = dist; best = j }
      }
      gi = best
      cache.set(key, gi)
    }
    if (gi >= 0) {
      d.data[i] = vivids[gi][0]; d.data[i + 1] = vivids[gi][1]; d.data[i + 2] = vivids[gi][2]
    } else {
      d.data[i] = 0; d.data[i + 1] = 0; d.data[i + 2] = 0
    }
    d.data[i + 3] = 255
  }
  ctx.putImageData(d, 0, 0)
  return { uri: c.toDataURL('image/png'), map: newMap }
}

async function fetchMaskOnce(): Promise<{ mask: string; map: { color: string; material: string }[]; timestamp: number } | null> {
  try {
    const res = await fetchWithTimeout(bridgeUrl('/api/mask'))
    if (!res.ok) return null
    const j = await res.json()
    if (!j.mask) return null
    return j
  } catch {
    return null
  }
}

/** 현재 뷰를 SketchUp 씬으로 저장. */
export async function addScene(): Promise<boolean> {
  return sendCommand({ type: 'add_scene' })
}

export async function pushResult(
  nodeId: string,
  imageBase64: string,
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(bridgeUrl('/api/result'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId,
        image: imageBase64,
        timestamp: new Date().toISOString(),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Capture → Source node injection
// ---------------------------------------------------------------------------

/**
 * Inject or update a SOURCE node from SketchUp capture.
 * - If a sketchup-origin SOURCE node already exists → update its image
 * - Otherwise → create a new SOURCE node
 */
function injectCapture(imageBase64: string) {
  const imageDataUri = toDataUri(imageBase64)
  const store = useGraphStore.getState()
  const origin = (useUIStore.getState().bridgeTool ?? 'sketchup') as 'sketchup' | 'blender' | 'rhino'

  // Find existing live DCC source node
  const existing = store.nodes.find(
    (n) => n.type === 'SOURCE' && 'origin' in n.params && n.params.origin === origin,
  )

  if (existing) {
    // Update existing node's image without creating a new one
    store.updateNodeParams(existing.id, { image: imageDataUri })
    store.updateNodeResult(existing.id, {
      image: imageDataUri,
      timestamp: new Date().toISOString(),
      cacheKey: '',
    })
  } else {
    // Create new SOURCE node at center-left of canvas
    const position = { x: 100, y: 200 }
    store.createSourceNode(imageDataUri, origin, position, {
      sceneMeta: defaultSceneMeta(),
      cameraLocked: true,
    })
  }
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

let pingFailures = 0

async function pollOnce() {
  const ui = useUIStore.getState()
  const isConnected = await ping()

  if (isConnected) {
    pingFailures = 0
    ui.setSketchUpStatus('connected')
    await syncApiKeyFromBridge()
    const capture = await fetchCapture()
    if (capture) {
      injectCapture(capture)
    }
    // 씬 목록 동기화 — 일시적 실패(null)면 기존 탭 유지 (탭이 깜빡이며 사라지는 문제 방지)
    const scenes = await getScenes()
    if (scenes !== null) {
      // 전환 대기 중이면 서버가 아직 옛 씬을 활성으로 보고해도 탭을 되돌리지 않는다
      if (pendingScene) {
        const p = pendingScene
        const serverActive = scenes.find((s) => s.active)?.name
        if (serverActive === p.name || Date.now() > p.until || !scenes.some((s) => s.name === p.name)) {
          pendingScene = null // 전환 확인됨(또는 유예 종료) - 서버 상태 수용
          ui.setSketchUpScenes(scenes)
        } else {
          ui.setSketchUpScenes(scenes.map((s) => ({ ...s, active: s.name === p.name })))
        }
      } else {
        ui.setSketchUpScenes(scenes)
      }
    }
    const bridgeState = useUIStore.getState()
    const bridgeTool = bridgeState.bridgeTool
    if (bridgeTool === 'blender') {
      const materials = await getMaterials()
      if (materials !== null) {
        ui.setBridgeMaterials(materials)
      }
    } else if (bridgeState.bridgeMaterials.length > 0) {
      ui.setBridgeMaterials([])
    }
  } else {
    // SketchUp이 캡처 등으로 바빠 응답이 늦은 것일 수 있으니 보수적으로 판정
    pingFailures += 1
    if (pingFailures >= 4) {
      ui.setSketchUpStatus('disconnected')
      ui.setBridgeMaterials([])
    }
    if (pingFailures >= 6) {
      // 진짜 끊긴 경우에만 탭 제거 (일시 지연에 탭이 사라졌다 나타나는 문제 방지)
      ui.setSketchUpScenes([])
    }
  }
}

export function startBridge() {
  if (pollTimer !== null) return

  useUIStore.getState().setSketchUpStatus('connecting')
  pollOnce()
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS)
}

export function stopBridge() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  useUIStore.getState().setSketchUpStatus('disconnected')
}
