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

function safeDocumentId(value = '') {
  const id = String(value).trim()
  return /^[A-Za-z0-9_-]{8,120}$/.test(id) ? id : ''
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const user = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })

  if (req.method === 'GET') {
    const limit = Math.min(Number(req.query?.limit ?? 50), 100)
    // orderBy 없는 목록 조회는 문서 이름 순 임의 페이지를 반환해, 항목이 limit을
    // 넘으면 최신 항목이 누락될 수 있다. runQuery로 최신 limit개를 보장한다.
    const docs = await fsFetch(`/users/${user.uid}:runQuery`, {
      method: 'POST',
      token: user.token,
      body: {
        structuredQuery: {
          from: [{ collectionId: 'history' }],
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit,
        },
      },
    })
    if (!docs.ok) return res.status(docs.status).json({ error: 'HISTORY_READ_FAILED' })

    const rows = (Array.isArray(docs.json) ? docs.json : [])
      .map((entry) => entry.document)
      .filter(Boolean)
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
          videoUrl: fieldString(fields, 'videoUrl'),
          videoFirstFrame: fieldString(fields, 'videoFirstFrame'),
          videoLastFrame: fieldString(fields, 'videoLastFrame'),
          targetNodeId: fieldString(fields, 'targetNodeId'),
          createdAt: fieldTimestamp(fields, 'createdAt'),
        }
      })
      .filter((row) => row.thumbnail)

    return res.status(200).json({ items: rows })
  }

  if (req.method === 'POST') {
    const { clientId = '', thumbnail, sourceThumbnail = '', videoUrl = '', videoFirstFrame = '', videoLastFrame = '', targetNodeId = '', prompt = '', engine = 'main', cost = 0, createdAt = null } = req.body ?? {}
    if (!thumbnail || typeof thumbnail !== 'string') return res.status(400).json({ error: 'BAD_REQUEST' })
    if (thumbnail.length > 900_000) return res.status(413).json({ error: 'THUMBNAIL_TOO_LARGE' })
    if (sourceThumbnail && String(sourceThumbnail).length > 900_000) return res.status(413).json({ error: 'SOURCE_THUMBNAIL_TOO_LARGE' })
    if (videoUrl && String(videoUrl).length > 4000) return res.status(413).json({ error: 'VIDEO_URL_TOO_LARGE' })
    if (videoFirstFrame && String(videoFirstFrame).length > 900_000) return res.status(413).json({ error: 'VIDEO_FIRST_FRAME_TOO_LARGE' })
    if (videoLastFrame && String(videoLastFrame).length > 900_000) return res.status(413).json({ error: 'VIDEO_LAST_FRAME_TOO_LARGE' })

    const docId = safeDocumentId(clientId)
    const path = docId ? `/users/${user.uid}/history/${docId}` : `/users/${user.uid}/history`
    const created = await fsFetch(path, {
      method: docId ? 'PATCH' : 'POST',
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
          videoUrl: { stringValue: String(videoUrl) },
          videoFirstFrame: { stringValue: String(videoFirstFrame) },
          videoLastFrame: { stringValue: String(videoLastFrame) },
          targetNodeId: { stringValue: String(targetNodeId).slice(0, 120) },
          createdAt: { timestampValue: createdAt ? String(createdAt) : new Date().toISOString() },
        },
      },
    })
    if (!created.ok) return res.status(created.status).json({ error: 'HISTORY_WRITE_FAILED' })
    return res.status(200).json({ ok: true, id: docId || documentId(created.json.name) })
  }

  return res.status(405).json({ error: 'METHOD' })
}
