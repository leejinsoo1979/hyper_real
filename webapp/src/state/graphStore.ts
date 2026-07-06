import { create } from 'zustand'
import type { NodeData, NodeType, NodeParams, NodeResult, NodeStatus, SceneMeta } from '../types/node'
import type { EdgeData } from '../types/graph'
import { v4 as uuid } from 'uuid'
import { useUndoStore } from './undoStore'

interface GraphState {
  nodes: NodeData[]
  edges: EdgeData[]
  selectedNodeId: string | null
  /** 마퀴/Shift 다중 선택. selectedNodeId는 항상 이 중 마지막(주 선택) */
  selectedNodeIds: string[]

  addNode: (node: NodeData) => void
  removeNode: (nodeId: string) => void
  updateNode: (nodeId: string, partial: Partial<NodeData>) => void
  updateNodeParams: (nodeId: string, params: Partial<NodeParams>) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void
  updateNodeResult: (nodeId: string, result: NodeResult | null) => void
  addEdge: (edge: EdgeData) => void
  removeEdge: (edgeId: string) => void
  selectNode: (nodeId: string | null) => void
  setSelectedNodes: (nodeIds: string[]) => void
  clearAll: () => void

  createSourceNode: (image: string, origin: 'upload' | 'paste' | 'sketchup' | 'blender' | 'rhino', position: { x: number; y: number }, meta?: { sceneMeta: SceneMeta; cameraLocked: boolean }) => string
  createNode: (type: NodeType, position: { x: number; y: number }) => string
  duplicateNode: (nodeId: string) => string | null
  getNode: (nodeId: string) => NodeData | undefined
  getSelectedNode: () => NodeData | undefined
  getUpstreamNodes: (nodeId: string) => NodeData[]
}

function getDefaultParams(type: NodeType): NodeParams {
  switch (type) {
    case 'SOURCE':
      return { origin: 'upload', image: '', cameraLocked: false, sceneMeta: null }
    case 'RENDER':
      return { engine: 'experimental-interior', prompt: 'Create photorealistic image', negativePrompt: '', presetId: null, seed: null, resolution: '1024', timePreset: 'day' as const, lightsOn: true }
    case 'MODIFIER':
      return { prompt: '', negativePrompt: '', presetId: null, mask: null, maskLayers: [] }
    case 'UPSCALE':
      return { scale: 2 as const, optimizedFor: 'standard' as const, creativity: 0, detailStrength: 0, similarity: 0, promptStrength: 0, prompt: 'Upscale' }
    case 'VIDEO':
      return {
        engine: 'grok' as const,
        duration: 5 as const,
        resolution: '1080p' as const,
        prompt: 'Generate a minimal premium camera drift. Keep the composition almost identical to the source image, adding only a very subtle stabilized motion, micro parallax, natural exposure breathing, and gentle lens realism. Preserve all geometry, subject identity, object placement, materials, lighting, and framing with maximum fidelity.',
        endFrameImage: null,
      }
    case 'COMPARE':
      return { mode: 'slider' as const }
  }
}

function getDefaultCost(type: NodeType): number {
  switch (type) {
    case 'SOURCE': return 0
    case 'RENDER': return 4
    case 'MODIFIER': return 1
    case 'UPSCALE': return 2
    case 'VIDEO': return 5
    case 'COMPARE': return 0
  }
}

function saveUndo() {
  const { nodes, edges, selectedNodeId } = useGraphStore.getState()
  useUndoStore.getState().pushUndo({
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    selectedNodeId,
  })
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedNodeIds: [],

  addNode: (node) => {
    saveUndo()
    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  removeNode: (nodeId) => {
    saveUndo()
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds.filter((id) => id !== nodeId),
    }))
  },

  updateNode: (nodeId, partial) => {
    saveUndo()
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...partial } : n)),
    }))
  },

  updateNodeParams: (nodeId, params) => {
    saveUndo()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, params: { ...n.params, ...params } as NodeParams } : n,
      ),
    }))
  },

  updateNodePosition: (nodeId, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    })),

  updateNodeStatus: (nodeId, status) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, status } : n)),
    })),

  updateNodeResult: (nodeId, result) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, result } : n)),
    })),

  addEdge: (edge) => {
    const s = get()
    const exists = s.edges.some(
      (e) => e.from === edge.from && e.fromPort === edge.fromPort && e.to === edge.to && e.toPort === edge.toPort,
    )
    if (exists) return
    saveUndo()
    set((prev) => ({ edges: [...prev.edges, edge] }))
  },

  removeEdge: (edgeId) => {
    saveUndo()
    set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) }))
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedNodeIds: nodeId ? [nodeId] : [] }),

  setSelectedNodes: (nodeIds) => set({
    selectedNodeIds: nodeIds,
    selectedNodeId: nodeIds.length > 0 ? nodeIds[nodeIds.length - 1] : null,
  }),

  clearAll: () => {
    saveUndo()
    set({ nodes: [], edges: [], selectedNodeId: null })
  },

  createSourceNode: (image, origin, position, meta) => {
    saveUndo()
    const id = uuid()
    const node: NodeData = {
      id,
      type: 'SOURCE',
      position,
      status: 'done',
      params: {
        origin,
        image,
        cameraLocked: meta?.cameraLocked ?? false,
        sceneMeta: meta?.sceneMeta ?? null,
      },
      result: { image, timestamp: new Date().toISOString(), cacheKey: '' },
      cost: 0,
      version: '1.0.0',
    }
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id }))
    return id
  },

  createNode: (type, position) => {
    saveUndo()
    const id = uuid()
    const node: NodeData = {
      id,
      type,
      position,
      status: 'idle',
      params: getDefaultParams(type),
      result: null,
      cost: getDefaultCost(type),
      version: '1.0.0',
    }
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id }))
    return id
  },

  duplicateNode: (nodeId) => {
    const source = get().nodes.find((n) => n.id === nodeId)
    if (!source) return null
    saveUndo()
    const id = uuid()
    const node: NodeData = {
      ...source,
      id,
      position: { x: source.position.x + 30, y: source.position.y + 30 },
      status: 'idle',
      result: null,
    }
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id }))
    return id
  },

  getNode: (nodeId) => get().nodes.find((n) => n.id === nodeId),

  getSelectedNode: () => {
    const { nodes, selectedNodeId } = get()
    return selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : undefined
  },

  getUpstreamNodes: (nodeId) => {
    const { nodes, edges } = get()
    const visited = new Set<string>()
    const queue = [nodeId]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      for (const edge of edges) {
        if (edge.to === current && !visited.has(edge.from)) {
          queue.push(edge.from)
        }
      }
    }
    return nodes.filter((n) => visited.has(n.id))
  },
}))

// 개발 모드 전용: E2E 테스트에서 스토어 조작용 (프로덕션 번들엔 미포함)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __graphStore?: typeof useGraphStore }).__graphStore = useGraphStore
}
