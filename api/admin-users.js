import { cors, fsFetch, requireAdmin } from './_lumanova.js'

function documentId(name = '') {
  return name.split('/').pop() ?? ''
}

function userFromDoc(doc) {
  const fields = doc.fields ?? {}
  return {
    uid: fields.uid?.stringValue || documentId(doc.name),
    email: fields.email?.stringValue ?? '',
    balance: Number(fields.balance?.integerValue ?? 0),
    plan: fields.plan?.stringValue ?? 'standard',
    createdAt: fields.createdAt?.timestampValue ?? '',
    updatedAt: fields.updatedAt?.timestampValue ?? '',
  }
}

function safeUid(value = '') {
  const uid = String(value).trim()
  return /^[A-Za-z0-9_-]{8,160}$/.test(uid) ? uid : ''
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const admin = await requireAdmin(req)
  if (admin.error) return res.status(admin.status).json({ error: admin.error })

  if (req.method === 'GET') {
    const docs = await fsFetch('/credits', { token: admin.user.token })
    if (!docs.ok) return res.status(docs.status).json({ error: 'USERS_READ_FAILED', detail: docs.json })
    const users = (docs.json.documents ?? []).map(userFromDoc)
    return res.status(200).json({ users })
  }

  if (req.method === 'PATCH') {
    const { uid: rawUid, balance: rawBalance, email = '', plan = 'standard' } = req.body ?? {}
    const uid = safeUid(rawUid)
    const balance = Math.max(0, Math.min(1_000_000, Math.round(Number(rawBalance) || 0)))
    if (!uid) return res.status(400).json({ error: 'BAD_UID' })

    const existing = await fsFetch(`/credits/${uid}`, { token: admin.user.token })
    const createdAt = existing.ok ? existing.json.fields?.createdAt?.timestampValue : new Date().toISOString()
    const saved = await fsFetch(`/credits/${uid}`, {
      method: 'PATCH',
      token: admin.user.token,
      body: {
        fields: {
          uid: { stringValue: uid },
          email: { stringValue: String(email).slice(0, 200) },
          balance: { integerValue: String(balance) },
          plan: { stringValue: String(plan).slice(0, 80) },
          createdAt: { timestampValue: createdAt },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      },
    })
    if (!saved.ok) return res.status(saved.status).json({ error: 'USER_SAVE_FAILED', detail: saved.json })
    return res.status(200).json({ ok: true, user: userFromDoc(saved.json) })
  }

  return res.status(405).json({ error: 'METHOD' })
}
