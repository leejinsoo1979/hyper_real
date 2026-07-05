// POST /api/render — 로그인 사용자의 크레딧을 차감하고 서버 키로 Gemini 렌더
import { cors, verifyUser, spendCredits, getBalance, logRender, geminiRender, COSTS } from './_lumanova.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD' })

  const user = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { engine = 'pro', image, prompt, negativePrompt = '', mask = null } = req.body ?? {}
  if (!image || !prompt) return res.status(400).json({ error: 'BAD_REQUEST' })
  if (String(image).length > 12_000_000) return res.status(413).json({ error: 'IMAGE_TOO_LARGE' })

  const cost = COSTS[engine] ?? COSTS.pro
  const balance = await spendCredits(user, cost)
  if (balance === null) {
    return res.status(402).json({ error: 'INSUFFICIENT_CREDITS', balance: await getBalance(user).catch(() => 0) })
  }

  try {
    const out = await geminiRender({ engine, image, prompt, negativePrompt, mask })
    await logRender(user, engine, cost, 'ok')
    return res.status(200).json({ image: out.image, balance })
  } catch (err) {
    // MVP: 자동 환불 없음(감액-전용 보안 규칙). 실패는 로그로 남겨 수동 보정.
    await logRender(user, engine, cost, 'error', err.message)
    return res.status(502).json({ error: 'RENDER_FAILED', detail: String(err.message).slice(0, 300), balance })
  }
}
