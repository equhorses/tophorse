// Panel de gestión (dirección y analistas)
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, downloadPrivate, fileUrl, openPrivateFile, useAuth, useFetch } from '../api.jsx'
import { LinkButton, Toast } from '../components/ui.jsx'
import { DOC_ROLES, HORSE_STATUS, REQ_STATUS, ROLE_LABELS, SEXES, VIDEO_KINDS, fmtDate } from '../data/content.js'
import { breedName, disciplineName, useCatalog } from '../data/catalog.js'
import { HorseForm, ResultsCard, resultFacts } from './Panel.jsx'

const eurs = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

function ExportButton({ kind, notify, label = 'Descargar Excel (CSV)' }) {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try { await downloadPrivate(`/admin/export/${kind}`, `tophorses-${kind}-${new Date().toISOString().slice(0, 10)}.csv`) } catch (x) { notify?.(x.message) }
    setBusy(false)
  }
  return <button type="button" className="btn btn-line btn-sm" onClick={go} disabled={busy}>{busy ? 'Preparando…' : `⬇ ${label}`}</button>
}

export default function Admin() {
  const { user, isStaff, isAdmin } = useAuth()
  const cat = useCatalog()
  const [tab, setTab] = useState('inicio')
  const [toast, setToast] = useState('')
  const [horseId, setHorseId] = useState(null)
  if (!user) return <Navigate to="/acceder?next=/admin" replace />
  if (!isStaff) return <Navigate to="/panel" replace />
  const openHorse = (id) => { setTab('caballos'); setHorseId(id) }
  const tabs = [['inicio', 'Inicio'], ['solicitudes', 'Solicitudes'], ['caballos', 'Caballos'], ['resultados', 'Resultados'],
    ...(isAdmin ? [['usuarios', 'Usuarios'], ['pagos', 'Pagos'], ['auditoria', 'Auditoría']] : [])]
  return (
    <div className="app-shell">
      <div className="app-top">
        <div className="wrap">
          <span className="eyebrow">{isAdmin ? 'Dirección' : 'Analista'}</span>
          <h2 style={{ fontSize: '2rem' }}>Panel de gestión</h2>
          <div className="tabs" role="tablist">
            {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => { setTab(k); setHorseId(null) }}>{l}</button>)}
          </div>
        </div>
      </div>
      <div className="wrap section tight">
        {tab === 'inicio' && <Dashboard cat={cat} go={setTab} />}
        {tab === 'solicitudes' && <RequestsAdmin notify={setToast} openHorse={openHorse} />}
        {tab === 'caballos' && (horseId
          ? <HorseAdmin id={horseId} cat={cat} isAdmin={isAdmin} notify={setToast} onBack={() => setHorseId(null)} />
          : <HorsesAdmin cat={cat} isAdmin={isAdmin} notify={setToast} open={setHorseId} />)}
        {tab === 'resultados' && <ResultsAdmin cat={cat} isAdmin={isAdmin} notify={setToast} openHorse={openHorse} />}
        {tab === 'usuarios' && <UsersAdmin notify={setToast} me={user.id} />}
        {tab === 'pagos' && <PaymentsAdmin notify={setToast} />}
        {tab === 'auditoria' && <AuditAdmin />}
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

// ─── INICIO ───
function Dashboard({ cat, go }) {
  const { data: s } = useFetch('/admin/stats')
  if (!s) return <p className="muted">Cargando…</p>
  const tile = (n, label, sub, tab) => (
    <button type="button" className="dash-tile" onClick={() => tab && go(tab)} disabled={!tab}>
      <strong>{n}</strong><span>{label}</span>{sub && <em>{sub}</em>}
    </button>
  )
  const by = Object.fromEntries((s.byDiscipline || []).map((d) => [d.discipline, d]))
  return (
    <div className="stack">
      <div>
        <span className="eyebrow">Pendiente</span>
        <div className="dash-grid mt8">
          {tile(s.pending, 'Informes por preparar', 'solicitudes abiertas', 'solicitudes')}
          {tile(s.unverifiedResults, 'Resultados por verificar', 'aportados por clientes', 'resultados')}
        </div>
      </div>
      <div>
        <span className="eyebrow">Archivo de datos</span>
        <div className="dash-grid mt8">
          {tile(s.horses, 'Caballos', `${s.horsesMonth} en los últimos 30 días`, 'caballos')}
          {tile(s.results, 'Resultados', null, 'resultados')}
          {tile(s.videos, 'Vídeos', null)}
          {tile(s.users, 'Usuarios', `${s.usersMonth} en los últimos 30 días`, 'usuarios')}
        </div>
        <div className="table-scroll mt16">
          <table className="table data-table">
            <thead><tr><th>Disciplina</th><th className="num">Caballos</th><th className="num">Resultados</th><th className="num">Vídeos</th></tr></thead>
            <tbody>{(cat?.disciplines || []).map((d) => (
              <tr key={d.key}><td>{d.name}</td><td className="num">{by[d.key]?.horses || 0}</td><td className="num">{by[d.key]?.results || 0}</td><td className="num">{by[d.key]?.videos || 0}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div>
        <span className="eyebrow">Dinero e IA</span>
        <div className="dash-grid mt8">
          {tile(eurs(s.revenue), 'Cobrado en total', null, 'pagos')}
          {tile(eurs(s.revenueMonth), 'Cobrado este mes', null, 'pagos')}
          {tile(s.docsMonth, 'Documentos leídos este mes', 'cada uno ≈ 0,01–0,02 $')}
        </div>
      </div>
    </div>
  )
}

// ─── SOLICITUDES ───
const NEXT = ['EN_REVISION', 'REQUIERE_DOCUMENTACION', 'RESUELTA', 'RECHAZADA']
function RequestsAdmin({ notify, openHorse }) {
  const { data, loading, reload } = useFetch('/admin/requests')
  const setStatus = async (r, status) => {
    const adminNotes = ['REQUIERE_DOCUMENTACION', 'RECHAZADA'].includes(status) ? window.prompt('Nota para el cliente') : undefined
    if (adminNotes === null) return
    try { await api(`/admin/requests/${r.id}`, { method: 'PATCH', body: { status, adminNotes } }); notify('Estado actualizado'); reload() } catch (x) { notify(x.message) }
  }
  if (loading && !data) return <p className="muted">Cargando…</p>
  if (!data?.length) return <div className="empty">Sin solicitudes.</div>
  return (
    <div className="table-scroll">
      <table className="table">
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Caballo</th><th>Petición</th><th>Estado</th><th /></tr></thead>
        <tbody>{data.map((r) => {
          const [label, cls] = REQ_STATUS[r.status] || [r.status, 'light']
          return (
            <tr key={r.id}>
              <td className="small">{fmtDate(r.createdAt)}</td>
              <td className="small">{r.userName}<div className="muted">{r.userEmail}</div></td>
              <td className="small">{r.horseId ? <LinkButton onClick={() => openHorse(r.horseId)}>{r.horseName}</LinkButton> : '—'}<div className="muted">{r.ref}</div></td>
              <td className="small">{r.notes || '—'}{(r.documents || []).map((d, n) => <div key={n}><LinkButton className="link small" onClick={() => openPrivateFile(`/my/requests/${r.id}/documents/${n}`).catch((x) => notify(x.message))}>{d.name}</LinkButton></div>)}</td>
              <td><span className={`badge ${cls}`}>{label}</span>{r.adminNotes && <div className="small muted mt8">{r.adminNotes}</div>}</td>
              <td><select className="select" value="" onChange={(e) => e.target.value && setStatus(r, e.target.value)}><option value="">Cambiar…</option>{NEXT.map((k) => <option key={k} value={k}>{REQ_STATUS[k][0]}</option>)}</select></td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}

// ─── CABALLOS ───
const EMPTY_HORSE = { name: '', birthDate: '', sex: 'MACHO', discipline: '', breed: '', coat: '', country: 'España', sireName: '', damName: '', damsireName: '', breederName: '', microchip: '', ueln: '', officialRegistry: '', studbook: '', trainerName: '', ownerEmail: '', externalOwner: '', adminNotes: '' }

function OwnerFields({ f, setF }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="grid g3" style={{ gap: 16 }}>
      <div className="field"><label>Email del cliente (cuenta)</label><input className="input" type="email" value={f.ownerEmail || ''} onChange={set('ownerEmail')} placeholder="Vacío = queda a nombre de la dirección" /></div>
      <div className="field"><label>Propietario sin cuenta</label><input className="input" value={f.externalOwner || ''} onChange={set('externalOwner')} /></div>
      <div className="field"><label>Nota interna</label><input className="input" value={f.adminNotes || ''} onChange={set('adminNotes')} /></div>
    </div>
  )
}

function HorsesAdmin({ cat, isAdmin, notify, open }) {
  const [q, setQ] = useState('')
  const [disc, setDisc] = useState('')
  const dq = useDebounced(q)
  const { data, loading, reload } = useFetch(`/admin/horses?q=${encodeURIComponent(dq)}&discipline=${disc}`)
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState(EMPTY_HORSE)
  const create = async (e) => {
    e.preventDefault()
    try { const h = await api('/admin/horses', { method: 'POST', body: f }); notify(`Alta: ${h.name} (${h.ref})`); setF(EMPTY_HORSE); setCreating(false); reload() } catch (x) { notify(x.message) }
  }
  return (
    <div className="stack">
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Buscar por nombre, ref, microchip, padre o email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ maxWidth: 260 }} value={disc} onChange={(e) => setDisc(e.target.value)}><option value="">Todas las disciplinas</option>{cat?.disciplines.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</select>
        <div className="row" style={{ gap: 8 }}>
          {isAdmin && <ExportButton kind="caballos" notify={notify} />}
          {isAdmin && <button className="btn btn-gold btn-sm" onClick={() => setCreating(!creating)}>{creating ? 'Cerrar' : '+ Alta de caballo'}</button>}
        </div>
      </div>
      {creating && (
        <form className="card form" onSubmit={create}>
          <h3>Alta de caballo</h3>
          <HorseForm f={f} setF={setF} cat={cat} />
          <OwnerFields f={f} setF={setF} />
          <div><button className="btn btn-ink">Dar de alta</button></div>
        </form>
      )}
      {loading && !data ? <p className="muted">Cargando…</p> : !data?.length ? <div className="empty">Sin caballos.</div> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Caballo</th><th>Disciplina</th><th>Genealogía</th><th>Propietario</th><th className="num">Res.</th><th className="num">Víd.</th><th>Estado</th><th /></tr></thead>
            <tbody>{data.map((h) => (
              <tr key={h.id}>
                <td><span className="t-name">{h.name}</span><div className="k">{h.ref} · {breedName(cat, h.breed)} · {new Date(h.birthDate).getFullYear()}</div></td>
                <td className="small">{disciplineName(cat, h.discipline)}</td>
                <td className="small">{h.sireName || '—'}<div className="muted">{h.damName || ''}</div></td>
                <td className="small">{h.externalOwner || h.ownerName}<div className="muted">{h.ownerEmail}</div></td>
                <td className="num">{h.resultCount}</td>
                <td className="num">{h.videoCount}</td>
                <td><span className="badge light">{HORSE_STATUS[h.status]}</span></td>
                <td><button className="btn btn-line btn-sm" onClick={() => open(h.id)}>Abrir</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HorseAdmin({ id, cat, isAdmin, notify, onBack }) {
  const { data: h, reload } = useFetch(`/admin/horses/${id}`)
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(null)
  useEffect(() => { if (h) setF({ ...EMPTY_HORSE, ...Object.fromEntries(Object.keys(EMPTY_HORSE).map((k) => [k, h[k] ?? ''])), ownerEmail: h.ownerEmail }) }, [h])
  if (!h || !f) return <p className="muted">Cargando…</p>
  const patch = async (body, msg) => { try { await api(`/admin/horses/${h.id}`, { method: 'PATCH', body }); notify(msg); reload() } catch (x) { notify(x.message) } }
  const verify = async (r) => { try { await api(`/admin/results/${r.id}/verify`, { method: 'POST' }); notify('Resultado verificado'); reload() } catch (x) { notify(x.message) } }
  const remove = async (r) => { if (!window.confirm('¿Borrar este resultado?')) return; try { await api(`/admin/results/${r.id}`, { method: 'DELETE' }); notify('Resultado borrado'); reload() } catch (x) { notify(x.message) } }
  return (
    <div className="stack">
      <LinkButton onClick={onBack}>← Caballos</LinkButton>
      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '2rem', textTransform: 'uppercase' }}>{h.name}</h2>
            <p className="k mt8">{h.ref} · {disciplineName(cat, h.discipline)} · {breedName(cat, h.breed)} · {SEXES[h.sex]} · {fmtDate(h.birthDate)}</p>
            <p className="small muted mt8">{[h.sireName && `Padre: ${h.sireName}`, h.damName && `Madre: ${h.damName}`, h.damsireName && `Abuelo materno: ${h.damsireName}`].filter(Boolean).join(' · ')}</p>
            <p className="small mt8">Propietario: {h.externalOwner || h.ownerName} · {h.ownerEmail}{h.ownerPhone ? ` · ${h.ownerPhone}` : ''}</p>
            {h.adminNotes && <p className="small muted mt8">Nota interna: {h.adminNotes}</p>}
          </div>
          {isAdmin && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <select className="select" value={h.status} onChange={(e) => patch({ status: e.target.value }, 'Estado actualizado')}>{Object.entries(HORSE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button className="btn btn-ink btn-sm" onClick={() => setEdit(!edit)}>{edit ? 'Cerrar' : 'Editar datos'}</button>
            </div>
          )}
        </div>
        {edit && (
          <form className="form mt16" onSubmit={(e) => { e.preventDefault(); patch(f, 'Datos guardados').then(() => setEdit(false)) }}>
            <HorseForm f={f} setF={setF} cat={cat} />
            <OwnerFields f={f} setF={setF} />
            <p className="small muted">Cambiar el email del cliente traspasa el caballo a esa cuenta (debe existir). Cada cambio queda en la auditoría.</p>
            <div><button className="btn btn-gold">Guardar cambios</button></div>
          </form>
        )}
      </div>
      <ResultsCard h={h} cat={cat} notify={notify} onChange={reload} base="/admin"
        adminActions={isAdmin ? (r) => <div className="row" style={{ gap: 6 }}>{!r.verified && <button className="btn btn-line btn-sm" onClick={() => verify(r)}>Verificar</button>}<button className="btn btn-line btn-sm" onClick={() => remove(r)}>Borrar</button></div> : null} />
      <div className="card">
        <h3>Vídeos ({h.videos.length})</h3>
        {h.videos.length ? h.videos.map((v) => <p key={v.id} className="mt8"><a className="link" href={fileUrl(v.url)} target="_blank" rel="noreferrer">{v.title || VIDEO_KINDS[v.kind]}</a><span className="small muted"> · {VIDEO_KINDS[v.kind]} · {fmtDate(v.recordedOn || v.uploadedAt)}</span></p>) : <p className="muted mt8">Sin vídeos.</p>}
      </div>
      <div className="card">
        <h3>Documentación ({h.documents.length})</h3>
        <p className="small muted mt8">Comparación entre lo declarado y lo que la IA ha leído en cada documento.</p>
        {h.documents.map((d) => (
          <div key={d.id} className="mt16">
            <LinkButton onClick={() => openPrivateFile(`/my/documents/${d.id}/file`).catch((x) => notify(x.message))}>{DOC_ROLES[d.role]}</LinkButton>
            <span className="small muted"> · {d.docType || d.originalName} · {fmtDate(d.createdAt)}{d.aiError ? ` · ${d.aiError}` : ''}</span>
            {d.checks?.length > 0 && (
              <table className="table mt8"><tbody>{d.checks.map((c) => (
                <tr key={c.label}><td className="small">{c.label}</td><td className="small">{c.declared || '—'}</td><td className="small">{c.read || '—'}</td><td><span className={`chk ${c.status}`}>{{ OK: '✓ coincide', DISTINTO: '✕ distinto', SIN_DATO: 'no aparece', NO_DECLARADO: 'no declarado' }[c.status]}</span></td></tr>
              ))}</tbody></table>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── RESULTADOS ───
function ResultsAdmin({ cat, isAdmin, notify, openHorse }) {
  const [disc, setDisc] = useState('')
  const [pending, setPending] = useState(true)
  const { data, loading, reload } = useFetch(`/admin/results?discipline=${disc}&pending=${pending ? 1 : ''}`)
  const verify = async (r) => { try { await api(`/admin/results/${r.id}/verify`, { method: 'POST' }); notify('Resultado verificado'); reload() } catch (x) { notify(x.message) } }
  const remove = async (r) => { if (!window.confirm('¿Borrar este resultado?')) return; try { await api(`/admin/results/${r.id}`, { method: 'DELETE' }); notify('Resultado borrado'); reload() } catch (x) { notify(x.message) } }
  return (
    <div className="stack">
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 12 }}>
          <select className="select" value={disc} onChange={(e) => setDisc(e.target.value)}><option value="">Todas las disciplinas</option>{cat?.disciplines.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</select>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} /> Solo pendientes</label>
        </div>
        {isAdmin && <ExportButton kind="resultados" notify={notify} />}
      </div>
      {loading && !data ? <p className="muted">Cargando…</p> : !data?.length ? <div className="empty">{pending ? 'No hay resultados pendientes de verificar.' : 'Sin resultados.'}</div> : (
        <div className="table-scroll">
          <table className="table data-table">
            <thead><tr><th>Caballo</th><th>Fecha</th><th>Competición</th><th>Nivel</th><th className="num">Puesto</th><th>Datos</th><th>Estado</th></tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.id}>
                <td className="small"><LinkButton onClick={() => openHorse(r.horseId)}>{r.horseName}</LinkButton><div className="muted">{disciplineName(cat, r.discipline)}</div></td>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                <td className="small">{r.competition}<div className="muted">{r.category}</div>{r.documentUrl && <a className="link" href={fileUrl(r.documentUrl)} target="_blank" rel="noreferrer">Documento</a>}{r.aiWarning && <div className="chk DISTINTO">⚠ {r.aiWarning}</div>}</td>
                <td className="small">{r.level || '—'}</td>
                <td className="num">{r.position ?? '—'}{r.fieldSize ? `/${r.fieldSize}` : ''}</td>
                <td className="small">{resultFacts(r) || '—'}</td>
                <td>{r.verified ? <span className="badge ok">verificado</span> : isAdmin ? <div className="row" style={{ gap: 6 }}><button className="btn btn-line btn-sm" onClick={() => verify(r)}>Verificar</button><button className="btn btn-line btn-sm" onClick={() => remove(r)}>Borrar</button></div> : <span className="badge example">pendiente</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── USUARIOS ───
const EMPTY_USER = { email: '', firstName: '', lastName: '', phone: '', country: 'España', company: '', role: 'TITULAR' }
const RoleSelect = ({ value, onChange, disabled }) => <select className="select" value={value} disabled={disabled} onChange={onChange}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>

function UsersAdmin({ notify, me }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, loading, reload } = useFetch(`/admin/users?q=${encodeURIComponent(dq)}`)
  const [sel, setSel] = useState(null)
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState(EMPTY_USER)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const create = async (e) => {
    e.preventDefault()
    try {
      const u = await api('/admin/users', { method: 'POST', body: f })
      window.alert(`Cuenta creada para ${u.email}.\n\nContraseña provisional: ${u.tempPassword}\n\nCópiala ahora y envíasela: no se vuelve a mostrar.`)
      setF(EMPTY_USER); setCreating(false); reload()
    } catch (x) { notify(x.message) }
  }
  if (sel) return <UserDetail id={sel} me={me} notify={notify} onBack={() => { setSel(null); reload() }} />
  return (
    <div className="stack">
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 240 }} placeholder="Buscar por nombre, email, empresa o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row" style={{ gap: 8 }}>
          <ExportButton kind="usuarios" notify={notify} />
          <button className="btn btn-gold btn-sm" onClick={() => setCreating(!creating)}>{creating ? 'Cerrar' : '+ Nueva cuenta'}</button>
        </div>
      </div>
      {creating && (
        <form className="card form" onSubmit={create}>
          <h3>Crear cuenta</h3>
          <div className="grid g3" style={{ gap: 14 }}>
            <div className="field"><label>Email *</label><input className="input" type="email" required value={f.email} onChange={set('email')} /></div>
            <div className="field"><label>Nombre *</label><input className="input" required value={f.firstName} onChange={set('firstName')} /></div>
            <div className="field"><label>Apellidos *</label><input className="input" required value={f.lastName} onChange={set('lastName')} /></div>
            <div className="field"><label>Teléfono</label><input className="input" value={f.phone} onChange={set('phone')} /></div>
            <div className="field"><label>Empresa / cuadra</label><input className="input" value={f.company} onChange={set('company')} /></div>
            <div className="field"><label>Rol</label><RoleSelect value={f.role} onChange={set('role')} /></div>
          </div>
          <p className="small muted">Se genera una contraseña provisional que verás una sola vez para enviársela.</p>
          <div><button className="btn btn-ink">Crear cuenta</button></div>
        </form>
      )}
      {loading && !data ? <p className="muted">Cargando…</p> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Usuario</th><th>Rol</th><th className="num">Caballos</th><th className="num">Informes</th><th>Alta</th><th>Estado</th><th /></tr></thead>
            <tbody>{(data || []).map((u) => (
              <tr key={u.id}>
                <td><span className="t-name">{u.firstName} {u.lastName}</span><div className="small muted">{u.email}{u.company ? ` · ${u.company}` : ''}</div></td>
                <td className="small">{ROLE_LABELS[u.role]}</td>
                <td className="num">{u.horseCount}</td>
                <td className="num">{u.requestCount}</td>
                <td className="small">{fmtDate(u.createdAt)}</td>
                <td><span className={`badge ${u.isActive ? 'ok' : 'bad'}`}>{u.isActive ? 'activa' : 'bloqueada'}</span></td>
                <td><button className="btn btn-line btn-sm" onClick={() => setSel(u.id)}>Abrir</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UserDetail({ id, me, notify, onBack }) {
  const { data: u, reload } = useFetch(`/admin/users/${id}`)
  const [f, setF] = useState(null)
  useEffect(() => { if (u) setF({ email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone || '', country: u.country || '', city: u.city || '', company: u.company || '', role: u.role }) }, [u])
  if (!u || !f) return <p className="muted">Cargando…</p>
  const self = u.id === me
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const patch = async (body, msg) => { try { await api(`/admin/users/${id}`, { method: 'PATCH', body }); notify(msg); reload() } catch (x) { notify(x.message) } }
  const resetPw = async () => {
    if (!window.confirm('¿Generar una contraseña nueva? La actual dejará de funcionar.')) return
    try { const r = await api(`/admin/users/${id}/password`, { method: 'POST' }); window.alert(`Nueva contraseña provisional para ${r.email}:\n\n${r.tempPassword}\n\nCópiala ahora: no se vuelve a mostrar.`) } catch (x) { notify(x.message) }
  }
  return (
    <div className="stack">
      <LinkButton onClick={onBack}>← Usuarios</LinkButton>
      <form className="card form" onSubmit={(e) => { e.preventDefault(); patch(f, 'Usuario actualizado') }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h3>{u.firstName} {u.lastName} {!u.isActive && <span className="badge bad">bloqueada</span>}</h3>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-line btn-sm" onClick={resetPw}>Nueva contraseña</button>
            {!self && <button type="button" className="btn btn-line btn-sm" onClick={() => window.confirm(u.isActive ? '¿Bloquear esta cuenta? No podrá entrar.' : '¿Desbloquear esta cuenta?') && patch({ isActive: !u.isActive }, u.isActive ? 'Cuenta bloqueada' : 'Cuenta desbloqueada')}>{u.isActive ? 'Bloquear cuenta' : 'Desbloquear'}</button>}
          </div>
        </div>
        <div className="grid g3" style={{ gap: 14 }}>
          <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={set('email')} /></div>
          <div className="field"><label>Nombre</label><input className="input" value={f.firstName} onChange={set('firstName')} /></div>
          <div className="field"><label>Apellidos</label><input className="input" value={f.lastName} onChange={set('lastName')} /></div>
          <div className="field"><label>Teléfono</label><input className="input" value={f.phone} onChange={set('phone')} /></div>
          <div className="field"><label>Empresa / cuadra</label><input className="input" value={f.company} onChange={set('company')} /></div>
          <div className="field"><label>Rol</label><RoleSelect value={f.role} disabled={self} onChange={set('role')} /></div>
        </div>
        <div><button className="btn btn-gold">Guardar cambios</button></div>
      </form>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Caballos ({u.horses.length})</h3>
          {u.horses.length ? u.horses.map((h) => <p key={h.id} className="mt8">{h.name} <span className="small muted">· {h.ref} · {HORSE_STATUS[h.status]}</span></p>) : <p className="muted mt8">Ninguno.</p>}
        </div>
        <div className="card">
          <h3>Informes ({u.requests.length})</h3>
          {u.requests.length ? u.requests.map((r) => <p key={r.id} className="mt8">Informe <span className="small muted">· {(REQ_STATUS[r.status] || [r.status])[0]} · {fmtDate(r.createdAt)}</span></p>) : <p className="muted mt8">Ninguno.</p>}
        </div>
      </div>
    </div>
  )
}

// ─── PAGOS ───
function PaymentsAdmin({ notify }) {
  const { data, loading } = useFetch('/admin/payments')
  return (
    <div className="stack">
      <div className="row between"><p className="small muted">Cobros (Stripe). Las devoluciones se hacen desde el panel de Stripe.</p><ExportButton kind="pagos" notify={notify} /></div>
      {loading && !data ? <p className="muted">Cargando…</p> : !data?.length ? <div className="empty">Aún no hay pagos.</div> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Servicio</th><th className="num">Importe</th><th>Estado</th></tr></thead>
            <tbody>{data.map((p) => (
              <tr key={p.id}>
                <td className="small">{fmtDate(p.createdAt)}</td>
                <td className="small">{p.userName}<div className="muted">{p.userEmail}</div></td>
                <td className="small">{p.service === 'INFORME' ? 'Informe' : p.service}</td>
                <td className="num">{eurs(p.amount / 100)}</td>
                <td><span className={`badge ${p.status === 'COMPLETADO' ? 'ok' : p.status === 'PENDIENTE' ? 'example' : 'bad'}`}>{p.status.toLowerCase()}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── AUDITORÍA ───
function AuditAdmin() {
  const { data, loading } = useFetch('/admin/audit')
  if (loading && !data) return <p className="muted">Cargando…</p>
  return (
    <div className="table-scroll">
      <table className="table">
        <thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead>
        <tbody>{(data || []).map((a) => (
          <tr key={a.id}>
            <td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(a.at).toLocaleString('es-ES')}</td>
            <td className="small">{a.userName || '—'}</td>
            <td className="small">{a.entity} · {a.action}</td>
            <td className="small muted" style={{ maxWidth: 420, wordBreak: 'break-word' }}>{a.data ? JSON.stringify(a.data) : ''}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
