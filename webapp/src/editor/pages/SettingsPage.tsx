import { useState } from 'react'
import { getStoredApiKey, setStoredApiKey } from '../../engine/geminiClient'

/**
 * Settings 페이지 — API Key 관리.
 * .env(VITE_GEMINI_API_KEY)가 없어도 앱 안에서 키를 넣을 수 있어야
 * Electron 배포본이 성립한다 (BRIEFING v2 §7 로드맵 4단계 전제).
 */
export function SettingsPage() {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey() ?? '')
  const [saved, setSaved] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const handleSave = () => {
    setStoredApiKey(apiKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: '#111118' }}>
      <h1 style={{ color: '#ffffff', fontSize: 18, fontWeight: 600 }}>Settings</h1>

      <section className="mt-6 max-w-xl">
        <h2 style={{ color: '#cccccc', fontSize: 14, fontWeight: 600 }}>
          Google Gemini API Key
        </h2>
        <p className="mt-1" style={{ color: '#888888', fontSize: 12, lineHeight: 1.6 }}>
          이미지 렌더링(Nanobanana)과 프롬프트 생성에 사용됩니다. 키는 이 컴퓨터에만
          저장되며 외부로 전송되지 않습니다.{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#00c9a7' }}
          >
            Google AI Studio에서 무료 발급
          </a>
        </p>

        <div className="mt-3 flex gap-2">
          <input
            type={revealed ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="flex-1 rounded px-3 py-2 outline-none"
            style={{
              backgroundColor: '#1a1a24',
              border: '1px solid #333344',
              color: '#ffffff',
              fontSize: 13,
            }}
          />
          <button
            onClick={() => setRevealed((v) => !v)}
            className="rounded px-3 py-2"
            style={{
              backgroundColor: '#1a1a24',
              border: '1px solid #333344',
              color: '#888888',
              fontSize: 12,
            }}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={handleSave}
            className="rounded px-4 py-2 font-semibold"
            style={{
              backgroundColor: saved ? '#00c9a7' : '#00b398',
              color: '#0a0a14',
              fontSize: 13,
            }}
          >
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>

        <p className="mt-2" style={{ color: '#666666', fontSize: 11 }}>
          키가 비어 있으면 mock 모드로 동작합니다 (실제 AI 호출 없음).
        </p>
      </section>
    </div>
  )
}
