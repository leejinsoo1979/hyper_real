import { useEffect, useRef, useCallback, useState } from 'react'
import { X, Sparkles, Square } from 'lucide-react'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { useExecutionStore } from '../../state/executionStore'
import { generateAutoPrompt, getUpstreamImage } from '../../engine/autoPrompt'
import type { RenderParams } from '../../types/node'

export function PromptBar() {
  const promptText = useUIStore((s) => s.promptText)
  const setPromptText = useUIStore((s) => s.setPromptText)

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const nodes = useGraphStore((s) => s.nodes)
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams)

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  const hasPrompt =
    selectedNode !== null && 'prompt' in selectedNode.params

  const nodePrompt = hasPrompt
    ? (selectedNode!.params as { prompt: string }).prompt
    : null

  // Sync: node selection → fill prompt bar
  const prevNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedNodeId !== prevNodeIdRef.current) {
      prevNodeIdRef.current = selectedNodeId
      if (nodePrompt !== null) {
        setPromptText(nodePrompt)
      }
    }
  }, [selectedNodeId, nodePrompt, setPromptText])

  // Debounced node param update (avoid undo-stack flooding)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncToNode = useCallback(
    (value: string) => {
      if (!selectedNodeId || !hasPrompt) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateNodeParams(selectedNodeId, { prompt: value })
      }, 400)
    },
    [selectedNodeId, hasPrompt, updateNodeParams],
  )

  // Flush pending debounce on unmount or node change
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [selectedNodeId])

  const handleChange = (value: string) => {
    setPromptText(value)
    syncToNode(value)
  }

  const handleClear = () => {
    setPromptText('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (selectedNodeId && hasPrompt) {
      updateNodeParams(selectedNodeId, { prompt: '' })
    }
  }

  // ── Auto 프롬프트 (구 플러그인 핵심 기능 이식) ──
  const [autoLoading, setAutoLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const setExecError = useExecutionStore((s) => s.setError)

  const isRenderNode = selectedNode?.type === 'RENDER'
  const upstreamImage = isRenderNode && selectedNodeId ? getUpstreamImage(selectedNodeId) : null
  const autoEnabled = isRenderNode && !!upstreamImage

  const handleAuto = async () => {
    // 생성 중이면 취소
    if (autoLoading) {
      abortRef.current?.abort()
      return
    }
    if (!selectedNodeId || !upstreamImage) return

    const params = selectedNode!.params as RenderParams
    const controller = new AbortController()
    abortRef.current = controller
    setAutoLoading(true)
    setExecError(null)

    // 안전장치: 120초 안에 끝나지 않으면 강제 취소 (무한 로딩 방지)
    const watchdog = setTimeout(() => controller.abort(), 120_000)

    try {
      const result = await generateAutoPrompt({
        image: upstreamImage,
        style: params.prompt !== 'Create photorealistic image' ? params.prompt : '',
        timePreset: params.timePreset ?? 'day',
        lightsOn: params.lightsOn ?? true,
        signal: controller.signal,
      })
      setPromptText(result.prompt)
      updateNodeParams(selectedNodeId, {
        prompt: result.prompt,
        negativePrompt: result.negativePrompt,
      })
    } catch (err) {
      if (!controller.signal.aborted) {
        setExecError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      clearTimeout(watchdog)
      setAutoLoading(false)
      abortRef.current = null
    }
  }

  return (
    <div className="relative flex flex-1 items-center gap-2 px-3">
      {/* Auto 프롬프트 생성 (생성 중 클릭 = 취소) */}
      <button
        onClick={handleAuto}
        disabled={!autoEnabled && !autoLoading}
        title={
          autoLoading
            ? '생성 취소'
            : autoEnabled
              ? 'AI가 씬을 분석해 프롬프트와 네거티브를 자동 생성'
              : 'Render 노드를 선택하고 Source와 연결하세요'
        }
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 transition-colors"
        style={{
          backgroundColor: autoLoading ? '#ff4466' : autoEnabled ? '#7c5cff' : '#1a1a24',
          color: autoEnabled || autoLoading ? '#ffffff' : '#555566',
          fontSize: 13,
          fontWeight: 600,
          cursor: autoEnabled || autoLoading ? 'pointer' : 'not-allowed',
        }}
      >
        {autoLoading ? (
          <>
            <Square size={12} fill="currentColor" />
            Cancel
          </>
        ) : (
          <>
            <Sparkles size={14} />
            Auto
          </>
        )}
      </button>
      <input
        type="text"
        value={promptText}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter your image prompt here..."
        className="h-9 w-full rounded-md px-3 pr-8 text-sm outline-none"
        style={{
          backgroundColor: '#111118',
          border: '1px solid #333340',
          color: '#ffffff',
          fontSize: 14,
        }}
      />
      {promptText && (
        <button
          onClick={handleClear}
          className="absolute right-5 flex items-center justify-center transition-colors duration-150"
          style={{ color: '#666666' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#666666')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
