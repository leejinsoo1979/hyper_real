import { useCallback, useEffect, useMemo } from 'react'
import { LeftSidebar } from './sidebar/LeftSidebar'
import { NodeCanvas } from './canvas/NodeCanvas'
import { InspectorPanel } from './panels/InspectorPanel'
import { PromptBar } from './toolbar/PromptBar'
import { saasMode } from '../api/lumanovaApi'
import { MakeButton } from './toolbar/MakeButton'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { AccountPage, TutorialPage, SupportPage } from './pages/MiscPages'
import { RenderClassicPage } from './pages/RenderClassicPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { useGraphStore } from '../state/graphStore'
import { useExecutionStore } from '../state/executionStore'
import { useCreditStore } from '../state/creditStore'
import { useUIStore } from '../state/uiStore'
import type { ConnectionStatus } from '../state/uiStore'
import { useUndoStore } from '../state/undoStore'
import { executePipeline, estimatePipelineCost } from '../engine'
import { useMock } from '../engine/geminiClient'
import { startBridge, stopBridge } from '../api/sketchupBridge'

function statusColor(s: ConnectionStatus): string {
  switch (s) {
    case 'connected': return '#00c9a7'
    case 'connecting': return '#ffaa00'
    case 'disconnected': return '#666666'
  }
}

function statusLabel(s: ConnectionStatus): string {
  switch (s) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting...'
    case 'disconnected': return 'Offline'
  }
}

export function NodeEditor() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const nodes = useGraphStore((s) => s.nodes)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const executionError = useExecutionStore((s) => s.error)
  const balance = useCreditStore((s) => s.balance)
  const activeSidebarItem = useUIStore((s) => s.activeSidebarItem)
  const sketchUpStatus = useUIStore((s) => s.sketchUpStatus)
  const materialsOpen = useUIStore((s) => s.materialLibraryOpen)

  // Start/stop SketchUp bridge polling
  useEffect(() => {
    startBridge()
    return () => stopBridge()
  }, [])

  // Estimate cost for the selected node's pipeline
  const estimatedCost = useMemo(() => {
    if (!selectedNodeId) return 0
    return estimatePipelineCost(selectedNodeId)
  }, [selectedNodeId, nodes])

  const insufficientCredits = estimatedCost > balance
  const noNodeSelected = !selectedNodeId
  const makeDisabled = isRunning || noNodeSelected || insufficientCredits

  const handleMake = useCallback(async () => {
    if (!selectedNodeId || isRunning) return
    await executePipeline(selectedNodeId)
  }, [selectedNodeId, isRunning])

  // Undo / Redo keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const { nodes: curNodes, edges: curEdges, selectedNodeId: curSelected } = useGraphStore.getState()
        const entry = useUndoStore.getState().undo({
          nodes: structuredClone(curNodes),
          edges: structuredClone(curEdges),
          selectedNodeId: curSelected,
        })
        if (entry) {
          useGraphStore.setState({
            nodes: entry.nodes,
            edges: entry.edges,
            selectedNodeId: entry.selectedNodeId,
          })
        }
      }

      if ((e.key === 'z' && e.shiftKey) || (e.key === 'y' && !e.shiftKey)) {
        e.preventDefault()
        const { nodes: curNodes, edges: curEdges, selectedNodeId: curSelected } = useGraphStore.getState()
        const entry = useUndoStore.getState().redo({
          nodes: structuredClone(curNodes),
          edges: structuredClone(curEdges),
          selectedNodeId: curSelected,
        })
        if (entry) {
          useGraphStore.setState({
            nodes: entry.nodes,
            edges: entry.edges,
            selectedNodeId: entry.selectedNodeId,
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 사이드바 페이지 전환 ('render'만 에디터, 나머지는 전용 페이지)
  const sidebarPage = (() => {
    switch (activeSidebarItem) {
      case 'render': return <RenderClassicPage />
      case 'history': return <HistoryPage />
      case 'settings': return <SettingsPage />
      case 'account': return <AccountPage />
      case 'tutorial': return <TutorialPage />
      case 'support': return <SupportPage />
      default: return null
    }
  })()

  return (
    <div className="flex h-full w-full flex-col">
      {/* Title Bar */}
      <div
        className="flex shrink-0 items-center px-4"
        style={{
          height: 28,
          backgroundColor: '#0a0a14',
          borderBottom: '1px solid #222233',
        }}
      >
        <span style={{ color: '#888888', fontSize: 12 }}>
          Lumanova
        </span>
        <span style={{ color: '#444444', fontSize: 12, margin: '0 8px' }}>|</span>
        <span style={{ color: '#888888', fontSize: 12 }}>
          SketchUp:{' '}
          <span style={{ color: statusColor(sketchUpStatus) }}>
            {statusLabel(sketchUpStatus)}
          </span>
        </span>
        {/* MOCK 배너는 개발자 모드 전용. SaaS 모드는 서버 키로 렌더하므로 해당 없음 */}
        {!saasMode() && useMock() && (
          <span
            className="ml-3 rounded px-2 py-0.5"
            style={{ backgroundColor: '#ffaa0022', color: '#ffaa00', fontSize: 11 }}
          >
            MOCK 모드 — Settings에서 API Key를 입력하면 실제 렌더링됩니다
          </span>
        )}
      </div>

      {/* Main Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <LeftSidebar />
        <MaterialsPage open={materialsOpen} />

        {/* Center + Right */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {sidebarPage ? (
            sidebarPage
          ) : (
            <>
              {/* Canvas + Inspector */}
              <div className="flex flex-1 overflow-hidden">
                <NodeCanvas />
                <InspectorPanel />
              </div>

              {/* Bottom Prompt Bar */}
              <div
                className="relative flex shrink-0 items-center"
                style={{
                  height: 64,
                  background: 'transparent',
                  padding: '0 24px 12px',
                  gap: 12,
                  justifyContent: 'center',
                }}
              >
                <PromptBar />
                <MakeButton
                  credits={estimatedCost}
                  disabled={makeDisabled}
                  isRunning={isRunning}
                  onClick={handleMake}
                />

                {/* Execution error display */}
                {executionError && (
                  <div
                    className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md px-3 py-1.5 text-xs"
                    style={{
                      backgroundColor: '#ff444433',
                      color: '#ff4444',
                      border: '1px solid #ff4444',
                    }}
                  >
                    {executionError}
                  </div>
                )}

                {/* Progress bar during execution */}
                {isRunning && (
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 2 }}
                  >
                    <div
                      className="h-full animate-pulse"
                      style={{
                        background: 'linear-gradient(90deg, #ff4466, #ff6688)',
                        width: '100%',
                      }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
