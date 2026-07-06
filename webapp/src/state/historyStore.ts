import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { getFirebaseAuth } from '../auth/firebase'
import { apiHistory, apiSaveHistory, saasMode } from '../api/lumanovaApi'
import type { GraphSnapshot } from '../types/graph'
import type { NodeData } from '../types/node'
import type { EdgeData } from '../types/graph'

interface HistoryState {
  snapshots: GraphSnapshot[]

  saveSnapshot: (nodes: NodeData[], edges: EdgeData[], creditUsed: number, targetNodeId?: string | null) => void
  loadSnapshots: () => Promise<void>
  restoreSnapshot: (snapshotId: string) => GraphSnapshot | undefined
  loadMore: () => void
}

const MAX_HISTORY_ITEMS = 30
const HISTORY_DB_NAME = 'lumanova-history'
const HISTORY_DB_VERSION = 1
const HISTORY_STORE_NAME = 'snapshots'

function getHistoryStorageKey(): string {
  const uid = getFirebaseAuth()?.currentUser?.uid ?? 'local'
  return `lumanova.history.${uid}`
}

function readSnapshotsByKey(key: string): GraphSnapshot[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_ITEMS) : []
  } catch {
    return []
  }
}

function persistSnapshots(snapshots: GraphSnapshot[]) {
  if (typeof localStorage === 'undefined') return

  let next = snapshots.slice(0, MAX_HISTORY_ITEMS)
  while (next.length > 0) {
    try {
      localStorage.setItem(getHistoryStorageKey(), JSON.stringify(next))
      return
    } catch {
      next = next.slice(0, Math.max(0, next.length - 5))
    }
  }
}

function openHistoryDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        db.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

// IndexedDB 레코드에는 소유 계정 키(ownerKey)를 함께 저장한다. 이전 버전 레코드는
// ownerKey가 없으므로, 현재 계정 소유가 확인되는 id(claimableIds)만 인정한다.
type StoredSnapshot = GraphSnapshot & { ownerKey?: string }

async function readOwnedSnapshotsFromIndexedDb(ownerKey: string, claimableIds: Set<string>): Promise<GraphSnapshot[]> {
  const db = await openHistoryDb()
  if (!db) return []
  return new Promise((resolve) => {
    const tx = db.transaction(HISTORY_STORE_NAME, 'readonly')
    const store = tx.objectStore(HISTORY_STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const rows = (Array.isArray(request.result) ? request.result : []) as StoredSnapshot[]
      const anonymousKey = ownerKey === 'lumanova.history.local'
      const owned = rows
        .filter((row) => row.ownerKey === ownerKey
          || (row.ownerKey === undefined && (anonymousKey || claimableIds.has(row.id))))
        .map(({ ownerKey: _ownerKey, ...snapshot }) => snapshot as GraphSnapshot)
      resolve(owned.slice(0, MAX_HISTORY_ITEMS))
    }
    request.onerror = () => resolve([])
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

async function persistSnapshotsToIndexedDb(snapshots: GraphSnapshot[], ownerKey: string) {
  const db = await openHistoryDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite')
    const store = tx.objectStore(HISTORY_STORE_NAME)
    snapshots.slice(0, MAX_HISTORY_ITEMS).forEach((snapshot) => {
      store.put({ ...snapshot, ownerKey } satisfies StoredSnapshot)
    })
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      resolve()
    }
  })
}

function pickPrompt(nodes: NodeData[]): string {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const params = nodes[i].params
    if ('prompt' in params && typeof params.prompt === 'string' && params.prompt.trim()) {
      return params.prompt
    }
  }
  return ''
}

function pickEngine(nodes: NodeData[]): string {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const params = nodes[i].params
    if ('engine' in params && typeof params.engine === 'string') return params.engine
  }
  return 'main'
}

function pickResultImage(nodes: NodeData[], thumbnails: string[] = [], targetNodeId?: string | null): string | null {
  const target = targetNodeId ? nodes.find((node) => node.id === targetNodeId) : null
  if (target?.result?.image) return target.result.image
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    if (node.type !== 'SOURCE' && node.result?.image) return node.result.image
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    if (node.result?.image) return node.result.image
  }
  return thumbnails[0] ?? null
}

function pickSourceImage(nodes: NodeData[], thumbnails: string[] = []): string | null {
  for (const node of nodes) {
    if (node.type === 'SOURCE' && node.result?.image) return node.result.image
  }
  return thumbnails[1] ?? null
}

function pickResultVideo(nodes: NodeData[], fallback?: string, targetNodeId?: string | null): string | null {
  const target = targetNodeId ? nodes.find((node) => node.id === targetNodeId) : null
  if (target?.result?.video && target.result.video !== 'mock-video-url') return target.result.video
  for (let i = nodes.length - 1; i >= 0; i--) {
    const video = nodes[i].result?.video
    if (video && video !== 'mock-video-url') return video
  }
  return fallback && fallback !== 'mock-video-url' ? fallback : null
}

async function createHistoryPreviewImage(image: string): Promise<string> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return image
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const widths = [1600, 1400, 1200, 1024, 800]
      const qualities = [0.92, 0.88, 0.84, 0.78]
      const maxPayloadLength = 850_000

      for (const maxWidth of widths) {
        const scale = Math.min(1, maxWidth / Math.max(1, img.width))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(image)
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        for (const quality of qualities) {
          const preview = canvas.toDataURL('image/jpeg', quality)
          if (preview.length <= maxPayloadLength) {
            resolve(preview)
            return
          }
        }
      }

      const fallbackScale = Math.min(1, 720 / Math.max(1, img.width))
      const fallbackCanvas = document.createElement('canvas')
      fallbackCanvas.width = Math.max(1, Math.round(img.width * fallbackScale))
      fallbackCanvas.height = Math.max(1, Math.round(img.height * fallbackScale))
      const fallbackCtx = fallbackCanvas.getContext('2d')
      if (!fallbackCtx) {
        resolve(image)
        return
      }
      fallbackCtx.drawImage(img, 0, 0, fallbackCanvas.width, fallbackCanvas.height)
      resolve(fallbackCanvas.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = () => resolve(image)
    img.src = image
  })
}

function captureVideoFrame(videoUrl: string, position: 'first' | 'last'): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const timeout = window.setTimeout(() => finish(null), 12_000)
    let settled = false

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      video.removeAttribute('src')
      video.load()
      resolve(value)
    }

    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      video.currentTime = position === 'last' && duration > 0.3 ? Math.max(0.05, duration - 0.12) : 0.05
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(null)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.86))
      } catch {
        finish(null)
      }
    }
    video.onerror = () => finish(null)
    video.src = videoUrl
  })
}

function snapshotFromServerItem(item: {
  id: string
  clientId?: string
  thumbnail: string
  sourceThumbnail?: string
  videoUrl?: string
  videoFirstFrame?: string
  videoLastFrame?: string
  targetNodeId?: string
  createdAt: string
  cost: number
  prompt?: string
  engine?: string
}): GraphSnapshot {
  const snapshotId = item.clientId || item.id
  return {
    id: snapshotId,
    graph: {
      graphId: snapshotId,
      nodes: [],
      edges: [],
      meta: {
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
        source: 'web',
        appVersion: '1.0.0',
      },
      ui: { zoom: 1.0, pan: { x: 0, y: 0 } },
    },
    timestamp: item.createdAt,
    creditUsed: item.cost,
    thumbnails: item.sourceThumbnail ? [item.thumbnail, item.sourceThumbnail] : [item.thumbnail],
    videoUrl: item.videoUrl ?? '',
    videoFirstFrame: item.videoFirstFrame ?? '',
    videoLastFrame: item.videoLastFrame ?? '',
    targetNodeId: item.targetNodeId ?? null,
    prompt: item.prompt ?? '',
    engine: item.engine ?? 'main',
    sourceThumbnail: item.sourceThumbnail ?? '',
  } as GraphSnapshot
}

async function persistSnapshotToServer(snapshot: GraphSnapshot) {
  if (!saasMode()) return
  const thumbnail = snapshot.videoLastFrame || pickResultImage(snapshot.graph.nodes, snapshot.thumbnails, snapshot.targetNodeId)
  if (!thumbnail) return
  const sourceThumbnail = pickSourceImage(snapshot.graph.nodes, snapshot.thumbnails)
  const videoUrl = pickResultVideo(snapshot.graph.nodes, snapshot.videoUrl, snapshot.targetNodeId)
  const nodes = snapshot.graph.nodes
  const compressed = await createHistoryPreviewImage(thumbnail)
  const compressedSource = sourceThumbnail ? await createHistoryPreviewImage(sourceThumbnail) : ''
  const compressedVideoFirstFrame = snapshot.videoFirstFrame ? await createHistoryPreviewImage(snapshot.videoFirstFrame) : ''
  const compressedVideoLastFrame = snapshot.videoLastFrame ? await createHistoryPreviewImage(snapshot.videoLastFrame) : ''
  try {
    await apiSaveHistory({
      clientId: snapshot.id,
      thumbnail: compressed,
      sourceThumbnail: compressedSource,
      prompt: pickPrompt(nodes),
      engine: pickEngine(nodes),
      videoUrl: videoUrl ?? undefined,
      videoFirstFrame: compressedVideoFirstFrame || undefined,
      videoLastFrame: compressedVideoLastFrame || undefined,
      targetNodeId: snapshot.targetNodeId ?? undefined,
      cost: snapshot.creditUsed,
      createdAt: snapshot.timestamp,
    })
  } catch (err) {
    // 실패한 항목은 로컬에만 남고, 다음 히스토리 로드 때 재업로드를 시도한다.
    console.warn('[history] 서버 히스토리 저장 실패:', err)
  }
}

function mergeSnapshots(...groups: GraphSnapshot[][]): GraphSnapshot[] {
  const seen = new Set<string>()
  const merged: GraphSnapshot[] = []
  for (const snapshot of groups.flat()) {
    const key = snapshot.id || snapshot.graph.graphId || `${snapshot.timestamp}-${merged.length}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(snapshot)
  }
  return merged
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_HISTORY_ITEMS)
}

function mergeServerSnapshotsWithLocalOriginals(serverSnapshots: GraphSnapshot[], localSnapshots: GraphSnapshot[]): GraphSnapshot[] {
  const localById = new Map(localSnapshots.map((snapshot) => [snapshot.id, snapshot]))
  const merged = serverSnapshots.map((serverSnapshot) => {
    const localSnapshot = localById.get(serverSnapshot.id)
    if (!localSnapshot) return serverSnapshot
    return {
      ...serverSnapshot,
      graph: localSnapshot.graph.nodes.length > 0 ? localSnapshot.graph : serverSnapshot.graph,
      thumbnails: localSnapshot.thumbnails.length > 0 ? localSnapshot.thumbnails : serverSnapshot.thumbnails,
      videoUrl: localSnapshot.videoUrl || serverSnapshot.videoUrl || pickResultVideo(localSnapshot.graph.nodes) || undefined,
      videoFirstFrame: localSnapshot.videoFirstFrame || serverSnapshot.videoFirstFrame || undefined,
      videoLastFrame: localSnapshot.videoLastFrame || serverSnapshot.videoLastFrame || undefined,
      targetNodeId: localSnapshot.targetNodeId ?? serverSnapshot.targetNodeId ?? null,
      sourceThumbnail: (localSnapshot as GraphSnapshot & { sourceThumbnail?: string }).sourceThumbnail
        || (serverSnapshot as GraphSnapshot & { sourceThumbnail?: string }).sourceThumbnail,
    } as GraphSnapshot
  })
  // 서버에 아직 반영 안 된 로컬 항목(방금 렌더한 것 등)을 유지 — 서버 저장은 비동기라
  // 렌더 직후 히스토리를 열면 서버 목록에는 없다. 이를 버리면 "저장 안 됨"으로 보인다.
  const serverIds = new Set(serverSnapshots.map((s) => s.id))
  const localOnly = localSnapshots.filter((s) => !serverIds.has(s.id))
  return mergeSnapshots(localOnly, merged)
}

async function enrichVideoFrames(snapshotId: string, videoUrl: string) {
  const [firstFrame, lastFrame] = await Promise.all([
    captureVideoFrame(videoUrl, 'first'),
    captureVideoFrame(videoUrl, 'last'),
  ])
  if (!firstFrame && !lastFrame) return

  const ownerKey = getHistoryStorageKey()
  let updatedSnapshot: GraphSnapshot | null = null

  useHistoryStore.setState((state) => {
    const snapshots = state.snapshots.map((snapshot) => {
      if (snapshot.id !== snapshotId) return snapshot
      const next: GraphSnapshot = {
        ...snapshot,
        videoFirstFrame: firstFrame ?? snapshot.videoFirstFrame,
        videoLastFrame: lastFrame ?? snapshot.videoLastFrame,
        thumbnails: [
          lastFrame ?? snapshot.videoLastFrame ?? snapshot.thumbnails[0],
          ...(firstFrame ? [firstFrame] : []),
          ...snapshot.thumbnails.slice(1),
        ].filter(Boolean) as string[],
      }
      updatedSnapshot = next
      return next
    })
    persistSnapshots(snapshots)
    void persistSnapshotsToIndexedDb(snapshots, ownerKey)
    return { snapshots }
  })

  if (updatedSnapshot) void persistSnapshotToServer(updatedSnapshot)
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  snapshots: [],

  saveSnapshot: (nodes, edges, creditUsed, targetNodeId = null) => {
    const resultImage = pickResultImage(nodes, [], targetNodeId)
    const videoUrl = pickResultVideo(nodes, undefined, targetNodeId)
    const otherImages = nodes
      .filter((n) => n.result?.image && n.result.image !== resultImage)
      .map((n) => n.result!.image!)
      .reverse()
    const thumbnails = resultImage ? [resultImage, ...otherImages] : otherImages
    const snapshotId = uuid()
    const graphId = uuid()
    const timestamp = new Date().toISOString()

    const snapshot: GraphSnapshot = {
      id: snapshotId,
      graph: {
        graphId,
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        meta: {
          createdAt: timestamp,
          updatedAt: timestamp,
          source: 'web',
          appVersion: '1.0.0',
        },
        ui: { zoom: 1.0, pan: { x: 0, y: 0 } },
      },
      timestamp,
      creditUsed,
      thumbnails,
      videoUrl: videoUrl ?? undefined,
      targetNodeId,
    }

    set((s) => {
      const ownerKey = getHistoryStorageKey()
      const snapshots = [snapshot, ...s.snapshots].slice(0, MAX_HISTORY_ITEMS)
      persistSnapshots(snapshots)
      void persistSnapshotsToIndexedDb(snapshots, ownerKey)
      void persistSnapshotToServer(snapshot)
      if (snapshot.videoUrl) {
        void enrichVideoFrames(snapshot.id, snapshot.videoUrl)
      }
      return { snapshots }
    })
  },

  loadSnapshots: async () => {
    // 로컬 캐시는 현재 계정 소유분만 사용한다. 익명(local) 히스토리를 로그인
    // 계정에 합치면 계정 간 목록이 오염되고 다른 계정 서버로 업로드까지 된다.
    const currentKey = getHistoryStorageKey()
    const storedSnapshots = readSnapshotsByKey(currentKey)
    const storedIds = new Set(storedSnapshots.map((snapshot) => snapshot.id))
    const indexedSnapshots = await readOwnedSnapshotsFromIndexedDb(currentKey, storedIds)
    const cachedSnapshots = mergeSnapshots(indexedSnapshots, storedSnapshots)
    set({ snapshots: cachedSnapshots })

    if (saasMode()) {
      try {
        const { items } = await apiHistory(60)
        const serverSnapshots = items.map(snapshotFromServerItem)
        // 서버 목록이 계정의 기준(source of truth). 로컬 캐시는 원본 그래프 복원과
        // 아직 업로드되지 않은 항목(업로드 대기분) 유지에만 쓴다.
        const serverIds = new Set(serverSnapshots.map((snapshot) => snapshot.id))
        const claimableIds = new Set([...storedIds, ...serverIds])
        const localSnapshots = mergeSnapshots(
          cachedSnapshots,
          await readOwnedSnapshotsFromIndexedDb(currentKey, claimableIds),
          storedSnapshots,
        )
        const snapshots = mergeServerSnapshotsWithLocalOriginals(serverSnapshots, localSnapshots)
        set({ snapshots })
        void persistSnapshotsToIndexedDb(snapshots, currentKey)
        localSnapshots.filter((snapshot) => !serverIds.has(snapshot.id)).forEach((snapshot) => {
          void persistSnapshotToServer(snapshot)
        })
        return
      } catch (err) {
        console.warn('[history] 서버 히스토리 조회 실패 — 로컬 캐시로 표시합니다:', err)
      }
    }
  },

  restoreSnapshot: (snapshotId) => {
    return get().snapshots.find((s) => s.id === snapshotId)
  },

  loadMore: () => {
    // Placeholder for pagination
  },
}))

// 개발 모드 전용: E2E 테스트에서 스토어 조작용 (프로덕션 번들엔 미포함)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __historyStore?: typeof useHistoryStore }).__historyStore = useHistoryStore
}
