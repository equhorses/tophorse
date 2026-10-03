// Panel del cliente: sus caballos, material, resultados e informes
import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { api, fileUrl, openPrivateFile, useAuth, useFetch } from '../api.jsx'
import { Img, LinkButton, Toast } from '../components/ui.jsx'
import { DOC_ROLES, HORSE_STATUS, PHOTO_VIEWS, REQ_STATUS, RESULT_STATUS, SEXES, VIDEO_KINDS, eur, fmtDate } from '../data/content.js'
import { breedName, disciplineName, useCatalog } from '../data/catalog.js'
import YoungReportView from '../components/YoungReport.jsx'

const camel = (s) => s.replace(/_(\w)/g, (_, c) => c.toUpperCase())

export default function Panel() {
  const { user } = useAuth()
  const cat = useCatalog()
  const [params] = useSearchParams()
  const [tab, setTab] = useState('caballos')
  const [toast, setToast] = useState(params.get('pago') === 'ok' ? 'Pago recibido. Tu informe queda en preparación.' : params.get('pago') === 'cancelado' ? 'Pago cancelado: la solicitud queda pendiente.' : '')
  const horses = useFetch(user ? '/my/horses' : null)
  const requests = useFetch(user ? '/my/requests' : null)
  const [selected, setSelected] = useState(null)

  if (!user) return <Navigate to="/acceder?next=/panel" replace />
  const list = horses.data || []
  const current = list.find((h) => h.id === selected)

  return (
    <div className="app-shell">
      <div className="app-top">
        <div className="wrap">
          <span className="eyebrow">Mi panel</span>
          <h2 style={{ fontSize: '2rem' }}>Hola, {user.firstName}</h2>
          <div className="tabs" role="tablist">
            {[['caballos', `Mis caballos (${list.length})`], ['nuevo', 'Dar de alta un caballo'], ['informes', 'Informes y pagos']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => { setTab(k); setSelected(null) }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="wrap section tight">
        {tab === 'caballos' && !current && (
          list.length ? (
            <div className="grid g3">
              {list.map((h) => (
                <button key={h.id} className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setSelected(h.id)}>
                  <div className="row between"><span className="badge light">{disciplineName(cat, h.discipline)}</span><span className="k">{h.ref}</span></div>
                  <h3 className="mt16" style={{ textTransform: 'uppercase' }}>{h.name}</h3>
                  <p className="small muted mt8">{breedName(cat, h.breed)} · {new Date(h.birthDate).getFullYear()}{h.sireName ? ` · por ${h.sireName}` : ''}</p>
                  <p className="small muted mt8">Resultados {h.results.length} · Vídeos {h.videos.length} · Documentos {h.documents.length}</p>
                </button>
              ))}
            </div>
          ) : <div className="empty">Aún no tienes caballos. <LinkButton onClick={() => setTab('nuevo')}>Da de alta el primero</LinkButton>.</div>
        )}
        {tab === 'caballos' && current && <HorseManager h={current} cat={cat} onBack={() => setSelected(null)} onChange={horses.reload} notify={setToast} onReport={() => setTab('informes')} />}
        {tab === 'nuevo' && <NewHorse cat={cat} onDone={(h) => { horses.reload(); setSelected(h.id); setTab('caballos'); setToast('Caballo dado de alta. Ahora añade sus resultados y vídeos.') }} />}
        {tab === 'informes' && <Reports horses={list} cat={cat} requests={requests} notify={setToast} preset={selected} />}
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

// ─── Alta ───
function fieldsFromDoc(role, x) {
  const out = {}
  const put = (k, v) => { if (v !== null && v !== undefined && String(v).trim() !== '') out[k] = String(v).trim() }
  if (role === 'PADRE') put('sireName', x.name)
  else if (role === 'MADRE') { put('damName', x.name); put('damsireName', x.sireName) }
  else {
    ;['name', 'coat', 'microchip', 'ueln', 'officialRegistry', 'studbook', 'sireName', 'damName', 'damsireName', 'breederName', 'country', 'breed'].forEach((k) => put(k, x[k]))
    if (/^\d{4}-\d{2}-\d{2}$/.test(x.birthDate || '')) put('birthDate', x.birthDate)
    if (SEXES[x.sex]) put('sex', x.sex)
  }
  return out
}

const EMPTY_HORSE = { name: '', birthDate: '', sex: 'MACHO', discipline: '', breed: '', coat: '', country: 'España', sireName: '', damName: '', damsireName: '', breederName: '', microchip: '', ueln: '', officialRegistry: '', studbook: '', trainerName: '', feiId: '' }

export function HorseForm({ f, setF, cat, aiKeys = [], onEdit }) {
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); onEdit?.(k) }
  const cls = (k, base = 'input') => (aiKeys.includes(k) ? `${base} ai-filled` : base)
  const disc = cat?.disciplines.find((d) => d.key === f.discipline)
  const breeds = cat ? [...(disc ? disc.breeds : []), ...cat.breeds.map((b) => b.key).filter((b) => !disc || !disc.breeds.includes(b))] : []
  return (
    <div className="grid g3" style={{ gap: 16 }}>
      <div className="field"><label>Nombre *</label><input className={cls('name')} required value={f.name} onChange={set('name')} /></div>
      <div className="field"><label>Fecha de nacimiento *</label><input className={cls('birthDate')} type="date" required value={f.birthDate || ''} onChange={set('birthDate')} /></div>
      <div className="field"><label>Sexo *</label><select className={cls('sex', 'select')} value={f.sex} onChange={set('sex')}>{Object.entries(SEXES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label>Disciplina *</label>
        <select className="select" required value={f.discipline} onChange={set('discipline')}>
          <option value="">Elige…</option>
          {cat?.groups.map((g) => <optgroup key={g.key} label={g.name}>{cat.disciplines.filter((d) => d.group === g.key).map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</optgroup>)}
        </select>
      </div>
      <div className="field"><label>Raza *</label>
        <select className={cls('breed', 'select')} required value={f.breed} onChange={set('breed')}>
          <option value="">Elige…</option>
          {breeds.map((b) => <option key={b} value={b}>{breedName(cat, b)}</option>)}
        </select>
      </div>
      <div className="field"><label>País *</label><input className={cls('country')} required value={f.country} onChange={set('country')} /></div>
      <div className="field"><label>Padre</label><input className={cls('sireName')} value={f.sireName || ''} onChange={set('sireName')} /></div>
      <div className="field"><label>Madre</label><input className={cls('damName')} value={f.damName || ''} onChange={set('damName')} /></div>
      <div className="field"><label>Abuelo materno</label><input className={cls('damsireName')} value={f.damsireName || ''} onChange={set('damsireName')} placeholder="Padre de la madre" /></div>
      <div className="field"><label>Capa</label><input className={cls('coat')} value={f.coat || ''} onChange={set('coat')} /></div>
      <div className="field"><label>Criador</label><input className={cls('breederName')} value={f.breederName || ''} onChange={set('breederName')} /></div>
      <div className="field"><label>Entrenador</label><input className="input" value={f.trainerName || ''} onChange={set('trainerName')} /></div>
      <div className="field"><label>Microchip</label><input className={cls('microchip')} value={f.microchip || ''} onChange={set('microchip')} /></div>
      <div className="field"><label>UELN</label><input className={cls('ueln')} value={f.ueln || ''} onChange={set('ueln')} /></div>
      <div className="field"><label>FEI ID</label><input className="input" value={f.feiId || ''} onChange={set('feiId')} placeholder="Si compite en FEI" /></div>
      <div className="field"><label>Libro genealógico y nº</label>
        <div className="row" style={{ gap: 6 }}>
          <input className={cls('studbook')} style={{ flex: 1 }} value={f.studbook || ''} onChange={set('studbook')} placeholder="Libro" />
          <input className={cls('officialRegistry')} style={{ flex: 1 }} value={f.officialRegistry || ''} onChange={set('officialRegistry')} placeholder="Nº" />
        </div>
      </div>
    </div>
  )
}

function DocUpload({ role, doc, onFile, busy }) {
  return (
    <label className={`doc-slot ${doc ? (doc.aiError ? 'warn' : 'done') : ''}`}>
      <strong>{DOC_ROLES[role]}</strong>
      <span className="small muted">
        {busy ? 'Leyendo el documento…'
          : doc ? (doc.aiError ? `Subido. ${doc.aiError}` : `✓ Leído: ${doc.docType || 'documento'}${doc.notes ? ` · ${doc.notes}` : ''}`)
          : role === 'EJEMPLAR' ? 'Carta genealógica, pasaporte o ficha de subasta (foto o PDF)' : 'Su carta genealógica (foto o PDF)'}
      </span>
      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => onFile(e.target.files[0])} />
    </label>
  )
}

function NewHorse({ cat, onDone }) {
  const [f, setF] = useState(EMPTY_HORSE)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [docs, setDocs] = useState({})
  const [reading, setReading] = useState('')
  const [aiKeys, setAiKeys] = useState([])
  const readDoc = async (role, file) => {
    if (!file) return
    setErr(''); setReading(role)
    try {
      const form = new FormData(); form.append('role', role); form.append('file', file)
      const d = await api('/my/documents/extract', { method: 'POST', form })
      setDocs((x) => ({ ...x, [role]: d }))
      if (d.fields) {
        const add = fieldsFromDoc(role, d.fields)
        setF((x) => ({ ...x, ...add }))
        setAiKeys((a) => [...new Set([...a, ...Object.keys(add)])])
      }
    } catch (x) { setErr(x.message) }
    setReading('')
  }
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { onDone(await api('/my/horses', { method: 'POST', body: { ...f, documentIds: Object.values(docs).map((d) => d.id) } })) } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <form className="card form" onSubmit={submit} style={{ maxWidth: 940 }}>
      <h3>1 · Sube la documentación (opcional, recomendado)</h3>
      <p className="muted small">La IA lee el documento y rellena la ficha por ti. Revisa lo que ha puesto (en amarillo) antes de guardar. La documentación es privada.</p>
      <div className="doc-slots">
        {['EJEMPLAR', 'PADRE', 'MADRE'].map((r) => <DocUpload key={r} role={r} doc={docs[r]} busy={reading === r} onFile={(file) => readDoc(r, file)} />)}
      </div>
      <h3 className="mt16">2 · Revisa los datos del caballo</h3>
      {aiKeys.length > 0 && <p className="small ai-note">Los campos en amarillo los ha rellenado la IA a partir del documento. Compruébalos.</p>}
      <HorseForm f={f} setF={setF} cat={cat} aiKeys={aiKeys} onEdit={(k) => setAiKeys((a) => a.filter((x) => x !== k))} />
      {err && <p className="notice bad">{err}</p>}
      <div><button className="btn btn-ink" disabled={busy}>{busy ? 'Guardando…' : 'Dar de alta'}</button></div>
    </form>
  )
}

// ─── Ficha del caballo ───
function HorseManager({ h, cat, onBack, onChange, notify, onReport }) {
  const [busy, setBusy] = useState('')
  const uploadPhoto = async (view, file) => {
    if (!file) return
    const form = new FormData(); form.append('file', file)
    setBusy(view)
    try { await api(`/my/horses/${h.id}/photos/${view}`, { method: 'POST', form }); notify('Foto subida'); onChange() } catch (x) { notify(x.message) }
    setBusy('')
  }
  return (
    <div className="stack">
      <LinkButton onClick={onBack}>← Mis caballos</LinkButton>
      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '2rem', textTransform: 'uppercase' }}>{h.name}</h2>
            <p className="k mt8">{h.ref} · {disciplineName(cat, h.discipline)} · {breedName(cat, h.breed)} · {SEXES[h.sex]} · {fmtDate(h.birthDate)}</p>
            <p className="small muted mt8">{[h.sireName && `Padre: ${h.sireName}`, h.damName && `Madre: ${h.damName}`, h.damsireName && `Abuelo materno: ${h.damsireName}`].filter(Boolean).join(' · ') || 'Genealogía sin completar'}</p>
          </div>
          <div className="stack" style={{ gap: 8, alignItems: 'flex-end' }}>
            <span className="badge light">{HORSE_STATUS[h.status]}</span>
            <button className="btn btn-gold" onClick={onReport}>Pedir informe</button>
          </div>
        </div>
      </div>
      {(h.youngReports || []).map((r) => <div key={r.id} className="card"><YoungReportView report={r} disciplineName={disciplineName(cat, r.discipline)} /></div>)}
      <ResultsCard h={h} cat={cat} notify={notify} onChange={onChange} base="/my" />
      <VideosCard h={h} cat={cat} notify={notify} onChange={onChange} />
      <HorseDocs h={h} notify={notify} onChange={onChange} />
      <div className="card">
        <h3>Fotografías (opcional)</h3>
        <p className="muted small mt8">Caballo cuadrado, fondo neutro, cámara a la altura del tronco. Ayudan a analizar su conformación.</p>
        <div className="photo-slots mt16">
          {PHOTO_VIEWS.map((v) => {
            const p = h.photos.find((x) => x.view === v.key)
            return (
              <label key={v.key} className="slot">
                {p ? <Img src={p.url} alt={v.label} /> : <span>{busy === v.key ? 'Subiendo…' : '+ Subir foto'}</span>}
                <span className="slot-label">{v.label}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadPhoto(v.key, e.target.files[0])} />
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Resultado: valor formateado para la tabla
const fmtTime = (s) => { if (s == null) return null; const m = Math.floor(s / 60); const r = (s - m * 60).toFixed(2).padStart(5, '0'); return m ? `${m}:${r}` : `${Number(s).toFixed(2)} s` }
export function resultFacts(r) {
  return [
    r.distanceM != null && `${r.distanceM} m`, r.timeS != null && fmtTime(r.timeS), r.going, r.score != null && `nota ${r.score}`,
    r.faults != null && `${r.faults} faltas`, r.speedKmh != null && `${r.speedKmh} km/h`, r.rating != null && `rating ${r.rating}${r.ratingAuthority ? ` (${r.ratingAuthority})` : ''}`,
    r.lengthsBeaten != null && `a ${r.lengthsBeaten} cuerpos`, r.weightKg != null && `${r.weightKg} kg`, r.speedIndex != null && `SI ${r.speedIndex}`,
    r.penalties != null && `${r.penalties} pen.`, r.eventMeanScore != null && `media prueba ${r.eventMeanScore}`, r.eventClearCount != null && `${r.eventClearCount} limpios en la prueba`,
    r.eliminationReason, r.earningsEur != null && `${Number(r.earningsEur).toLocaleString('es-ES')} €`,
  ].filter(Boolean).join(' · ')
}

const EMPTY_RESULT = { competition: '', date: '', country: '', category: '', level: '', status: 'CLASIFICADO', position: '', fieldSize: '' }

// Resultados: se sube el documento oficial; la IA lo lee; se verifica. base = '/my' (cliente) o '/admin' (dirección)
export function ResultsCard({ h, cat, notify, onChange, base, adminActions }) {
  const disc = cat?.disciplines.find((d) => d.key === h.discipline)
  const extra = disc ? disc.fields : []
  const [m, setM] = useState(EMPTY_RESULT)
  const [doc, setDoc] = useState(null)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setM({ ...m, [k]: e.target.value })
  const send = async (withFields) => {
    if (!doc && base === '/my') return notify('Adjunta el documento oficial del resultado')
    setBusy(true)
    try {
      const form = new FormData()
      if (doc) form.append('document', doc)
      if (withFields) Object.entries(m).forEach(([k, v]) => form.append(k, v ?? ''))
      const r = await api(`${base}/horses/${h.id}/results`, { method: 'POST', form })
      notify(base === '/my' ? `Resultado añadido${r.aiWarning ? ' (con aviso para revisar)' : ''}: queda pendiente de verificar` : 'Resultado registrado')
      setM(EMPTY_RESULT); setDoc(null); setManual(false); onChange?.()
    } catch (x) {
      notify(x.message)
      if (x.status === 422) {
        setManual(true)
        const p = x.partial || {}
        setM((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(p).filter(([k, v]) => k in { ...EMPTY_RESULT, ...Object.fromEntries(extra.map((f) => [camel(f), 1])) } && v != null).map(([k, v]) => [k, String(v)])) }))
      }
    }
    setBusy(false)
  }
  const results = h.results || []
  return (
    <div className="card">
      <h3>Resultados ({results.length})</h3>
      <p className="small muted mt8">Sube el documento oficial (clasificación, acta o ficha de la carrera): la IA lee la competición, la fecha, el puesto{extra.length ? `, ${extra.map((f) => cat.fieldLabels[f].toLowerCase()).join(', ')}` : ''}. Cada resultado se verifica antes de entrar en el análisis.</p>
      {results.length > 0 && (
        <div className="table-scroll mt16">
          <table className="table data-table">
            <thead><tr><th>Fecha</th><th>Competición</th><th>Nivel</th><th className="num">Puesto</th><th>Datos</th><th>Estado</th>{adminActions && <th />}</tr></thead>
            <tbody>{results.map((r) => (
              <tr key={r.id}>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                <td className="small"><span className="t-name">{r.competition}</span>{r.category && <div className="muted">{r.category}</div>}{r.aiWarning && <div className="chk DISTINTO">⚠ {r.aiWarning}</div>}{r.documentUrl && <a className="link" href={fileUrl(r.documentUrl)} target="_blank" rel="noreferrer">Documento</a>}</td>
                <td className="small">{r.level || '—'}</td>
                <td className="num">{r.status === 'CLASIFICADO' ? `${r.position}${r.fieldSize ? `/${r.fieldSize}` : ''}` : RESULT_STATUS[r.status]}</td>
                <td className="small">{resultFacts(r) || '—'}</td>
                <td><span className={`badge ${r.verified ? 'ok' : 'example'}`}>{r.verified ? 'verificado' : 'pendiente'}</span></td>
                {adminActions && <td>{adminActions(r)}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="row mt16" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDoc(e.target.files[0])} />
        {!manual && <button type="button" className="btn btn-ink btn-sm" disabled={busy || !doc} onClick={() => send(false)}>{busy ? 'Leyendo el documento…' : 'Añadir resultado'}</button>}
        {!manual && <LinkButton className="link small" onClick={() => setManual(true)}>o escribirlo a mano</LinkButton>}
      </div>
      {manual && (
        <div className="stack mt16" style={{ gap: 8 }}>
          <div className="grid g3" style={{ gap: 8 }}>
            <input className="input" placeholder="Competición / hipódromo *" value={m.competition} onChange={set('competition')} />
            <input className="input" type="date" value={m.date} onChange={set('date')} />
            <input className="input" placeholder="País" value={m.country} onChange={set('country')} />
            <input className="input" placeholder="Prueba / carrera" value={m.category} onChange={set('category')} />
            <input className="input" list={`lv-${h.id}`} placeholder="Nivel" value={m.level} onChange={set('level')} />
            <datalist id={`lv-${h.id}`}>{(disc?.levels || []).map((l) => <option key={l} value={l} />)}</datalist>
            <select className="select" value={m.status} onChange={set('status')}>{Object.entries(RESULT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input className="input" placeholder="Puesto" inputMode="numeric" value={m.position} onChange={set('position')} />
            <input className="input" placeholder="Participantes" inputMode="numeric" value={m.fieldSize} onChange={set('fieldSize')} />
            {extra.map((f) => <input key={f} className="input" placeholder={cat.fieldLabels[f]} value={m[camel(f)] || ''} onChange={set(camel(f))} />)}
          </div>
          <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn-ink btn-sm" disabled={busy} onClick={() => send(true)}>{busy ? 'Guardando…' : 'Guardar resultado'}</button><button type="button" className="btn btn-line btn-sm" onClick={() => setManual(false)}>Cancelar</button></div>
        </div>
      )}
    </div>
  )
}

function VideosCard({ h, cat, notify, onChange }) {
  const kn = cat?.knowledge?.disciplines?.[h.discipline]
  const film = kn && cat.knowledge.filming[kn.video.filming]
  const months = Math.floor((Date.now() - new Date(h.birthDate).getTime()) / (30.44 * 864e5))
  const stages = cat?.knowledge?.stages?.[h.discipline] || []
  const stage = [...stages].reverse().find((st) => months >= st.from)
  const [f, setF] = useState({ kind: 'ENTRENAMIENTO', title: '', recordedOn: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData(); form.append('file', file); Object.entries(f).forEach(([k, v]) => form.append(k, v))
      await api(`/my/horses/${h.id}/videos`, { method: 'POST', form }); notify('Vídeo subido'); setFile(null); setF({ ...f, title: '' }); onChange()
    } catch (x) { notify(x.message) }
    setBusy(false)
  }
  const [link, setLink] = useState('')
  const fromUrl = async () => {
    if (!link) return
    setBusy(true)
    try { await api(`/my/horses/${h.id}/videos/from-url`, { method: 'POST', body: { url: link, ...f } }); notify('Vídeo añadido'); setLink(''); onChange() } catch (x) { notify(x.message) }
    setBusy(false)
  }
  const del = async (v) => { if (!window.confirm('¿Borrar este vídeo?')) return; try { await api(`/my/horses/${h.id}/videos/${v.id}`, { method: 'DELETE' }); onChange() } catch (x) { notify(x.message) } }
  return (
    <div className="card">
      <h3>Vídeos ({h.videos.length})</h3>
      <p className="small muted mt8">Entrenamiento, competición, subasta, a la mano o en libertad. MP4, MOV o WEBM.</p>
      {stage && months < 48 && <p className="notice small mt8"><strong>Qué vídeo enviar ahora ({stage.name}):</strong> {stage.material}</p>}
      {film && <p className="notice info small mt8"><strong>Para que el vídeo sirva para medir:</strong> {film.view} · {film.fps} · {film.calibration}. Si no se puede, súbelo igual: se analizará de forma descriptiva.</p>}
      {h.videos.map((v) => (
        <p key={v.id} className="mt8">
          <a className="link" href={fileUrl(v.url)} target="_blank" rel="noreferrer">{v.title || VIDEO_KINDS[v.kind]}</a>
          <span className="small muted"> · {VIDEO_KINDS[v.kind]} · {fmtDate(v.recordedOn || v.uploadedAt)}</span>{' '}
          <LinkButton className="link small" onClick={() => del(v)}>borrar</LinkButton>
        </p>
      ))}
      <div className="grid g3 mt16" style={{ gap: 8 }}>
        <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(VIDEO_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input className="input" placeholder="Título (opcional)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input className="input" type="date" title="Fecha de grabación" value={f.recordedOn} onChange={(e) => setF({ ...f, recordedOn: e.target.value })} />
      </div>
      <div className="row mt8" style={{ gap: 8 }}>
        <input className="input" style={{ flex: 1 }} type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setFile(e.target.files[0])} />
        <button type="button" className="btn btn-ink btn-sm" disabled={busy || !file} onClick={send}>{busy ? 'Subiendo…' : 'Subir vídeo'}</button>
      </div>
      <div className="row mt8" style={{ gap: 8 }}>
        <input className="input" style={{ flex: 1 }} placeholder="…o pega un enlace (web de la subasta, YouTube, Vimeo)" value={link} onChange={(e) => setLink(e.target.value)} />
        <button type="button" className="btn btn-line btn-sm" disabled={busy || !link} onClick={fromUrl}>{busy ? 'Descargando…' : 'Añadir desde enlace'}</button>
      </div>
    </div>
  )
}

function HorseDocs({ h, notify, onChange }) {
  const [role, setRole] = useState('EJEMPLAR')
  const [busy, setBusy] = useState(false)
  const send = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData(); form.append('role', role); form.append('file', file)
      await api(`/my/horses/${h.id}/documents`, { method: 'POST', form }); notify('Documento subido'); onChange()
    } catch (x) { notify(x.message) }
    setBusy(false)
  }
  return (
    <div className="card">
      <h3>Documentación</h3>
      <p className="muted small mt8">Carta genealógica, pasaporte o ficha de subasta del caballo y de sus padres. Es privada: solo la ve nuestro equipo.</p>
      {(h.documents || []).map((d) => (
        <p key={d.id} className="mt8">
          <LinkButton onClick={() => openPrivateFile(`/my/documents/${d.id}/file`).catch((x) => notify(x.message))}>{DOC_ROLES[d.role]}</LinkButton>
          <span className="small muted"> · {d.docType || d.originalName} · {fmtDate(d.createdAt)}</span>
        </p>
      ))}
      <div className="row mt16" style={{ gap: 8 }}>
        <select className="select" style={{ maxWidth: 260 }} value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(DOC_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="btn btn-line" style={{ cursor: 'pointer' }}>
          {busy ? 'Leyendo…' : 'Subir documento'}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} onChange={(e) => send(e.target.files[0])} />
        </label>
      </div>
    </div>
  )
}

// ─── Informes ───
function Reports({ horses, cat, requests, notify, preset }) {
  const [f, setF] = useState({ horseId: preset || '', notes: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!f.horseId && horses[0]) setF((x) => ({ ...x, horseId: horses[0].id })) }, [horses])
  const svc = cat?.services.find((s) => s.code === 'INFORME')
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const form = new FormData()
    form.append('service', 'INFORME'); form.append('horseId', f.horseId); form.append('notes', f.notes)
    try {
      const r = await api('/my/requests', { method: 'POST', form })
      if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return }
      notify(r.message || 'Solicitud registrada'); setF({ ...f, notes: '' }); requests.reload()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <div className="grid g2" style={{ alignItems: 'start', gap: 32 }}>
      <form className="card form" onSubmit={submit}>
        <h3>Pedir un informe</h3>
        <div className="field"><label>Caballo</label>
          {horses.length ? (
            <select className="select" value={f.horseId} onChange={(e) => setF({ ...f, horseId: e.target.value })}>
              {horses.map((h) => <option key={h.id} value={h.id}>{h.name} · {h.ref}</option>)}
            </select>
          ) : <p className="notice">Primero da de alta un caballo.</p>}
        </div>
        <p className="small muted">Cuantos más resultados, vídeos y documentos tenga el caballo, más completo será el informe.</p>
        <div className="field"><label>¿Qué quieres saber? (opcional)</label><textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Por ejemplo: voy a comprarlo, quiero saber si seguir en carreras o pasar a otra disciplina…" /></div>
        {err && <p className="notice bad">{err}</p>}
        <button className="btn btn-gold btn-block" disabled={busy || !horses.length}>{busy ? 'Enviando…' : svc?.price === 0 ? 'Pedir informe (gratis en fase de pruebas)' : `Pedir y pagar ${svc ? eur(svc.price) : ''}`}</button>
      </form>
      <div>
        <h3>Mis solicitudes</h3>
        <div className="mt16">
          {(requests.data || []).length ? requests.data.map((r) => {
            const [label, cls] = REQ_STATUS[r.status] || [r.status, 'light']
            return (
              <div key={r.id} className="card" style={{ padding: 18, marginBottom: 12 }}>
                <div className="row between"><strong>Informe · {r.horseName}</strong><span className={`badge ${cls}`}>{label}</span></div>
                <p className="small muted mt8">{fmtDate(r.createdAt)}{r.adminNotes ? ` · ${r.adminNotes}` : ''}</p>
              </div>
            )
          }) : <div className="empty">Sin solicitudes todavía.</div>}
        </div>
      </div>
    </div>
  )
}
