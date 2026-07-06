// POST /api/auto-prompt — 씬 분석 자동 프롬프트 (텍스트 모델, 1크레딧)
import { cors, verifyUser, spendCredits, getBalance, logRender, geminiText, COSTS } from './_lumanova.js'

// 정책(2026-07-06): 사용자 개별 키로만 호출 — 서버 키 사용 비활성화 (render.js와 동일)
const SERVER_RENDERING_DISABLED = true

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD' })

  if (SERVER_RENDERING_DISABLED) {
    return res.status(410).json({
      error: 'SERVER_RENDERING_DISABLED',
      detail: '본인 Gemini API 키를 Settings → API Keys에 등록해 사용하세요.',
    })
  }

  const user = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { image, instruction } = req.body ?? {}
  if (!image || !instruction) return res.status(400).json({ error: 'BAD_REQUEST' })

  const cost = COSTS.auto_prompt
  const balance = await spendCredits(user, cost)
  if (balance === null) {
    return res.status(402).json({ error: 'INSUFFICIENT_CREDITS', balance: await getBalance(user).catch(() => 0) })
  }

  try {
    const out = await geminiText({ image, instruction })
    await logRender(user, 'auto_prompt', cost, 'ok')
    return res.status(200).json({ text: out.text, balance })
  } catch (err) {
    await logRender(user, 'auto_prompt', cost, 'error', err.message)
    return res.status(502).json({ error: 'AUTO_PROMPT_FAILED', detail: String(err.message).slice(0, 300), balance })
  }
}
