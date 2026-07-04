import { Play, Loader2 } from 'lucide-react'

interface MakeButtonProps {
  credits: number
  disabled: boolean
  isRunning: boolean
  onClick: () => void
}

export function MakeButton({ credits, disabled, isRunning, onClick }: MakeButtonProps) {
  return (
    <div className="flex flex-col items-center px-3">
      <button
        data-make-button
        onClick={onClick}
        disabled={disabled}
        className="flex h-9 items-center gap-1.5 rounded-md px-5 text-sm font-bold transition-colors duration-150"
        style={{
          backgroundColor: disabled ? '#333340' : '#00c9a7',
          color: disabled ? '#666666' : '#06251f',
          minWidth: 100,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.backgroundColor = '#00ddb8'
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.backgroundColor = '#00c9a7'
        }}
      >
        {isRunning ? 'Running...' : 'Make'}
        {isRunning ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Play size={13} fill="currentColor" />
        )}
      </button>
      <span style={{ color: '#666666', fontSize: 11 }}>
        Credits: {credits}
      </span>
    </div>
  )
}
