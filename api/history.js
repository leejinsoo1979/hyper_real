// GET/POST /api/history — logged-in user's render history dashboard entries
import { cors, verifyUser, fsFetch } from './_lumanova.js'

function fieldString(fields, key) {
  return fields?.[key]?.stringValue ?? ''
}

function fieldInt(fields, key) {
  return Number(fields?.[key]?.integerValue ?? 0)
}

function fieldTimestamp(fields, key) {
  return fields?.[key]?.timestampValue ?? ''
}

function documentId(name = '') {
  return name.split('/').pop() ?? ''
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const user = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })

  if (req.method === 'GET') {
    const limit = Math.min(Number(req.query?.limit ?? 50), 100)
    const docs = await fsFetch(`/users/${user.uid}/history`, {
      token: user.token,
      query: `?pageSize=${limit}`,
    })
    if (!docs.ok) return res.status(docs.status).json({ error: 'HISTORY_READ_FAILED' })

    const rows = (docs.json.documents ?? [])
      .map((doc) => {
        const fields = doc.fields ?? {}
        return {
          id: documentId(doc.name),
          engine: fieldString(fields, 'engine'),
          cost: fieldInt(fields, 'cost'),
          status: fieldString(fields, 'status'),
          kind: fieldString(fields, 'kind') || 'log',
          clientId: fieldString(fields, 'clientId'),
          prompt: fieldString(fields, 'prompt'),
          thumbnail: fieldString(fields, 'thumbnail'),
          sourceThumbnail: fieldString(fields, 'sourceThumbnail'),
          createdAt: fieldTimestamp(fields, 'createdAt'),
        }
      })
      .filter((row) => row.thumbnail)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return res.status(200).json({ items: rows })
  }

  if (req.method === 'POST') {
    const { clientId = '', thumbnail, sourceThumbnail = '', prompt = '', engine = 'main', cost = 0, createdAt = null } = req.body ?? {}
    if (!thumbnail || typeof thumbnail !== 'string') return res.status(400).json({ error: 'BAD_REQUEST' })
    if (thumbnail.length > 900_000) return res.status(413).json({ error: 'THUMBNAIL_TOO_LARGE' })
    if (sourceThumbnail && String(sourceThumbnail).length > 900_000) return res.status(413).json({ error: 'SOURCE_THUMBNAIL_TOO_LARGE' })

    const created = await fsFetch(`/users/${user.uid}/history`, {
      method: 'POST',
      token: user.token,
      body: {
        fields: {
          uid: { stringValue: user.uid },
          kind: { stringValue: 'history' },
          clientId: { stringValue: String(clientId).slice(0, 120) },
          engine: { stringValue: String(engine).slice(0, 80) },
          cost: { integerValue: String(Number(cost) || 0) },
          status: { stringValue: 'ok' },
          prompt: { stringValue: String(prompt).slice(0, 1500) },
          thumbnail: { stringValue: thumbnail },
          sourceThumbnail: { stringValue: String(sourceThumbnail) },
          createdAt: { timestampValue: createdAt ? String(createdAt) : new Date().toISOString() },
        },
      },
    })
    if (!created.ok) return res.status(created.status).json({ error: 'HISTORY_WRITE_FAILED' })
    return res.status(200).json({ ok: true, id: documentId(created.json.name) })
  }

  return res.status(405).json({ error: 'METHOD' })
}
