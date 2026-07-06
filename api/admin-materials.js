import { cors, fsFetch, requireAdmin } from './_lumanova.js'

function documentId(name = '') {
  return name.split('/').pop() ?? ''
}

function fieldString(fields, key) {
  return fields?.[key]?.stringValue ?? ''
}

function fieldBool(fields, key, fallback = false) {
  return fields?.[key]?.booleanValue ?? fallback
}

function fieldArray(fields, key) {
  return (fields?.[key]?.arrayValue?.values ?? [])
    .map((entry) => entry.stringValue)
    .filter(Boolean)
}

function materialFromDoc(doc) {
  const fields = doc.fields ?? {}
  return {
    id: fieldString(fields, 'id') || documentId(doc.name),
    name: fieldString(fields, 'name'),
    category: fieldString(fields, 'category'),
    tags: fieldArray(fields, 'tags'),
    colors: fieldArray(fields, 'colors'),
    prompt: fieldString(fields, 'prompt'),
    thumbnailPath: fieldString(fields, 'thumbnailPath'),
    referencePath: fieldString(fields, 'referencePath'),
    baseColorPath: fieldString(fields, 'baseColorPath'),
    roughnessPath: fieldString(fields, 'roughnessPath'),
    normalPath: fieldString(fields, 'normalPath'),
    active: fieldBool(fields, 'active', true),
    updatedAt: fields.updatedAt?.timestampValue ?? '',
    createdAt: fields.createdAt?.timestampValue ?? '',
  }
}

function safeId(value = '') {
  const id = String(value).trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{2,80}$/.test(id)) return ''
  return id
}

function stringArray(value, limit = 20) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  return raw
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, limit)
}

function materialFields(body, id, existingCreatedAt = null) {
  const now = new Date().toISOString()
  const tags = stringArray(body.tags)
  const colors = stringArray(body.colors, 6)
  return {
    id: { stringValue: id },
    name: { stringValue: String(body.name ?? '').trim().slice(0, 120) },
    category: { stringValue: String(body.category ?? '').trim().slice(0, 80) },
    tags: { arrayValue: { values: tags.map((tag) => ({ stringValue: tag })) } },
    colors: { arrayValue: { values: colors.map((color) => ({ stringValue: color })) } },
    prompt: { stringValue: String(body.prompt ?? '').trim().slice(0, 2500) },
    thumbnailPath: { stringValue: String(body.thumbnailPath ?? '').trim().slice(0, 500) },
    referencePath: { stringValue: String(body.referencePath ?? '').trim().slice(0, 500) },
    baseColorPath: { stringValue: String(body.baseColorPath ?? '').trim().slice(0, 500) },
    roughnessPath: { stringValue: String(body.roughnessPath ?? '').trim().slice(0, 500) },
    normalPath: { stringValue: String(body.normalPath ?? '').trim().slice(0, 500) },
    active: { booleanValue: body.active !== false },
    createdAt: { timestampValue: existingCreatedAt ?? now },
    updatedAt: { timestampValue: now },
  }
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const admin = await requireAdmin(req)
  if (admin.error) return res.status(admin.status).json({ error: admin.error })

  if (req.method === 'GET') {
    const docs = await fsFetch('/materials', { token: admin.user.token })
    if (!docs.ok) return res.status(docs.status).json({ error: 'MATERIALS_READ_FAILED', detail: docs.json })
    const items = (docs.json.documents ?? []).map(materialFromDoc)
    return res.status(200).json({ items })
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const body = req.body ?? {}
    const id = safeId(body.id)
    if (!id) return res.status(400).json({ error: 'BAD_ID' })
    if (!String(body.name ?? '').trim()) return res.status(400).json({ error: 'NAME_REQUIRED' })
    if (!String(body.category ?? '').trim()) return res.status(400).json({ error: 'CATEGORY_REQUIRED' })
    if (!String(body.prompt ?? '').trim()) return res.status(400).json({ error: 'PROMPT_REQUIRED' })

    const existing = await fsFetch(`/materials/${id}`, { token: admin.user.token })
    const createdAt = existing.ok ? existing.json.fields?.createdAt?.timestampValue : null
    const saved = await fsFetch(`/materials/${id}`, {
      method: 'PATCH',
      token: admin.user.token,
      body: { fields: materialFields(body, id, createdAt) },
    })
    if (!saved.ok) return res.status(saved.status).json({ error: 'MATERIAL_SAVE_FAILED', detail: saved.json })
    return res.status(200).json({ ok: true, item: materialFromDoc(saved.json) })
  }

  if (req.method === 'DELETE') {
    const id = safeId(req.query?.id)
    if (!id) return res.status(400).json({ error: 'BAD_ID' })
    const deleted = await fsFetch(`/materials/${id}`, { method: 'DELETE', token: admin.user.token })
    if (!deleted.ok) return res.status(deleted.status).json({ error: 'MATERIAL_DELETE_FAILED', detail: deleted.json })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'METHOD' })
}
