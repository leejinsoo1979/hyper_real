import { useGraphStore } from '../state/graphStore'
import { getStoredApiKey, setStoredApiKey } from '../engine/geminiClient'
import { useUIStore } from '../state/uiStore'
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

/** GET /api/ping → { status: 'ok', app: 'BananaShow', ip: string, port: number } */
interface PingResponse {
  status: string
  app?: string
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BRIDGE_BASE_URL = 'http://localhost:9876'
const POLL_INTERVAL_MS = 2000
const REQUEST_TIMEOUT_MS = 3500

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSceneMeta(): SceneMeta {
  return {
    modelName: 'SketchUp',
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

/**
 * Ping the Ruby WEBrick server.
 * Ruby endpoint: GET /api/ping → { status: 'ok', ... }
 */
async function ping(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/ping`)
    if (!res.ok) return false
    const data: PingResponse = await res.json()
    return data.status === 'ok'
  } catch {
    return false
  }
}

/**
 * Fetch the latest SketchUp capture from Ruby server.
 * Ruby endpoint: GET /api/data → { source: base64, rendered: base64, timestamp: unix }
 * Returns the source image base64 if it has changed since the last poll.
 */
async function fetchCapture(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/data`)
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
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/data`)
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
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/apikey`)
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

/** SketchUp의 저장된 씬 목록 조회. null = 일시적 실패 (기존 목록 유지해야 함). */
export async function getScenes(): Promise<SketchUpScene[] | null> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/scenes`)
    if (!res.ok) return null
    const data: ScenesResponse = await res.json()
    return data.scenes ?? []
  } catch {
    return null
  }
}

/** 앱 → SketchUp 명령 전송 (씬 전환, 카메라, 즉시 캡처). */
async function sendCommand(cmd: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    })
    return res.ok
  } catch {
    return false
  }
}

/** SketchUp 씬 전환. 탭 하이라이트는 즉시(낙관적) 반영, 캡처는 연속 폴링으로 수신. */
export async function selectScene(name: string): Promise<boolean> {
  // 낙관적 UI: 서버 응답을 기다리지 않고 active 탭 즉시 갱신
  const ui = useUIStore.getState()
  ui.setSketchUpScenes(ui.sketchUpScenes.map((s) => ({ ...s, active: s.name === name })))

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

/** 오브젝트 ID 마스크 캡처 요청 후 수신 (클릭 선택용). */
export async function captureMask(): Promise<MaskData | null> {
  const before = await fetchMaskOnce()
  await sendCommand({ type: 'capture_mask' })
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const now = await fetchMaskOnce()
    if (now && (!before || now.timestamp !== before.timestamp)) {
      return { uri: toDataUri(now.mask), map: now.map }
    }
  }
  return null
}

async function fetchMaskOnce(): Promise<{ mask: string; map: { color: string; material: string }[]; timestamp: number } | null> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/mask`)
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
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/result`, {
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

  // Find existing sketchup source node
  const existing = store.nodes.find(
    (n) => n.type === 'SOURCE' && 'origin' in n.params && n.params.origin === 'sketchup',
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
    store.createSourceNode(imageDataUri, 'sketchup', position, {
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
      ui.setSketchUpScenes(scenes)
    }
  } else {
    // SketchUp이 캡처 등으로 바빠 응답이 늦은 것일 수 있으니 보수적으로 판정
    pingFailures += 1
    if (pingFailures >= 4) {
      ui.setSketchUpStatus('disconnected')
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
