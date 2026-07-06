import type { NodeData } from './node'

export interface EdgeData {
  id: string
  from: string
  fromPort: string
  to: string
  toPort: string
}

export interface GraphMeta {
  createdAt: string
  updatedAt: string
  source: 'sketchup' | 'web' | 'api'
  appVersion: string
}

export interface GraphUI {
  zoom: number
  pan: { x: number; y: number }
}

export interface Graph {
  graphId: string
  nodes: NodeData[]
  edges: EdgeData[]
  meta: GraphMeta
  ui: GraphUI
}

export interface GraphSnapshot {
  id: string
  graph: Graph
  timestamp: string
  creditUsed: number
  thumbnails: string[]
  videoUrl?: string
  videoFirstFrame?: string
  videoLastFrame?: string
  targetNodeId?: string | null
}
