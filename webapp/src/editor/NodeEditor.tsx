import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useAuthUser } from '../auth/firebase'
import { apiMe } from '../api/lumanovaApi'

function statusColor(s: ConnectionStatus): string {
  switch (s) {
    case 'connected': return '#00c9a7'
    case 'connecting': return '#ffaa00'
    case 'disconnected': return '#666666'
  }
}

// ── 앱 상단 헤더: 로고+제품명 · 크레딧 · 프로필 (SketchUp 연결 텍스트 제거) ──
function AppHeader() {
  const sketchUpStatus = useUIStore((s) => s.sketchUpStatus)
  const setActiveSidebarItem = useUIStore((s) => s.setActiveSidebarItem)
  const saas = saasMode()
  const user = useAuthUser()
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!saas || !user) return
    apiMe().then((m) => setBalance(m.balance)).catch(() => {})
  }, [saas, user])

  const initial = (user?.displayName || user?.email || '·')[0]?.toUpperCase() ?? '·'

  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{ height: 48, padding: '0 18px', background: 'linear-gradient(180deg, #0e0e16, #0a0a12)', borderBottom: '1px solid #1c1c26' }}
    >
      {/* 좌: 로고 + 제품명 */}
      <div className="flex items-center gap-2.5">
        <img src="/landing/logo-circle.png" alt="" width={24} height={24} style={{ objectFit: 'contain' }} />
        <span style={{ color: '#f0f0f5', fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>Lumanova</span>
        {/* 연결 상태: 은은한 점 인디케이터 (텍스트 없이) */}
        <span
          title={sketchUpStatus === 'connected' ? 'SketchUp 연결됨' : sketchUpStatus === 'connecting' ? '연결 중' : '연결 안 됨'}
          style={{ width: 7, height: 7, borderRadius: 999, background: statusColor(sketchUpStatus), marginLeft: 4, boxShadow: sketchUpStatus === 'connected' ? `0 0 6px ${statusColor(sketchUpStatus)}` : 'none' }}
        />
      </div>

      {/* 우: 크레딧 + 프로필 */}
      <div className="flex items-center gap-3">
        {saas && (
          <button
            onClick={() => setActiveSidebarItem('account')}
            className="flex items-center gap-1.5"
            style={{ height: 30, padding: '0 12px', borderRadius: 999, background: 'rgba(0,201,167,0.1)', border: '1px solid rgba(0,201,167,0.28)', color: '#37e7cb', fontSize: 12.5, fontWeight: 700 }}
          >
            <span style={{ fontSize: 13 }}>◈</span>
            {balance === null ? '—' : balance.toLocaleString()}
          </button>
        )}
        <button
          onClick={() => setActiveSidebarItem('account')}
          className="flex items-center justify-center overflow-hidden rounded-full"
          style={{ width: 30, height: 30, background: '#00c9a7', color: '#06251f', fontSize: 13, fontWeight: 800, flexShrink: 0 }}
          title="계정"
        >
          {user?.photoURL
            ? <img src={user.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            : initial}
        </button>
      </div>
    </div>
  )
}

export function NodeEditor() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const nodes = useGraphStore((s) => s.nodes)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const executionError = useExecutionStore((s) => s.error)
  const balance = useCreditStore((s) => s.balance)
  const activeSidebarItem = useUIStore((s) => s.activeSidebarItem)
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
      {/* App Header */}
      <AppHeader />
      {/* MOCK 배너 (개발자 모드 전용) */}
      {!saasMode() && useMock() && (
        <div className="flex shrink-0 items-center px-5" style={{ height: 26, background: '#ffaa0014', borderBottom: '1px solid #2a220f' }}>
          <span style={{ color: '#ffaa00', fontSize: 11 }}>
            MOCK 모드 — Settings에서 API Key를 입력하면 실제 렌더링됩니다
          </span>
        </div>
      )}

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
