import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Download, RotateCcw, Search, ImageIcon, RefreshCw, Eye, ChevronsLeftRight, ArrowLeft, Copy, Play } from 'lucide-react'
import { useHistoryStore } from '../../state/historyStore'
import { useGraphStore } from '../../state/graphStore'
import { useClassicStore } from '../../state/classicStore'
import { useUIStore } from '../../state/uiStore'
import { useAuthUser } from '../../auth/firebase'
import type { GraphSnapshot } from '../../types/graph'

const HISTORY_PAGE_SIZE = 16

function formatTimeAgo(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'Just now'
  if (diffMin === 1) return '1 minute ago'
  if (diffMin < 60) return `${diffMin} minutes ago`

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour === 1) return '1 hour ago'
  if (diffHour < 24) return `${diffHour} hours ago`

  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return '1 day ago'
  return `${diffDay} days ago`
}

function downloadImage(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function getResultThumbnail(snapshot: GraphSnapshot): string | null {
  if (snapshot.videoLastFrame) return snapshot.videoLastFrame
  if (snapshot.targetNodeId) {
    const target = snapshot.graph.nodes.find((node) => node.id === snapshot.targetNodeId)
    if (target?.result?.image) return target.result.image
  }
  for (let i = snapshot.graph.nodes.length - 1; i >= 0; i--) {
    const node = snapshot.graph.nodes[i]
    if (node.type !== 'SOURCE' && node.result?.image) return node.result.image
  }
  return snapshot.thumbnails[0] ?? null
}

function getVideoFirstFrame(snapshot: GraphSnapshot): string | null {
  return snapshot.videoFirstFrame || null
}

function getSnapshotVideo(snapshot: GraphSnapshot): string | null {
  if (snapshot.targetNodeId) {
    const target = snapshot.graph.nodes.find((node) => node.id === snapshot.targetNodeId)
    if (target?.result?.video && target.result.video !== 'mock-video-url') return target.result.video
  }
  if (snapshot.videoUrl) return snapshot.videoUrl
  for (let i = snapshot.graph.nodes.length - 1; i >= 0; i--) {
    const video = snapshot.graph.nodes[i].result?.video
    if (video && video !== 'mock-video-url') return video
  }
  return null
}

function getSourceThumbnail(snapshot: GraphSnapshot): string | null {
  for (const node of snapshot.graph.nodes) {
    if (node.type === 'SOURCE' && node.result?.image) return node.result.image
  }
  return snapshot.thumbnails[1] ?? ((snapshot as GraphSnapshot & { sourceThumbnail?: string }).sourceThumbnail || null)
}

function getSnapshotPrompt(snapshot: GraphSnapshot): string {
  const savedPrompt = (snapshot as GraphSnapshot & { prompt?: string }).prompt
  if (savedPrompt) return savedPrompt
  for (let i = snapshot.graph.nodes.length - 1; i >= 0; i--) {
    const params = snapshot.graph.nodes[i].params
    if ('prompt' in params && typeof params.prompt === 'string' && params.prompt.trim()) return params.prompt
  }
  return ''
}

function getSnapshotEngine(snapshot: GraphSnapshot): string {
  const savedEngine = (snapshot as GraphSnapshot & { engine?: string }).engine
  if (savedEngine) return savedEngine
  for (let i = snapshot.graph.nodes.length - 1; i >= 0; i--) {
    const params = snapshot.graph.nodes[i].params
    if ('engine' in params && typeof params.engine === 'string') return params.engine
  }
  return 'main'
}

function HistoryLoadingScreen() {
  const previewCards = [
    { width: '68%', delay: '0ms' },
    { width: '52%', delay: '160ms' },
    { width: '76%', delay: '320ms' },
  ]

  return (
    <div
      className="relative flex flex-1 items-center justify-center overflow-hidden px-7 py-6"
      style={{
        background:
          'linear-gradient(180deg, #0f0f16 0%, #11111a 48%, #0f0f16 100%), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,.02) 1px, transparent 1px)',
        backgroundSize: 'auto, 42px 42px, 42px 42px',
      }}
    >
      <style>{`
        @keyframes history-ring-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes history-core-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(0,201,167,0), inset 0 0 18px rgba(255,255,255,.04); }
          50% { box-shadow: 0 0 28px rgba(0,201,167,.28), inset 0 0 24px rgba(0,201,167,.08); }
        }
        @keyframes history-scan {
          0% { transform: translateX(-120%); opacity: 0; }
          14% { opacity: 1; }
          72% { opacity: 1; }
          100% { transform: translateX(120%); opacity: 0; }
        }
        @keyframes history-card-rise {
          0%, 100% { transform: translateY(0); border-color: #242430; }
          50% { transform: translateY(-5px); border-color: rgba(0,201,167,.34); }
        }
        @keyframes history-line-fill {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes history-dot-glow {
          0%, 100% { background: #343442; box-shadow: none; }
          50% { background: #00c9a7; box-shadow: 0 0 16px rgba(0,201,167,.42); }
        }
      `}</style>

      <div
        className="w-full"
        style={{
          maxWidth: 900,
          borderRadius: 8,
          background: 'rgba(19,19,28,.74)',
          border: '1px solid #292938',
          boxShadow: '0 24px 80px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.04)',
          overflow: 'hidden',
        }}
      >
        <div className="grid" style={{ gridTemplateColumns: '280px minmax(0, 1fr)', minHeight: 392 }}>
          <div
            className="relative flex flex-col justify-between p-6"
            style={{
              background: 'linear-gradient(180deg, rgba(0,201,167,.10), rgba(255,255,255,.018))',
              borderRight: '1px solid #292938',
            }}
          >
            <div>
              <div
                className="relative flex items-center justify-center"
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 8,
                  background: '#101018',
                  border: '1px solid #2d2d3a',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="absolute"
                  style={{
                    width: 92,
                    height: 92,
                    background: 'conic-gradient(from 90deg, transparent, #00c9a7, transparent, #ff7aa8, transparent)',
                    animation: 'history-ring-spin 1.8s linear infinite',
                  }}
                />
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 7,
                    background: '#12121b',
                    border: '1px solid rgba(255,255,255,.08)',
                    animation: 'history-core-pulse 2s ease-in-out infinite',
                  }}
                >
                  <Clock size={22} style={{ color: '#8ff7e6' }} />
                </div>
              </div>

              <div className="mt-5" style={{ color: '#ffffff', fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>
                Loading history
              </div>
              <div className="mt-2" style={{ color: '#9b9baa', fontSize: 12.5, lineHeight: 1.55 }}>
                Syncing saved renders, previews, prompts, and workflow snapshots.
              </div>
            </div>

            <div>
              {['Connect account', 'Fetch renders', 'Build previews'].map((label, index) => (
                <div key={label} className="mb-3 flex items-center gap-2.5">
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      animation: `history-dot-glow 1.8s ease-in-out infinite ${index * 180}ms`,
                    }}
                  />
                  <span style={{ color: '#c7c7d1', fontSize: 12, fontWeight: 650 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6">
            <div
              className="relative overflow-hidden rounded-md"
              style={{
                height: 8,
                background: '#1d1d29',
                border: '1px solid #2b2b39',
              }}
            >
              <div
                className="absolute inset-y-0"
                style={{
                  width: '48%',
                  background: 'linear-gradient(90deg, transparent, rgba(0,201,167,.82), rgba(255,122,168,.58), transparent)',
                  animation: 'history-line-fill 1.6s ease-in-out infinite',
                }}
              />
            </div>

            <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {previewCards.map((card, index) => (
                <div
                  key={index}
                  className="relative overflow-hidden"
                  style={{
                    borderRadius: 8,
                    background: '#171720',
                    border: '1px solid #242430',
                    animation: `history-card-rise 2s ease-in-out infinite ${card.delay}`,
                  }}
                >
                  <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3', background: '#101018' }}>
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          index === 0
                            ? 'linear-gradient(135deg, #20202d, #12352f 45%, #282032)'
                            : index === 1
                              ? 'linear-gradient(135deg, #1f2230, #2c2634 52%, #143730)'
                              : 'linear-gradient(135deg, #151923, #23312f 48%, #33202d)',
                      }}
                    />
                    <div
                      className="absolute inset-y-0"
                      style={{
                        width: '58%',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent)',
                        animation: `history-scan 1.9s ease-in-out infinite ${card.delay}`,
                      }}
                    />
                    <div className="absolute bottom-3 left-3 right-3">
                      <div style={{ width: card.width, height: 8, borderRadius: 4, background: 'rgba(255,255,255,.20)' }} />
                      <div className="mt-2" style={{ width: '44%', height: 6, borderRadius: 4, background: 'rgba(255,255,255,.12)' }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3" style={{ height: 42, borderTop: '1px solid #242430' }}>
                    <div style={{ width: 58, height: 8, borderRadius: 4, background: '#2a2a36' }} />
                    <div style={{ width: 36, height: 20, borderRadius: 6, background: '#242431' }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {['Restoring thumbnails', 'Checking cloud history'].map((label, index) => (
                <div
                  key={label}
                  className="relative overflow-hidden rounded-md px-4"
                  style={{
                    height: 54,
                    background: '#171720',
                    border: '1px solid #262635',
                  }}
                >
                  <div className="flex h-full items-center justify-between gap-3">
                    <span style={{ color: '#aaaab8', fontSize: 12, fontWeight: 650 }}>{label}</span>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: index === 0 ? '#00c9a7' : '#ff7aa8' }} />
                  </div>
                  <div
                    className="absolute inset-y-0"
                    style={{
                      width: '36%',
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent)',
                      animation: `history-scan 2.2s ease-in-out infinite ${index * 260}ms`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryCard({ snapshot, onOpen }: { snapshot: GraphSnapshot; onOpen: (snapshot: GraphSnapshot) => void }) {
  const [hovered, setHovered] = useState(false)

  const thumbnail = getResultThumbnail(snapshot)
  const video = getSnapshotVideo(snapshot)
  const videoFirstFrame = getVideoFirstFrame(snapshot)
  const sourceThumbnail = getSourceThumbnail(snapshot)
  const showSource = !video && hovered && !!sourceThumbnail && sourceThumbnail !== thumbnail
  const showVideoFirstFrame = !!video && hovered && !!videoFirstFrame && videoFirstFrame !== thumbnail

  return (
    <div
      className="group relative overflow-hidden"
      style={{
        backgroundColor: '#171720',
        border: '1px solid #242430',
        borderRadius: 8,
        width: '100%',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(snapshot)}
    >
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{ aspectRatio: '16 / 10', backgroundColor: '#0f0f16' }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt="History thumbnail"
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <ImageIcon size={22} style={{ color: '#444452' }} />
        )}

        {sourceThumbnail && sourceThumbnail !== thumbnail && (
          <img
            src={sourceThumbnail}
            alt="Source thumbnail"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ opacity: showSource ? 1 : 0, transition: 'opacity .25s ease' }}
            draggable={false}
          />
        )}

        {showVideoFirstFrame && (
          <img
            src={videoFirstFrame}
            alt="Video first frame"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ opacity: 1, transition: 'opacity .25s ease' }}
            draggable={false}
          />
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 52%, rgba(0,0,0,.42) 100%)',
          }}
        />

        {video && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 42,
                height: 42,
                background: 'rgba(0,0,0,.62)',
                border: '1px solid rgba(255,255,255,.20)',
                boxShadow: '0 12px 26px rgba(0,0,0,.42)',
                color: '#ffffff',
              }}
            >
              <Play size={18} fill="currentColor" />
            </div>
          </div>
        )}

        {video && (
          <span
            className="pointer-events-none absolute right-2 top-2 rounded-full px-2 py-0.5"
            style={{
              background: 'rgba(0,201,167,.18)',
              border: '1px solid rgba(0,201,167,.38)',
              color: '#7df0dc',
              fontSize: 9,
              fontWeight: 850,
              letterSpacing: 0.5,
            }}
          >
            VIDEO
          </span>
        )}

        {showSource && (
          <span
            className="pointer-events-none absolute left-2 top-2 rounded px-1.5 py-0.5"
            style={{
              background: 'rgba(5,5,9,.72)',
              border: '1px solid rgba(255,255,255,.14)',
              color: '#c9c9d4',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.6,
            }}
          >
            SOURCE
          </span>
        )}
      </div>

      <div
        className="flex items-center justify-between gap-2 px-3"
        style={{ borderTop: '1px solid #222233', height: 40 }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Clock size={11} style={{ color: '#777784', flexShrink: 0 }} />
          <span className="truncate" style={{ color: '#9a9aa6', fontSize: 11 }}>
            {formatTimeAgo(snapshot.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          <span style={{ color: '#5d5d68', fontSize: 10 }}>
            -{snapshot.creditUsed}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(snapshot) }}
            className="flex items-center gap-1 rounded-md px-2.5 transition-colors duration-150"
            style={{
              height: 24,
              backgroundColor: hovered ? 'rgba(0,201,167,.16)' : '#20202c',
              border: `1px solid ${hovered ? 'rgba(0,201,167,.55)' : '#2e2e3b'}`,
              color: hovered ? '#7df0dc' : '#b8b8c4',
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1,
            }}
            title="View"
          >
            <Eye size={12} />
            View
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryDetailView({ snapshot, onBack }: { snapshot: GraphSnapshot; onBack: () => void }) {
  const resultThumbnail = getResultThumbnail(snapshot)
  const video = getSnapshotVideo(snapshot)
  const sourceThumbnail = getSourceThumbnail(snapshot)
  const prompt = getSnapshotPrompt(snapshot)
  const engine = getSnapshotEngine(snapshot)
  const canRestore = snapshot.graph.nodes.length > 0
  const [activeTab, setActiveTab] = useState<'images' | 'compare'>('images')

  const handleUse = () => {
    if (!canRestore) return
    const { nodes, edges } = snapshot.graph
    const isClassic = nodes.some((n) => String(n.id).startsWith('classic-'))

    if (isClassic) {
      // 클래식 렌더 기록: 그래프에 옛 sketchup-origin 노드를 넣으면 라이브 소스로
      // 오인되므로(소스/결과 어긋남), classicStore에 일관된 쌍으로 복원한다
      const srcNode = nodes.find((n) => n.type === 'SOURCE')
      const renderNode = [...nodes].reverse().find((n) => n.type !== 'SOURCE' && n.result?.image)
      const prompt = renderNode && 'prompt' in renderNode.params ? String(renderNode.params.prompt ?? '') : ''
      const srcImage = srcNode?.result?.image ?? null
      useClassicStore.getState().set({
        frozenSource: srcImage,
        frozenFromBridge: false,
        mirror: false,
        resultImage: renderNode?.result?.image ?? null,
        renderSourceImage: srcImage,
        sourcePrompt: prompt,
        maskUri: null,
        maskMap: [],
        selectedColors: [],
        sourceSelectedColors: [],
        materialSwaps: [],
        regionMaterial: null,
        statusText: '히스토리 작업을 불러왔습니다 — Mirror를 켜면 실시간 뷰로 복귀합니다',
      })
      useUIStore.getState().setActiveSidebarItem('render')
      return
    }

    // 노드 에디터 스냅샷: 그래프 복원 후 노드 화면으로
    useGraphStore.setState({ nodes, edges, selectedNodeId: null })
    useUIStore.getState().setActiveSidebarItem('nodes')
  }

  const handleSave = () => {
    if (video) {
      window.open(video, '_blank', 'noopener,noreferrer')
      return
    }
    if (!resultThumbnail) return
    const ts = new Date(snapshot.timestamp).toISOString().slice(0, 19).replace(/:/g, '-')
    downloadImage(resultThumbnail, `lumanova-${ts}.png`)
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden" style={{ background: '#0f0f16' }}>
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-4 px-5" style={{ height: 56, borderBottom: '1px solid #222233' }}>
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="flex shrink-0 items-center justify-center rounded-md"
            style={{ width: 32, height: 32, background: '#181820', border: '1px solid #2a2a36', color: '#d9d9e2' }}
            title="Back to history"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="flex min-w-0 items-center gap-2" style={{ color: '#ffffff', fontSize: 19, fontWeight: 800 }}>
            <span className="truncate">History</span>
            <span style={{ color: '#777784' }}>›</span>
            <span className="truncate">Details</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canRestore && (
            <button
              onClick={handleUse}
              className="flex items-center gap-1.5 rounded-md"
              style={{ height: 32, padding: '0 12px', background: 'rgba(0,201,167,.12)', border: '1px solid rgba(0,201,167,.38)', color: '#37e7cb', fontSize: 12.5, fontWeight: 600 }}
              title="이 작업을 편집 화면으로 불러오기"
            >
              <RotateCcw size={14} />
              불러오기
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-md"
            style={{ height: 32, padding: '0 12px', background: '#1b1b24', border: '1px solid #30303b', color: '#d9d9e2', fontSize: 12.5, fontWeight: 600 }}
            title="결과 이미지를 PNG로 저장"
          >
            <Download size={14} />
            저장
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
        <div className="min-w-0">
          <div className="mb-4 flex justify-center">
            <div className="flex items-center rounded-full" style={{ background: '#15151d', border: '1px solid #292935', padding: 3 }}>
            <DetailTab active={activeTab === 'images'} onClick={() => setActiveTab('images')}>
              Images
            </DetailTab>
            <DetailTab active={activeTab === 'compare'} onClick={() => setActiveTab('compare')}>
              Compare
            </DetailTab>
            </div>
          </div>

          {video ? (
            <DetailVideoPanel video={video} poster={resultThumbnail} />
          ) : activeTab === 'compare' ? (
            <ImageComparisonSlider sourceImage={sourceThumbnail} resultImage={resultThumbnail} />
          ) : (
            <div className="grid min-w-0 gap-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <DetailImagePanel title="Source" image={sourceThumbnail} />
              <DetailImagePanel title="Generated result" image={resultThumbnail} />
            </div>
          )}
        </div>

        <div className="mt-4 rounded-md" style={{ background: '#191922', border: '1px solid #292935' }}>
          <div className="flex min-w-0 items-start justify-between gap-4 p-3">
            <div className="min-w-0">
              <div style={{ color: '#ffffff', fontSize: 12, fontWeight: 750 }}>Prompt</div>
              <div className="mt-1" style={{ color: prompt ? '#d6d6de' : '#6d6d78', fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                {prompt || 'No prompt metadata saved for this item.'}
              </div>
            </div>
            {prompt && (
              <button
                onClick={() => navigator.clipboard?.writeText(prompt)}
                className="flex items-center justify-center rounded-md"
                style={{ width: 30, height: 30, background: '#25252f', border: '1px solid #33333f', color: '#d8d8e0', flexShrink: 0 }}
                title="Copy prompt"
              >
                <Copy size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div style={{ color: '#ffffff', fontSize: 12, fontWeight: 750 }}>Workflow details</div>
          <div className="mt-2 grid rounded-md p-3" style={{ background: '#191922', border: '1px solid #292935', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <DetailRow label="Engine" value={engine} />
            <DetailRow label="Created at" value={new Date(snapshot.timestamp).toLocaleString()} />
            <DetailRow label="Credits" value={`-${snapshot.creditUsed}`} />
            <DetailRow label="Snapshot" value={snapshot.id.slice(0, 12)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-4"
      style={{
        minWidth: 86,
        height: 30,
        background: active ? '#f2f2f5' : 'transparent',
        border: '1px solid transparent',
        color: active ? '#111118' : '#8d8d98',
        fontSize: 11,
        fontWeight: 800,
        transition: 'background-color 140ms ease, color 140ms ease',
      }}
    >
      {children}
    </button>
  )
}

function ImageComparisonSlider({ sourceImage, resultImage }: { sourceImage: string | null; resultImage: string | null }) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [split, setSplit] = useState(50)

  const updateSplit = (clientX: number) => {
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const next = ((clientX - rect.left) / rect.width) * 100
    setSplit(Math.max(4, Math.min(96, next)))
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    updateSplit(event.clientX)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return
    updateSplit(event.clientX)
  }

  if (!sourceImage || !resultImage) {
    return (
      <div className="flex items-center justify-center rounded-md" style={{ height: 'clamp(520px, calc(100vh - 190px), 820px)', minHeight: 420, background: '#101018', border: '1px solid #2a2a36', color: '#6f6f7a', fontSize: 13 }}>
        Source and generated images are required for comparison.
      </div>
    )
  }

  return (
    <div
      ref={frameRef}
      className="relative overflow-hidden rounded-md"
      style={{ height: 'clamp(520px, calc(100vh - 190px), 820px)', minHeight: 420, width: '100%', background: '#0d0d13', border: '1px solid #2a2a36', cursor: 'ew-resize', userSelect: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <img src={resultImage} alt="Generated result" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      <img
        src={sourceImage}
        alt="Source"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        draggable={false}
      />

      <div className="absolute left-3 top-3 rounded-full px-3 py-1" style={{ background: 'rgba(10,10,14,.72)', border: '1px solid rgba(255,255,255,.12)', color: '#ffffff', fontSize: 11, fontWeight: 750 }}>
        Source
      </div>
      <div className="absolute right-3 top-3 rounded-full px-3 py-1" style={{ background: 'rgba(10,10,14,.72)', border: '1px solid rgba(255,255,255,.12)', color: '#ffffff', fontSize: 11, fontWeight: 750 }}>
        Result
      </div>

      <div
        className="absolute top-0 h-full"
        style={{ left: `${split}%`, width: 2, background: '#ffffff', boxShadow: '0 0 0 1px rgba(0,0,0,.22)' }}
      />
      <div
        className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
        style={{ left: `${split}%`, width: 34, height: 34, background: '#ffffff', border: '1px solid rgba(0,0,0,.18)', boxShadow: '0 8px 22px rgba(0,0,0,.35)', color: '#15151c' }}
      >
        <ChevronsLeftRight size={18} />
      </div>
    </div>
  )
}

function DetailImagePanel({ title, image }: { title: string; image: string | null }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md" style={{ background: '#191922', border: '1px solid #292935' }}>
      <div className="relative flex items-center justify-center" style={{ height: 'clamp(520px, calc(100vh - 190px), 820px)', minHeight: 420, background: '#0d0d13' }}>
        {image ? (
          <img src={image} alt={title} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <ImageIcon size={30} style={{ color: '#4f4f5a' }} />
        )}
        <div className="absolute left-3 top-3 rounded-full px-3 py-1" style={{ background: 'rgba(10,10,14,.72)', border: '1px solid rgba(255,255,255,.10)', color: '#ffffff', fontSize: 11, fontWeight: 750 }}>
          {title}
        </div>
      </div>
    </div>
  )
}

function DetailVideoPanel({ video, poster }: { video: string; poster: string | null }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md" style={{ background: '#050509', border: '1px solid #292935' }}>
      <div className="relative flex items-center justify-center" style={{ height: 'clamp(520px, calc(100vh - 190px), 820px)', minHeight: 420, background: '#050509' }}>
        <video
          src={video}
          poster={poster ?? undefined}
          controls
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', background: '#000' }}
        />
        <div className="absolute left-3 top-3 rounded-full px-3 py-1" style={{ background: 'rgba(10,10,14,.72)', border: '1px solid rgba(255,255,255,.10)', color: '#ffffff', fontSize: 11, fontWeight: 750 }}>
          Generated video
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div style={{ color: '#777784', fontSize: 10, fontWeight: 700 }}>{label}</div>
      <div className="mt-1 truncate" style={{ color: '#d8d8e0', fontSize: 12 }}>{value}</div>
    </div>
  )
}

export function HistoryPage() {
  const snapshots = useHistoryStore((s) => s.snapshots)
  const loadSnapshots = useHistoryStore((s) => s.loadSnapshots)
  const user = useAuthUser()
  const [query, setQuery] = useState('')
  const [mediaTab, setMediaTab] = useState<'image' | 'video'>('image')
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE)
  const [detailSnapshot, setDetailSnapshot] = useState<GraphSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setVisibleCount(HISTORY_PAGE_SIZE)
    void loadSnapshots().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [loadSnapshots, user?.uid])

  useEffect(() => {
    if (loading && snapshots.length > 0) setLoading(false)
  }, [loading, snapshots.length])

  // 검색어만 반영된 목록 (탭별 개수 표시용)
  const searchedSnapshots = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return snapshots
    return snapshots.filter((snapshot) => {
      const date = new Date(snapshot.timestamp).toLocaleString().toLowerCase()
      return snapshot.id.toLowerCase().includes(q) || date.includes(q)
    })
  }, [query, snapshots])

  const videoCount = useMemo(
    () => searchedSnapshots.filter((s) => getSnapshotVideo(s) !== null).length,
    [searchedSnapshots],
  )
  const imageCount = searchedSnapshots.length - videoCount

  const filteredSnapshots = useMemo(
    () => searchedSnapshots.filter((s) => (getSnapshotVideo(s) !== null) === (mediaTab === 'video')),
    [searchedSnapshots, mediaTab],
  )

  const visibleSnapshots = filteredSnapshots.slice(0, visibleCount)
  const hasMore = visibleCount < filteredSnapshots.length
  const refreshHistory = () => {
    setLoading(true)
    setVisibleCount(HISTORY_PAGE_SIZE)
    void loadSnapshots().finally(() => setLoading(false))
  }

  if (detailSnapshot) {
    return <HistoryDetailView snapshot={detailSnapshot} onBack={() => setDetailSnapshot(null)} />
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto" style={{ background: '#0f0f16' }}>
      <div
        className="flex shrink-0 items-center justify-between gap-4 px-7"
        style={{ height: 68, borderBottom: '1px solid #222233' }}
      >
        <div>
          <h1 style={{ color: '#ffffff', fontSize: 24, fontWeight: 750, lineHeight: 1.1 }}>
            History
          </h1>
          <div className="mt-1" style={{ color: '#777784', fontSize: 12 }}>
            {loading ? 'Loading history...' : `${filteredSnapshots.length} saved ${mediaTab === 'video' ? 'videos' : 'renders'}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-full px-3"
            style={{
              width: 260,
              height: 34,
              background: '#171720',
              border: '1px solid #2a2a36',
            }}
          >
            <Search size={13} color="#747481" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setVisibleCount(HISTORY_PAGE_SIZE) }}
              placeholder="Search history"
              className="min-w-0 flex-1 bg-transparent outline-none"
              style={{ color: '#d8d8e0', fontSize: 12 }}
            />
          </div>
          <button
            onClick={refreshHistory}
            className="flex items-center justify-center rounded-full"
            style={{ width: 34, height: 34, background: '#171720', border: '1px solid #2a2a36', color: '#8f8f9a' }}
            title="Refresh history"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 미디어 타입 탭: 이미지 / 영상 */}
      <div
        className="flex shrink-0 items-center gap-2 px-7"
        style={{ height: 50, borderBottom: '1px solid #222233' }}
      >
        {([
          { key: 'image', icon: <ImageIcon size={13} />, label: '이미지', count: imageCount },
          { key: 'video', icon: <Play size={12} fill="currentColor" />, label: '영상', count: videoCount },
        ] as const).map((t) => {
          const active = mediaTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => { setMediaTab(t.key); setVisibleCount(HISTORY_PAGE_SIZE) }}
              className="flex items-center gap-1.5 rounded-full transition-colors duration-150"
              style={{
                height: 32,
                padding: '0 16px',
                fontSize: 12.5,
                fontWeight: active ? 750 : 500,
                background: active ? 'rgba(0,201,167,.14)' : '#171720',
                border: `1px solid ${active ? 'rgba(0,201,167,.45)' : '#2a2a36'}`,
                color: active ? '#37e7cb' : '#8f8f9a',
              }}
            >
              {t.icon}
              {t.label}
              <span style={{ fontSize: 11, opacity: 0.75 }}>{loading ? '' : t.count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <HistoryLoadingScreen />
      ) : filteredSnapshots.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center px-7"
          style={{ color: '#6f6f7a' }}
        >
          <div
            className="flex w-full max-w-sm flex-col items-center rounded-lg px-8 py-7 text-center"
            style={{ background: '#15151d', border: '1px solid #252532', boxShadow: '0 18px 55px rgba(0,0,0,.22)' }}
          >
            <div className="flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: '#101018', border: '1px solid #2c2c39' }}>
              <ImageIcon size={22} />
            </div>
            <div className="mt-4" style={{ color: '#eeeeF5', fontSize: 14, fontWeight: 750 }}>
              {query.trim()
                ? (mediaTab === 'video' ? 'No matching videos' : 'No matching renders')
                : (mediaTab === 'video' ? 'No videos saved yet' : 'No renders saved yet')}
            </div>
            <div className="mt-1.5 max-w-xs" style={{ fontSize: 12, color: '#858592', lineHeight: 1.45 }}>
              {query.trim()
                ? 'Try another search term.'
                : mediaTab === 'video'
                  ? 'Image to video 노드로 생성한 영상이 여기에 표시됩니다.'
                  : 'Finished render results will appear here as thumbnails.'}
            </div>
            {!query.trim() && (
              <button
                onClick={() => useUIStore.getState().setActiveSidebarItem('render')}
                className="mt-5 rounded-md px-4"
                style={{ height: 34, background: '#00c9a7', color: '#061614', fontSize: 12, fontWeight: 800, boxShadow: '0 10px 26px rgba(0,201,167,.18)' }}
              >
                Go to Render
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 18,
              width: '100%',
              maxWidth: 1520,
              margin: '0 auto',
            }}
          >
            {visibleSnapshots.map((snapshot) => (
              <HistoryCard key={snapshot.id} snapshot={snapshot} onOpen={setDetailSnapshot} />
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setVisibleCount((c) => c + HISTORY_PAGE_SIZE)}
                className="rounded-md px-6 py-2 text-sm transition-colors duration-150"
                style={{
                  backgroundColor: '#333340',
                  color: '#cccccc',
                  borderRadius: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#444450')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#333340')}
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
