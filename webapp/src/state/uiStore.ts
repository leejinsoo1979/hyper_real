import { create } from 'zustand'

export type SidebarItem = 'render' | 'nodes' | 'history' | 'account' | 'tutorial' | 'support' | 'settings'
export type InspectorTab = 'preview' | 'compare' | 'draw'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface SketchUpSceneInfo {
  name: string
  active: boolean
}

interface UIState {
  activeSidebarItem: SidebarItem
  activeTab: InspectorTab
  zoom: number
  pan: { x: number; y: number }
  promptText: string
  compareANodeId: string | null
  compareBNodeId: string | null
  sketchUpStatus: ConnectionStatus
  sketchUpScenes: SketchUpSceneInfo[]
  sketchUpViewport: { w: number; h: number } | null

  setActiveSidebarItem: (item: SidebarItem) => void
  setActiveTab: (tab: InspectorTab) => void
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
  setPromptText: (text: string) => void
  setCompareA: (nodeId: string | null) => void
  setCompareB: (nodeId: string | null) => void
  setSketchUpStatus: (status: ConnectionStatus) => void
  setSketchUpScenes: (scenes: SketchUpSceneInfo[]) => void
  setSketchUpViewport: (vp: { w: number; h: number } | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeSidebarItem: 'render',
  activeTab: 'preview',
  zoom: 1.0,
  pan: { x: 0, y: 0 },
  promptText: '',
  compareANodeId: null,
  compareBNodeId: null,
  sketchUpStatus: 'disconnected',
  sketchUpScenes: [],
  sketchUpViewport: null,

  setActiveSidebarItem: (item) => set({ activeSidebarItem: item }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (pan) => set({ pan }),
  setPromptText: (text) => set({ promptText: text }),
  setCompareA: (nodeId) => set({ compareANodeId: nodeId }),
  setCompareB: (nodeId) => set({ compareBNodeId: nodeId }),
  setSketchUpStatus: (status) => set({ sketchUpStatus: status }),
  setSketchUpScenes: (scenes) => set({ sketchUpScenes: scenes }),
  setSketchUpViewport: (vp) => set({ sketchUpViewport: vp }),
}))
