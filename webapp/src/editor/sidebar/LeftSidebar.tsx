import {
  Monitor,
  Palette,
  Workflow,
  RotateCcw,
  Users,
  PlaySquare,
  HelpCircle,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { useUIStore, type SidebarItem } from '../../state/uiStore'
import { firebaseEnabled, isAdminEmail, useAuthUser } from '../../auth/firebase'

interface SidebarButton {
  id: SidebarItem | 'materials'
  icon: LucideIcon
  label: string
}

const topButtons: SidebarButton[] = [
  { id: 'render', icon: Monitor, label: 'Render' },
  { id: 'materials', icon: Palette, label: 'Materials' },
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
  const materialLibraryOpen = useUIStore((s) => s.materialLibraryOpen)
  const toggleMaterialLibrary = useUIStore((s) => s.toggleMaterialLibrary)
  const isMaterialButton = button.id === 'materials'
  const isActive = isMaterialButton ? materialLibraryOpen : activeSidebarItem === button.id
  const Icon = button.icon

  return (
    <button
      onClick={() => {
        if (isMaterialButton) {
          toggleMaterialLibrary()
          return
        }
        setActiveSidebarItem(button.id as SidebarItem)
      }}
      className="relative my-0.5 flex flex-col items-center justify-center self-center"
      style={{
        height: 62,
        width: 64,
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
  const user = useAuthUser()
  const showAdmin = isAdminEmail(user?.email)

  return (
    <aside
      className="flex h-full flex-col items-center"
      style={{
        width: 76,
        minWidth: 76,
        backgroundColor: '#0d0d13',
        borderRight: '1px solid #1e1e28',
        paddingTop: 6,
        paddingBottom: 6,
      }}
    >
      <div className="flex w-full flex-col items-center">
        {topButtons.map((btn) => (
          <SidebarIcon key={btn.id} button={btn} />
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex w-full flex-col items-center">
        {showAdmin && <AdminIcon />}
        {bottomButtons.map((btn) => (
          <SidebarIcon key={btn.id} button={btn} />
        ))}
        <ProfileBadge />
      </div>
    </aside>
  )
}

function AdminIcon() {
  return (
    <button
      onClick={() => { window.location.href = '/admin' }}
      className="relative my-0.5 flex flex-col items-center justify-center self-center"
      style={{
        height: 62,
        width: 64,
        borderRadius: 10,
        background: 'rgba(0,201,167,0.10)',
        border: '1px solid rgba(0,201,167,.18)',
      }}
      title="관리자 모드"
    >
      <Shield size={22} color="#2fe6c8" className="transition-colors duration-150" />
      <span
        className="mt-1.5 text-center leading-none"
        style={{ fontSize: 11, fontWeight: 700, color: '#eafffb' }}
      >
        Admin
      </span>
    </button>
  )
}

// 좌측 하단 프로필 배지: 로그인 상태를 항상 눈으로 확인 가능하게
function ProfileBadge() {
  const user = useAuthUser()
  const setActiveSidebarItem = useUIStore((st) => st.setActiveSidebarItem)
  const saas = firebaseEnabled()
  const loggedIn = saas && !!user
  const initial = user?.email?.[0]?.toUpperCase() ?? 'D'
  const label = loggedIn ? (user?.email?.split('@')[0] ?? '') : 'Dev'

  return (
    <button
      title={loggedIn ? `로그인됨: ${user?.email}` : '개발자 모드 (로그인 없음)'}
      onClick={() => setActiveSidebarItem('account')}
      className="mb-1 mt-2 flex flex-col items-center self-center"
      style={{ width: 64 }}
    >
      <span
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 34, height: 34, fontSize: 14, fontWeight: 700,
          background: loggedIn ? '#00c9a7' : '#2a2a34',
          color: loggedIn ? '#06251f' : '#777788',
          border: loggedIn ? 'none' : '1px dashed #444450',
        }}
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initial
        )}
        <span
          className="absolute rounded-full"
          style={{
            right: -1, bottom: -1, width: 10, height: 10,
            background: loggedIn ? '#22cc66' : '#666672',
            border: '2px solid #0d0d13',
          }}
        />
      </span>
      <span className="mt-1 w-full truncate text-center" style={{ fontSize: 9, color: loggedIn ? '#bfeee4' : '#666672' }}>
        {label}
      </span>
    </button>
  )
}
