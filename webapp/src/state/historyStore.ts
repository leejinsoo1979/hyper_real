import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { getFirebaseAuth } from '../auth/firebase'
import { apiHistory, apiSaveHistory, saasMode } from '../api/lumanovaApi'
import type { GraphSnapshot } from '../types/graph'
import type { NodeData } from '../types/node'
import type { EdgeData } from '../types/graph'

interface HistoryState {
  snapshots: GraphSnapshot[]

  saveSnapshot: (nodes: NodeData[], edges: EdgeData[], creditUsed: number) => void
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

async function readSnapshotsFromIndexedDb(): Promise<GraphSnapshot[]> {
  const db = await openHistoryDb()
  if (!db) return []
  return new Promise((resolve) => {
    const tx = db.transaction(HISTORY_STORE_NAME, 'readonly')
    const store = tx.objectStore(HISTORY_STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : []
      resolve(rows.slice(0, MAX_HISTORY_ITEMS) as GraphSnapshot[])
    }
    request.onerror = () => resolve([])
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

async function persistSnapshotsToIndexedDb(snapshots: GraphSnapshot[]) {
  const db = await openHistoryDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite')
    const store = tx.objectStore(HISTORY_STORE_NAME)
    snapshots.slice(0, MAX_HISTORY_ITEMS).forEach((snapshot) => {
      store.put(snapshot)
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

function pickResultImage(nodes: NodeData[], thumbnails: string[] = []): string | null {
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

function snapshotFromServerItem(item: {
  id: string
  clientId?: string
  thumbnail: string
  sourceThumbnail?: string
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
    prompt: item.prompt ?? '',
    engine: item.engine ?? 'main',
    sourceThumbnail: item.sourceThumbnail ?? '',
  } as GraphSnapshot
}

async function persistSnapshotToServer(snapshot: GraphSnapshot) {
  if (!saasMode()) return
  const thumbnail = pickResultImage(snapshot.graph.nodes, snapshot.thumbnails)
  if (!thumbnail) return
  const sourceThumbnail = pickSourceImage(snapshot.graph.nodes, snapshot.thumbnails)
  const nodes = snapshot.graph.nodes
  const compressed = await createHistoryPreviewImage(thumbnail)
  const compressedSource = sourceThumbnail ? await createHistoryPreviewImage(sourceThumbnail) : ''
  await apiSaveHistory({
    clientId: snapshot.id,
    thumbnail: compressed,
    sourceThumbnail: compressedSource,
    prompt: pickPrompt(nodes),
    engine: pickEngine(nodes),
    cost: snapshot.creditUsed,
    createdAt: snapshot.timestamp,
  }).catch(() => {})
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

export const useHistoryStore = create<HistoryState>((set, get) => ({
  snapshots: [],

  saveSnapshot: (nodes, edges, creditUsed) => {
    const resultImage = pickResultImage(nodes)
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
    }

    set((s) => {
      const snapshots = [snapshot, ...s.snapshots].slice(0, MAX_HISTORY_ITEMS)
      persistSnapshots(snapshots)
      void persistSnapshotsToIndexedDb(snapshots)
      void persistSnapshotToServer(snapshot)
      return { snapshots }
    })
  },

  loadSnapshots: async () => {
    const auth = getFirebaseAuth()
    const currentKey = getHistoryStorageKey()
    const localKey = 'lumanova.history.local'
    const indexedDbSnapshots = await readSnapshotsFromIndexedDb()
    const localSnapshots = mergeSnapshots(
      indexedDbSnapshots,
      readSnapshotsByKey(currentKey),
      auth?.currentUser ? readSnapshotsByKey(localKey) : [],
    )

    if (saasMode()) {
      try {
        const { items } = await apiHistory(60)
        const serverSnapshots = items.map(snapshotFromServerItem)
        const snapshots = mergeSnapshots(localSnapshots, serverSnapshots)
        set({ snapshots })
        localSnapshots.forEach((snapshot) => {
          void persistSnapshotToServer(snapshot)
        })
        return
      } catch {
        // fall through to local cache
      }
    }
    set({ snapshots: localSnapshots })
  },

  restoreSnapshot: (snapshotId) => {
    return get().snapshots.find((s) => s.id === snapshotId)
  },

  loadMore: () => {
    // Placeholder for pagination
  },
}))
