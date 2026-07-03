import { useGraphStore } from '../state/graphStore'
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
  const setStatus = useUIStore.getState().setSketchUpStatus
  const isConnected = await ping()

  if (isConnected) {
    setStatus('connected')
    const capture = await fetchCapture()
    if (capture) {
      injectCapture(capture)
    }
  } else {
    setStatus('disconnected')
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
