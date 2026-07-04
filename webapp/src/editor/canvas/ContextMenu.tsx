import { useCallback } from 'react'
import {
  ImagePlus, Wand2, Sparkles, ArrowUpWideNarrow, Clapperboard, Columns2,
  Play, Copy, Trash2, type LucideIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// 컨텍스트 메뉴 — 실물 VizMaker 팝업 디자인 언어
// (엔진 드롭다운 참조: 어두운 라운드 패널, 부드러운 그림자, 아이콘+행 호버)
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: string
  action: () => void
  danger?: boolean
}

// 라벨 문구로 아이콘 매칭 (기존 호출부 시그니처 유지)
function iconFor(label: string): LucideIcon | null {
  if (/source|소스|이미지 추가/i.test(label)) return ImagePlus
  if (/render|렌더/i.test(label)) return Sparkles
  if (/modifier|수정/i.test(label)) return Wand2
  if (/upscale|업스케일/i.test(label)) return ArrowUpWideNarrow
  if (/video|영상/i.test(label)) return Clapperboard
  if (/compare|비교/i.test(label)) return Columns2
  if (/실행|run|make/i.test(label)) return Play
  if (/복제|duplicate|copy/i.test(label)) return Copy
  if (/삭제|delete/i.test(label)) return Trash2
  return null
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const handleClick = useCallback(
    (action: () => void) => {
      action()
      onClose()
    },
    [onClose],
  )

  // 노드 추가 항목(+)과 일반 액션 사이 구분선
  const isAdd = (l: string) => l.trim().startsWith('+')

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-50 py-1.5"
        style={{
          left: x,
          top: y,
          background: 'rgba(23, 23, 30, 0.98)',
          border: '1px solid #2e2e3a',
          boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)',
          minWidth: 200,
          borderRadius: 10,
          backdropFilter: 'blur(8px)',
        }}
      >
        {items.map((item, i) => {
          const Icon = iconFor(item.label)
          const divider = i > 0 && isAdd(items[i - 1].label) && !isAdd(item.label)
          return (
            <div key={item.label}>
              {divider && <div style={{ height: 1, background: '#2a2a36', margin: '5px 10px' }} />}
              <button
                className="flex w-full items-center gap-2.5 text-left transition-colors duration-100"
                style={{
                  padding: '7px 14px',
                  fontSize: 12.5,
                  color: item.danger ? '#ff6666' : '#d8d8e0',
                  borderRadius: 6,
                  margin: '0 4px',
                  width: 'calc(100% - 8px)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = item.danger ? 'rgba(255,68,68,0.12)' : 'rgba(0,201,167,0.10)'
                  if (!item.danger) e.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = item.danger ? '#ff6666' : '#d8d8e0'
                }}
                onClick={() => handleClick(item.action)}
              >
                {Icon && <Icon size={14} style={{ color: item.danger ? '#ff6666' : '#8a8a96', flexShrink: 0 }} />}
                <span>{item.label.replace(/^\+\s*/, '')}</span>
                {isAdd(item.label) && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5a5a66' }}>추가</span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
