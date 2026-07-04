import {
  Monitor,
  Workflow,
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
  { id: 'nodes', icon: Workflow, label: 'Nodes' },
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
      className="relative mx-1.5 my-0.5 flex flex-col items-center justify-center"
      style={{
        height: 62,
        width: 'calc(100% - 12px)',
        borderRadius: 10,
        background: isActive ? 'rgba(0,201,167,0.10)' : 'transparent',
        transition: 'background 150ms',
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
          style={{ width: 3, height: 34, backgroundColor: '#00c9a7' }}
        />
      )}
      <Icon
        size={22}
        color={isActive ? '#2fe6c8' : '#8a8a96'}
        className="transition-colors duration-150"
      />
      <span
        className="mt-1.5 text-center leading-none transition-colors duration-150"
        style={{
          fontSize: 11,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? '#eafffb' : '#8a8a96',
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
        width: 76,
        minWidth: 76,
        backgroundColor: '#0d0d13',
        borderRight: '1px solid #1e1e28',
        paddingTop: 6,
        paddingBottom: 6,
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
