// Archivo de datos (dirección): fuentes, subastas con vídeo y precio, importación CSV y análisis de vídeo con IA
import { useState } from 'react'
import { api, downloadPrivate, fileUrl, useFetch } from '../api.jsx'
import { LinkButton } from '../components/ui.jsx'
import { fmtDate } from '../data/content.js'
import { disciplineName } from '../data/catalog.js'

const KIND = { RESULTADOS: 'Resultados', GENEALOGIA: 'Genealogía', INDICES: 'Índices genéticos', SUBASTA: 'Subasta', VIDEO: 'Vídeo', SENSORES: 'Sensores' }
const ACCESS = { PUBLICO: 'Público', PUBLICO_CABALLO_A_CABALLO: 'Público, caballo a caballo', SUSCRIPCION: 'Suscripción', LICENCIA: 'Licencia', CONVENIO: 'Convenio' }
const SRC_STATUS = { PENDIENTE: ['Pendiente', 'example'], CONTACTADO: ['Contactado', 'light'], PERMISO: ['Con permiso', 'ok'], ACTIVA: ['Activa', 'ok'], DESCARTADA: ['Descartada', 'bad'] }
const BLOCKS = { 1: 'Bloque 1 · España (gratis, pedir permiso por escrito)', 2: 'Bloque 2 · Vídeo + precio de subastas', 3: 'Bloque 3 · Licencias de resultados', 4: 'Bloque 4 · Árabes y raid' }
const LOT_STATUS = { VENDIDO: ['Vendido', 'ok'], RECOMPRADO: ['Recomprado', 'example'], NO_VENDIDO: ['No vendido', 'bad'], RETIRADO: ['Retirado', 'light'] }

const money = (n, cur) => (n == null ? '—' : `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${cur === 'EUR' ? '€' : cur || ''}`)

// ─── TASAS BASE ───
// Qué % de potros de cada disciplina llega a cada nivel. Es el punto de partida de todas las probabilidades del informe de potro.
export function BaseRatesAdmin({ cat, isAdmin, notify }) {
  const { data, reload } = useFetch('/admin/settings')
  const [edit, setEdit] = useState(null)
  if (!data || !cat) return null
  const rates = data.base_rates || {}
  const levelsOf = (d) => cat.knowledge?.young?.[d] || []
  const start = () => setEdit(Object.fromEntries(cat.disciplines.map((d) => {
    const names = [...new Set([...levelsOf(d.key), ...(rates[d.key] || []).map((r) => r.level)])]
    return [d.key, names.map((level) => { const r = (rates[d.key] || []).find((x) => x.level === level); return { level, rate: r?.rate != null ? String(Math.round(r.rate * 1000) / 10) : '', source: r?.source || '' } })]
  })))
  const save = async () => {
    const body = Object.fromEntries(Object.entries(edit).map(([k, list]) => [k, list.filter((r) => r.rate !== '').map((r) => ({ level: r.level, rate: Number(String(r.rate).replace(',', '.')) / 100, source: r.source || null }))]))
    try { await api('/admin/settings', { method: 'PATCH', body: { base_rates: body } }); notify('Tasas base guardadas'); setEdit(null); reload() } catch (x) { notify(x.message) }
  }
  return (
    <div className="card">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3>Tasas base por disciplina</h3>
          <p className="small muted mt8">De cada 100 potros, cuántos llegan a cada nivel. Todas las probabilidades del informe de potro parten de aquí. Solo hay cifras con fuente; el resto se rellenará con los datos de los convenios (FN, SWB, KWPN…).</p>
        </div>
        {isAdmin && !edit && <button className="btn btn-line btn-sm" onClick={start}>Editar</button>}
        {edit && <div className="row" style={{ gap: 8 }}><button className="btn btn-gold btn-sm" onClick={save}>Guardar</button><button className="btn btn-line btn-sm" onClick={() => setEdit(null)}>Cancelar</button></div>}
      </div>
      <div className="grid g2 mt16" style={{ gap: 16 }}>
        {cat.disciplines.map((d) => (
          <div key={d.key}>
            <p className="small t-name">{d.name}</p>
            <table className="table mt8"><tbody>{(edit ? edit[d.key] : levelsOf(d.key).map((level) => ({ level, ...((rates[d.key] || []).find((x) => x.level === level) || {}) }))).map((r, i) => (
              <tr key={r.level}>
                <td className="small">{r.level}</td>
                <td className="small" style={{ width: 110 }}>{edit
                  ? <input className="input" style={{ padding: '4px 8px' }} inputMode="decimal" placeholder="%" value={r.rate} onChange={(e) => setEdit({ ...edit, [d.key]: edit[d.key].map((x, n) => (n === i ? { ...x, rate: e.target.value } : x)) })} />
                  : r.rate != null ? `${Math.round(r.rate * 1000) / 10} %` : <span className="muted">sin dato</span>}</td>
                <td className="small muted">{edit
                  ? <input className="input" style={{ padding: '4px 8px' }} placeholder="Fuente" value={r.source} onChange={(e) => setEdit({ ...edit, [d.key]: edit[d.key].map((x, n) => (n === i ? { ...x, source: e.target.value } : x)) })} />
                  : r.source}</td>
              </tr>
            ))}</tbody></table>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── FUENTES ───
export function SourcesAdmin({ cat, isAdmin, notify }) {
  const { data, loading, reload } = useFetch('/admin/sources')
  const [open, setOpen] = useState(null)
  const setStatus = async (s, status) => {
    const statusNotes = window.prompt('Nota (con quién has hablado, qué te han dicho…)', s.statusNotes || '')
    if (statusNotes === null) return
    try { await api(`/admin/sources/${s.key}`, { method: 'PATCH', body: { status, statusNotes } }); notify('Fuente actualizada'); reload() } catch (x) { notify(x.message) }
  }
  if (loading && !data) return <p className="muted">Cargando…</p>
  return (
    <div className="stack">
      <p className="small muted">Dónde están los datos de cada disciplina y en qué orden cargarlos. Marca el estado a medida que contactes con cada una: casi ninguna publica licencia de reutilización, así que antes de automatizar la extracción conviene tener el permiso por escrito.</p>
      {[1, 2, 3, 4].map((b) => (
        <div key={b}>
          <span className="eyebrow">{BLOCKS[b]}</span>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Fuente</th><th>Tipo</th><th>Disciplinas</th><th>Acceso</th><th>Vídeo / precio</th><th>Estado</th></tr></thead>
              <tbody>{(data || []).filter((s) => s.block === b).map((s) => {
                const [label, cls] = SRC_STATUS[s.status]
                return (
                  <tr key={s.key}>
                    <td className="small" style={{ maxWidth: 360 }}>
                      <span className="t-name">{s.url ? <a className="link" href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}</span>
                      <div className="muted">{s.region}{s.lotCount ? ` · ${s.lotCount} lotes en el archivo` : ''}</div>
                      {open === s.key ? <div className="mt8">{s.notes}{s.statusNotes && <div className="mt8"><strong>Seguimiento:</strong> {s.statusNotes}</div>}</div>
                        : (s.notes || s.statusNotes) && <LinkButton className="link small" onClick={() => setOpen(s.key)}>ver notas</LinkButton>}
                    </td>
                    <td className="small">{KIND[s.kind]}</td>
                    <td className="small">{s.disciplines.map((d) => disciplineName(cat, d)).join(', ')}</td>
                    <td className="small">{ACCESS[s.access]}</td>
                    <td className="small">{s.hasVideo ? 'Vídeo' : '—'} · {s.hasPrices ? 'Precios' : '—'}</td>
                    <td>{isAdmin
                      ? <select className="select" style={{ minWidth: 150 }} value={s.status} onChange={(e) => setStatus(s, e.target.value)}>{Object.entries(SRC_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                      : <span className={`badge ${cls}`}>{label}</span>}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── SUBASTAS ───
const EMPTY_LOT = { sourceKey: '', saleName: '', saleDate: '', lot: '', discipline: '', horseName: '', sireName: '', damName: '', damsireName: '', sex: '', birthYear: '', price: '', currency: 'EUR', saleStatus: 'VENDIDO', breezeTimeS: '', breezeDistance: '', videoUrl: '' }

export function SalesAdmin({ cat, isAdmin, notify, openHorse }) {
  const [sale, setSale] = useState('')
  const [q, setQ] = useState('')
  const sales = useFetch('/admin/sales')
  const lots = useFetch(`/admin/sale-lots?sale=${encodeURIComponent(sale)}&q=${encodeURIComponent(q)}`)
  const sources = useFetch('/admin/sources')
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState(EMPTY_LOT)
  const [video, setVideo] = useState(null)
  const [sel, setSel] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const reload = () => { sales.reload(); lots.reload() }
  const create = async (e) => {
    e.preventDefault()
    const form = new FormData(); Object.entries(f).forEach(([k, v]) => form.append(k, v)); if (video) form.append('video', video)
    try { await api('/admin/sale-lots', { method: 'POST', form }); notify('Lote añadido'); setF({ ...EMPTY_LOT, sourceKey: f.sourceKey, saleName: f.saleName, saleDate: f.saleDate, discipline: f.discipline, currency: f.currency }); setVideo(null); reload() } catch (x) { notify(x.message) }
  }
  if (sel) return <LotDetail id={sel} lots={lots.data || []} cat={cat} isAdmin={isAdmin} notify={notify} openHorse={openHorse} onBack={() => { setSel(null); reload() }} />
  return (
    <div className="stack">
      <p className="small muted">Archivo de subastas: cada lote con su vídeo, su precio y si se vendió de verdad (las recompras no cuentan como precio de mercado). Enlaza cada lote con su caballo para seguir después sus resultados: así se entrena el modelo.</p>
      <div className="table-scroll">
        <table className="table data-table">
          <thead><tr><th>Subasta</th><th>Fecha</th><th className="num">Lotes</th><th className="num">Vendidos</th><th className="num">Con vídeo</th><th className="num">Enlazados</th><th className="num">Precio medio</th></tr></thead>
          <tbody>{(sales.data || []).map((s) => (
            <tr key={s.saleName} style={{ cursor: 'pointer', background: sale === s.saleName ? 'var(--gold-soft)' : undefined }} onClick={() => setSale(sale === s.saleName ? '' : s.saleName)}>
              <td className="t-name">{s.saleName}</td><td className="small">{fmtDate(s.saleDate)}</td><td className="num">{s.lots}</td><td className="num">{s.sold}</td><td className="num">{s.videos}</td><td className="num">{s.linked}</td><td className="num">{money(s.avgPrice, s.currency)}</td>
            </tr>
          ))}</tbody>
        </table>
        {!sales.data?.length && <div className="empty">Aún no hay subastas en el archivo. Añade lotes a mano o impórtalos desde la pestaña Importar.</div>}
      </div>
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Buscar lote, caballo, padre o madre…" value={q} onChange={(e) => setQ(e.target.value)} />
        {sale && <button className="btn btn-line btn-sm" onClick={() => setSale('')}>Ver todas las subastas</button>}
        {isAdmin && <button className="btn btn-gold btn-sm" onClick={() => setCreating(!creating)}>{creating ? 'Cerrar' : '+ Añadir lote'}</button>}
      </div>
      {creating && (
        <form className="card form" onSubmit={create}>
          <h3>Añadir lote</h3>
          <div className="grid g3" style={{ gap: 12 }}>
            <div className="field"><label>Fuente</label><select className="select" value={f.sourceKey} onChange={set('sourceKey')}><option value="">—</option>{(sources.data || []).filter((s) => s.kind === 'SUBASTA').map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></div>
            <div className="field"><label>Subasta *</label><input className="input" required value={f.saleName} onChange={set('saleName')} placeholder="OBS March 2026" /></div>
            <div className="field"><label>Fecha</label><input className="input" type="date" value={f.saleDate} onChange={set('saleDate')} /></div>
            <div className="field"><label>Lote</label><input className="input" value={f.lot} onChange={set('lot')} /></div>
            <div className="field"><label>Disciplina</label><select className="select" value={f.discipline} onChange={set('discipline')}><option value="">—</option>{cat?.disciplines.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</select></div>
            <div className="field"><label>Caballo (si tiene nombre)</label><input className="input" value={f.horseName} onChange={set('horseName')} /></div>
            <div className="field"><label>Padre</label><input className="input" value={f.sireName} onChange={set('sireName')} /></div>
            <div className="field"><label>Madre</label><input className="input" value={f.damName} onChange={set('damName')} /></div>
            <div className="field"><label>Abuelo materno</label><input className="input" value={f.damsireName} onChange={set('damsireName')} /></div>
            <div className="field"><label>Año de nacimiento</label><input className="input" inputMode="numeric" value={f.birthYear} onChange={set('birthYear')} /></div>
            <div className="field"><label>Precio y moneda</label><div className="row" style={{ gap: 6 }}><input className="input" style={{ flex: 1 }} value={f.price} onChange={set('price')} /><select className="select" style={{ width: 90 }} value={f.currency} onChange={set('currency')}>{['EUR', 'USD', 'GBP', 'GNS', 'AUD', 'AED'].map((c) => <option key={c}>{c}</option>)}</select></div></div>
            <div className="field"><label>Estado</label><select className="select" value={f.saleStatus} onChange={set('saleStatus')}>{Object.entries(LOT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label>Breeze (s) y distancia</label><div className="row" style={{ gap: 6 }}><input className="input" style={{ flex: 1 }} value={f.breezeTimeS} onChange={set('breezeTimeS')} placeholder="10,2" /><input className="input" style={{ width: 80 }} value={f.breezeDistance} onChange={set('breezeDistance')} placeholder="1f" /></div></div>
            <div className="field"><label>Enlace al vídeo</label><input className="input" value={f.videoUrl} onChange={set('videoUrl')} placeholder="https://…" /></div>
            <div className="field"><label>Copia del vídeo (para analizarlo)</label><input className="input" type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setVideo(e.target.files[0])} /></div>
          </div>
          <div><button className="btn btn-ink">Guardar lote</button></div>
        </form>
      )}
      {lots.loading && !lots.data ? <p className="muted">Cargando…</p> : lots.data?.length > 0 && (
        <div className="table-scroll">
          <table className="table data-table">
            <thead><tr><th>Lote</th><th>Caballo / pedigrí</th><th>Disciplina</th><th className="num">Precio</th><th>Estado</th><th className="num">Breeze</th><th>Vídeo</th><th>Caballo enlazado</th><th /></tr></thead>
            <tbody>{lots.data.map((l) => {
              const [label, cls] = LOT_STATUS[l.saleStatus]
              return (
                <tr key={l.id}>
                  <td className="small"><span className="t-name">{l.lot || '—'}</span><div className="muted">{l.saleName}</div></td>
                  <td className="small">{l.horseName || <em className="muted">sin nombre</em>}<div className="muted">{[l.sireName, l.damName].filter(Boolean).join(' × ')}{l.birthYear ? ` · ${l.birthYear}` : ''}</div></td>
                  <td className="small">{l.discipline ? disciplineName(cat, l.discipline) : '—'}</td>
                  <td className="num">{money(l.price, l.currency)}</td>
                  <td><span className={`badge ${cls}`}>{label}</span></td>
                  <td className="num">{l.breezeTimeS != null ? `${l.breezeTimeS} s ${l.breezeDistance || ''}` : '—'}</td>
                  <td className="small">{l.videoFile ? <a className="link" href={fileUrl(l.videoFile)} target="_blank" rel="noreferrer">copia</a> : null}{l.videoFile && l.videoUrl ? ' · ' : ''}{l.videoUrl ? <a className="link" href={l.videoUrl} target="_blank" rel="noreferrer">origen</a> : null}{!l.videoFile && !l.videoUrl && '—'}{l.analysisCount ? <div className="muted">{l.analysisCount} análisis</div> : null}</td>
                  <td className="small">{l.horseId ? <LinkButton onClick={() => openHorse(l.horseId)}>{l.linkedHorse}</LinkButton> : '—'}</td>
                  <td><button className="btn btn-line btn-sm" onClick={() => setSel(l.id)}>Abrir</button></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LotDetail({ id, lots, cat, isAdmin, notify, openHorse, onBack }) {
  const l = lots.find((x) => x.id === id)
  const cands = useFetch(`/admin/sale-lots/${id}/candidates`)
  const analyses = useFetch(`/admin/analyses?lotId=${id}`)
  const [busy, setBusy] = useState('')
  const [horseRef, setHorseRef] = useState('')
  if (!l) return <p className="muted">Cargando…</p>
  const patch = async (body, msg) => { try { await api(`/admin/sale-lots/${id}`, { method: 'PATCH', ...(body instanceof FormData ? { form: body } : { body }) }); notify(msg); onBack() } catch (x) { notify(x.message) } }
  const uploadVideo = (file) => { if (!file) return; const form = new FormData(); form.append('video', file); setBusy('video'); patch(form, 'Vídeo subido').finally(() => setBusy('')) }
  const linkByRef = async () => {
    try { const list = await api(`/admin/horses?q=${encodeURIComponent(horseRef)}`); if (!list.length) return notify('No hay ningún caballo con ese nombre o referencia'); patch({ horseId: list[0].id }, `Enlazado con ${list[0].name}`) } catch (x) { notify(x.message) }
  }
  const analyze = async () => {
    setBusy('ai')
    try { await api(`/admin/sale-lots/${id}/analyze`, { method: 'POST' }); notify('Análisis listo'); analyses.reload() } catch (x) { notify(x.message) }
    setBusy('')
  }
  const fetchFromLink = async () => {
    setBusy('fetch')
    try { await api(`/admin/sale-lots/${id}/fetch-video`, { method: 'POST', body: {} }); notify('Vídeo descargado desde el enlace'); onBack() } catch (x) { notify(x.message) }
    setBusy('')
  }
  const del = async () => { if (!window.confirm('¿Borrar este lote del archivo?')) return; try { await api(`/admin/sale-lots/${id}`, { method: 'DELETE' }); notify('Lote borrado'); onBack() } catch (x) { notify(x.message) } }
  return (
    <div className="stack">
      <LinkButton onClick={onBack}>← Subastas</LinkButton>
      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3>{l.saleName} · lote {l.lot || '—'}</h3>
            <p className="small muted mt8">{l.horseName || 'Sin nombre'} · {[l.sireName, l.damName].filter(Boolean).join(' × ')}{l.damsireName ? ` (${l.damsireName})` : ''}{l.birthYear ? ` · ${l.birthYear}` : ''} · {l.discipline ? disciplineName(cat, l.discipline) : 'disciplina sin indicar'}</p>
            <p className="mt8">{money(l.price, l.currency)} · {LOT_STATUS[l.saleStatus][0]}{l.breezeTimeS != null ? ` · breeze ${l.breezeTimeS} s ${l.breezeDistance || ''}` : ''}</p>
          </div>
          {isAdmin && <button className="btn btn-line btn-sm" onClick={del}>Borrar lote</button>}
        </div>
      </div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Vídeo</h3>
          {l.videoUrl && <p className="mt8"><a className="link" href={l.videoUrl} target="_blank" rel="noreferrer">Ver en origen</a></p>}
          {l.videoFile ? <video src={fileUrl(l.videoFile)} controls style={{ width: '100%', marginTop: 12 }} /> : <p className="small muted mt8">La IA analiza archivos: descárgalo desde el enlace o sube una copia.</p>}
          {isAdmin && l.videoUrl && !l.videoFile && <button className="btn btn-ink btn-sm mt16" style={{ marginRight: 8 }} disabled={busy === 'fetch'} onClick={fetchFromLink}>{busy === 'fetch' ? 'Descargando…' : 'Descargar desde el enlace'}</button>}
          {isAdmin && <label className="btn btn-line btn-sm mt16" style={{ cursor: 'pointer' }}>{busy === 'video' ? 'Subiendo…' : l.videoFile ? 'Cambiar copia del vídeo' : 'Subir copia del vídeo'}<input type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={(e) => uploadVideo(e.target.files[0])} /></label>}
          {l.videoFile && <button className="btn btn-gold btn-sm mt16" style={{ marginLeft: 8 }} disabled={busy === 'ai'} onClick={analyze}>{busy === 'ai' ? 'Analizando… (1–2 min)' : 'Analizar con IA'}</button>}
        </div>
        <div className="card">
          <h3>Caballo enlazado</h3>
          {l.horseId ? <p className="mt8"><LinkButton onClick={() => openHorse(l.horseId)}>{l.linkedHorse} · {l.linkedRef}</LinkButton>{isAdmin && <> · <LinkButton className="link small" onClick={() => patch({ horseId: '' }, 'Enlace quitado')}>quitar</LinkButton></>}</p>
            : <p className="small muted mt8">Enlázalo con su ficha para relacionar este vídeo y este precio con sus resultados posteriores.</p>}
          {!l.horseId && (cands.data || []).map((h) => (
            <p key={h.id} className="mt8">{h.name} <span className="small muted">· {h.ref} · {String(h.birthDate).slice(0, 4)} · {[h.sireName, h.damName].filter(Boolean).join(' × ')}</span> {isAdmin && <button className="btn btn-line btn-sm" onClick={() => patch({ horseId: h.id }, `Enlazado con ${h.name}`)}>Enlazar</button>}</p>
          ))}
          {!l.horseId && isAdmin && <div className="row mt16" style={{ gap: 8 }}><input className="input" style={{ flex: 1 }} placeholder="Nombre o referencia TH-…" value={horseRef} onChange={(e) => setHorseRef(e.target.value)} /><button className="btn btn-ink btn-sm" onClick={linkByRef}>Buscar y enlazar</button></div>}
        </div>
      </div>
      <AnalysesList data={analyses.data} />
    </div>
  )
}

// ─── ANÁLISIS DE VÍDEO ───
export function AnalysesList({ data, title = 'Análisis de vídeo con IA' }) {
  if (!data?.length) return null
  return (
    <div className="card">
      <h3>{title} ({data.length})</h3>
      {data.map((a) => {
        const r = a.result || {}
        return (
          <div key={a.id} className="mt16" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <p className="small muted">{new Date(a.createdAt).toLocaleString('es-ES')} · {a.model || '—'}{a.videoTitle || a.videoKind ? ` · ${a.videoTitle || a.videoKind}` : ''}</p>
            {a.error ? <p className="notice bad mt8">{a.error}</p> : (
              <>
                <p className="mt8"><span className={`badge ${a.filmingOk ? 'ok' : 'example'}`}>{a.filmingOk ? 'Vídeo apto para medir' : 'Solo descripción cualitativa'}</span> <span className="small muted">{r.filmingNotes}</span></p>
                {r.summary && <p className="mt8">{r.summary}</p>}
                {r.measures?.length > 0 && (
                  <table className="table mt8"><tbody>{r.measures.map((m) => (
                    <tr key={m.name}><td className="small t-name">{m.name}</td><td className="small">{m.value != null ? `${m.value} ${m.unit || ''}` : '—'}</td><td className="small muted">{m.observation}</td><td className="small">{m.confidence}</td></tr>
                  ))}</tbody></table>
                )}
                <div className="grid g3 mt8" style={{ gap: 12 }}>
                  {[['Puntos fuertes', r.strengths], ['A vigilar', r.concerns], ['Para el veterinario', r.vetFlags]].map(([t, list]) => (
                    <div key={t}><p className="small t-name">{t}</p>{list?.length ? <ul className="small" style={{ paddingLeft: 18, margin: '4px 0 0' }}>{list.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="small muted">—</p>}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── IMPORTAR ───
const IMPORTS = [
  ['resultados', 'Resultados', 'Una fila por resultado. El caballo se busca por ref, FEI ID o nombre + año; si no existe, se crea (hace falta la disciplina y el nacimiento). Se marcan como verificados porque vienen de fuente oficial.'],
  ['subastas', 'Lotes de subasta', 'Una fila por lote. "fuente" es la clave de la pestaña Fuentes (obs, tattersalls, verden, nrha_sale…). "estado": VENDIDO, RECOMPRADO, NO_VENDIDO o RETIRADO.'],
]

export function ImportAdmin({ notify }) {
  const [kind, setKind] = useState('resultados')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const send = async () => {
    if (!file) return
    setBusy(true); setRes(null)
    const form = new FormData(); form.append('file', file)
    try { const r = await api(`/admin/import/${kind}`, { method: 'POST', form }); setRes(r); notify(`${r.ok} de ${r.rows} filas importadas`) } catch (x) { notify(x.message) }
    setBusy(false)
  }
  return (
    <div className="grid g2" style={{ alignItems: 'start', gap: 32 }}>
      <div className="card form">
        <h3>Carga masiva desde Excel</h3>
        <p className="small muted">Guarda la hoja en Excel como «CSV UTF-8 (delimitado por comas)». Vale con ; o con , y con números en formato español (4.500 · 72,5) o inglés. Los tiempos pueden ir en segundos o como 1:35.42.</p>
        <div className="field"><label>Qué vas a importar</label>
          <select className="select" value={kind} onChange={(e) => { setKind(e.target.value); setRes(null) }}>{IMPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <p className="small">{IMPORTS.find((x) => x[0] === kind)[2]}</p>
        <button type="button" className="btn btn-line btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => downloadPrivate(`/admin/import/${kind}/template`, `plantilla-${kind}.csv`).catch((x) => notify(x.message))}>⬇ Descargar plantilla</button>
        <div className="field"><label>Archivo CSV</label><input className="input" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => setFile(e.target.files[0])} /></div>
        <button className="btn btn-gold" disabled={busy || !file} onClick={send}>{busy ? 'Importando…' : 'Importar'}</button>
      </div>
      <div>
        {res && (
          <div className="card">
            <h3>Resultado</h3>
            <p className="mt8">{res.ok} de {res.rows} filas importadas.{res.created?.length ? ` Caballos nuevos: ${res.created.length}.` : ''}</p>
            {res.created?.length > 0 && <p className="small muted mt8">{res.created.slice(0, 50).join(', ')}{res.created.length > 50 ? '…' : ''}</p>}
            {res.errors?.length > 0 && (
              <table className="table mt16"><thead><tr><th>Fila</th><th>Problema</th></tr></thead>
                <tbody>{res.errors.map((e) => <tr key={e.row}><td className="small">{e.row}</td><td className="small">{e.error}</td></tr>)}</tbody></table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── RASTREADOR DE VÍDEOS ───
const CAND_STATUS = { RELEVANTE: 'Relevantes', NUEVO: 'Por revisar', DESCARGADO: 'Descargados', DESCARTADO: 'Descartados', ERROR: 'Con error' }
const STAGE_TXT = { POTRO: 'Potro', YEARLING: 'Yearling', DOS_ANOS: '2 años / breeze', JOVEN: 'Joven sin montar', PRIMERA_MONTA: 'Primera monta', COMPETICION: 'Competición', OTRO: 'Otro' }

export function CrawlerAdmin({ cat, isAdmin, notify, openHorse }) {
  const [status, setStatus] = useState('RELEVANTE')
  const [disc, setDisc] = useState('')
  const [q, setQ] = useState('')
  const cands = useFetch(`/admin/crawler/candidates?status=${status}&discipline=${disc}&q=${encodeURIComponent(q)}`)
  const runs = useFetch('/admin/crawler/runs')
  const settings = useFetch('/admin/settings')
  const [cfg, setCfg] = useState(null)
  const [busy, setBusy] = useState('')
  const s = settings.data
  const startEdit = () => setCfg({ ...s, queriesText: (s.crawler_queries || []).map((x) => `${x.discipline} | ${x.q}`).join('\n') })
  const save = async () => {
    const queries = cfg.queriesText.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter(([d, qq]) => d && qq).map(([discipline, qq]) => ({ discipline, q: qq }))
    const body = {
      crawler_enabled: Boolean(cfg.crawler_enabled), crawler_every_hours: Math.max(1, Number(cfg.crawler_every_hours) || 24), crawler_auto_download: Boolean(cfg.crawler_auto_download),
      crawler_max_auto: Math.max(0, Number(cfg.crawler_max_auto) || 0), crawler_min_relevance: Math.min(100, Math.max(0, Number(cfg.crawler_min_relevance) || 70)), crawler_queries: queries,
    }
    try { await api('/admin/settings', { method: 'PATCH', body }); notify('Rastreador guardado'); setCfg(null); settings.reload() } catch (x) { notify(x.message) }
  }
  const runNow = async () => { try { const r = await api('/admin/crawler/run', { method: 'POST' }); notify(r.message); runs.reload() } catch (x) { notify(x.message) } }
  const mark = async (c, st) => { try { await api(`/admin/crawler/candidates/${c.id}`, { method: 'PATCH', body: { status: st } }); cands.reload() } catch (x) { notify(x.message) } }
  const accept = async (c, as) => {
    let horseId
    if (as === 'horse') {
      const name = window.prompt('Nombre o referencia TH- del caballo al que pertenece el vídeo', c.horseName || '')
      if (!name) return
      const list = await api(`/admin/horses?q=${encodeURIComponent(name)}`)
      if (!list.length) return notify('No hay ningún caballo con ese nombre')
      horseId = list[0].id
    }
    setBusy(c.id)
    try { await api(`/admin/crawler/candidates/${c.id}/accept`, { method: 'POST', body: { as, horseId } }); notify(as === 'horse' ? 'Vídeo añadido al caballo' : 'Vídeo descargado y archivado como lote'); cands.reload() } catch (x) { notify(x.message); cands.reload() }
    setBusy('')
  }
  const last = runs.data?.runs?.[0]
  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3>Rastreador de vídeos</h3>
            <p className="small muted mt8">Busca en YouTube y en las webs de subastas de la pestaña Fuentes, y la IA criba cada vídeo: si sirve, disciplina, etapa (potro, yearling, breeze, primera monta), subasta, lote y caballo. Tú aceptas los buenos y se descargan al archivo para analizarlos.</p>
            {s && <p className="small mt8">{s.crawler_enabled ? `Automático cada ${s.crawler_every_hours} h` : 'Automático desactivado'} · descarga automática {s.crawler_auto_download ? `sí (máx. ${s.crawler_max_auto} por pasada)` : 'no'} · relevante desde {s.crawler_min_relevance} · {(s.crawler_queries || []).length} búsquedas</p>}
            {last && <p className="small muted mt8">Última pasada: {new Date(last.startedAt).toLocaleString('es-ES')} · {last.finishedAt ? `${last.found} encontrados, ${last.added} nuevos, ${last.triaged} cribados, ${last.downloaded} descargados` : 'en marcha…'}{last.error ? ` · error: ${last.error}` : ''}</p>}
          </div>
          {isAdmin && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-line btn-sm" onClick={() => (cfg ? setCfg(null) : startEdit())}>{cfg ? 'Cerrar ajustes' : 'Ajustes'}</button>
              <button className="btn btn-gold btn-sm" disabled={runs.data?.running} onClick={runNow}>{runs.data?.running ? 'Buscando…' : 'Buscar ahora'}</button>
            </div>
          )}
        </div>
        {cfg && (
          <div className="form mt16">
            <div className="grid g3" style={{ gap: 12 }}>
              <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={cfg.crawler_enabled} onChange={(e) => setCfg({ ...cfg, crawler_enabled: e.target.checked })} /> Búsqueda automática</label>
              <div className="field"><label>Cada cuántas horas</label><input className="input" inputMode="numeric" value={cfg.crawler_every_hours} onChange={(e) => setCfg({ ...cfg, crawler_every_hours: e.target.value })} /></div>
              <div className="field"><label>Relevante desde (0–100)</label><input className="input" inputMode="numeric" value={cfg.crawler_min_relevance} onChange={(e) => setCfg({ ...cfg, crawler_min_relevance: e.target.value })} /></div>
              <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={cfg.crawler_auto_download} onChange={(e) => setCfg({ ...cfg, crawler_auto_download: e.target.checked })} /> Descargar solos los más relevantes</label>
              <div className="field"><label>Máximo de descargas por pasada</label><input className="input" inputMode="numeric" value={cfg.crawler_max_auto} onChange={(e) => setCfg({ ...cfg, crawler_max_auto: e.target.value })} /></div>
            </div>
            <div className="field"><label>Búsquedas en YouTube (una por línea: DISCIPLINA | búsqueda)</label><textarea className="textarea" rows={10} value={cfg.queriesText} onChange={(e) => setCfg({ ...cfg, queriesText: e.target.value })} /></div>
            <p className="small muted">Las webs de subastas que recorre son las de la pestaña Fuentes (las que no estén descartadas). Cada pasada cuesta poco en IA: la criba se hace por el texto, no viendo el vídeo.</p>
            <div><button className="btn btn-ink btn-sm" onClick={save}>Guardar ajustes</button></div>
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(CAND_STATUS).map(([k, l]) => <button key={k} className={`btn btn-sm ${status === k ? 'btn-ink' : 'btn-line'}`} onClick={() => setStatus(k)}>{l}{cands.data?.counts?.[k] ? ` (${cands.data.counts[k]})` : ''}</button>)}
        <select className="select" value={disc} onChange={(e) => setDisc(e.target.value)}><option value="">Todas las disciplinas</option>{cat?.disciplines.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</select>
        <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar título, canal, caballo o subasta…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {cands.loading && !cands.data ? <p className="muted">Cargando…</p> : !cands.data?.items?.length ? <div className="empty">No hay vídeos en esta lista. Pulsa «Buscar ahora».</div> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Vídeo</th><th>Disciplina / etapa</th><th>Subasta · lote · caballo</th><th className="num">Relevancia</th><th /></tr></thead>
            <tbody>{cands.data.items.map((c) => (
              <tr key={c.id}>
                <td className="small" style={{ maxWidth: 380 }}><a className="link" href={c.url} target="_blank" rel="noreferrer">{c.title || c.url}</a><div className="muted">{c.platform}{c.channel ? ` · ${c.channel}` : ''}{c.durationS ? ` · ${Math.round(c.durationS / 60 * 10) / 10} min` : ''}{c.sourceKey ? ` · ${c.sourceKey}` : ''}{c.query ? ` · «${c.query}»` : ''}</div>{c.triage?.reason && <div className="muted">IA: {c.triage.reason}</div>}{c.error && <div className="chk DISTINTO">{c.error}</div>}</td>
                <td className="small">{c.discipline ? disciplineName(cat, c.discipline) : '—'}<div className="muted">{STAGE_TXT[c.stage] || ''}</div></td>
                <td className="small">{[c.saleName, c.lot && `lote ${c.lot}`, c.horseName].filter(Boolean).join(' · ') || '—'}{c.saleLotId && <div className="muted">archivado como lote</div>}{c.horseId && <div><LinkButton className="link small" onClick={() => openHorse(c.horseId)}>ver caballo</LinkButton></div>}</td>
                <td className="num">{c.relevance ?? '—'}</td>
                <td>{isAdmin && !['DESCARGADO'].includes(c.status) && (
                  <div className="stack" style={{ gap: 6 }}>
                    <button className="btn btn-gold btn-sm" disabled={busy === c.id} onClick={() => accept(c, 'lot')}>{busy === c.id ? 'Descargando…' : 'Archivar como lote'}</button>
                    <button className="btn btn-line btn-sm" disabled={busy === c.id} onClick={() => accept(c, 'horse')}>Añadir a un caballo</button>
                    {c.status !== 'DESCARTADO' ? <button className="btn btn-line btn-sm" onClick={() => mark(c, 'DESCARTADO')}>Descartar</button> : <button className="btn btn-line btn-sm" onClick={() => mark(c, 'NUEVO')}>Recuperar</button>}
                  </div>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
