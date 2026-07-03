import { useState } from 'react'
import { Clock, Download, ArrowDownToLine, X, Info } from 'lucide-react'
import { useHistoryStore } from '../../state/historyStore'
import { useGraphStore } from '../../state/graphStore'
import { useUIStore } from '../../state/uiStore'
import type { GraphSnapshot } from '../../types/graph'

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

function HistoryCard({ snapshot }: { snapshot: GraphSnapshot }) {
  const [hovered, setHovered] = useState(false)
  const restoreSnapshot = useHistoryStore((s) => s.restoreSnapshot)

  const thumbnail = snapshot.thumbnails[snapshot.thumbnails.length - 1] ?? null

  const handleUse = () => {
    const snap = restoreSnapshot(snapshot.id)
    if (!snap) return
    const { nodes, edges } = snap.graph
    useGraphStore.setState({ nodes, edges, selectedNodeId: null })
    // 복원 후 에디터 화면으로 복귀 (실물 VizMaker 동작)
    useUIStore.getState().setActiveSidebarItem('render')
  }

  const handleSave = () => {
    if (!thumbnail) return
    const ts = new Date(snapshot.timestamp).toISOString().slice(0, 19).replace(/:/g, '-')
    downloadImage(thumbnail, `vizmaker-${ts}.png`)
  }

  return (
    <div
      className="relative overflow-hidden rounded"
      style={{ backgroundColor: '#1a1a24' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div
        className="flex items-center justify-center"
        style={{ height: 140, backgroundColor: '#111118' }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt="History thumbnail"
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <span style={{ color: '#444444', fontSize: 12 }}>No image</span>
        )}
      </div>

      {/* Hover overlay: Use / Save buttons */}
      {hovered && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
          <button
            onClick={handleUse}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors duration-100"
            style={{ backgroundColor: '#1a1a24', color: '#ffffff' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a36')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1a1a24')}
          >
            <ArrowDownToLine size={12} />
            Use
          </button>
          {thumbnail && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors duration-100"
              style={{ backgroundColor: '#1a1a24', color: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a36')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1a1a24')}
            >
              <Download size={12} />
              Save
            </button>
          )}
        </div>
      )}

      {/* Timestamp */}
      <div
        className="flex items-center gap-1 px-2 py-1.5"
        style={{ borderTop: '1px solid #222233' }}
      >
        <Clock size={10} style={{ color: '#888888' }} />
        <span style={{ color: '#888888', fontSize: 11 }}>
          {formatTimeAgo(snapshot.timestamp)}
        </span>
      </div>
    </div>
  )
}

export function HistoryPage() {
  const snapshots = useHistoryStore((s) => s.snapshots)
  const [hintVisible, setHintVisible] = useState(true)
  const [visibleCount, setVisibleCount] = useState(12)

  const visibleSnapshots = snapshots.slice(0, visibleCount)
  const hasMore = visibleCount < snapshots.length

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto px-6 py-4">
      {/* Header */}
      <h1
        className="mb-4"
        style={{ color: '#ffffff', fontSize: 24, fontWeight: 700 }}
      >
        History
      </h1>

      {/* Hint banner */}
      {hintVisible && (
        <div
          className="mb-4 flex items-center justify-between rounded-md px-4 py-2.5"
          style={{ backgroundColor: '#1a1a24' }}
        >
          <div className="flex items-center gap-2">
            <Info size={14} style={{ color: '#4488ff' }} />
            <span style={{ color: '#888888', fontSize: 13 }}>
              Hint: You can get more details about generated image by clicking on the image
            </span>
          </div>
          <button
            onClick={() => setHintVisible(false)}
            className="transition-colors duration-150"
            style={{ color: '#666666' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#666666')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Grid */}
      {snapshots.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center"
          style={{ color: '#555555', fontSize: 14 }}
        >
          No history yet. Run a pipeline to generate results.
        </div>
      ) : (
        <>
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: 'repeat(6, 1fr)',
            }}
          >
            {visibleSnapshots.map((snapshot) => (
              <HistoryCard key={snapshot.id} snapshot={snapshot} />
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setVisibleCount((c) => c + 12)}
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
        </>
      )}
    </div>
  )
}
