import { useCallback, useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { v4 as uuid } from 'uuid'
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
import { useUIStore } from '../state/uiStore'
import type { ConnectionStatus } from '../state/uiStore'
import { useUndoStore } from '../state/undoStore'
import { executePipeline } from '../engine'
import { useMock } from '../engine/geminiClient'
import { startBridge, stopBridge, bridgeToolLabel } from '../api/sketchupBridge'
import { useAuthUser } from '../auth/firebase'
import { APP_VERSION, UPDATE_MANIFEST_URL, isNewerVersion, type UpdateManifest } from '../app/version'

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
  const bridgeTool = useUIStore((s) => s.bridgeTool)
  const setActiveSidebarItem = useUIStore((s) => s.setActiveSidebarItem)
  const user = useAuthUser()
  const toolLabel = bridgeTool ? bridgeToolLabel() : '3D 툴'

  const initial = (user?.displayName || user?.email || '·')[0]?.toUpperCase() ?? '·'
  const openLandingPage = () => {
    window.open('/', '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{ height: 48, padding: '0 18px', background: 'linear-gradient(180deg, #0e0e16, #0a0a12)', borderBottom: '1px solid #1c1c26' }}
    >
      {/* 좌: 로고 + 제품명 */}
      <button
        type="button"
        onClick={openLandingPage}
        className="flex items-center gap-2.5 rounded-md"
        style={{ padding: '4px 6px', marginLeft: -6, cursor: 'pointer' }}
        title="랜딩페이지 열기"
      >
        <img src="/landing/logo-circle.png" alt="" width={24} height={24} style={{ objectFit: 'contain' }} />
        <span style={{ color: '#f0f0f5', fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>Lumanova</span>
        {/* 연결 상태: 은은한 점 인디케이터 (텍스트 없이) */}
        <span
          title={sketchUpStatus === 'connected' ? `${toolLabel} 연결됨` : sketchUpStatus === 'connecting' ? '연결 중' : '3D 툴 연결 안 됨'}
          style={{ width: 7, height: 7, borderRadius: 999, background: statusColor(sketchUpStatus), marginLeft: 4, boxShadow: sketchUpStatus === 'connected' ? `0 0 6px ${statusColor(sketchUpStatus)}` : 'none' }}
        />
      </button>

      {/* 우: 프로필 (크레딧 배지는 개인 키 정책 동안 숨김 — 서비스 운영 시 복원) */}
      <div className="flex items-center gap-3">
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

function UpdateBanner() {
  const update = useUIStore((s) => s.desktopUpdate)
  const dismissedVersion = useUIStore((s) => s.desktopUpdateDismissedVersion)
  const dismissDesktopUpdate = useUIStore((s) => s.dismissDesktopUpdate)
  const setActiveSidebarItem = useUIStore((s) => s.setActiveSidebarItem)

  if (!update || dismissedVersion === update.version) return null

  const openUpdate = () => {
    if (update.downloadUrl) {
      window.open(update.downloadUrl, '_blank', 'noopener,noreferrer')
    } else {
      setActiveSidebarItem('settings')
    }
  }

  return (
    <div
      className="flex shrink-0 items-center justify-between gap-4"
      style={{
        minHeight: 38,
        padding: '7px 16px 7px 18px',
        background: 'linear-gradient(90deg, rgba(0,201,167,.16), rgba(34,34,46,.92))',
        borderBottom: '1px solid rgba(0,201,167,.28)',
      }}
    >
      <div className="min-w-0">
        <div style={{ color: '#e9fffb', fontSize: 12.5, fontWeight: 800 }}>
          Lumanova {update.version} 업데이트가 있습니다
        </div>
        <div className="truncate" style={{ color: '#91bdb7', fontSize: 11.5, marginTop: 1 }}>
          {update.title ?? '새 기능과 개선사항을 사용하려면 데스크톱 앱을 업데이트하세요.'}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={openUpdate}
          className="flex items-center gap-1.5 rounded-md"
          style={{ height: 28, padding: '0 12px', background: '#00c9a7', color: '#06251f', fontSize: 11.5, fontWeight: 800 }}
        >
          <Download size={13} />
          업데이트
        </button>
        <button
          type="button"
          title="닫기"
          onClick={() => dismissDesktopUpdate(update.version)}
          className="flex items-center justify-center rounded-md"
          style={{ width: 28, height: 28, color: '#8fc8bf', background: 'rgba(255,255,255,.04)' }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// 파이프라인 실행 경과 시간 (프롬프트 바 위 좌측)
function PipelineElapsed() {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const timer = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div
      className="absolute bottom-full left-8 mb-2 flex items-center gap-1.5 rounded-md px-2.5 py-1"
      style={{ background: 'rgba(13,13,20,0.9)', border: '1px solid #1f5952', color: '#7df0dd', fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
    >
      <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: '#00f0c8' }} />
      렌더링 중... {sec}초
    </div>
  )
}

export function NodeEditor() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const executionError = useExecutionStore((s) => s.error)
  const activeSidebarItem = useUIStore((s) => s.activeSidebarItem)
  const materialsOpen = useUIStore((s) => s.materialLibraryOpen)

  // Start/stop SketchUp bridge polling
  useEffect(() => {
    startBridge()
    return () => stopBridge()
  }, [])

  useEffect(() => {
    if (!window.vizmakerNative) return
    let cancelled = false

    fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest: UpdateManifest | null) => {
        if (cancelled || !manifest?.version) return
        useUIStore.getState().setDesktopUpdate(
          isNewerVersion(manifest.version, APP_VERSION) ? manifest : null,
        )
      })
      .catch(() => {
        if (!cancelled) useUIStore.getState().setDesktopUpdate(null)
      })

    return () => { cancelled = true }
  }, [])

  // 개인 키 정책: 크레딧 잔액으로 실행을 막지 않는다 (비용은 본인 API 계정으로 청구)
  const noNodeSelected = !selectedNodeId
  const makeDisabled = isRunning || noNodeSelected

  const handleMake = useCallback(async () => {
    if (isRunning) return

    // 그룹 소스 생성: 2개 이상 선택 시 선택 노드들을 전부 입력으로 하는
    // RENDER 노드를 만들어 실행한다 (왼쪽 노드가 기본 이미지, 나머지는 참조)
    const g = useGraphStore.getState()
    if (g.selectedNodeIds.length >= 2) {
      const selected = g.nodes
        .filter((n) => g.selectedNodeIds.includes(n.id) && n.type !== 'COMPARE')
        .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
      if (selected.length >= 2) {
        const maxX = Math.max(...selected.map((n) => n.position.x))
        const avgY = selected.reduce((sum, n) => sum + n.position.y, 0) / selected.length
        const newId = g.createNode('RENDER', { x: maxX + 340, y: avgY })
        const prompt = useUIStore.getState().promptText.trim()
        if (prompt) g.updateNodeParams(newId, { prompt })
        for (const n of selected) {
          g.addEdge({ id: uuid(), from: n.id, fromPort: 'image', to: newId, toPort: 'image' })
        }
        g.selectNode(newId)
        await executePipeline(newId)
        return
      }
    }

    if (!selectedNodeId) return
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
      <UpdateBanner />
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
                className="relative flex shrink-0 items-center justify-center"
                style={{
                  height: 86,
                  background: 'linear-gradient(180deg, rgba(11,11,15,0) 0%, rgba(13,13,20,.88) 38%, rgba(13,13,20,.98) 100%)',
                  padding: '14px 30px 18px',
                }}
              >
                <div
                  className="flex w-full items-center justify-center gap-3"
                  style={{ maxWidth: 1280 }}
                >
                  <PromptBar />
                  <MakeButton
                    disabled={makeDisabled}
                    isRunning={isRunning}
                    onClick={handleMake}
                  />
                </div>

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

                {isRunning && <PipelineElapsed />}

                {/* Progress bar during execution */}
                {isRunning && (
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 2 }}
                  >
                    <div
                      className="h-full animate-pulse"
                      style={{
                        background: 'linear-gradient(90deg, rgba(0,201,167,0), #00f0c8, rgba(0,201,167,0))',
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
