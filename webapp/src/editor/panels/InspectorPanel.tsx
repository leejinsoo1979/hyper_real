import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { ImageLightbox } from './ImageLightbox'
import { useUIStore, type InspectorTab } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { PreviewTab } from './PreviewTab'
import { CompareTab, getNodeInputImage } from './CompareTab'
import { DrawTab } from './DrawTab'
import { RenderSettings } from './RenderSettings'
import { SketchUpScenesPanel } from './SketchUpScenesPanel'
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

      <RenderSettings selectedNode={selectedNode} />

      {enlarged && (() => {
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
