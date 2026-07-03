import type { NodeData } from '../types/node'
import type { EdgeData } from '../types/graph'

/**
 * Simple string hash (djb2 algorithm).
 * Not cryptographic — sufficient for cache key comparison.
 */
function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

function sortedParams(params: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(params).sort()) {
    sorted[key] = params[key]
  }
  return sorted
}

function getInputImageHash(
  node: NodeData,
  allNodes: NodeData[],
  edges: EdgeData[],
): string {
  const incomingEdge = edges.find((e) => e.to === node.id)
  if (!incomingEdge) return 'root'

  const inputNode = allNodes.find((n) => n.id === incomingEdge.from)
  if (!inputNode?.result?.cacheKey) return 'pending'

  return inputNode.result.cacheKey
}

export function computeCacheKey(
  node: NodeData,
  allNodes: NodeData[],
  edges: EdgeData[],
): string {
  const inputHash = getInputImageHash(node, allNodes, edges)
  const payload = JSON.stringify({
    type: node.type,
    params: sortedParams(node.params as unknown as Record<string, unknown>),
    inputHash,
  })
  return hashString(payload)
}
