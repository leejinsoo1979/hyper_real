import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Download, RotateCcw, Search, ImageIcon, RefreshCw, Eye, ChevronsLeftRight, ArrowLeft, Copy } from 'lucide-react'
import { useHistoryStore } from '../../state/historyStore'
import { useGraphStore } from '../../state/graphStore'
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
  for (let i = snapshot.graph.nodes.length - 1; i >= 0; i--) {
    const node = snapshot.graph.nodes[i]
    if (node.type !== 'SOURCE' && node.result?.image) return node.result.image
  }
  return snapshot.thumbnails[0] ?? null
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

function HistorySkeletonGrid() {
  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div
        className="grid animate-pulse"
        style={{
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 18,
          width: '100%',
          maxWidth: 1520,
          margin: '0 auto',
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden"
            style={{
              backgroundColor: '#171720',
              border: '1px solid #242430',
              borderRadius: 8,
              width: '100%',
              opacity: 1 - i * 0.09,
            }}
          >
            <div style={{ aspectRatio: '16 / 10', backgroundColor: '#1d1d28' }} />
            <div
              className="flex items-center justify-between gap-2 px-3"
              style={{ borderTop: '1px solid #222233', height: 34 }}
            >
              <div style={{ width: 72, height: 8, borderRadius: 4, backgroundColor: '#242430' }} />
              <div style={{ width: 20, height: 8, borderRadius: 4, backgroundColor: '#242430' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryCard({ snapshot, onOpen }: { snapshot: GraphSnapshot; onOpen: (snapshot: GraphSnapshot) => void }) {
  const [hovered, setHovered] = useState(false)

  const thumbnail = getResultThumbnail(snapshot)
  const sourceThumbnail = getSourceThumbnail(snapshot)
  const showSource = hovered && !!sourceThumbnail && sourceThumbnail !== thumbnail

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

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 52%, rgba(0,0,0,.42) 100%)',
          }}
        />

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

      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(snapshot) }}
          className="absolute flex items-center justify-center gap-1.5 rounded-full px-3"
          style={{
            right: 8,
            bottom: 4,
            height: 26,
            backgroundColor: 'rgba(17,17,24,.94)',
            border: '1px solid rgba(0,201,167,.58)',
            color: '#eafffb',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.2,
          }}
          title="View"
        >
          <Eye size={13} />
          View
        </button>
      )}

      <div
        className="flex items-center justify-between gap-2 px-3"
        style={{ borderTop: '1px solid #222233' }}
      >
        <div className="flex min-w-0 items-center gap-1.5" style={{ height: 34 }}>
          <Clock size={11} style={{ color: '#777784', flexShrink: 0 }} />
          <span className="truncate" style={{ color: '#9a9aa6', fontSize: 11 }}>
            {formatTimeAgo(snapshot.timestamp)}
          </span>
        </div>
        <span style={{ color: '#5d5d68', fontSize: 10, flexShrink: 0 }}>
          -{snapshot.creditUsed}
        </span>
      </div>
    </div>
  )
}

function HistoryDetailView({ snapshot, onBack }: { snapshot: GraphSnapshot; onBack: () => void }) {
  const resultThumbnail = getResultThumbnail(snapshot)
  const sourceThumbnail = getSourceThumbnail(snapshot)
  const prompt = getSnapshotPrompt(snapshot)
  const engine = getSnapshotEngine(snapshot)
  const canRestore = snapshot.graph.nodes.length > 0
  const [activeTab, setActiveTab] = useState<'images' | 'compare'>('images')

  const handleUse = () => {
    if (!canRestore) return
    const { nodes, edges } = snapshot.graph
    useGraphStore.setState({ nodes, edges, selectedNodeId: null })
    useUIStore.getState().setActiveSidebarItem('render')
  }

  const handleSave = () => {
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

          {activeTab === 'compare' ? (
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

  const filteredSnapshots = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return snapshots
    return snapshots.filter((snapshot) => {
      const date = new Date(snapshot.timestamp).toLocaleString().toLowerCase()
      return snapshot.id.toLowerCase().includes(q) || date.includes(q)
    })
  }, [query, snapshots])

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
            {loading ? 'Loading history...' : `${filteredSnapshots.length} saved renders`}
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

      {loading ? (
        <HistorySkeletonGrid />
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
              {query.trim() ? 'No matching renders' : 'No renders saved yet'}
            </div>
            <div className="mt-1.5 max-w-xs" style={{ fontSize: 12, color: '#858592', lineHeight: 1.45 }}>
              {query.trim() ? 'Try another search term.' : 'Finished render results will appear here as thumbnails.'}
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
