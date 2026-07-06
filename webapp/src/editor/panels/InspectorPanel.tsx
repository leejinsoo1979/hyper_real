import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Loader2, Maximize2, Play, X } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { ImageLightbox } from './ImageLightbox'
import { useUIStore, type InspectorTab } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { useExecutionStore } from '../../state/executionStore'
import { executePipeline } from '../../engine'
import { PreviewTab } from './PreviewTab'
import { CompareTab, getNodeInputImage } from './CompareTab'
import { DrawTab, type DrawTabHandle } from './DrawTab'
import { RenderSettings } from './RenderSettings'
import { SketchUpScenesPanel } from './SketchUpScenesPanel'
import { DccMaterialsPanel } from './DccMaterialsPanel'
import { PromptPresets } from './PromptPresets'

const tabs: { id: InspectorTab; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'compare', label: 'Compare' },
  { id: 'draw', label: 'Draw' },
]

export function InspectorPanel() {
  const activeTab = useUIStore((s) => s.activeTab)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const [enlarged, setEnlarged] = useState(false)

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const nodes = useGraphStore((s) => s.nodes)
  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  // Draw 전체화면: 드로잉+프롬프트 → Modifier 노드 자동 추가 후 2차 생성
  const isRunning = useExecutionStore((s) => s.isRunning)
  const drawApiRef = useRef<DrawTabHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [drawPrompt, setDrawPrompt] = useState('')

  const handleDrawGenerate = useCallback(() => {
    const prompt = drawPrompt.trim()
    if (!prompt || isRunning || !selectedNode) return
    const store = useGraphStore.getState()
    const mask = drawApiRef.current?.exportMaskData() ?? null
    const newId = store.createNode('MODIFIER', {
      x: selectedNode.position.x + 340,
      y: selectedNode.position.y,
    })
    useGraphStore.getState().addEdge({
      id: uuid(),
      from: selectedNode.id,
      fromPort: 'image',
      to: newId,
      toPort: 'image',
    })
    useGraphStore.getState().updateNodeParams(newId, { prompt, mask })
    useGraphStore.getState().selectNode(newId)
    setDrawPrompt('')
    setEnlarged(false)
    void executePipeline(newId)
  }, [drawPrompt, isRunning, selectedNode])

  return (
    <aside
      className="flex h-full flex-col overflow-y-auto overflow-x-hidden"
      style={{
        width: 400,
        minWidth: 400,
        backgroundColor: '#17171f',
        borderLeft: '1px solid #222233',
      }}
    >
      {/* Enlarge — 실물 VizMaker: 패널 전폭 중앙정렬 바 */}
      <button
        className="flex w-full items-center justify-center gap-2 transition-colors duration-150"
        style={{
          height: 42,
          flexShrink: 0,
          color: '#c9c9d4',
          fontSize: 13,
          fontWeight: 500,
          background: '#1d1d26',
          borderBottom: '1px solid #222233',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#242430'
          e.currentTarget.style.color = '#ffffff'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#1d1d26'
          e.currentTarget.style.color = '#c9c9d4'
        }}
        onClick={() => setEnlarged(true)}
      >
        <Maximize2 size={14} />
        Enlarge
      </button>

      {/* Tab Bar — 실물 VizMaker: 3등분 셀, 활성 셀은 밝은 배경 */}
      <div
        className="grid grid-cols-3"
        style={{ height: 42, flexShrink: 0, borderBottom: '1px solid #222233' }}
      >
        {tabs.map((tab, i) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center justify-center transition-colors duration-150"
              style={{
                fontSize: 13,
                color: isActive ? '#ffffff' : '#71717f',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? '#242430' : 'transparent',
                borderLeft: i > 0 ? '1px solid #222233' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = '#b8b8c4'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = '#71717f'
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{ borderBottom: '1px solid #222233' }}>
        {activeTab === 'preview' && (
          <PreviewTab selectedNode={selectedNode} />
        )}
        {activeTab === 'compare' && <CompareTab selectedNode={selectedNode} />}
        {activeTab === 'draw' && <DrawTab selectedNode={selectedNode} />}
      </div>

      {/* Render Settings Section */}
      <SketchUpScenesPanel selectedNode={selectedNode} />
      <DccMaterialsPanel />

      <RenderSettings selectedNode={selectedNode} />

      {enlarged && activeTab === 'draw' && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 200, backgroundColor: 'rgba(5, 5, 12, 0.95)' }}
        >
          <div
            className="flex shrink-0 items-center justify-between px-5"
            style={{ height: 52, background: '#15151e', borderBottom: '1px solid #2c2c38' }}
          >
            <div className="flex items-center gap-2" style={{ color: '#f2f2f5', fontSize: 13, fontWeight: 750 }}>
              <Maximize2 size={15} style={{ color: '#00c9a7' }} />
              Draw
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: '#1f1f2a', color: '#ffffff', border: '1px solid #30303d' }}
              onClick={() => setEnlarged(false)}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 p-5 pb-3">
            <div
              className="h-full overflow-hidden rounded-md"
              style={{
                background: '#111118',
                border: '1px solid #2c2c38',
                boxShadow: '0 24px 80px rgba(0,0,0,.42)',
              }}
            >
              <DrawTab selectedNode={selectedNode} variant="lightbox" apiRef={drawApiRef} />
            </div>
          </div>

          {/* 하단 프롬프트 바 — 드로잉+프롬프트로 2차 생성 (Modifier 노드 자동 추가) */}
          <div
            className="flex shrink-0 items-center gap-2.5"
            style={{ padding: '10px 20px 16px' }}
          >
            <button
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 44, height: 44, borderRadius: 10,
                background: '#1c1c25', border: '1px solid #2c2c38', color: '#a9a9b4',
              }}
              title="이미지 첨부 (캔버스에 참조 이미지 추가 · Ctrl+V 붙여넣기도 가능)"
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3d3d4b'; e.currentTarget.style.color = '#ffffff' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2c2c38'; e.currentTarget.style.color = '#a9a9b4' }}
            >
              <ImagePlus size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => drawApiRef.current?.addImage(reader.result as string)
                reader.readAsDataURL(file)
                e.target.value = ''
              }}
            />
            <input
              type="text"
              value={drawPrompt}
              onChange={(e) => setDrawPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDrawGenerate() }}
              placeholder="수정할 내용을 입력하세요 — 예: 표시한 부분의 소파를 가죽 소재로 바꿔줘"
              className="min-w-0 flex-1 rounded-xl px-4 outline-none"
              style={{
                height: 44, background: '#101018', border: '1px solid #2c2c38',
                color: '#fff', fontSize: 13.5,
              }}
            />
            <button
              onClick={handleDrawGenerate}
              disabled={!drawPrompt.trim() || isRunning}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl"
              style={{
                height: 44, padding: '0 26px', fontSize: 13.5, fontWeight: 800,
                background: !drawPrompt.trim() || isRunning
                  ? 'linear-gradient(180deg, #23232c, #1a1a22)'
                  : 'linear-gradient(180deg, #18e3c4, #00bfa2)',
                color: !drawPrompt.trim() || isRunning ? '#6d6d78' : '#031716',
                border: !drawPrompt.trim() || isRunning ? '1px solid #32323e' : '1px solid rgba(94,255,226,.45)',
                cursor: !drawPrompt.trim() || isRunning ? 'not-allowed' : 'pointer',
              }}
            >
              {isRunning ? <Loader2 size={15} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
              {isRunning ? 'Running' : 'Make'}
            </button>
          </div>
        </div>
      )}

      {enlarged && activeTab !== 'draw' && (() => {
        const img =
          selectedNode?.result?.image ??
          (selectedNode && 'image' in selectedNode.params
            ? (selectedNode.params as { image: string }).image
            : null)
        if (!img) return null
        // 전체화면에서 소스↔결과 비교: 선택 노드의 입력 이미지가 비교 기준
        const inputImage = getNodeInputImage(selectedNode, nodes, useGraphStore.getState().edges)
        return (
          <ImageLightbox
            image={img}
            compareImage={inputImage !== img ? inputImage : null}
            onClose={() => setEnlarged(false)}
          />
        )
      })()}

      {/* Prompt Presets Section */}
      <PromptPresets selectedNode={selectedNode} />
    </aside>
  )
}
