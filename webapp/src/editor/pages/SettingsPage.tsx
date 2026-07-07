import { useState } from 'react'
import { Check, Cpu, Download, Folder, Network, X } from 'lucide-react'
import logo3dsMax from '../../assets/plugin-logos/3dsmax.png'
import logoRevit from '../../assets/plugin-logos/revit.png'
import logoSketchUp from '../../assets/plugin-logos/sketchup.png'
import logoArchicad from '../../assets/plugin-logos/archicad.png'
import logoRhino from '../../assets/plugin-logos/rhino.png'
import logoUnreal from '../../assets/plugin-logos/unreal.png'
import logoBlender from '../../assets/plugin-logos/blender.png'
import { getStoredApiKey, setStoredApiKey } from '../../engine/geminiClient'
import { getStoredXaiApiKey, setStoredXaiApiKey } from '../../engine/xaiClient'
import { getStoredOpenAIApiKey, setStoredOpenAIApiKey } from '../../engine/openaiClient'
import { saasMode } from '../../api/lumanovaApi'
import { useUIStore } from '../../state/uiStore'
import { APP_VERSION } from '../../app/version'

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
    icon: <PluginLogo src={logo3dsMax} name="3ds Max" />,
    versions: ['2021', '2022', '2023', '2024', '2025', '2026', '2027'],
    availableVersions: [],
  },
  {
    key: 'revit',
    name: 'Revit',
    icon: <PluginLogo src={logoRevit} name="Revit" />,
    versions: ['2022', '2023', '2024', '2025', '2026'],
    availableVersions: [],
  },
  {
    key: 'sketchup',
    name: 'SketchUp',
    icon: <PluginLogo src={logoSketchUp} name="SketchUp" />,
    versions: ['2022', '2023', '2024', '2025', '2026'],
    availableVersions: ['2022', '2023', '2024', '2025'],
  },
  {
    key: 'archicad',
    name: 'Archicad',
    icon: <PluginLogo src={logoArchicad} name="Archicad" />,
    versions: ['26', '27', '28', '29'],
    availableVersions: [],
  },
  {
    key: 'rhino',
    name: 'Rhino',
    icon: <PluginLogo src={logoRhino} name="Rhino" />,
    versions: ['6.0', '7.0', '8.0'],
    availableVersions: ['8.0'],
  },
  {
    key: 'unreal',
    name: 'Unreal Engine',
    icon: <PluginLogo src={logoUnreal} name="Unreal Engine" />,
    versions: ['5.5', '5.6', '5.7'],
    availableVersions: [],
  },
  {
    key: 'blender',
    name: 'Blender',
    icon: <PluginLogo src={logoBlender} name="Blender" />,
    versions: ['4.2', '4.3', '4.4', '4.5', '5.0', '5.1'],
    availableVersions: ['4.2', '4.3', '4.4', '4.5'],
  },
]

// 설치(다운로드) 파일: SketchUp은 rbz(API 패키징), Blender/Rhino는 정적 파일
const PLUGIN_DOWNLOADS: Partial<Record<PluginKey, { url: string; filename: string }>> = {
  sketchup: { url: '/downloads/Lumanova_v1.0.7.rbz', filename: 'Lumanova_v1.0.7.rbz' },
  blender: { url: '/downloads/lumanova_bridge.py', filename: 'lumanova_bridge.py' },
  rhino: { url: '/downloads/lumanova_bridge_rhino.py', filename: 'lumanova_bridge_rhino.py' },
}

function downloadPluginFiles(keys: PluginKey[]) {
  keys.forEach((key, i) => {
    const item = PLUGIN_DOWNLOADS[key]
    if (!item) return
    // 다중 다운로드: 브라우저가 연속 클릭을 무시하지 않도록 간격을 둔다
    setTimeout(() => {
      const a = document.createElement('a')
      a.href = item.url
      a.download = item.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    }, i * 600)
  })
}

function PluginLogo({ src, name }: { src: string; name: string }) {
  return <img src={src} alt={name} width={35} height={35} style={{ objectFit: 'contain' }} draggable={false} />
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

  const handleInstall = () => {
    persistPluginSelections(selections)
    // 버전 하나라도 체크된(그리고 설치 파일이 있는) 툴의 플러그인을 내려받는다
    const selectedKeys = pluginFamilies
      .filter((family) =>
        PLUGIN_DOWNLOADS[family.key]
        && family.availableVersions.some((version) => selections[`${family.key}:${version}`]))
      .map((family) => family.key)
    downloadPluginFiles(selectedKeys)
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

const TOOL_LABELS: Record<string, string> = {
  sketchup: 'SketchUp',
  blender: 'Blender',
  rhino: 'Rhino',
}

export function SettingsPage() {
  const saas = saasMode()
  const status = useUIStore((s) => s.sketchUpStatus)
  const bridgeTool = useUIStore((s) => s.bridgeTool)
  const desktopUpdate = useUIStore((s) => s.desktopUpdate)
  const [pluginsOpen, setPluginsOpen] = useState(false)
  const connectedToolLabel = bridgeTool ? (TOOL_LABELS[bridgeTool] ?? bridgeTool) : null

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

      <Section title="3D 툴 연동">
        <Row
          label="연결 상태"
          value={
            <span style={{ color: status === 'connected' ? '#4cd6a8' : '#ff7777' }}>
              {status === 'connected'
                ? `● 연결됨${connectedToolLabel ? ` — ${connectedToolLabel}` : ''}`
                : '○ 연결 안 됨'}
            </span>
          }
        />
        <Row label="지원 툴" value="SketchUp · Blender · Rhino" />
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#71717c', lineHeight: 1.6 }}>
          플러그인이 설치된 3D 툴을 실행하면 자동으로 연결됩니다 (SketchUp 9876 · Blender 9877 · Rhino 9878).
          여러 툴이 동시에 켜져 있으면 SketchUp이 우선 연결됩니다.
        </div>
      </Section>

      <Section title="플러그인">
        <PluginDownloadRow
          name="SketchUp"
          hint="SketchUp 2021~2025 지원 · 설치: 창(Window) → Extension Manager → Install Extension → 받은 rbz 선택 → SketchUp 재시작"
          href="/downloads/Lumanova_v1.0.7.rbz"
          label="SketchUp 다운로드"
        />
        <PluginDownloadRow
          name="Blender"
          hint="Blender 4.2~4.5 지원 · 설치: Edit → Preferences → Add-ons → Install from Disk → 받은 py 선택 → 체크 활성화"
          href="/downloads/lumanova_bridge.py"
          label="Blender 다운로드"
        />
        <PluginDownloadRow
          name="Rhino (실험적)"
          hint="Rhino 8 지원 · 실행: 명령줄에 ScriptEditor 입력 → 받은 py 열기 → 실행 (Rhino를 닫을 때까지 유지)"
          href="/downloads/lumanova_bridge_rhino.py"
          label="Rhino 다운로드"
        />
        <div className="mt-3 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid #22222a', paddingTop: 12 }}>
          {['SketchUp 2022~2025', 'Blender 4.2~4.5', 'Rhino 8'].map((n) => (
            <span key={n} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 10.5, background: '#122a28', color: '#35e5cf', border: '1px solid #1f5952' }}>
              {n} 지원
            </span>
          ))}
          {['3ds Max', 'Revit', 'Archicad', 'Unreal Engine'].map((n) => (
            <span key={n} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 10.5, background: '#1e1e26', color: '#686875', border: '1px solid #2a2a34' }}>
              {n} 준비 중
            </span>
          ))}
        </div>
      </Section>

      <ApiKeySection saas={saas} />

      <Section title="정보">
        <Row label="앱" value="Lumanova" />
        <Row label="현재 버전" value={APP_VERSION} />
        <Row
          label="업데이트"
          value={desktopUpdate ? (
            <a
              href={desktopUpdate.downloadUrl ?? '/docs'}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#00c9a7', fontWeight: 800, textDecoration: 'none' }}
            >
              {desktopUpdate.version} 사용 가능 →
            </a>
          ) : '최신 버전'}
        />
        <Row label="업데이트 채널" value="Stable" />
      </Section>

      {pluginsOpen && <InstallPluginsModal onClose={() => setPluginsOpen(false)} />}
    </div>
  )
}

function PluginDownloadRow({ name, hint, href, label }: { name: string; hint: string; href: string; label: string }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '7px 0' }}>
      <div style={{ paddingRight: 16 }}>
        <div style={{ color: '#e6e6ee', fontSize: 13, fontWeight: 600 }}>{name}</div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: '#71717c' }}>{hint}</div>
      </div>
      <a
        href={href}
        download
        className="flex items-center"
        style={{
          height: 36, padding: '0 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
          background: '#00c9a7', color: '#06251f', textDecoration: 'none', flexShrink: 0,
        }}
      >
        <Download size={14} className="mr-1.5" />
        {label}
      </a>
    </div>
  )
}

// API Keys: Gemini(렌더링) + xAI Grok(영상 생성)
// 개발자 모드에선 Gemini 필수, SaaS 모드에선 선택(본인 키 사용 시 크레딧 미차감)
function ApiKeySection({ saas }: { saas: boolean }) {
  return (
    <Section title="API Keys">
      {saas && (
        <div className="mb-3" style={{ fontSize: 11.5, color: '#71717c' }}>
          이미지 렌더링(Gemini)과 영상 생성(xAI Grok)은 본인 API 키가 필요합니다. 선택 키(OpenAI 등)를 저장하면 렌더 화면 MODEL 목록에 해당 모델이 추가됩니다.
        </div>
      )}
      <ApiKeyRow
        label="Gemini (이미지 렌더링 · 필수)"
        placeholder="AIza..."
        read={() => getStoredApiKey() ?? ''}
        write={setStoredApiKey}
        issueHref="https://aistudio.google.com/apikey"
        issueLabel="Google AI Studio에서 발급"
        issueSteps={[
          'Google AI Studio(aistudio.google.com/apikey)에 접속해 Google 계정으로 로그인',
          '"API 키 만들기(Create API key)" 버튼 클릭 — 프로젝트가 없으면 자동 생성됩니다',
          '생성된 AIza... 로 시작하는 키를 복사',
          '위 입력란에 붙여넣고 저장 — 무료 등급은 Nanobanana(Flash) 모델 기준이며, Nanobanana Pro(Gemini 3)는 Billing 결제 등록이 필요합니다',
        ]}
      />
      <div style={{ borderTop: '1px solid #22222a', margin: '14px 0' }} />
      <ApiKeyRow
        label="xAI Grok (이미지 → 영상 생성 · 필수)"
        placeholder="xai-..."
        read={() => getStoredXaiApiKey() ?? ''}
        write={setStoredXaiApiKey}
        issueHref="https://console.x.ai"
        issueLabel="xAI Console에서 발급"
        issueSteps={[
          'xAI Console(console.x.ai)에 접속해 계정 로그인(가입)',
          '좌측 "API Keys" 메뉴에서 "Create API key" 클릭',
          '생성된 xai-... 키를 복사 — 생성 직후 한 번만 표시되니 바로 복사하세요',
          'Billing 메뉴에서 결제 수단 등록 후 크레딧 충전 (영상 생성은 유료 — 해상도에 따라 약 초당 $0.05~0.07)',
          '위 입력란에 붙여넣고 저장',
        ]}
      />
      <div style={{ borderTop: '1px solid #22222a', margin: '14px 0' }} />
      <ApiKeyRow
        label="OpenAI (이미지 렌더링 · 선택 — 저장하면 GPT Image 모델 사용 가능)"
        placeholder="sk-..."
        read={() => getStoredOpenAIApiKey() ?? ''}
        write={setStoredOpenAIApiKey}
        issueHref="https://platform.openai.com/api-keys"
        issueLabel="OpenAI Platform에서 발급"
        issueSteps={[
          'OpenAI Platform(platform.openai.com/api-keys)에 접속해 로그인',
          '"Create new secret key" 클릭 → 생성된 sk-... 키를 바로 복사 (한 번만 표시)',
          'Billing에서 결제 수단 등록 (gpt-image-1은 유료 — 장당 약 $0.02~0.19)',
          'gpt-image-1이 403을 반환하면 Settings → Organization에서 조직 인증(Verify) 필요',
          '위 입력란에 붙여넣고 저장 → 렌더 화면 MODEL에 "GPT Image (OpenAI)"가 나타납니다',
        ]}
      />
      <div style={{ marginTop: 10, fontSize: 11.5, color: '#71717c' }}>
        키는 이 컴퓨터(브라우저)에만 저장되며 서버로 전송되지 않습니다.
      </div>
    </Section>
  )
}

function ApiKeyRow({
  label,
  placeholder,
  read,
  write,
  issueHref,
  issueLabel,
  issueSteps,
}: {
  label: string
  placeholder: string
  read: () => string
  write: (key: string) => void
  issueHref: string
  issueLabel: string
  issueSteps?: string[]
}) {
  const [apiKey, setApiKey] = useState(read)
  const [saved, setSaved] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)

  const handleSave = () => {
    write(apiKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div style={{ marginBottom: 6, fontSize: 12.5, fontWeight: 600, color: '#c8c8d0' }}>{label}</div>
      <div className="flex gap-2">
        <input
          type={revealed ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={placeholder}
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
      <div className="flex items-center gap-3" style={{ marginTop: 6, fontSize: 11.5, color: '#71717c' }}>
        <a href={issueHref} target="_blank" rel="noreferrer" style={{ color: '#00c9a7' }}>
          {issueLabel} ↗
        </a>
        {issueSteps && (
          <button
            onClick={() => setStepsOpen((v) => !v)}
            style={{ color: '#8a8a96', fontSize: 11.5 }}
          >
            발급 방법 {stepsOpen ? '▲' : '▼'}
          </button>
        )}
      </div>
      {issueSteps && stepsOpen && (
        <ol
          style={{
            margin: '8px 0 0', padding: '10px 14px 10px 30px', borderRadius: 8,
            background: '#101018', border: '1px solid #22222a',
            fontSize: 11.5, color: '#9a9aa6', lineHeight: 1.9, listStyle: 'decimal',
          }}
        >
          {issueSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
