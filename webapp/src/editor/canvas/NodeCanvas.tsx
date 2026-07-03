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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FolderOpen, ImageIcon } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { SourceNode } from '../nodes/SourceNode'
import { RenderNode } from '../nodes/RenderNode'
import { ModifierNode } from '../nodes/ModifierNode'
import { UpscaleNode } from '../nodes/UpscaleNode'
import { VideoNode } from '../nodes/VideoNode'
import { CompareNode } from '../nodes/CompareNode'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { useGraphStore } from '../../state/graphStore'
import { useUIStore } from '../../state/uiStore'
import { executePipeline } from '../../engine'
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
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const selectNode = useGraphStore((s) => s.selectNode)
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition)
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

  // Convert graphStore nodes to React Flow nodes
  const rfNodes: RFNode[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        selected: n.id === selectedNodeId,
        data: {
          status: n.status,
          params: n.params,
          resultImage: n.result?.image ?? null,
        },
      })),
    [nodes, selectedNodeId],
  )

  // Convert graphStore edges to React Flow edges
  const rfEdges: RFEdge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.from,
        sourceHandle: e.fromPort,
        target: e.to,
        targetHandle: e.toPort,
        style: { stroke: '#555555', strokeWidth: 2 },
        animated: false,
      })),
    [edges],
  )

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
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
    [updateNodePosition, removeNode, rfNodes],
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

  // Node selection
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
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
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ backgroundColor: '#111118' }}
        defaultEdgeOptions={{
          style: { stroke: '#555555', strokeWidth: 2 },
        }}
        deleteKeyCode="Delete"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1a1a24"
        />
      </ReactFlow>

      {/* Empty state overlay */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col items-center gap-3">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 80,
                height: 80,
                border: '2px dashed #555555',
              }}
            >
              <ImageIcon size={32} style={{ color: '#555555' }} />
            </div>
            <p style={{ color: '#888888', fontSize: 14 }}>
              Drag and drop an image to get started, or
            </p>
            <button
              className="flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors duration-150"
              style={{
                backgroundColor: '#00c9a7',
                color: '#ffffff',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = '#00ddb8')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = '#00c9a7')
              }
              onClick={handleBrowse}
            >
              <FolderOpen size={14} />
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
