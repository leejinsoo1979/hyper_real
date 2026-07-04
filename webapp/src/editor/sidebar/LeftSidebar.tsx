import {
  Monitor,
  Camera,
  RotateCcw,
  Users,
  PlaySquare,
  HelpCircle,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useUIStore, type SidebarItem } from '../../state/uiStore'

interface SidebarButton {
  id: SidebarItem
  icon: LucideIcon
  label: string
}

const topButtons: SidebarButton[] = [
  { id: 'render', icon: Monitor, label: 'Render' },
  { id: 'camera', icon: Camera, label: 'Camera' },
  { id: 'history', icon: RotateCcw, label: 'History' },
  { id: 'account', icon: Users, label: 'Account' },
  { id: 'tutorial', icon: PlaySquare, label: 'Tutorial' },
]

const bottomButtons: SidebarButton[] = [
  { id: 'support', icon: HelpCircle, label: 'Support' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]

function SidebarIcon({ button }: { button: SidebarButton }) {
  const activeSidebarItem = useUIStore((s) => s.activeSidebarItem)
  const setActiveSidebarItem = useUIStore((s) => s.setActiveSidebarItem)
  const isActive = activeSidebarItem === button.id
  const Icon = button.icon

  return (
    <button
      onClick={() => setActiveSidebarItem(button.id)}
      className="relative flex w-full flex-col items-center justify-center py-2"
      style={{ height: 56 }}
    >
      {isActive && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-sm"
          style={{ width: 3, height: 40, backgroundColor: '#00c9a7' }}
        />
      )}
      <Icon
        size={20}
        color={isActive ? '#ffffff' : '#666666'}
        className="transition-colors duration-150"
      />
      <span
        className="mt-1 text-center leading-none transition-colors duration-150"
        style={{
          fontSize: 10,
          color: isActive ? '#ffffff' : '#666666',
        }}
      >
        {button.label}
      </span>
    </button>
  )
}

export function LeftSidebar() {
  return (
    <aside
      className="flex h-full flex-col"
      style={{
        width: 56,
        minWidth: 56,
        backgroundColor: '#0f0f1a',
        borderRight: '1px solid #222233',
      }}
    >
      <div className="flex flex-col">
        {topButtons.map((btn) => (
          <SidebarIcon key={btn.id} button={btn} />
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col">
        {bottomButtons.map((btn) => (
          <SidebarIcon key={btn.id} button={btn} />
        ))}
      </div>
    </aside>
  )
}
