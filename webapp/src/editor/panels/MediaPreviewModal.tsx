import { useEffect } from 'react'
import { Download, ExternalLink, ImageIcon, Play, X } from 'lucide-react'

export type MediaPreviewState = {
  kind: 'image' | 'video'
  src: string
  poster?: string | null
  title: string
} | null

interface MediaPreviewModalProps {
  media: NonNullable<MediaPreviewState>
  onClose: () => void
}

export function MediaPreviewModal({ media, onClose }: MediaPreviewModalProps) {
  const isVideo = media.kind === 'video'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 220,
        background: 'radial-gradient(circle at 50% 38%, rgba(255,255,255,.07), transparent 34%), rgba(2,2,6,.94)',
        backdropFilter: 'blur(18px)',
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes media-preview-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes media-preview-rise {
          from { opacity: 0; transform: translateY(14px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .media-preview-action {
          transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease, color 140ms ease;
        }
        .media-preview-action:hover {
          background-color: rgba(255,255,255,.14) !important;
          border-color: rgba(255,255,255,.24) !important;
          color: #ffffff !important;
          transform: translateY(-1px);
        }
        .media-preview-close:hover {
          background-color: rgba(255,80,96,.20) !important;
          border-color: rgba(255,110,125,.36) !important;
        }
      `}</style>

      <div
        className="relative flex h-[94vh] w-[94vw] items-center justify-center"
        style={{
          animation: 'media-preview-rise 180ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute left-5 top-5 flex min-w-0 items-center gap-2.5"
          style={{
            zIndex: 2,
            maxWidth: 'min(540px, 48vw)',
            padding: '8px 11px',
            borderRadius: 999,
            background: 'rgba(14,14,20,.62)',
            border: '1px solid rgba(255,255,255,.10)',
            boxShadow: '0 14px 36px rgba(0,0,0,.32)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{
              width: 28,
              height: 28,
              background: isVideo ? 'rgba(0,201,167,.18)' : 'rgba(255,255,255,.08)',
              border: `1px solid ${isVideo ? 'rgba(0,201,167,.34)' : 'rgba(255,255,255,.12)'}`,
              color: isVideo ? '#69f7df' : '#d8d8e0',
            }}
          >
            {isVideo ? <Play size={13} fill="currentColor" /> : <ImageIcon size={14} />}
          </div>
          <div className="min-w-0">
            <div className="truncate" style={{ color: '#ffffff', fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>
              {media.title}
            </div>
            <div style={{ color: '#8d8d9a', fontSize: 11, lineHeight: 1.2 }}>
              {isVideo ? 'Video result' : 'Image result'}
            </div>
          </div>
        </div>

        <div
          className="absolute right-5 top-5 flex items-center gap-2"
          style={{ zIndex: 2 }}
        >
          <a
            href={media.src}
            target="_blank"
            rel="noreferrer"
            className="media-preview-action flex items-center gap-1.5 rounded-full px-3"
            style={{
              height: 36,
              background: 'rgba(14,14,20,.62)',
              border: '1px solid rgba(255,255,255,.10)',
              color: '#d9d9e2',
              fontSize: 12,
              fontWeight: 750,
              backdropFilter: 'blur(16px)',
            }}
            title="Open in a new tab"
          >
            <ExternalLink size={13} />
            Open
          </a>
          <a
            href={media.src}
            download
            className="media-preview-action flex items-center justify-center rounded-full"
            style={{
              width: 36,
              height: 36,
              background: 'rgba(14,14,20,.62)',
              border: '1px solid rgba(255,255,255,.10)',
              color: '#d9d9e2',
              backdropFilter: 'blur(16px)',
            }}
            title="Download"
          >
            <Download size={14} />
          </a>
          <button
            className="media-preview-action media-preview-close flex items-center justify-center rounded-full"
            style={{
              width: 36,
              height: 36,
              background: 'rgba(14,14,20,.62)',
              border: '1px solid rgba(255,255,255,.10)',
              color: '#ffffff',
              backdropFilter: 'blur(16px)',
            }}
            onClick={onClose}
            title="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div
          className="flex h-full w-full items-center justify-center px-5 py-16"
          style={{ animation: 'media-preview-fade 180ms ease-out' }}
        >
          {isVideo ? (
            <video
              src={media.src}
              poster={media.poster ?? undefined}
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                display: 'block',
                borderRadius: 10,
                background: '#000',
                boxShadow: '0 24px 80px rgba(0,0,0,.72)',
                outline: '1px solid rgba(255,255,255,.08)',
              }}
            />
          ) : (
            <img
              src={media.src}
              alt=""
              draggable={false}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: 10,
                boxShadow: '0 24px 80px rgba(0,0,0,.58)',
                outline: '1px solid rgba(255,255,255,.08)',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
