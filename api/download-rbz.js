import { readFile } from 'node:fs/promises'
import path from 'node:path'

const RBZ_FILENAME = 'Lumanova_v1.0.5.rbz'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end('Method Not Allowed')
  }

  try {
    const filePath = path.join(process.cwd(), 'webapp', 'public', 'downloads', RBZ_FILENAME)
    const file = await readFile(filePath)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${RBZ_FILENAME}"`)
    res.setHeader('Content-Length', String(file.length))
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
    if (req.method === 'HEAD') return res.status(200).end()
    return res.status(200).send(file)
  } catch {
    return res.status(404).end('RBZ not found')
  }
}
