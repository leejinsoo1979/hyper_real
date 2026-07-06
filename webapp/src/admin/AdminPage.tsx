import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  Database,
  ImagePlus,
  Layers3,
  Loader2,
  Plus,
  Save,
  Search,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'
import {
  apiAdminMaterials,
  apiAdminMe,
  apiAdminUsers,
  apiDeleteAdminMaterial,
  apiSaveAdminMaterial,
  apiSaveAdminUser,
  type AdminMaterial,
  type AdminUser,
} from '../api/adminApi'
import { categories, resolveMaterialAssetUrl } from '../data/materialLibrary'

const BG = '#08090d'
const PANEL = '#12131a'
const LINE = '#272a35'
const TEXT = '#f3f5f7'
const DIM = '#8b909d'
const TEAL = '#00c9a7'

const emptyMaterial: AdminMaterial = {
  id: '',
  name: '',
  category: 'Wood',
  tags: [],
  colors: ['#8a5f34', '#c79b62', '#6e4525'],
  prompt: '',
  thumbnailPath: '',
  referencePath: '',
  baseColorPath: '',
  roughnessPath: '',
  normalPath: '',
  active: true,
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Database }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 8, padding: '16px 18px' }}>
      <div className="flex items-center justify-between">
        <span style={{ color: DIM, fontSize: 12 }}>{label}</span>
        <Icon size={17} style={{ color: TEAL }} />
      </div>
      <div style={{ color: TEXT, fontSize: 26, fontWeight: 850, marginTop: 10 }}>{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span style={{ color: '#aeb3bf', fontSize: 11.5, fontWeight: 700 }}>{label}</span>
      <div style={{ marginTop: 7 }}>{children}</div>
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  borderRadius: 8,
  border: `1px solid ${LINE}`,
  background: '#0d0e14',
  color: TEXT,
  padding: '0 12px',
  fontSize: 13,
  outline: 'none',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: 118,
  resize: 'vertical',
  padding: '10px 12px',
  lineHeight: 1.55,
}

function MaterialPreview({ material }: { material: AdminMaterial }) {
  const preview = resolveMaterialAssetUrl(material.thumbnailPath || material.referencePath)
  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{
        width: 64,
        height: 64,
        borderRadius: 8,
        border: `1px solid ${LINE}`,
        background: material.colors?.length
          ? `radial-gradient(circle at 35% 30%, ${material.colors[1] ?? material.colors[0]}, ${material.colors[0]} 45%, ${material.colors[2] ?? '#111'})`
          : '#111',
      }}
    >
      {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={20} style={{ color: '#565b68' }} />}
    </div>
  )
}

function AccessDenied({ error }: { error: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: BG, color: TEXT }}>
      <div style={{ width: 460, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, padding: 28 }}>
        <Shield size={28} style={{ color: '#ff6b6b' }} />
        <h1 style={{ fontSize: 24, fontWeight: 850, marginTop: 16 }}>Admin access required</h1>
        <p style={{ color: DIM, fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
          이 페이지는 관리자 이메일 allowlist에 포함된 계정만 접근할 수 있습니다.
        </p>
        <p style={{ color: '#ff9f9f', fontSize: 12, marginTop: 14 }}>{error}</p>
      </div>
    </div>
  )
}

export function AdminPage() {
  const [ready, setReady] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'materials' | 'users'>('materials')
  const [materials, setMaterials] = useState<AdminMaterial[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<AdminMaterial>(emptyMaterial)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    setError(null)
    const me = await apiAdminMe()
    setAdminEmail(me.email)
    const [mats, userRows] = await Promise.all([apiAdminMaterials(), apiAdminUsers()])
    setMaterials(mats.items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
    setUsers(userRows.users.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')))
    setReady(true)
  }

  useEffect(() => {
    void load().catch((err) => {
      setReady(true)
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  const filteredMaterials = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return materials
    return materials.filter((m) =>
      m.name.toLowerCase().includes(q)
      || m.id.toLowerCase().includes(q)
      || m.category.toLowerCase().includes(q)
      || m.tags.some((tag) => tag.toLowerCase().includes(q)),
    )
  }, [materials, query])

  const activeCount = materials.filter((m) => m.active).length
  const categoriesCount = new Set(materials.map((m) => m.category)).size
  const remoteReadyCount = materials.filter((m) => m.thumbnailPath && m.referencePath).length

  const editMaterial = (material: AdminMaterial) => {
    setSelectedId(material.id)
    setForm({
      ...emptyMaterial,
      ...material,
      tags: material.tags ?? [],
      colors: material.colors?.length ? material.colors : emptyMaterial.colors,
    })
    setTab('materials')
  }

  const createMaterial = () => {
    setSelectedId(null)
    setForm(emptyMaterial)
    setTab('materials')
  }

  const patchForm = (partial: Partial<AdminMaterial>) => {
    setForm((current) => ({ ...current, ...partial }))
  }

  const saveMaterial = async () => {
    const id = form.id || slugify(form.name)
    setSaving(true)
    setNotice(null)
    try {
      const saved = await apiSaveAdminMaterial({ ...form, id })
      setMaterials((rows) => {
        const next = rows.filter((m) => m.id !== saved.item.id).concat(saved.item)
        return next.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      })
      setSelectedId(saved.item.id)
      setForm(saved.item)
      setNotice('재질 저장 완료')
    } finally {
      setSaving(false)
    }
  }

  const deleteMaterial = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await apiDeleteAdminMaterial(selectedId)
      setMaterials((rows) => rows.filter((m) => m.id !== selectedId))
      createMaterial()
      setNotice('재질 삭제 완료')
    } finally {
      setSaving(false)
    }
  }

  const updateUserBalance = async (user: AdminUser, balance: number) => {
    const saved = await apiSaveAdminUser({ ...user, balance })
    setUsers((rows) => rows.map((row) => (row.uid === saved.user.uid ? saved.user : row)))
    setNotice(`${user.email || user.uid} 크레딧 업데이트 완료`)
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: BG }}>
        <Loader2 size={30} className="animate-spin" style={{ color: TEAL }} />
      </div>
    )
  }

  if (error) return <AccessDenied error={error} />

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="flex min-h-screen">
        <aside style={{ width: 260, borderRight: `1px solid ${LINE}`, background: '#0b0c11', padding: 22 }}>
          <button onClick={() => { window.location.href = '/' }} className="flex items-center gap-2.5" style={{ background: 'none' }}>
            <img src="/landing/logo-circle.png" alt="" width={28} height={28} />
            <span style={{ fontSize: 18, fontWeight: 850 }}>Lumanova</span>
          </button>
          <div style={{ marginTop: 24, color: '#68707d', fontSize: 11, textTransform: 'uppercase', fontWeight: 800 }}>Admin Console</div>
          <nav className="mt-3 flex flex-col gap-1">
            {[
              { id: 'materials' as const, label: 'Material Library', icon: Layers3 },
              { id: 'users' as const, label: 'Users & Credits', icon: Users },
            ].map((item) => {
              const Icon = item.icon
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className="flex items-center gap-3 rounded-md text-left"
                  style={{
                    height: 42,
                    padding: '0 12px',
                    color: active ? '#eafffb' : '#9aa0ad',
                    background: active ? 'rgba(0,201,167,.13)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(0,201,167,.28)' : 'transparent'}`,
                    fontSize: 13,
                    fontWeight: active ? 800 : 600,
                  }}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div style={{ position: 'absolute', bottom: 22, width: 216, color: '#737987', fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ color: '#d7dae2', fontWeight: 800 }}>{adminEmail}</div>
            관리자 권한으로 접속 중
          </div>
        </aside>

        <main className="min-w-0 flex-1" style={{ padding: '28px 34px 34px' }}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: 0 }}>Operations</h1>
              <p style={{ marginTop: 6, color: DIM, fontSize: 13 }}>
                재질 카탈로그, CDN 경로, 사용자 크레딧을 관리합니다.
              </p>
            </div>
            <button
              onClick={() => void load()}
              className="rounded-md"
              style={{ height: 38, padding: '0 15px', background: PANEL, border: `1px solid ${LINE}`, color: '#d7dae2', fontSize: 12.5, fontWeight: 750 }}
            >
              Refresh
            </button>
          </div>

          {notice && (
            <div className="mt-4 flex items-center gap-2 rounded-md" style={{ padding: '10px 12px', background: 'rgba(0,201,167,.10)', border: '1px solid rgba(0,201,167,.24)', color: '#98fff0', fontSize: 12.5 }}>
              <Check size={15} />
              {notice}
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Active materials" value={activeCount} icon={Layers3} />
            <Stat label="Categories" value={categoriesCount} icon={Database} />
            <Stat label="CDN-ready materials" value={remoteReadyCount} icon={ImagePlus} />
          </div>

          {tab === 'materials' ? (
            <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) 430px' }}>
              <section style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: `1px solid ${LINE}` }}>
                  <div className="flex items-center gap-2" style={{ color: '#dfe3ea', fontSize: 14, fontWeight: 850 }}>
                    <Layers3 size={16} style={{ color: TEAL }} />
                    Material Catalog
                  </div>
                  <button
                    onClick={createMaterial}
                    className="flex items-center gap-1.5 rounded-md"
                    style={{ height: 32, padding: '0 11px', background: TEAL, color: '#041d18', fontSize: 12, fontWeight: 900 }}
                  >
                    <Plus size={14} />
                    New material
                  </button>
                </div>
                <div style={{ padding: 14, borderBottom: `1px solid ${LINE}` }}>
                  <div className="flex items-center gap-2 rounded-md" style={{ height: 38, padding: '0 12px', background: '#0d0e14', border: `1px solid ${LINE}` }}>
                    <Search size={15} style={{ color: '#68707d' }} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, id, category, tag"
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      style={{ color: TEXT, fontSize: 13 }}
                    />
                  </div>
                </div>
                <div style={{ maxHeight: 'calc(100vh - 302px)', overflow: 'auto' }}>
                  {filteredMaterials.map((material) => {
                    const active = material.id === selectedId
                    return (
                      <button
                        key={material.id}
                        onClick={() => editMaterial(material)}
                        className="grid w-full items-center text-left"
                        style={{
                          gridTemplateColumns: '78px minmax(0, 1fr) 105px 80px',
                          gap: 12,
                          padding: '12px 16px',
                          background: active ? '#1b2a29' : PANEL,
                          borderBottom: `1px solid ${LINE}`,
                        }}
                      >
                        <MaterialPreview material={material} />
                        <div className="min-w-0">
                          <div className="truncate" style={{ color: TEXT, fontSize: 13.5, fontWeight: 850 }}>{material.name}</div>
                          <div className="truncate" style={{ color: DIM, fontSize: 11.5, marginTop: 4 }}>{material.id}</div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {material.tags.slice(0, 3).map((tag) => (
                              <span key={tag} style={{ color: '#8feadd', background: 'rgba(0,201,167,.10)', borderRadius: 999, padding: '2px 7px', fontSize: 10.5 }}>{tag}</span>
                            ))}
                          </div>
                        </div>
                        <span style={{ color: '#b7bcc7', fontSize: 12 }}>{material.category}</span>
                        <span style={{ color: material.active ? TEAL : '#777', fontSize: 12, fontWeight: 800 }}>{material.active ? 'Active' : 'Hidden'}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ fontSize: 14, fontWeight: 850 }}>{selectedId ? 'Edit Material' : 'New Material'}</div>
                  <label className="flex items-center gap-2" style={{ color: '#c9ced8', fontSize: 12, fontWeight: 750 }}>
                    <input type="checkbox" checked={form.active} onChange={(e) => patchForm({ active: e.target.checked })} />
                    Active
                  </label>
                </div>
                <div className="grid gap-4" style={{ padding: 16 }}>
                  <div className="flex gap-3">
                    <MaterialPreview material={form} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate" style={{ color: TEXT, fontSize: 15, fontWeight: 900 }}>{form.name || 'Untitled material'}</div>
                      <div className="truncate" style={{ color: DIM, fontSize: 12, marginTop: 5 }}>{form.thumbnailPath || 'No thumbnail path'}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="ID">
                      <input style={inputStyle} value={form.id} placeholder="warm-oak-01" onChange={(e) => patchForm({ id: slugify(e.target.value) })} />
                    </Field>
                    <Field label="Category">
                      <select style={inputStyle} value={form.category} onChange={(e) => patchForm({ category: e.target.value })}>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Name">
                    <input
                      style={inputStyle}
                      value={form.name}
                      placeholder="Warm oak veneer"
                      onChange={(e) => patchForm({ name: e.target.value, id: form.id || slugify(e.target.value) })}
                    />
                  </Field>
                  <Field label="Tags">
                    <input style={inputStyle} value={form.tags.join(', ')} placeholder="wood, oak, warm, veneer" onChange={(e) => patchForm({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                  </Field>
                  <Field label="Prompt">
                    <textarea style={textareaStyle} value={form.prompt} placeholder="Describe material appearance precisely..." onChange={(e) => patchForm({ prompt: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Thumbnail path">
                      <input style={inputStyle} value={form.thumbnailPath ?? ''} placeholder="thumbs/wood/warm-oak-01.webp" onChange={(e) => patchForm({ thumbnailPath: e.target.value })} />
                    </Field>
                    <Field label="Reference path">
                      <input style={inputStyle} value={form.referencePath ?? ''} placeholder="references/wood/warm-oak-01.webp" onChange={(e) => patchForm({ referencePath: e.target.value })} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Base color">
                      <input style={inputStyle} value={form.baseColorPath ?? ''} placeholder="pbr/id/basecolor.webp" onChange={(e) => patchForm({ baseColorPath: e.target.value })} />
                    </Field>
                    <Field label="Roughness">
                      <input style={inputStyle} value={form.roughnessPath ?? ''} placeholder="pbr/id/roughness.webp" onChange={(e) => patchForm({ roughnessPath: e.target.value })} />
                    </Field>
                    <Field label="Normal">
                      <input style={inputStyle} value={form.normalPath ?? ''} placeholder="pbr/id/normal.webp" onChange={(e) => patchForm({ normalPath: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Fallback colors">
                    <input style={inputStyle} value={form.colors.join(', ')} placeholder="#8a5f34, #c79b62, #6e4525" onChange={(e) => patchForm({ colors: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                  </Field>
                  <div className="flex items-center justify-between gap-3" style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
                    <button
                      onClick={() => void deleteMaterial()}
                      disabled={!selectedId || saving}
                      className="flex items-center gap-1.5 rounded-md"
                      style={{ height: 38, padding: '0 13px', background: '#2a171a', color: selectedId ? '#ff9ca8' : '#6d5459', fontSize: 12.5, fontWeight: 800 }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                    <button
                      onClick={() => void saveMaterial().catch((err) => setError(err instanceof Error ? err.message : String(err)))}
                      disabled={saving || !form.name || !form.category || !form.prompt}
                      className="flex items-center gap-1.5 rounded-md"
                      style={{ height: 38, padding: '0 16px', background: TEAL, color: '#041d18', opacity: saving ? 0.65 : 1, fontSize: 12.5, fontWeight: 900 }}
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save material
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <section className="mt-5" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
              <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: `1px solid ${LINE}` }}>
                <div className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 850 }}>
                  <Users size={16} style={{ color: TEAL }} />
                  Users & Credits
                </div>
                <div style={{ color: DIM, fontSize: 12 }}>Firebase Auth 전체 사용자 목록은 Admin SDK 연동 후 확장됩니다.</div>
              </div>
              <div style={{ overflow: 'auto' }}>
                <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#9ca3af', background: '#101119' }}>
                      <th style={{ textAlign: 'left', padding: '12px 16px' }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px' }}>UID</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px' }}>Plan</th>
                      <th style={{ textAlign: 'right', padding: '12px 16px' }}>Credits</th>
                      <th style={{ width: 170, padding: '12px 16px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <UserRow key={user.uid} user={user} onSave={updateUserBalance} />
                    ))}
                  </tbody>
                </table>
              </div>
              {users.length === 0 && (
                <div className="flex items-center gap-2" style={{ padding: 20, color: DIM, fontSize: 13 }}>
                  <AlertCircle size={15} />
                  아직 크레딧 문서가 있는 사용자가 없습니다.
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function UserRow({ user, onSave }: { user: AdminUser; onSave: (user: AdminUser, balance: number) => Promise<void> }) {
  const [balance, setBalance] = useState(String(user.balance))
  const [saving, setSaving] = useState(false)

  useEffect(() => setBalance(String(user.balance)), [user.balance])

  return (
    <tr style={{ borderTop: `1px solid ${LINE}` }}>
      <td style={{ padding: '13px 16px', color: TEXT, fontWeight: 750 }}>{user.email || 'No email recorded'}</td>
      <td style={{ padding: '13px 16px', color: DIM, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{user.uid}</td>
      <td style={{ padding: '13px 16px', color: '#b6bbc7' }}>{user.plan}</td>
      <td style={{ padding: '13px 16px', textAlign: 'right' }}>
        <input
          value={balance}
          onChange={(e) => setBalance(e.target.value.replace(/[^\d]/g, ''))}
          style={{ ...inputStyle, width: 110, textAlign: 'right' }}
        />
      </td>
      <td style={{ padding: '13px 16px', textAlign: 'right' }}>
        <button
          onClick={() => {
            setSaving(true)
            void onSave(user, Number(balance)).finally(() => setSaving(false))
          }}
          className="inline-flex items-center gap-1.5 rounded-md"
          style={{ height: 34, padding: '0 12px', background: '#1b2a29', color: '#8ff5e6', fontSize: 12, fontWeight: 850 }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save
        </button>
      </td>
    </tr>
  )
}
