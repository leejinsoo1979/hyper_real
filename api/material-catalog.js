import { cors, fsFetch, verifyUser } from './_lumanova.js'

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
  const id = fieldString(fields, 'id') || documentId(doc.name)
  return {
    id,
    name: fieldString(fields, 'name'),
    category: fieldString(fields, 'category'),
    tags: fieldArray(fields, 'tags'),
    colors: fieldArray(fields, 'colors'),
    prompt: fieldString(fields, 'prompt'),
    thumbnailPath: fieldString(fields, 'thumbnailPath'),
    referencePath: fieldString(fields, 'referencePath'),
    pbr: {
      baseColor: fieldString(fields, 'baseColorPath'),
      roughness: fieldString(fields, 'roughnessPath'),
      normal: fieldString(fields, 'normalPath'),
    },
    active: fieldBool(fields, 'active', true),
  }
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD' })

  const user = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const docs = await fsFetch('/materials', { token: user.token })
  if (!docs.ok) return res.status(docs.status).json({ error: 'MATERIAL_CATALOG_FAILED' })
  const materials = (docs.json.documents ?? [])
    .map(materialFromDoc)
    .filter((item) => item.active && item.id && item.name && item.category && item.prompt)

  return res.status(200).json({ materials, updatedAt: new Date().toISOString() })
}
