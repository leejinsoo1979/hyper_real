import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type OnConnect,
  type OnConnectStart,
  type OnNodesChange,
  type OnEdgesChange,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type NodeTypes,
  type XYPosition,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FolderOpen, Hand, ImageIcon, MousePointer2 } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { SourceNode } from '../nodes/SourceNode'
import { RenderNode } from '../nodes/RenderNode'
import { ModifierNode } from '../nodes/ModifierNode'
import { UpscaleNode } from '../nodes/UpscaleNode'
import { VideoNode } from '../nodes/VideoNode'
import { CompareNode } from '../nodes/CompareNode'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { MediaPreviewModal, type MediaPreviewState } from '../panels/MediaPreviewModal'
import { useGraphStore } from '../../state/graphStore'
import { useUIStore } from '../../state/uiStore'
import { executePipeline } from '../../engine'
import { useExecutionStore } from '../../state/executionStore'
import type { NodeType } from '../../types/node'
import type { EdgeData } from '../../types/graph'

const nodeTypes: NodeTypes = {
  SOURCE: SourceNode,
  RENDER: RenderNode,
  MODIFIER: ModifierNode,
  UPSCALE: UpscaleNode,
  VIDEO: VideoNode,
  COMPARE: CompareNode,
}

type EdgeVisualState = 'idle' | 'ready' | 'active' | 'complete' | 'error'

function AnimatedPipelineEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const state = ((data as { state?: EdgeVisualState } | undefined)?.state ?? 'idle') as EdgeVisualState
  const isActive = state === 'active'
  const isReady = state === 'ready'
  const isComplete = state === 'complete'
  const isError = state === 'error'
  const baseStroke = isError ? '#ff5a65' : isActive ? '#00f0c8' : isReady ? '#00c9a7' : isComplete ? '#4d8c82' : '#454550'
  const baseWidth = isActive ? 2.35 : selected ? 2.15 : 1.65

  return (
    <g className={`lumanova-edge lumanova-edge--${state}${selected ? ' lumanova-edge--selected' : ''}`}>
      {(isActive || isReady) && (
        <path
          d={edgePath}
          fill="none"
          stroke={isActive ? '#00f0c8' : '#00c9a7'}
          strokeWidth={isActive ? 12 : 8}
          strokeLinecap="round"
          className="lumanova-edge__halo"
        />
      )}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: baseStroke,
          strokeWidth: baseWidth,
          strokeLinecap: 'round',
          filter: isError ? 'drop-shadow(0 0 7px rgba(255,90,101,.35))' : undefined,
        }}
      />
      {isActive && (
        <>
          <path
            d={edgePath}
            fill="none"
            stroke="#9affef"
            strokeWidth={2.7}
            strokeLinecap="round"
            strokeDasharray="12 18"
            className="lumanova-edge__flow"
          />
          <path
            d={edgePath}
            fill="none"
            stroke="#ffffff"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray="1 96"
            className="lumanova-edge__spark"
          />
        </>
      )}
      {isComplete && (
        <path
          d={edgePath}
          fill="none"
          stroke="#00c9a7"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeDasharray="2 10"
          className="lumanova-edge__complete"
        />
      )}
    </g>
  )
}

const edgeTypes: EdgeTypes = {
  lumanova: AnimatedPipelineEdge,
}

interface DropMenuState {
  visible: boolean
  position: XYPosition
  screenPosition: { x: number; y: number }
  sourceNodeId: string
  sourcePortName: string
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  items: MenuItem[]
}

const RENDER_MODE_OPTIONS: { type: NodeType; label: string }[] = [
  { type: 'RENDER', label: '1. Main renderer' },
  { type: 'MODIFIER', label: '2. Details editor' },
  { type: 'UPSCALE', label: '3. Creative upscaler' },
  { type: 'VIDEO', label: '4. Image to video' },
  { type: 'COMPARE', label: 'Compare' },
]

// ── DAG-based auto layout ──

function rearrangeNodes(
  nodeIds: string[],
  edgeList: EdgeData[],
  updatePosition: (id: string, pos: { x: number; y: number }) => void,
) {
  if (nodeIds.length === 0) return

  const nodeSet = new Set(nodeIds)
  const relevantEdges = edgeList.filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to))

  // Compute in-degree
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of nodeIds) {
    inDegree.set(id, 0)
    adj.set(id, [])
  }
  for (const edge of relevantEdges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
    adj.get(edge.from)!.push(edge.to)
  }

  // Kahn's algorithm → levels
  const levels: string[][] = []
  let queue = nodeIds.filter((id) => inDegree.get(id) === 0)

  while (queue.length > 0) {
    levels.push([...queue])
    const next: string[] = []
    for (const id of queue) {
      for (const neighborId of adj.get(id)!) {
        const newDeg = inDegree.get(neighborId)! - 1
        inDegree.set(neighborId, newDeg)
        if (newDeg === 0) next.push(neighborId)
      }
    }
    queue = next
  }

  // Assign positions: Source on left, horizontal 250px, vertical 150px
  const H_GAP = 250
  const V_GAP = 150

  for (let col = 0; col < levels.length; col++) {
    const level = levels[col]
    // Sort by out-degree descending (hub nodes top)
    level.sort((a, b) => (adj.get(b)?.length ?? 0) - (adj.get(a)?.length ?? 0))

    const totalHeight = (level.length - 1) * V_GAP
    const startY = -totalHeight / 2

    for (let row = 0; row < level.length; row++) {
      updatePosition(level[row], { x: col * H_GAP, y: startY + row * V_GAP })
    }
  }
}

function NodeCanvasInner() {
  const reactFlowInstance = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contextFileInputRef = useRef<HTMLInputElement>(null)
  const connectingRef = useRef<{ nodeId: string; handleId: string } | null>(null)

  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const isExecuting = useExecutionStore((s) => s.isRunning)
  const currentNodeId = useExecutionStore((s) => s.currentNodeId)
  const executionQueue = useExecutionStore((s) => s.queue)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const selectNode = useGraphStore((s) => s.selectNode)
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition)
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds)
  const setSelectedNodes = useGraphStore((s) => s.setSelectedNodes)
  const addEdge = useGraphStore((s) => s.addEdge)
  const createSourceNode = useGraphStore((s) => s.createSourceNode)
  const createNode = useGraphStore((s) => s.createNode)
  const removeNode = useGraphStore((s) => s.removeNode)
  const removeEdge = useGraphStore((s) => s.removeEdge)
  const duplicateNode = useGraphStore((s) => s.duplicateNode)
  const clearAll = useGraphStore((s) => s.clearAll)
  const setCompareA = useUIStore((s) => s.setCompareA)
  const setCompareB = useUIStore((s) => s.setCompareB)

  const [dropMenu, setDropMenu] = useState<DropMenuState>({
    visible: false,
    position: { x: 0, y: 0 },
    screenPosition: { x: 0, y: 0 },
    sourceNodeId: '',
    sourcePortName: '',
  })

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    items: [],
  })

  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState>(null)

  // 캔버스 툴: select = 드래그로 박스(마퀴) 다중 선택 / pan = 드래그로 화면 이동
  const [canvasTool, setCanvasTool] = useState<'select' | 'pan'>('select')

  // Convert graphStore nodes to React Flow nodes
  const rfNodes: RFNode[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        selected: n.id === selectedNodeId || selectedNodeIds.includes(n.id),
        data: {
          status: n.status,
          params: n.params,
          resultImage: n.result?.image ?? null,
          resultVideo: n.result?.video ?? null,
          error: n.result?.error ?? null,
          onOpenPreview: () => {
            if (n.result?.video && n.result.video !== 'mock-video-url') {
              setMediaPreview({
                kind: 'video',
                src: n.result.video,
                poster: n.result.image ?? null,
                title: 'Image to video',
              })
              return
            }
            const image =
              n.result?.image ??
              (n.type === 'SOURCE' && 'image' in n.params ? n.params.image : null)
            if (image) {
              setMediaPreview({
                kind: 'image',
                src: image,
                title: n.type === 'SOURCE' ? 'Source' : n.type,
              })
            }
          },
        },
      })),
    [nodes, selectedNodeId],
  )

  // Convert graphStore edges to React Flow edges
  const rfEdges: RFEdge[] = useMemo(
    () => {
      const nodeStatus = new Map(nodes.map((n) => [n.id, n.status]))
      const queued = new Set(executionQueue)

      return edges.map((e) => {
        const fromStatus = nodeStatus.get(e.from)
        const toStatus = nodeStatus.get(e.to)
        let state: EdgeVisualState = 'idle'

        if (fromStatus === 'error' || toStatus === 'error' || toStatus === 'blocked') {
          state = 'error'
        } else if (isExecuting && (currentNodeId === e.to || toStatus === 'running')) {
          state = 'active'
        } else if (isExecuting && queued.has(e.to)) {
          state = 'ready'
        } else if (fromStatus === 'done' && toStatus === 'done') {
          state = 'complete'
        }

        return {
          id: e.id,
          type: 'lumanova',
          source: e.from,
          sourceHandle: e.fromPort,
          target: e.to,
          targetHandle: e.toPort,
          animated: false,
          data: { state },
        }
      })
    },
    [edges, nodes, isExecuting, currentNodeId, executionQueue],
  )

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // 마퀴/Shift 선택: React Flow가 보내는 select 변경을 스토어에 반영
      const selectChanges = changes.filter((c) => c.type === 'select')
      if (selectChanges.length > 0) {
        const next = new Set(useGraphStore.getState().selectedNodeIds)
        for (const change of selectChanges) {
          if (change.selected) next.add(change.id)
          else next.delete(change.id)
        }
        setSelectedNodes([...next])
      }
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.id) {
          updateNodePosition(change.id, change.position)
        }
        if (change.type === 'remove' && change.id) {
          removeNode(change.id)
        }
      }
      void applyNodeChanges(changes, rfNodes)
    },
    [updateNodePosition, removeNode, setSelectedNodes, rfNodes],
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === 'remove' && change.id) {
          removeEdge(change.id)
        }
      }
      void applyEdgeChanges(changes, rfEdges)
    },
    [removeEdge, rfEdges],
  )

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      addEdge({
        id: uuid(),
        from: connection.source,
        fromPort: connection.sourceHandle ?? 'image',
        to: connection.target,
        toPort: connection.targetHandle ?? 'image',
      })
    },
    [addEdge],
  )

  const onConnectStart: OnConnectStart = useCallback(
    (_event, params) => {
      if (params.nodeId && params.handleType === 'source') {
        connectingRef.current = {
          nodeId: params.nodeId,
          handleId: params.handleId ?? 'image',
        }
      }
    },
    [],
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const connecting = connectingRef.current
      connectingRef.current = null
      if (!connecting) return

      const targetIsPane = (event.target as HTMLElement)?.classList?.contains(
        'react-flow__pane',
      )
      if (!targetIsPane) return

      const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : event.clientX
      const clientY = 'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY

      const flowPosition = reactFlowInstance.screenToFlowPosition({
        x: clientX,
        y: clientY,
      })

      setDropMenu({
        visible: true,
        position: flowPosition,
        screenPosition: { x: clientX, y: clientY },
        sourceNodeId: connecting.nodeId,
        sourcePortName: connecting.handleId,
      })
    },
    [reactFlowInstance],
  )

  const handleDropMenuSelect = useCallback(
    (nodeType: NodeType) => {
      const newNodeId = createNode(nodeType, dropMenu.position)
      const targetPort = nodeType === 'COMPARE' ? 'imageA' : 'image'
      addEdge({
        id: uuid(),
        from: dropMenu.sourceNodeId,
        fromPort: dropMenu.sourcePortName,
        to: newNodeId,
        toPort: targetPort,
      })
      setDropMenu((s) => ({ ...s, visible: false }))
    },
    [createNode, addEdge, dropMenu],
  )

  const handleDropMenuClose = useCallback(() => {
    setDropMenu((s) => ({ ...s, visible: false }))
  }, [])

  // ── Context menus ──

  const closeContextMenu = useCallback(() => {
    setContextMenu((s) => ({ ...s, visible: false }))
  }, [])

  // Node right-click
  // 우클릭 위치에 노드 생성 (선택된 노드가 있으면 그 출력에 자동 연결)
  const addNodeAt = useCallback(
    (nodeType: NodeType, screenX: number, screenY: number) => {
      const position = reactFlowInstance.screenToFlowPosition({ x: screenX, y: screenY })
      const { selectedNodeId: fromId, nodes: curNodes } = useGraphStore.getState()
      const newNodeId = createNode(nodeType, position)
      const fromNode = fromId ? curNodes.find((n) => n.id === fromId) : null
      const fromHasOutput = fromNode && fromNode.type !== 'COMPARE'
      if (fromId && fromHasOutput) {
        addEdge({
          id: uuid(),
          from: fromId,
          fromPort: 'image',
          to: newNodeId,
          toPort: nodeType === 'COMPARE' ? 'imageA' : 'image',
        })
      }
      selectNode(newNodeId)
    },
    [reactFlowInstance, createNode, addEdge, selectNode],
  )

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, node: RFNode) => {
      event.preventDefault()
      selectNode(node.id)

      const items: MenuItem[] = [
        ...RENDER_MODE_OPTIONS.map((opt) => ({
          label: `+ ${opt.label}`,
          action: () => {
            selectNode(node.id)
            addNodeAt(opt.type, event.clientX + 240, event.clientY)
          },
        })),
        {
          label: 'Make',
          action: () => { executePipeline(node.id) },
        },
        {
          label: 'Duplicate',
          action: () => { duplicateNode(node.id) },
        },
        {
          label: 'Delete',
          action: () => { removeNode(node.id) },
          danger: true,
        },
        {
          label: 'Compare A',
          action: () => { setCompareA(node.id) },
        },
        {
          label: 'Compare B',
          action: () => { setCompareB(node.id) },
        },
      ]

      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        items,
      })
    },
    [selectNode, duplicateNode, removeNode, setCompareA, setCompareB, addNodeAt],
  )

  // Canvas right-click (empty area)
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()

      const cx = event.clientX
      const cy = event.clientY
      const items: MenuItem[] = [
        ...RENDER_MODE_OPTIONS.map((opt) => ({
          label: `+ ${opt.label}`,
          action: () => { addNodeAt(opt.type, cx, cy) },
        })),
        {
          label: 'Load image...',
          action: () => { contextFileInputRef.current?.click() },
        },
        {
          label: 'Clear all',
          action: () => { clearAll() },
          danger: true,
        },
        {
          label: 'Rearrange nodes',
          action: () => {
            const currentNodes = useGraphStore.getState().nodes
            const currentEdges = useGraphStore.getState().edges
            rearrangeNodes(
              currentNodes.map((n) => n.id),
              currentEdges,
              updateNodePosition,
            )
            // Fit view after rearrange
            setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50)
          },
        },
      ]

      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        items,
      })
    },
    [clearAll, updateNodePosition, reactFlowInstance, addNodeAt],
  )

  // Node selection (Shift 클릭은 React Flow의 다중 선택에 맡긴다)
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: RFNode) => {
      if (event.shiftKey) return
      selectNode(node.id)
    },
    [selectNode],
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    setDropMenu((s) => ({ ...s, visible: false }))
    setContextMenu((s) => ({ ...s, visible: false }))
  }, [selectNode])

  // Image drag and drop → Source node
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const files = event.dataTransfer.files
      if (files.length === 0) return

      const file = files[0]
      if (!file.type.startsWith('image/')) return

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        createSourceNode(base64, 'upload', position)
      }
      reader.readAsDataURL(file)
    },
    [reactFlowInstance, createSourceNode],
  )

  // Browse button file selection
  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file || !file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        const position = reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        })
        createSourceNode(base64, 'upload', position)
      }
      reader.readAsDataURL(file)
      event.target.value = ''
    },
    [reactFlowInstance, createSourceNode],
  )

  // Context menu "Load image..." file select
  const handleContextFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file || !file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        const position = reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        })
        createSourceNode(base64, 'upload', position)
      }
      reader.readAsDataURL(file)
      event.target.value = ''
    },
    [reactFlowInstance, createSourceNode],
  )

  // Paste handler for images
  const onPaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = event.clipboardData.items
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue

          const reader = new FileReader()
          reader.onload = () => {
            const base64 = reader.result as string
            const position = reactFlowInstance.screenToFlowPosition({
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            })
            createSourceNode(base64, 'paste', position)
          }
          reader.readAsDataURL(file)
          event.preventDefault()
          break
        }
      }
    },
    [reactFlowInstance, createSourceNode],
  )

  const isEmpty = nodes.length === 0

  return (
    <div
      ref={wrapperRef}
      className="relative flex-1"
      style={{ backgroundColor: '#111118' }}
      onPaste={onPaste}
      tabIndex={0}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ backgroundColor: '#0b0b0f' }}
        defaultEdgeOptions={{
          style: { stroke: '#3a3a44', strokeWidth: 1.5 },
        }}
        deleteKeyCode="Delete"
        // 선택 툴: 빈 캔버스 드래그 = 박스 선택 (팬은 휠클릭/우클릭 드래그)
        // 이동 툴: 드래그 = 팬
        panOnDrag={canvasTool === 'pan' ? true : [1, 2]}
        selectionOnDrag={canvasTool === 'select'}
        multiSelectionKeyCode="Shift"
        selectNodesOnDrag={false}
      >
        {/* 실물 Lumanova: 무광 검정 캔버스 (그리드 없음) */}
        <Background variant={BackgroundVariant.Dots} gap={9999} size={0.01} color="#0b0b0f" />
      </ReactFlow>

      {/* 실물 Lumanova: 캔버스 워터마크 */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
        style={{ zIndex: 0 }}
      >
        <span style={{ fontSize: 130, fontWeight: 800, color: 'rgba(255,255,255,0.025)', letterSpacing: 2 }}>
          Lumanova
        </span>
      </div>

      {/* 캔버스 툴바: 선택(마퀴) / 이동(팬) — 실물 VizMaker처럼 캔버스 우상단 세로 스택 */}
      {!isEmpty && (
        <div className="absolute flex flex-col items-end gap-2" style={{ right: 14, top: 14, zIndex: 20 }}>
          <div
            className="flex flex-col gap-1"
            style={{
              padding: 4, borderRadius: 10,
              background: '#16161e', border: '1px solid #26262f',
              boxShadow: '0 6px 18px rgba(0,0,0,.35)',
            }}
          >
            {([
              { key: 'select', icon: <MousePointer2 size={16} />, title: '선택 — 드래그로 여러 노드를 박스 선택 (Shift 클릭 추가)' },
              { key: 'pan', icon: <Hand size={16} />, title: '이동 — 드래그로 캔버스 이동' },
            ] as const).map((t) => (
              <button
                key={t.key}
                title={t.title}
                onClick={() => setCanvasTool(t.key)}
                className="flex items-center justify-center rounded-md"
                style={{
                  width: 34, height: 34,
                  background: canvasTool === t.key ? '#00c9a7' : 'transparent',
                  color: canvasTool === t.key ? '#06251f' : '#9a9aa6',
                }}
              >
                {t.icon}
              </button>
            ))}
          </div>
          {selectedNodeIds.length > 1 && (
            <span
              style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 11.5, whiteSpace: 'nowrap',
                background: '#122a28', color: '#35e5cf', border: '1px solid #1f5952',
              }}
            >
              {selectedNodeIds.length}개 선택됨
            </span>
          )}
        </div>
      )}

      {/* Empty state overlay */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col items-center" style={{ transform: 'translateY(-18px)' }}>
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 104,
                height: 104,
                border: '3px dashed rgba(170,170,178,.46)',
                borderRadius: 16,
                color: '#6f6f78',
              }}
            >
              <ImageIcon size={48} strokeWidth={1.7} />
            </div>
            <p className="mt-7" style={{ color: '#a1a1aa', fontSize: 28, lineHeight: 1.2, letterSpacing: 0 }}>
              Drag and drop an image to get started, or
            </p>
            <button
              className="mt-8 flex items-center justify-center gap-3 rounded-xl transition-colors duration-150"
              style={{
                minWidth: 222,
                height: 72,
                backgroundColor: '#00c9a7',
                color: '#ffffff',
                fontSize: 28,
                fontWeight: 500,
                boxShadow: '0 18px 38px rgba(0,201,167,.18)',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = '#00ddb8')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = '#00c9a7')
              }
              onClick={handleBrowse}
            >
              <FolderOpen size={30} strokeWidth={1.8} />
              Browse
            </button>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={contextFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleContextFileSelect}
      />

      {/* Render Mode dropdown when dragging port to empty canvas */}
      {dropMenu.visible && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={handleDropMenuClose}
          />
          <div
            className="absolute z-50 rounded-md py-1"
            style={{
              left: dropMenu.screenPosition.x - (wrapperRef.current?.getBoundingClientRect().left ?? 0),
              top: dropMenu.screenPosition.y - (wrapperRef.current?.getBoundingClientRect().top ?? 0),
              backgroundColor: '#1a1a2e',
              border: '1px solid #333344',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              minWidth: 180,
            }}
          >
            <div
              className="px-3 py-1.5"
              style={{ color: '#888888', fontSize: 11, borderBottom: '1px solid #333344' }}
            >
              Add node
            </div>
            {RENDER_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                className="block w-full px-3 py-2 text-left text-sm transition-colors duration-100"
                style={{ color: '#cccccc' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = '#2a2a3e')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
                onClick={() => handleDropMenuSelect(opt.type)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}

      {mediaPreview && (
        <MediaPreviewModal media={mediaPreview} onClose={() => setMediaPreview(null)} />
      )}
    </div>
  )
}

export function NodeCanvas() {
  return (
    <ReactFlowProvider>
      <NodeCanvasInner />
    </ReactFlowProvider>
  )
}
