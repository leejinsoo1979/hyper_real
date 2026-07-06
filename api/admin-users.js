import { cors, fsFetch, listAuthUsers, requireAdmin } from './_lumanova.js'

function documentId(name = '') {
  return name.split('/').pop() ?? ''
}

function creditFromDoc(doc) {
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

function userFromAuth(authUser, credit = null) {
  const providerIds = (authUser.providerUserInfo ?? [])
    .map((provider) => provider.providerId)
    .filter(Boolean)
  const email = authUser.email ?? credit?.email ?? ''
  const isTestUser = /^e2e-\d+@lumanova-test\.com$/i.test(email)
  return {
    uid: authUser.localId,
    email,
    balance: credit?.balance ?? 0,
    plan: credit?.plan ?? 'standard',
    disabled: Boolean(authUser.disabled),
    emailVerified: Boolean(authUser.emailVerified),
    providers: providerIds,
    providerType: providerIds.includes('google.com') ? 'google' : providerIds[0] ?? 'unknown',
    isTestUser,
    createdAt: authUser.createdAt ? new Date(Number(authUser.createdAt)).toISOString() : credit?.createdAt ?? '',
    lastLoginAt: authUser.lastLoginAt ? new Date(Number(authUser.lastLoginAt)).toISOString() : '',
    updatedAt: credit?.updatedAt ?? '',
    hasCreditDoc: Boolean(credit),
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
    try {
      const [authRows, docs] = await Promise.all([
        listAuthUsers({ maxResults: 1000 }),
        fsFetch('/credits', { token: admin.user.token }),
      ])
      if (!docs.ok) return res.status(docs.status).json({ error: 'USERS_READ_FAILED', detail: docs.json })
      const credits = new Map((docs.json.documents ?? []).map((doc) => {
        const credit = creditFromDoc(doc)
        return [credit.uid, credit]
      }))
      const users = authRows.users.map((user) => userFromAuth(user, credits.get(user.localId) ?? null))
      return res.status(200).json({
        users,
        total: users.length,
        source: 'firebase-auth',
        nextPageToken: authRows.nextPageToken,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = message.startsWith('SERVICE_ACCOUNT_NOT_CONFIGURED') ? 500 : 502
      return res.status(status).json({ error: message })
    }
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
    return res.status(200).json({ ok: true, user: creditFromDoc(saved.json) })
  }

  return res.status(405).json({ error: 'METHOD' })
}
