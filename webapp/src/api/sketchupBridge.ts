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
const POLL_INTERVAL_MS = 3000
const REQUEST_TIMEOUT_MS = 2000

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
  return `data:image/png;base64,${base64}`
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

/** SketchUp의 저장된 씬 목록 조회. */
export async function getScenes(): Promise<SketchUpScene[]> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/scenes`)
    if (!res.ok) return []
    const data: ScenesResponse = await res.json()
    return data.scenes ?? []
  } catch {
    return []
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

/** SketchUp 씬 전환. 전환 직후 새 캡처가 폴링으로 들어온다. */
export async function selectScene(name: string): Promise<boolean> {
  const ok = await sendCommand({ type: 'select_scene', name })
  if (ok) {
    // 씬이 바뀌면 같은 이미지 dedup 캐시를 무효화해 즉시 갱신되게 한다
    lastSourceHash = null
    // 전환 렌더가 끝난 뒤 바로 한 번 폴링
    setTimeout(pollOnce, 700)
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
    setTimeout(pollOnce, 600)
  }
  return ok
}

/** 현재 뷰 즉시 재캡처 요청. */
export async function requestCapture(): Promise<boolean> {
  const ok = await sendCommand({ type: 'capture' })
  if (ok) {
    lastSourceHash = null
    setTimeout(pollOnce, 700)
  }
  return ok
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

async function pollOnce() {
  const ui = useUIStore.getState()
  const isConnected = await ping()

  if (isConnected) {
    ui.setSketchUpStatus('connected')
    await syncApiKeyFromBridge()
    const capture = await fetchCapture()
    if (capture) {
      injectCapture(capture)
    }
    // 씬 목록 동기화 (인스펙터의 씬 전환 UI용)
    const scenes = await getScenes()
    ui.setSketchUpScenes(scenes)
  } else {
    ui.setSketchUpStatus('disconnected')
    ui.setSketchUpScenes([])
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
