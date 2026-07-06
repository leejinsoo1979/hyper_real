import { Play, Loader2 } from 'lucide-react'

interface MakeButtonProps {
  disabled: boolean
  isRunning: boolean
  onClick: () => void
}

export function MakeButton({ disabled, isRunning, onClick }: MakeButtonProps) {
  return (
    <div className="flex shrink-0 items-center">
      <button
        data-make-button
        onClick={onClick}
        disabled={disabled}
        className="group flex items-center justify-center gap-2 rounded-xl transition-colors duration-150"
        style={{
          width: 132,
          height: 48,
          background: disabled
            ? 'linear-gradient(180deg, #23232c, #1a1a22)'
            : 'linear-gradient(180deg, #18e3c4, #00bfa2)',
          border: disabled ? '1px solid #32323e' : '1px solid rgba(94,255,226,.45)',
          color: disabled ? '#6d6d78' : '#031716',
          fontSize: 13,
          fontWeight: 850,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: disabled
            ? 'inset 0 1px 0 rgba(255,255,255,.04)'
            : '0 16px 34px rgba(0,201,167,.22), inset 0 1px 0 rgba(255,255,255,.32)',
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.background = 'linear-gradient(180deg, #27f1d2, #00c9a7)'
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = 'linear-gradient(180deg, #18e3c4, #00bfa2)'
        }}
      >
        {/* 크레딧 표기는 개인 키 정책 동안 숨김 — 서비스 운영 시 복원 */}
        <span className="flex min-w-0 items-center leading-none">
          <span>{isRunning ? 'Running' : 'Make'}</span>
        </span>
        <span
          className="flex items-center justify-center rounded-full"
          style={{
            width: 24,
            height: 24,
            background: disabled ? '#2c2c36' : 'rgba(3,23,22,.13)',
            color: disabled ? '#686875' : '#031716',
          }}
        >
          {isRunning ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Play size={12} fill="currentColor" />
          )}
        </span>
      </button>
    </div>
  )
}
