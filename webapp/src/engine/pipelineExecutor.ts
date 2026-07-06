import type { NodeData, NodeResult, RenderParams, ModifierParams, UpscaleParams, VideoParams, SourceParams } from '../types/node'
import type { EdgeData } from '../types/graph'
import { useGraphStore } from '../state/graphStore'
import { useExecutionStore } from '../state/executionStore'
import { useHistoryStore } from '../state/historyStore'
import { useCreditStore } from '../state/creditStore'
import { computeCacheKey } from './cacheManager'
import { renderMain } from './adapters/mainRenderer'
import { buildLightingDescription } from './autoPrompt'
import { modifyDetails } from './adapters/detailsEditor'
import { upscaleCreative } from './adapters/creativeUpscaler'
import { generateVideo } from './adapters/imageToVideo'

// ── Upstream subgraph extraction ──

export function resolveUpstream(
  nodeId: string,
  edges: EdgeData[],
): Set<string> {
  const result = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (result.has(current)) continue
    result.add(current)

    const incomingEdges = edges.filter((e) => e.to === current)
    for (const edge of incomingEdges) {
      queue.push(edge.from)
    }
  }

  return result
}

// ── Cycle detection (DFS) ──

export function detectCycle(
  nodeIds: Set<string>,
  edges: EdgeData[],
): boolean {
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(nodeId: string): boolean {
    visited.add(nodeId)
    inStack.add(nodeId)

    const outgoing = edges.filter((e) => e.from === nodeId && nodeIds.has(e.to))
    for (const edge of outgoing) {
      if (inStack.has(edge.to)) return true
      if (!visited.has(edge.to) && dfs(edge.to)) return true
    }

    inStack.delete(nodeId)
    return false
  }

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId) && dfs(nodeId)) return true
  }

  return false
}

// ── Topological sort (Kahn's algorithm, level-grouped) ──

export function topologicalSort(
  nodes: NodeData[],
  edges: EdgeData[],
): NodeData[][] {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const relevantEdges = edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
  )

  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adj.set(node.id, [])
  }

  for (const edge of relevantEdges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
    adj.get(edge.from)!.push(edge.to)
  }

  const levels: NodeData[][] = []
  let queue = nodes.filter((n) => inDegree.get(n.id) === 0)

  while (queue.length > 0) {
    levels.push([...queue])
    const next: NodeData[] = []

    for (const node of queue) {
      for (const neighborId of adj.get(node.id)!) {
        const newDeg = inDegree.get(neighborId)! - 1
        inDegree.set(neighborId, newDeg)
        if (newDeg === 0) {
          const neighborNode = nodes.find((n) => n.id === neighborId)
          if (neighborNode) next.push(neighborNode)
        }
      }
    }

    queue = next
  }

  return levels
}

// ── Error propagation ──

function markDescendantsBlocked(nodeId: string): void {
  const { edges } = useGraphStore.getState()
  const updateNodeStatus = useGraphStore.getState().updateNodeStatus
  const descendants = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    const outgoing = edges.filter((e) => e.from === current)
    for (const edge of outgoing) {
      if (!descendants.has(edge.to)) {
        descendants.add(edge.to)
        queue.push(edge.to)
        updateNodeStatus(edge.to, 'blocked')
      }
    }
  }
}

// ── Get input image from upstream node ──

function getInputImage(nodeId: string): string | null {
  const { nodes, edges } = useGraphStore.getState()
  const incomingEdge = edges.find((e) => e.to === nodeId && e.toPort === 'image')
  if (!incomingEdge) return null

  const inputNode = nodes.find((n) => n.id === incomingEdge.from)
  return inputNode?.result?.image ?? null
}

/** 모든 입력 이미지 (그룹 소스 생성 — 여러 노드가 연결된 경우). 첫 번째가 기본 이미지 */
function getInputImages(nodeId: string): string[] {
  const { nodes, edges } = useGraphStore.getState()
  return edges
    .filter((e) => e.to === nodeId && e.toPort === 'image')
    .map((e) => nodes.find((n) => n.id === e.from)?.result?.image)
    .filter((img): img is string => !!img)
}

// ── Execute single node ──

async function executeNode(node: NodeData): Promise<void> {
  const { updateNodeStatus, updateNodeResult } = useGraphStore.getState()
  const { nodes, edges } = useGraphStore.getState()
  const { setCurrentNodeId } = useExecutionStore.getState()
  const { deduct } = useCreditStore.getState()

  updateNodeStatus(node.id, 'running')
  setCurrentNodeId(node.id)

  try {
    let result: NodeResult

    switch (node.type) {
      case 'SOURCE': {
        const params = node.params as SourceParams
        result = {
          image: params.image,
          resolution: 'original',
          timestamp: new Date().toISOString(),
          cacheKey: '',
        }
        break
      }

      case 'RENDER': {
        const params = node.params as RenderParams
        // 그룹 소스 생성: 입력이 여러 개면 첫 번째가 기본, 나머지는 참조 이미지
        const inputImages = getInputImages(node.id)
        // 시간대/조명 설정을 프롬프트에 합성 (구 플러그인의 build_render_prompt 역할)
        const lighting = buildLightingDescription(
          params.timePreset ?? 'day',
          params.lightsOn ?? true,
        )
        result = await renderMain({
          engine: params.engine,
          image: inputImages[0] ?? '',
          extraImages: inputImages.length > 1 ? inputImages.slice(1) : undefined,
          prompt: `${params.prompt}\n\n[LIGHTING]\n${lighting}`,
          systemPrompt: '',
          negativePrompt: params.negativePrompt ?? '',
          seed: params.seed,
          resolution: params.resolution,
        })
        break
      }

      case 'MODIFIER': {
        const params = node.params as ModifierParams
        const inputImage = getInputImage(node.id)
        result = await modifyDetails({
          image: inputImage ?? '',
          prompt: params.prompt,
          systemPrompt: '',
          negativePrompt: '',
          mask: params.mask,
          maskLayers: params.maskLayers,
          materialReferences: params.materialReferences,
        })
        break
      }

      case 'UPSCALE': {
        const params = node.params as UpscaleParams
        const inputImage = getInputImage(node.id)
        result = await upscaleCreative({
          image: inputImage ?? '',
          scale: params.scale,
          optimizedFor: params.optimizedFor,
          creativity: params.creativity,
          detailStrength: params.detailStrength,
          similarity: params.similarity,
          promptStrength: params.promptStrength,
          prompt: params.prompt,
        })
        break
      }

      case 'VIDEO': {
        const params = node.params as VideoParams
        const inputImage = getInputImage(node.id)
        if (!inputImage) {
          throw new Error('Image to video requires an image input. Connect a rendered/source image to the VIDEO node.')
        }
        result = await generateVideo({
          engine: params.engine,
          image: inputImage,
          endFrame: params.endFrameImage,
          duration: params.duration,
          resolution: params.resolution ?? '1080p',
          prompt: params.prompt,
        })
        break
      }

      case 'COMPARE': {
        result = {
          timestamp: new Date().toISOString(),
          cacheKey: '',
        }
        break
      }
    }

    // Set cache key on result
    result.cacheKey = computeCacheKey(node, nodes, edges)
    updateNodeResult(node.id, result)
    updateNodeStatus(node.id, 'done')
    deduct(node.cost)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateNodeResult(node.id, {
      image: node.result?.image ?? getInputImage(node.id) ?? undefined,
      video: node.result?.video,
      error: message,
      timestamp: new Date().toISOString(),
      cacheKey: '',
    })
    useExecutionStore.getState().setError(message)
    updateNodeStatus(node.id, 'error')
    markDescendantsBlocked(node.id)
  }
}

// ── Main pipeline entry point ──

export async function executePipeline(selectedNodeId: string): Promise<void> {
  const { nodes, edges, updateNodeStatus } = useGraphStore.getState()
  const executionStore = useExecutionStore.getState()
  const creditStore = useCreditStore.getState()
  const historyStore = useHistoryStore.getState()

  // 1. Extract upstream subgraph
  const subgraphNodeIds = resolveUpstream(selectedNodeId, edges)
  const subgraphNodes = nodes.filter((n) => subgraphNodeIds.has(n.id))

  // 2. Cycle detection
  if (detectCycle(subgraphNodeIds, edges)) {
    executionStore.setError('Cyclic connection detected')
    return
  }

  // 3. Cache check — skip already-done nodes with matching cache
  for (const node of subgraphNodes) {
    const cacheKey = computeCacheKey(node, nodes, edges)
    if (node.result && node.result.cacheKey === cacheKey) {
      // No param change → skip (keep done)
    } else if (node.type !== 'SOURCE' || !node.result) {
      updateNodeStatus(node.id, 'idle')
    }
  }

  // 4. Filter pending nodes (need execution)
  const freshNodes = useGraphStore.getState().nodes
  const pendingNodes = freshNodes
    .filter((n) => subgraphNodeIds.has(n.id))
    .filter((n) => n.status !== 'done')

  // 5. Cost check
  const totalCost = pendingNodes.reduce((sum, n) => sum + n.cost, 0)
  if (creditStore.balance < totalCost) {
    executionStore.setError('Not enough credits')
    return
  }

  // 6. Enter execution state
  executionStore.setRunning(true)
  executionStore.setError(null)
  executionStore.setQueue(pendingNodes.map((n) => n.id))

  for (const node of pendingNodes) {
    updateNodeStatus(node.id, 'queued')
  }

  // 7. Topological sort and level-by-level execution
  const levels = topologicalSort(pendingNodes, edges)

  try {
    for (const level of levels) {
      await Promise.all(level.map((node) => executeNode(node)))
    }
  } finally {
    executionStore.setRunning(false)
    executionStore.setCurrentNodeId(null)
    executionStore.setQueue([])
  }

  // 8. Save history snapshot
  const finalState = useGraphStore.getState()
  historyStore.saveSnapshot(finalState.nodes, finalState.edges, totalCost, selectedNodeId)
}

// ── Estimate cost for Make button display ──

export function estimatePipelineCost(selectedNodeId: string): number {
  const { nodes, edges } = useGraphStore.getState()
  const subgraphIds = resolveUpstream(selectedNodeId, edges)
  const subgraphNodes = nodes.filter((n) => subgraphIds.has(n.id))

  return subgraphNodes
    .filter((n) => {
      if (n.status === 'done' && n.result) {
        const key = computeCacheKey(n, nodes, edges)
        return n.result.cacheKey !== key // param changed → needs re-execution
      }
      return true // not yet executed
    })
    .reduce((sum, n) => sum + n.cost, 0)
}
