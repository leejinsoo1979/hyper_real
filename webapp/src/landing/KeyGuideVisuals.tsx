// ---------------------------------------------------------------------------
// API 키 발급 매뉴얼용 단계별 일러스트 (실제 발급 화면을 HTML로 재현)
// 실스크린샷 대신 재현 목업을 쓰는 이유: 개인정보(계정/키/프로젝트) 노출 0,
// 어느 해상도에서도 선명, 발급 화면이 바뀌면 코드로 즉시 수정 가능.
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react'
import { TEAL } from './shared'

// ── 공통 빌딩 블록 ──────────────────────────────────────────────────────────

/** 미니 브라우저 창 프레임 (주소창 + 본문) */
function Browser({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div style={{ borderRadius: 10, border: '1px solid #2a2a36', background: '#0d0d13', overflow: 'hidden' }}>
      <div className="flex items-center gap-2" style={{ padding: '7px 10px', background: '#16161e', borderBottom: '1px solid #23232e' }}>
        <span className="flex gap-1.5">
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <span key={c} style={{ width: 8, height: 8, borderRadius: 999, background: c, display: 'inline-block' }} />
          ))}
        </span>
        <span className="flex-1 truncate" style={{ padding: '3px 10px', borderRadius: 6, background: '#0b0b10', border: '1px solid #23232e', fontSize: 10.5, color: '#8a8a96' }}>
          {url}
        </span>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  )
}

/** 단계 카드: 번호 + 설명 + 목업 */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className="flex items-center justify-center"
          style={{ width: 20, height: 20, borderRadius: 999, background: TEAL, color: '#06251f', fontSize: 11.5, fontWeight: 800, flexShrink: 0 }}
        >
          {n}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#d8d8e0' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

/** 클릭 대상 강조 버튼 (teal 점선 링 + "클릭" 라벨) */
function ClickTarget({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span className="relative inline-flex" style={{ padding: 4 }}>
      <span
        className="absolute inset-0"
        style={{ border: `2px dashed ${TEAL}`, borderRadius: 10, pointerEvents: 'none' }}
      />
      <span
        className="absolute"
        style={{ top: -9, right: -6, padding: '1px 7px', borderRadius: 999, background: TEAL, color: '#06251f', fontSize: 9, fontWeight: 800 }}
      >
        클릭
      </span>
      <span
        style={{
          padding: '7px 14px', borderRadius: 7, fontSize: 11.5, fontWeight: 700,
          background: dark ? '#23232e' : '#e8eaf0', color: dark ? '#e8e8ee' : '#1a1c22',
        }}
      >
        {children}
      </span>
    </span>
  )
}

/** 발급된 키 표시 + 복사 버튼 목업 */
function KeyPill({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2" style={{ padding: '8px 10px', borderRadius: 8, background: '#0b0b10', border: '1px solid #2a2a36' }}>
      <code style={{ fontSize: 11.5, color: '#7df0dd', letterSpacing: 0.4 }}>{value}</code>
      <span style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: TEAL, color: '#06251f', fontSize: 10.5, fontWeight: 800 }}>
        복사
      </span>
    </div>
  )
}

/** 우리 앱 Settings 입력란 목업 (마지막 공통 단계) */
function AppSettingsStep({ n, placeholder, label }: { n: number; placeholder: string; label: string }) {
  return (
    <Step n={n} title="앱에 등록">
      <Browser url="Lumanova → Settings → API Keys">
        <div style={{ fontSize: 11, fontWeight: 700, color: '#d8d8e0', marginBottom: 6 }}>{label}</div>
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate" style={{ padding: '7px 10px', borderRadius: 7, background: '#0b0b10', border: '1px solid #2a2a36', fontSize: 11, color: '#6a6a76' }}>
            {placeholder} ← 복사한 키 붙여넣기
          </span>
          <ClickTarget dark>저장</ClickTarget>
        </div>
      </Browser>
    </Step>
  )
}

const GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: 14,
  marginTop: 14,
}

// ── Gemini (Google AI Studio) ───────────────────────────────────────────────

export function GeminiKeySteps() {
  return (
    <div style={GRID}>
      <Step n={1} title="AI Studio 접속 · 로그인">
        <Browser url="aistudio.google.com/apikey">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 13, fontWeight: 800, color: '#e8e8ee' }}>Google AI Studio</span>
            <span style={{ padding: '5px 12px', borderRadius: 7, background: '#1a73e8', color: '#fff', fontSize: 10.5, fontWeight: 700 }}>
              Google 계정으로 로그인
            </span>
          </div>
          <div style={{ marginTop: 10, fontSize: 10.5, color: '#6a6a76' }}>
            로그인하면 API 키 페이지로 이동합니다
          </div>
        </Browser>
      </Step>
      <Step n={2} title='"API 키 만들기" 클릭'>
        <Browser url="aistudio.google.com/apikey">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#e8e8ee' }}>API 키</span>
            <ClickTarget dark>🔑 API 키 만들기</ClickTarget>
          </div>
          <div style={{ marginTop: 10, fontSize: 10.5, color: '#6a6a76' }}>
            프로젝트가 없으면 자동으로 생성됩니다
          </div>
        </Browser>
      </Step>
      <Step n={3} title="생성된 키 복사">
        <Browser url="aistudio.google.com/apikey">
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d8d8e0', marginBottom: 6 }}>API 키가 생성되었습니다</div>
          <KeyPill value="AIzaSy••••••••••••••••••••••••" />
          <div style={{ marginTop: 8, fontSize: 10.5, color: '#6a6a76' }}>
            AIza로 시작하는 39자 키입니다
          </div>
        </Browser>
      </Step>
      <AppSettingsStep n={4} placeholder="AIza..." label="Gemini (이미지 렌더링 · 필수)" />
    </div>
  )
}

// ── xAI Grok ────────────────────────────────────────────────────────────────

export function XaiKeySteps() {
  return (
    <div style={GRID}>
      <Step n={1} title="xAI Console 가입 · 로그인">
        <Browser url="console.x.ai">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 13, fontWeight: 800, color: '#e8e8ee' }}>xAI Console</span>
            <span style={{ padding: '5px 12px', borderRadius: 7, background: '#fff', color: '#111', fontSize: 10.5, fontWeight: 700 }}>
              Sign in
            </span>
          </div>
        </Browser>
      </Step>
      <Step n={2} title="API Keys → Create API key">
        <Browser url="console.x.ai">
          <div className="flex gap-3">
            <div style={{ fontSize: 10.5, color: '#8a8a96', lineHeight: 2 }}>
              <div>Overview</div>
              <div style={{ color: TEAL, fontWeight: 700 }}>API Keys ◀</div>
              <div>Billing</div>
            </div>
            <div className="flex flex-1 items-start justify-end">
              <ClickTarget dark>Create API key</ClickTarget>
            </div>
          </div>
        </Browser>
      </Step>
      <Step n={3} title="키 복사 (한 번만 표시!)">
        <Browser url="console.x.ai">
          <KeyPill value="xai-••••••••••••••••••••••••••" />
          <div style={{ marginTop: 8, fontSize: 10.5, color: '#f0ad4e' }}>
            ⚠ 생성 직후 한 번만 표시됩니다 — 바로 복사하세요
          </div>
        </Browser>
      </Step>
      <Step n={4} title="Billing 크레딧 충전">
        <Browser url="console.x.ai/billing">
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d8d8e0' }}>Billing</div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: '#6a6a76', lineHeight: 1.6 }}>
            결제 수단 등록 후 크레딧 충전.<br />영상 생성은 유료 (해상도별 약 초당 $0.05~0.07)
          </div>
        </Browser>
      </Step>
      <AppSettingsStep n={5} placeholder="xai-..." label="xAI Grok (이미지 → 영상 생성 · 필수)" />
    </div>
  )
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

export function OpenAIKeySteps() {
  return (
    <div style={GRID}>
      <Step n={1} title="OpenAI Platform 로그인">
        <Browser url="platform.openai.com/api-keys">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 13, fontWeight: 800, color: '#e8e8ee' }}>OpenAI Platform</span>
            <span style={{ padding: '5px 12px', borderRadius: 7, background: '#fff', color: '#111', fontSize: 10.5, fontWeight: 700 }}>
              Log in
            </span>
          </div>
        </Browser>
      </Step>
      <Step n={2} title="Create new secret key">
        <Browser url="platform.openai.com/api-keys">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, fontWeight: 800, color: '#e8e8ee' }}>API keys</span>
            <ClickTarget dark>+ Create new secret key</ClickTarget>
          </div>
        </Browser>
      </Step>
      <Step n={3} title="키 복사 (한 번만 표시!)">
        <Browser url="platform.openai.com/api-keys">
          <KeyPill value="sk-••••••••••••••••••••••••••••" />
          <div style={{ marginTop: 8, fontSize: 10.5, color: '#f0ad4e' }}>
            ⚠ 생성 직후 한 번만 표시됩니다 — 바로 복사하세요
          </div>
        </Browser>
      </Step>
      <Step n={4} title="Billing · 조직 인증">
        <Browser url="platform.openai.com/settings">
          <div style={{ fontSize: 10.5, color: '#6a6a76', lineHeight: 1.7 }}>
            Billing에서 결제 수단 등록 (gpt-image-1은 유료 · 장당 약 $0.02~0.19).<br />
            403 오류가 나면 Settings → Organization에서 조직 인증(Verify)을 진행하세요.
          </div>
        </Browser>
      </Step>
      <AppSettingsStep n={5} placeholder="sk-..." label="OpenAI (선택 — 저장 시 GPT Image 모델 추가)" />
    </div>
  )
}
