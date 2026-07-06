import { cors, requireAdmin } from './_lumanova.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD' })

  const admin = await requireAdmin(req)
  if (admin.error) return res.status(admin.status).json({ error: admin.error })

  return res.status(200).json({
    ok: true,
    uid: admin.user.uid,
    email: admin.user.email,
    role: 'admin',
  })
}
