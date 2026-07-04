import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Zap, Loader2, SlidersHorizontal, Download } from 'lucide-react'
import { useClassicStore, type ClassicModel, type ClassicSize } from '../../state/classicStore'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { selectScene, requestCapture, addScene, sendCamera } from '../../api/sketchupBridge'
import { generateAutoPrompt, buildLightingDescription } from '../../engine/autoPrompt'
import { renderMain } from '../../engine/adapters/mainRenderer'
import { EditOverlay } from '../panels/EditOverlay'

// ---------------------------------------------------------------------------
// 클래식 렌더 화면 — 레거시 루비 창(main_dialog.html) UI의 충실한 재현
// 디자인 수치는 레거시 main-base.css / main-render.css 원본 값 사용
// ---------------------------------------------------------------------------

// ── 레거시 디자인 토큰 (main-base.css에서 추출) ──────────────────────────────
const C = {
  bg: '#0a0a0a',
  sidebar: '#141414',
  border: '#333333',
  input: '#0a0a0a',
  panelBg: '#0d0d0d',
  panelLabel: '#1a1a1a',
  promptBg: '#111111',
  textarea: '#1a1a1a',
  accent: '#00c9a7', // 앱 공통 액센트 (틸) - 화면마다 색 튀지 않게 통일
  text: '#e0e0e0',
  dim: '#666666',
  label: '#666666',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </span>
  )
}

function Segmented({ options, value, onChange }: {
  options: { v: string; l: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex" style={{ background: C.input, borderRadius: 6, padding: 3, border: `1px solid ${C.border}` }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className="flex-1 transition-colors"
          style={{
            padding: '5px 4px', fontSize: 11, fontWeight: 500, borderRadius: 4,
            background: value === o.v ? '#333333' : 'transparent',
            color: value === o.v ? '#ffffff' : C.dim,
          }}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

function CamKey({ k, title, onClick, active }: { k: string; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 22, height: 22, fontSize: 9, fontWeight: 600, borderRadius: 4,
        background: active ? C.accent : '#1e1e1e', color: active ? '#0a0a14' : '#999',
        border: `1px solid ${C.border}`,
      }}
    >
      {k}
    </button>
  )
}

declare global {
  interface Window {
    vizmakerNative?: { getSketchUpSourceId: () => Promise<string | null>; setSketchUpTitleHint: (t: string) => void }
  }
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────

export function RenderClassicPage() {
  const s = useClassicStore()
  const scenes = useUIStore((st) => st.sketchUpScenes)
  const status = useUIStore((st) => st.sketchUpStatus)
  const nodes = useGraphStore((st) => st.nodes)
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<{ src: 'prompt' | 'negative'; res: 'prompt' | 'negative' }>({ src: 'prompt', res: 'prompt' })
  const abortRef = useRef<AbortController | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const viewport = useUIStore((st) => st.sketchUpViewport)

  // SketchUp 미러 이미지 (브릿지가 그래프의 sketchup 소스 노드에 주입)
  const liveNode = nodes.find((n) => n.type === 'SOURCE' && 'origin' in n.params && n.params.origin === 'sketchup')
  const liveImage = liveNode?.result?.image ?? (liveNode && 'image' in liveNode.params ? (liveNode.params as { image: string }).image : null)
  const sourceImage = s.previewOverride ?? (s.mirror ? (liveImage ?? s.frozenSource) : (s.frozenSource ?? liveImage))

  // ── 실시간 미러링 (Electron: SketchUp 창을 30fps 스트림으로) ──
  useEffect(() => {
    if (!window.vizmakerNative || !s.mirror || status !== 'connected') {
      setLiveStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return null })
      return
    }
    // 모델 창 제목을 알기 전에는 스트림을 시작하지 않는다 (다른 창 오탐 방지)
    const hint = viewport?.title
    if (!hint) {
      setLiveStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return null })
      return
    }
    let cancelled = false
    window.vizmakerNative.setSketchUpTitleHint(hint)
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        setLiveStream(stream)
      })
      .catch(() => {
        // 화면 기록 권한 없음 등 - 폴링 미러로 폴백
        setLiveStream(null)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.mirror, status, viewport?.title])

  useEffect(() => {
    if (videoRef.current && liveStream) videoRef.current.srcObject = liveStream
  }, [liveStream])

  // 주의: 스트림 프레임(SketchUp 창 캡처)에는 툴바/패널 UI가 포함되므로
  // AI 입력으로는 절대 쓰지 않는다. 생성 입력은 항상 브릿지의 클린 뷰포트 캡처.

  // 새 소스 이미지 도착: 씬 프리뷰 캐시에 저장하고 즉시표시 상태 해제
  useEffect(() => {
    if (!liveImage) return
    const st = useClassicStore.getState()
    const activeScene = useUIStore.getState().sketchUpScenes.find((sc) => sc.active)?.name
    const key = st.lastSceneClicked ?? activeScene
    st.set({
      sourceLoading: false,
      previewOverride: null,
      lastSceneClicked: null,
      ...(key ? { scenePreviews: { ...st.scenePreviews, [key]: liveImage } } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveImage])

  // 로딩 5초 안전장치 (이미지가 안 와도 오버레이가 영원히 남지 않게)
  useEffect(() => {
    if (!s.sourceLoading) return
    const t = setTimeout(() => useClassicStore.getState().set({ sourceLoading: false }), 5000)
    return () => clearTimeout(t)
  }, [s.sourceLoading])

  // ── 키보드 단축키 (레거시: WASD 이동 | QE 높이 | ZX 회전) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return
      const map: Record<string, [Parameters<typeof sendCamera>[0], string]> = {
        w: ['move', 'forward'], a: ['move', 'left'], s: ['move', 'back'], d: ['move', 'right'],
        q: ['move', 'up'], e: ['move', 'down'], z: ['rotate', 'left'], x: ['rotate', 'right'],
      }
      const m = map[e.key.toLowerCase()]
      if (m) sendCamera(m[0], m[1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── 동작 ──
  const doConvert = useCallback(async () => {
    s.set({ statusText: 'Convert 중... (고품질 캡처)' })
    await requestCapture(s.size)
    // 새 캡처가 폴링으로 들어온 뒤 고정
    setTimeout(() => {
      const st = useGraphStore.getState()
      const node = st.nodes.find((n) => n.type === 'SOURCE' && 'origin' in n.params && n.params.origin === 'sketchup')
      const img = node?.result?.image ?? null
      useClassicStore.getState().set({
        frozenSource: img,
        statusText: img ? 'Convert 완료 - Auto로 프롬프트 생성하세요' : 'Convert 실패 - SketchUp 연결 확인',
      })
    }, 1600)
  }, [s])

  const doAuto = useCallback(async () => {
    if (s.autoLoading) { abortRef.current?.abort(); return }
    // 생성 입력은 클린 뷰포트 캡처만 (스트림 화면엔 SketchUp UI가 섞임)
    const autoInput = s.frozenSource ?? liveImage
    if (!autoInput) { s.set({ statusText: '먼저 Convert 하거나 이미지를 불러오세요' }); return }
    const controller = new AbortController()
    abortRef.current = controller
    s.set({ autoLoading: true, statusText: 'Auto 프롬프트 생성 중...' })
    const watchdog = setTimeout(() => controller.abort(), 120_000)
    try {
      const r = await generateAutoPrompt({
        image: autoInput,
        timePreset: s.timePreset,
        lightsOn: s.lightsOn,
        signal: controller.signal,
      })
      useClassicStore.getState().set({
        sourcePrompt: r.prompt, sourceNegative: r.negativePrompt,
        statusText: 'Auto 프롬프트 생성 완료 - ⚡로 렌더링하세요',
      })
    } catch (err) {
      if (!controller.signal.aborted) {
        useClassicStore.getState().set({ statusText: `프롬프트 생성 실패: ${err instanceof Error ? err.message : err}` })
      } else {
        useClassicStore.getState().set({ statusText: 'Auto 프롬프트 취소됨' })
      }
    } finally {
      clearTimeout(watchdog)
      useClassicStore.getState().set({ autoLoading: false })
    }
  }, [s, sourceImage, liveImage])

  const doRender = useCallback(async (which: 'src' | 'res') => {
    const st = useClassicStore.getState()
    // 생성 입력은 항상 클린 뷰포트 캡처 (Convert 고정본 > 브릿지 미러 최신본)
    const input = which === 'src' ? (st.frozenSource ?? liveImage) : (st.resultImage ?? sourceImage)
    const prompt = which === 'src' ? st.sourcePrompt : st.resultPrompt
    const negative = which === 'src' ? st.sourceNegative : st.resultNegative
    if (!input) { st.set({ statusText: '소스 이미지가 없습니다' }); return }
    if (!prompt.trim()) { st.set({ statusText: '프롬프트를 입력하거나 Auto로 생성하세요' }); return }

    const lighting = buildLightingDescription(st.timePreset, st.lightsOn)
    st.set({ rendering: true, statusText: '렌더링 중... (20~60초)' })
    try {
      const result = await renderMain({
        engine: st.model === 'gemini-3-pro-image' ? 'experimental-interior' : 'main',
        image: input,
        prompt: `${prompt}\n\n[LIGHTING]\n${lighting}`,
        systemPrompt: '',
        negativePrompt: negative,
        seed: null,
        resolution: st.size,
      })
      useClassicStore.getState().set({ resultImage: result.image, rendering: false, statusText: '렌더링 완료' })
    } catch (err) {
      useClassicStore.getState().set({
        rendering: false,
        statusText: `렌더링 실패: ${err instanceof Error ? err.message : err}`,
      })
    }
  }, [sourceImage, liveImage])

  const doExport = useCallback(() => {
    const img = useClassicStore.getState().resultImage
    if (!img) return
    const a = document.createElement('a')
    a.href = img
    a.download = `vizmaker-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`
    a.click()
  }, [])

  const onUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => useClassicStore.getState().set({ frozenSource: String(reader.result), mirror: false, statusText: '이미지 로드됨' })
    reader.readAsDataURL(f)
    e.target.value = ''
  }, [])

  // ── 레이아웃 ──
  return (
    <div className="flex flex-1 overflow-hidden" style={{ background: C.bg, color: C.text, fontSize: 12 }}>
      {/* ══ 좌측 컨트롤 사이드바 (레거시 .sidebar 200px) ══ */}
      <aside className="flex flex-col" style={{ width: 200, minWidth: 200, background: C.sidebar, borderRight: `1px solid ${C.border}` }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: '#fff' }}>
          VizMaker
        </div>

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto" style={{ padding: '10px 12px', minHeight: 0 }}>
          <div className="flex flex-col gap-1">
            <SectionLabel>Time</SectionLabel>
            <Segmented
              options={[{ v: 'day', l: 'Day' }, { v: 'evening', l: 'Eve' }, { v: 'night', l: 'Night' }]}
              value={s.timePreset}
              onChange={(v) => s.set({ timePreset: v as typeof s.timePreset })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Lights</SectionLabel>
            <Segmented
              options={[{ v: 'on', l: 'On' }, { v: 'off', l: 'Off' }]}
              value={s.lightsOn ? 'on' : 'off'}
              onChange={(v) => s.set({ lightsOn: v === 'on' })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Model</SectionLabel>
            <select
              value={s.model}
              onChange={(e) => s.set({ model: e.target.value as ClassicModel })}
              style={{
                width: '100%', padding: '6px 10px', background: C.input,
                border: `1px solid ${C.border}`, borderRadius: 6, color: '#ccc', fontSize: 11,
              }}
            >
              <option value="gemini-2.5-flash-image">Nanobanana (Flash 2.5)</option>
              <option value="gemini-3-pro-image">Nanobanana Pro (Gemini 3)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Size</SectionLabel>
            <Segmented
              options={[{ v: '1024', l: '속도' }, { v: '1536', l: '밸런스' }, { v: '1920', l: '고품질' }]}
              value={s.size}
              onChange={(v) => s.set({ size: v as ClassicSize })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Camera</SectionLabel>
            <div className="flex gap-1.5">
              <button
                onClick={() => s.set({ mirror: !s.mirror, statusText: s.mirror ? '미러링 중지' : '미러링 시작' })}
                className="flex-1"
                style={{
                  height: 27, borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: s.mirror ? C.accent : '#1e1e1e',
                  color: s.mirror ? '#0a0a14' : '#999', border: `1px solid ${s.mirror ? C.accent : C.border}`,
                }}
              >
                {s.mirror ? 'Mirror ON' : 'Mirror'}
              </button>
              <button
                title="2점 투시 자동 보정"
                onClick={() => { s.set({ sourceLoading: true }); sendCamera('two_point') }}
                style={{ width: 27, height: 27, borderRadius: 6, background: '#1e1e1e', border: `1px solid ${C.border}`, color: '#999', fontSize: 12 }}
              >
                ⊞
              </button>
            </div>

            {/* WASD / QE / ZX */}
            <div className="mt-1 flex items-start justify-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <CamKey k="W" title="전진 (W)" onClick={() => sendCamera('move', 'forward')} />
                <div className="flex gap-1">
                  <CamKey k="A" title="왼쪽 (A)" onClick={() => sendCamera('move', 'left')} />
                  <CamKey k="S" title="후진 (S)" onClick={() => sendCamera('move', 'back')} />
                  <CamKey k="D" title="오른쪽 (D)" onClick={() => sendCamera('move', 'right')} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <CamKey k="Q" title="위로 (Q)" onClick={() => sendCamera('move', 'up')} />
                <CamKey k="E" title="아래로 (E)" onClick={() => sendCamera('move', 'down')} />
              </div>
              <div className="flex flex-col gap-1">
                <CamKey k="Z" title="좌회전 (Z)" onClick={() => sendCamera('rotate', 'left')} />
                <CamKey k="X" title="우회전 (X)" onClick={() => sendCamera('rotate', 'right')} />
              </div>
            </div>
            <div className="text-center" style={{ fontSize: 9, color: '#555' }}>
              WASD 이동 | QE 높이 | ZX 회전
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Height</SectionLabel>
            <Segmented
              options={[{ v: 'standing', l: '서기' }, { v: 'seated', l: '앉기' }, { v: 'low_angle', l: '낮음' }]}
              value=""
              onChange={(v) => { s.set({ sourceLoading: true }); sendCamera('height', v) }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>FOV</SectionLabel>
            <Segmented
              options={[{ v: 'wide', l: '광각' }, { v: 'standard', l: '표준' }, { v: 'telephoto', l: '망원' }]}
              value=""
              onChange={(v) => { s.set({ sourceLoading: true }); sendCamera('fov', v) }}
            />
          </div>
        </div>

        {/* 액션: Convert 버튼 + Edit/Export 아이콘 한 줄 통합 */}
        <div className="flex gap-1.5" style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={doConvert}
            className="flex-1"
            style={{ height: 32, borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#222', color: '#ddd', border: `1px solid ${C.border}` }}
          >
            Convert
          </button>
          <button
            onClick={() => setEditOpen(true)}
            disabled={!s.resultImage}
            title="이미지 보정 (밝기/대비/채도 등)"
            className="flex items-center justify-center"
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: s.resultImage ? '#222' : '#1a1a1a',
              color: s.resultImage ? '#ddd' : '#444',
              border: `1px solid ${s.resultImage ? C.border : '#2a2a2a'}`,
            }}
          >
            <SlidersHorizontal size={14} />
          </button>
          <button
            onClick={doExport}
            disabled={!s.resultImage}
            title="결과 이미지 저장"
            className="flex items-center justify-center"
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: s.resultImage ? '#222' : '#1a1a1a',
              color: s.resultImage ? '#ddd' : '#444',
              border: `1px solid ${s.resultImage ? C.border : '#2a2a2a'}`,
            }}
          >
            <Download size={14} />
          </button>
        </div>

        {/* 연결 상태 (레거시 .sidebar-footer) */}
        <div className="flex items-center gap-2" style={{ padding: '6px 16px', borderTop: `1px solid ${C.border}` }}>
          <span style={{
            width: 8, height: 8, borderRadius: 4,
            background: status === 'connected' ? '#4caf50' : '#f44336',
          }} />
          <span style={{ fontSize: 11, color: '#888' }}>
            {status === 'connected' ? 'Connected' : 'Offline'}
          </span>
        </div>
      </aside>

      {/* ══ 중앙: 씬 탭 + SOURCE/RESULT 패널 ══ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 씬 탭 */}
        <div className="flex items-center gap-1 overflow-x-auto" style={{ padding: '6px 8px 0' }}>
          {scenes.map((sc) => (
            <button
              key={sc.name}
              onClick={() => {
                const cached = s.scenePreviews[sc.name] ?? null
                s.set({
                  previewOverride: cached,      // 캐시가 있으면 즉시 그 씬 이미지 표시
                  sourceLoading: !cached,       // 캐시 없을 때만 스피너
                  lastSceneClicked: sc.name,
                })
                selectScene(sc.name)
              }}
              style={{
                padding: '7px 16px', fontSize: 11, whiteSpace: 'nowrap',
                borderRadius: '6px 6px 0 0',
                background: sc.active ? '#2a2a2a' : '#161616',
                color: sc.active ? '#fff' : '#777',
                border: `1px solid ${C.border}`, borderBottom: 'none',
              }}
            >
              {sc.name}
            </button>
          ))}
          <button
            title="현재 뷰를 씬으로 추가"
            onClick={() => addScene()}
            style={{
              padding: '7px 12px', fontSize: 12, borderRadius: '6px 6px 0 0',
              background: '#161616', color: '#777', border: `1px solid ${C.border}`, borderBottom: 'none',
            }}
          >
            +
          </button>
        </div>

        {/* 패널 영역 */}
        <div className="flex flex-1 gap-px overflow-hidden" style={{ background: C.border, borderTop: `1px solid ${C.border}` }}>
          {/* SOURCE */}
          <Panel
            label="SOURCE"
            active
            image={sourceImage}
            emptyText="SketchUp 연결 대기 중... (또는 이미지 버튼으로 불러오기)"
            loading={s.sourceLoading && !liveStream}
            loadingText="SketchUp 화면 불러오는 중..."
            video={liveStream ? videoRef : null}
            videoViewport={viewport}
            tab={tab.src}
            onTab={(t) => setTab((p) => ({ ...p, src: t }))}
            prompt={s.sourcePrompt}
            negative={s.sourceNegative}
            onPrompt={(v) => s.set({ sourcePrompt: v })}
            onNegative={(v) => s.set({ sourceNegative: v })}
            promptPlaceholder="직접 입력하거나 Auto 버튼으로 자동 생성하세요."
            headerRight={
              <button
                onClick={doAuto}
                className="flex items-center gap-1"
                style={{
                  padding: '3px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  background: s.autoLoading ? '#ff4466' : '#7c5cff', color: '#fff',
                }}
              >
                {s.autoLoading ? <><Loader2 size={11} className="animate-spin" /> 취소</> : 'Auto'}
              </button>
            }
            actions={
              <>
                <PanelAction title="이미지 불러오기" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={16} />
                </PanelAction>
                <PanelAction title="렌더링 실행" onClick={() => doRender('src')} disabled={s.rendering}>
                  {s.rendering ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                </PanelAction>
              </>
            }
          />

          {/* RESULT 1 */}
          <Panel
            label="RESULT 1"
            image={s.resultImage}
            emptyText={s.rendering ? '렌더링 중...' : 'Ready'}
            loading={s.rendering}
            tab={tab.res}
            onTab={(t) => setTab((p) => ({ ...p, res: t }))}
            prompt={s.resultPrompt}
            negative={s.resultNegative}
            onPrompt={(v) => s.set({ resultPrompt: v })}
            onNegative={(v) => s.set({ resultNegative: v })}
            promptPlaceholder="렌더링 완료 후 2차 생성용 프롬프트를 입력하세요."
            actions={
              <PanelAction title="2차 생성 (결과 이미지 기반)" onClick={() => doRender('res')} disabled={s.rendering || !s.resultImage}>
                {s.rendering ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              </PanelAction>
            }
          />
        </div>

        {/* 하단 상태바 */}
        <div className="flex items-center" style={{ height: 26, padding: '0 12px', borderTop: `1px solid ${C.border}`, fontSize: 11, color: '#777' }}>
          {s.statusText}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />

      {editOpen && s.resultImage && (
        <EditOverlay
          image={s.resultImage}
          onApply={(img) => {
            s.set({ resultImage: img, statusText: '보정 적용됨' })
            setEditOpen(false)
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}

// ── 패널 컴포넌트 (레거시 .image-panel) ──────────────────────────────────────

function PanelAction({ children, title, onClick, disabled }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center"
      style={{
        width: 40, height: 40, borderRadius: 8,
        background: '#1e1e1e', border: `1px solid ${C.border}`,
        color: disabled ? '#444' : '#ccc',
      }}
    >
      {children}
    </button>
  )
}

function Panel({ label, active, image, emptyText, loading, loadingText, video, videoViewport, tab, onTab, prompt, negative, onPrompt, onNegative, promptPlaceholder, headerRight, actions }: {
  label: string
  active?: boolean
  image: string | null
  emptyText: string
  loading?: boolean
  loadingText?: string
  video?: React.RefObject<HTMLVideoElement | null> | null
  videoViewport?: { w: number; h: number; sf: number } | null
  tab: 'prompt' | 'negative'
  onTab: (t: 'prompt' | 'negative') => void
  prompt: string
  negative: string
  onPrompt: (v: string) => void
  onNegative: (v: string) => void
  promptPlaceholder: string
  headerRight?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: '#111111' }}>
      {/* 헤더 (SOURCE 활성 = 파랑) */}
      <div
        className="flex items-center justify-between"
        style={{
          height: 24, padding: '0 12px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
          background: active ? C.accent : C.panelLabel,
          color: active ? '#0a0a14' : '#555',
        }}
      >
        <span>{label}</span>
      </div>

      {/* 이미지 영역 (16:9) */}
      <div className="relative flex items-center justify-center" style={{ width: '100%', aspectRatio: '16 / 9', background: C.panelBg, minHeight: 0 }}>
        {video ? (
          <CroppedVideo videoRef={video} viewport={videoViewport ?? null} />
        ) : image ? (
          <img src={image} alt="" className="h-full w-full object-contain" draggable={false} />
        ) : (
          <span style={{ color: '#444', fontSize: 12 }}>{emptyText}</span>
        )}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: 'rgba(10,10,10,0.75)' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: C.accent }} />
            <span style={{ fontSize: 11, color: '#aaa' }}>{loadingText ?? '렌더링 중... (20~60초)'}</span>
          </div>
        )}
      </div>

      {/* Prompt / Negative 탭 */}
      <div className="flex items-center" style={{ background: '#0a0a0a', borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => onTab('prompt')}
          className="flex-1"
          style={{
            padding: '8px 0', fontSize: 11, color: tab === 'prompt' ? '#fff' : '#666',
            borderBottom: tab === 'prompt' ? `2px solid ${C.accent}` : '2px solid transparent',
          }}
        >
          Prompt
        </button>
        <button
          onClick={() => onTab('negative')}
          className="flex-1"
          style={{
            padding: '8px 0', fontSize: 11, color: tab === 'negative' ? '#ff5555' : '#884444',
            borderBottom: tab === 'negative' ? '2px solid #ff5555' : '2px solid transparent',
          }}
        >
          Negative
        </button>
        {headerRight && <div style={{ padding: '0 8px' }}>{headerRight}</div>}
      </div>

      {/* 텍스트영역 + 액션버튼 */}
      <div className="flex flex-1 gap-2 overflow-hidden" style={{ padding: 10, background: C.promptBg, minHeight: 90 }}>
        <textarea
          value={tab === 'prompt' ? prompt : negative}
          onChange={(e) => (tab === 'prompt' ? onPrompt(e.target.value) : onNegative(e.target.value))}
          placeholder={tab === 'prompt' ? promptPlaceholder : '네거티브 프롬프트 (Auto가 자동 생성)'}
          className="flex-1 resize-none outline-none"
          style={{
            background: C.textarea, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '10px 12px', fontSize: 12, color: tab === 'negative' ? '#ff9999' : '#ddd', lineHeight: 1.5,
          }}
        />
        {actions && <div className="flex flex-col gap-2">{actions}</div>}
      </div>
    </div>
  )
}


// SketchUp 창 스트림에서 3D 뷰포트 영역만 잘라 표시 (메뉴/툴바 제거)
function CroppedVideo({ videoRef, viewport }: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  viewport: { w: number; h: number; sf: number } | null
}) {
  const [dims, setDims] = useState<{ W: number; H: number } | null>(null)

  // 크롭 계산: 뷰포트(물리 픽셀) 기준, 좌측 정렬 + 하단 상태바 제외
  let crop: { w: number; h: number; top: number } | null = null
  if (dims && viewport && viewport.w <= dims.W && viewport.h < dims.H) {
    const w = viewport.w
    const h = viewport.h
    // 하단 상태바(측정 박스 포함) 실측 약 31pt - 살짝 넉넉히 잘라 흰 띠 제거
    const statusBar = Math.round(31 * viewport.sf)
    const top = Math.max(0, dims.H - h - statusBar)
    // 상태바를 넉넉히 자른 만큼 표시 높이도 보정
    crop = { w, h: Math.min(h, dims.H - top - statusBar), top }
  }

  return (
    <div
      className="relative overflow-hidden"
      style={crop ? { width: '100%', height: '100%' } : { width: '100%', height: '100%' }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onLoadedMetadata={(e) => setDims({ W: e.currentTarget.videoWidth, H: e.currentTarget.videoHeight })}
        className={crop ? 'absolute' : 'h-full w-full object-contain'}
        style={crop && dims ? {
          width: `${(dims.W / crop.w) * 100}%`,
          maxWidth: 'none',
          left: 0,
          top: `${-(crop.top / crop.h) * 100}%`,
        } : undefined}
      />
    </div>
  )
}
