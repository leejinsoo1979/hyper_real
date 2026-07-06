import { useState } from 'react'
import { Box, Building2, Check, Cpu, Download, Folder, Network, X } from 'lucide-react'
import { getStoredApiKey, setStoredApiKey } from '../../engine/geminiClient'
import { saasMode } from '../../api/lumanovaApi'
import { useUIStore } from '../../state/uiStore'

// ---------------------------------------------------------------------------
// Settings — 실물 VizMaker 디자인 언어 (좌측 큰 제목 + 전체폭 섹션 행)
// SaaS 모드: 연동/정보만. API Key 입력은 개발자 모드 전용.
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#17171d', border: '1px solid #24242c', borderRadius: 10, marginBottom: 14 }}>
      <div style={{ padding: '13px 20px', borderBottom: '1px solid #22222a', color: '#e8e8ee', fontSize: 13.5, fontWeight: 600 }}>
        {title}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '6px 0' }}>
      <span style={{ color: '#a9a9b4', fontSize: 12.5 }}>{label}</span>
      <span style={{ color: '#e6e6ee', fontSize: 12.5, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

type PluginKey = 'max' | 'revit' | 'sketchup' | 'archicad' | 'rhino' | 'unreal' | 'blender'

interface PluginFamily {
  key: PluginKey
  name: string
  icon: React.ReactNode
  versions: string[]
  availableVersions: string[]
}

const PLUGIN_SELECTION_KEY = 'lumanova.pluginSelections'

const pluginFamilies: PluginFamily[] = [
  {
    key: 'max',
    name: '3ds Max',
    icon: <PluginBadge label="3" sub="MAX" color="#45bde8" />,
    versions: ['2021', '2022', '2023', '2024', '2025', '2026', '2027'],
    availableVersions: [],
  },
  {
    key: 'revit',
    name: 'Revit',
    icon: <PluginBadge label="R" sub="RVT" color="#4d77ff" />,
    versions: ['2022', '2023', '2024', '2025', '2026'],
    availableVersions: [],
  },
  {
    key: 'sketchup',
    name: 'SketchUp',
    icon: <Box size={35} strokeWidth={2.2} color="#0087c8" />,
    versions: ['2022', '2023', '2024', '2025', '2026'],
    availableVersions: ['2022', '2023', '2024', '2025'],
  },
  {
    key: 'archicad',
    name: 'Archicad',
    icon: <Building2 size={35} strokeWidth={2.2} color="#14bde6" />,
    versions: ['26', '27', '28', '29'],
    availableVersions: [],
  },
  {
    key: 'rhino',
    name: 'Rhino',
    icon: <PluginBadge label="Rh" sub="" color="#f6f6ff" darkText />,
    versions: ['6.0', '7.0', '8.0'],
    availableVersions: [],
  },
  {
    key: 'unreal',
    name: 'Unreal Engine',
    icon: <PluginBadge label="U" sub="" color="#f8f8ff" darkText />,
    versions: ['5.5', '5.6', '5.7'],
    availableVersions: [],
  },
  {
    key: 'blender',
    name: 'Blender',
    icon: <PluginBadge label="B" sub="" color="#f28c1b" />,
    versions: ['4.2', '4.3', '4.4', '4.5', '5.0', '5.1'],
    availableVersions: [],
  },
]

function PluginBadge({ label, sub, color, darkText = false }: { label: string; sub: string; color: string; darkText?: boolean }) {
  return (
    <span
      className="flex items-center justify-center"
      style={{
        width: 35,
        height: 35,
        borderRadius: 8,
        background: color,
        color: darkText ? '#15151c' : '#ffffff',
        fontWeight: 900,
        fontSize: sub ? 18 : 17,
        boxShadow: `0 8px 24px ${color}22`,
      }}
    >
      <span className="flex flex-col items-center leading-none">
        <span>{label}</span>
        {sub && <span style={{ fontSize: 6, marginTop: 1, letterSpacing: 0 }}>{sub}</span>}
      </span>
    </span>
  )
}

function readPluginSelections(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return { 'sketchup:2022': true }
  try {
    const parsed = JSON.parse(localStorage.getItem(PLUGIN_SELECTION_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed ? { 'sketchup:2022': true, ...parsed } : { 'sketchup:2022': true }
  } catch {
    return { 'sketchup:2022': true }
  }
}

function persistPluginSelections(selections: Record<string, boolean>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PLUGIN_SELECTION_KEY, JSON.stringify(selections))
}

function PluginCheckbox({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      className="flex items-center gap-2 text-left"
      style={{
        height: 34,
        color: disabled ? '#72727d' : '#c8c8d0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.62 : 1,
      }}
      title={disabled ? '지원 준비 중' : '설치 대상 선택'}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          background: checked ? '#15d8cf' : 'transparent',
          border: checked ? '1px solid #15d8cf' : '1px solid #3a3a48',
          color: '#06221f',
          flexShrink: 0,
        }}
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
      <span style={{ fontSize: 13, fontWeight: checked ? 700 : 500 }}>{label}</span>
    </button>
  )
}

function InstallPluginsModal({ onClose }: { onClose: () => void }) {
  const [selections, setSelections] = useState(readPluginSelections)

  const toggle = (family: PluginFamily, version: string) => {
    const key = `${family.key}:${version}`
    const next = { ...selections, [key]: !selections[key] }
    setSelections(next)
    persistPluginSelections(next)
  }

  const selectedSketchUp = pluginFamilies
    .find((family) => family.key === 'sketchup')!
    .versions.some((version) => selections[`sketchup:${version}`])

  const handleInstall = () => {
    persistPluginSelections(selections)
    if (selectedSketchUp) {
      window.location.href = '/api/download-rbz'
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-8"
      style={{ background: 'rgba(0,0,0,.58)', backdropFilter: 'blur(5px)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative overflow-hidden"
        style={{
          width: 'min(1640px, calc(100vw - 96px))',
          minHeight: 760,
          maxHeight: 'calc(100vh - 96px)',
          borderRadius: 8,
          background:
            'radial-gradient(circle at 14% 78%, rgba(23,92,95,.20), transparent 33%), radial-gradient(circle at 70% 105%, rgba(91,30,94,.36), transparent 36%), linear-gradient(135deg, #171b1f 0%, #1b1e2b 48%, #21172d 100%)',
          border: '1px solid #2f3038',
          boxShadow: '0 28px 90px rgba(0,0,0,.55)',
        }}
      >
        <div className="flex items-center justify-between px-10 pt-5">
          <span style={{ color: '#d4d4dc', fontSize: 12, fontWeight: 800 }}>Install Plugins</span>
          <div className="flex items-center gap-6">
            <button style={{ color: '#d6d6de', fontSize: 24, lineHeight: 1 }} title="Minimize">−</button>
            <button style={{ width: 16, height: 16, border: '2px solid #d6d6de', borderRadius: 2 }} title="Maximize" />
            <button onClick={onClose} className="flex items-center justify-center" style={{ color: '#d6d6de' }} title="Close">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="px-10 pb-10 pt-7">
          <div className="flex items-center gap-3">
            <Network size={31} color="#ffffff" />
            <h2 style={{ color: '#ffffff', fontSize: 34, lineHeight: 1, fontWeight: 850 }}>Plugins</h2>
          </div>
          <p style={{ marginTop: 24, color: '#e6e6ee', fontSize: 18, fontWeight: 500 }}>
            Plugins allows you to integrate Lumanova with a 3rd party CAD / Sketch software for faster view capture
          </p>

          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))',
              columnGap: 42,
              marginTop: 52,
              padding: '0 30px',
            }}
          >
            {pluginFamilies.map((family) => (
              <div key={family.key} className="min-w-0">
                <div className="mb-5 flex h-10 items-center justify-center">{family.icon}</div>
                <div className="space-y-2">
                  {family.versions.map((version) => {
                    const key = `${family.key}:${version}`
                    const available = family.availableVersions.includes(version)
                    return (
                      <PluginCheckbox
                        key={key}
                        label={`${family.name} ${version}`}
                        checked={Boolean(selections[key])}
                        disabled={!available}
                        onToggle={() => toggle(family, version)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="absolute bottom-5 right-5 flex items-center gap-2">
            <button
              onClick={onClose}
              style={{
                height: 44,
                padding: '0 18px',
                borderRadius: 7,
                background: 'rgba(255,255,255,.08)',
                color: '#f2f2f6',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleInstall}
              style={{
                height: 44,
                padding: '0 21px',
                borderRadius: 7,
                background: '#16d8d2',
                color: '#062220',
                fontSize: 14,
                fontWeight: 850,
                boxShadow: '0 10px 28px rgba(22,216,210,.25)',
              }}
            >
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const saas = saasMode()
  const status = useUIStore((s) => s.sketchUpStatus)
  const [pluginsOpen, setPluginsOpen] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#0d0d11', padding: '36px 48px' }}>
      <h1 style={{ color: '#ffffff', fontSize: 26, fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      <Section title="Application">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <button
            onClick={() => setPluginsOpen(true)}
            className="flex min-w-0 items-center gap-4 text-left"
            style={{
              height: 100,
              padding: '0 20px',
              borderRadius: 8,
              background: '#1b1b22',
              border: '1px solid #2a2a34',
              color: '#e8e8ee',
            }}
          >
            <span className="flex items-center justify-center rounded-md" style={{ width: 42, height: 42, background: '#111118', color: '#a8a8b4' }}>
              <Network size={22} />
            </span>
            <span className="min-w-0">
              <span className="block" style={{ fontSize: 14, fontWeight: 800 }}>Install Plugins</span>
              <span className="mt-1 block truncate" style={{ fontSize: 11.5, color: '#777784' }}>SketchUp, Rhino, Blender and more</span>
            </span>
          </button>
          <div
            className="flex min-w-0 items-center gap-4"
            style={{ height: 100, padding: '0 20px', borderRadius: 8, background: '#15151c', border: '1px solid #24242c', opacity: 0.8 }}
          >
            <span className="flex items-center justify-center rounded-md" style={{ width: 42, height: 42, background: '#101018', color: '#777784' }}>
              <Folder size={22} />
            </span>
            <span className="min-w-0">
              <span className="block" style={{ color: '#dadae2', fontSize: 14, fontWeight: 750 }}>Plugin Folder</span>
              <span className="mt-1 block truncate" style={{ fontSize: 11.5, color: '#666672' }}>Managed by each host app</span>
            </span>
          </div>
          <div
            className="flex min-w-0 items-center gap-4"
            style={{ height: 100, padding: '0 20px', borderRadius: 8, background: '#15151c', border: '1px solid #24242c', opacity: 0.8 }}
          >
            <span className="flex items-center justify-center rounded-md" style={{ width: 42, height: 42, background: '#101018', color: '#777784' }}>
              <Cpu size={22} />
            </span>
            <span className="min-w-0">
              <span className="block" style={{ color: '#dadae2', fontSize: 14, fontWeight: 750 }}>Capture Bridge</span>
              <span className="mt-1 block truncate" style={{ fontSize: 11.5, color: '#666672' }}>Local viewport sync</span>
            </span>
          </div>
        </div>
      </Section>

      <Section title="SketchUp 연동">
        <Row
          label="연결 상태"
          value={
            <span style={{ color: status === 'connected' ? '#4cd6a8' : '#ff7777' }}>
              {status === 'connected' ? '● 연결됨' : '○ 연결 안 됨'}
            </span>
          }
        />
        <Row label="플러그인" value="Lumanova SketchUp Plugin v1.0.5" />
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#71717c', lineHeight: 1.6 }}>
          SketchUp을 실행하면 자동으로 연결됩니다. 연결이 안 되면 SketchUp을 재시작하세요.
        </div>
      </Section>

      <Section title="플러그인">
        <div className="flex items-center justify-between">
          <div>
            <div style={{ color: '#e6e6ee', fontSize: 13, fontWeight: 600 }}>SketchUp</div>
            <div style={{ marginTop: 3, fontSize: 11.5, color: '#71717c' }}>
              SketchUp 2021~2025 지원 · 설치: 창 → Extension Manager → Install Extension → 받은 rbz 선택 → SketchUp 재시작
            </div>
          </div>
          <a
            href="/api/download-rbz"
            download
            className="flex items-center"
            style={{
              height: 36, padding: '0 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              background: '#00c9a7', color: '#06251f', textDecoration: 'none', flexShrink: 0,
            }}
          >
            <Download size={14} className="mr-1.5" />
            SketchUp 다운로드
          </a>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid #22222a', paddingTop: 12 }}>
          {['SketchUp 2022', 'SketchUp 2023', 'SketchUp 2024', 'SketchUp 2025'].map((n) => (
            <span key={n} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 10.5, background: '#122a28', color: '#35e5cf', border: '1px solid #1f5952' }}>
              {n} 지원
            </span>
          ))}
          {['Rhino', 'Blender', '3ds Max', 'Revit', 'Archicad', 'Unreal Engine'].map((n) => (
            <span key={n} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 10.5, background: '#1e1e26', color: '#686875', border: '1px solid #2a2a34' }}>
              {n} 준비 중
            </span>
          ))}
        </div>
      </Section>

      <ApiKeySection saas={saas} />

      <Section title="정보">
        <Row label="앱" value="Lumanova" />
        <Row label="버전" value="1.0.5" />
        <Row label="업데이트 채널" value="Stable" />
      </Section>

      {pluginsOpen && <InstallPluginsModal onClose={() => setPluginsOpen(false)} />}
    </div>
  )
}

// Gemini API Key: 개발자 모드에선 필수, SaaS 모드에선 선택(본인 키 사용 시 크레딧 미차감)
function ApiKeySection({ saas }: { saas: boolean }) {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey() ?? '')
  const [saved, setSaved] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const handleSave = () => {
    setStoredApiKey(apiKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Section title={saas ? 'API Key (선택)' : 'Gemini API Key'}>
      {saas && (
        <div className="mb-3" style={{ fontSize: 11.5, color: '#71717c' }}>
          기본적으로 키는 필요 없습니다(크레딧으로 렌더링). 본인 Gemini 키를 입력하면 크레딧 차감 없이 본인 키로 렌더링합니다.
        </div>
      )}
      <div className="flex gap-2">
        <input
          type={revealed ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
          className="flex-1 rounded-lg px-3 outline-none"
          style={{ height: 38, background: '#0d0d15', border: '1px solid #26262f', color: '#fff', fontSize: 13 }}
        />
        <button
          onClick={() => setRevealed((v) => !v)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, background: '#1e1e28', border: '1px solid #2c2c38', color: '#a9a9b4', fontSize: 12 }}
        >
          {revealed ? '숨김' : '표시'}
        </button>
        <button
          onClick={handleSave}
          style={{ height: 38, padding: '0 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: '#00c9a7', color: '#06251f' }}
        >
          {saved ? '저장됨 ✓' : '저장'}
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#71717c' }}>
        키는 이 컴퓨터에만 저장됩니다.{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#00c9a7' }}>
          Google AI Studio에서 발급
        </a>
      </div>
    </Section>
  )
}
