// Archivo de datos de la dirección: fuentes, subastas (vídeo + precio), importación CSV y análisis de vídeo con IA
const router = require('express').Router()
const { db, upload, authenticate, requireRole, audit, wrap, UPLOAD_DIR } = require('../lib/common')
const { parseCsv, toCsv } = require('../lib/csv')
const { discipline, isBreed } = require('../lib/disciplines')
const { analyzeVideo } = require('../lib/analysis')
const ai = require('../lib/ai')
const { fetchVideo } = require('../lib/videoFetch')
const young = require('../lib/youngReport')
const { getSetting } = require('../lib/common')
const { VIDEO_KINDS } = require('../lib/disciplines')
const my = require('./my')
const multer = require('multer')

// CSV en memoria (máx. 20 MB)
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(csv|txt)$/i.test(file.originalname || '') || /csv|text\/plain|excel/.test(file.mimetype)) })

router.use(authenticate, requireRole('ADMIN', 'EVALUADOR'))

const SOURCE_STATUS = ['PENDIENTE', 'CONTACTADO', 'PERMISO', 'ACTIVA', 'DESCARTADA']

// ─── Fuentes ───
router.get('/sources', wrap(async (req, res) => {
  res.json(await db.query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM sale_lots l WHERE l.source_key=s.key) AS lot_count
     FROM data_sources s ORDER BY s.block, s.kind, s.name`,
  ))
}))

router.patch('/sources/:key', requireRole('ADMIN'), wrap(async (req, res) => {
  const b = req.body || {}
  if (b.status && !SOURCE_STATUS.includes(b.status)) return res.status(400).json({ error: 'Estado no válido' })
  const s = await db.one(
    `UPDATE data_sources SET status=COALESCE($2,status), status_notes=COALESCE($3,status_notes), url=COALESCE($4,url), notes=COALESCE($5,notes), updated_at=now()
     WHERE key=$1 RETURNING *`, [req.params.key, b.status || null, b.statusNotes ?? null, b.url ?? null, b.notes ?? null],
  )
  if (!s) return res.status(404).json({ error: 'Fuente no encontrada' })
  audit(req.user.id, 'DataSource', s.key, 'EDITAR', b)
  res.json(s)
}))

// ─── Subastas ───
const LOT_STATUS = ['VENDIDO', 'RECOMPRADO', 'NO_VENDIDO', 'RETIRADO']
const { parseNumber: num, parseTime } = require('../lib/csv')
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())
const date = (v) => { const s = txt(v); if (!s) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null }

function lotData(b) {
  const status = String(b.saleStatus || b.sale_status || 'VENDIDO').toUpperCase().replace(/\s/g, '_')
  return {
    source_key: txt(b.sourceKey ?? b.source_key), sale_name: txt(b.saleName ?? b.sale_name), sale_date: date(b.saleDate ?? b.sale_date), lot: txt(b.lot),
    discipline: discipline(b.discipline) ? b.discipline : null, horse_name: txt(b.horseName ?? b.horse_name)?.toUpperCase() || null,
    sire_name: txt(b.sireName ?? b.sire ?? b.sire_name)?.toUpperCase() || null, dam_name: txt(b.damName ?? b.dam ?? b.dam_name)?.toUpperCase() || null,
    damsire_name: txt(b.damsireName ?? b.damsire ?? b.damsire_name)?.toUpperCase() || null, sex: txt(b.sex), birth_year: num(b.birthYear ?? b.birth_year),
    consignor: txt(b.consignor), buyer: txt(b.buyer), price: num(b.price), currency: (txt(b.currency) || 'EUR').toUpperCase(),
    sale_status: LOT_STATUS.includes(status) ? status : 'VENDIDO', breeze_time_s: parseTime(b.breezeTimeS ?? b.breeze_time_s),
    breeze_distance: txt(b.breezeDistance ?? b.breeze_distance), video_url: txt(b.videoUrl ?? b.video_url), notes: txt(b.notes),
  }
}

async function validSource(key) { return !key || Boolean(await db.one('SELECT key FROM data_sources WHERE key=$1', [key])) }

router.get('/sale-lots', wrap(async (req, res) => {
  const { q = '', sale = '', discipline: disc = '' } = req.query
  const params = []; const w = ['TRUE']
  if (q) { params.push(`%${q}%`); w.push(`(l.horse_name ILIKE $${params.length} OR l.sire_name ILIKE $${params.length} OR l.dam_name ILIKE $${params.length} OR l.lot ILIKE $${params.length})`) }
  if (sale) { params.push(sale); w.push(`l.sale_name=$${params.length}`) }
  if (disc) { params.push(disc); w.push(`l.discipline=$${params.length}`) }
  res.json(await db.query(
    `SELECT l.*, h.name AS linked_horse, h.ref AS linked_ref,
       (SELECT COUNT(*)::int FROM video_analyses a WHERE a.sale_lot_id=l.id) AS analysis_count
     FROM sale_lots l LEFT JOIN horses h ON h.id=l.horse_id WHERE ${w.join(' AND ')} ORDER BY l.sale_date DESC NULLS LAST, l.sale_name, l.lot LIMIT 2000`, params,
  ))
}))

router.get('/sales', wrap(async (req, res) => {
  res.json(await db.query(
    `SELECT sale_name, MIN(sale_date) AS sale_date, MAX(source_key) AS source_key, COUNT(*)::int AS lots,
       COUNT(*) FILTER (WHERE sale_status='VENDIDO')::int AS sold, (COUNT(video_url) + COUNT(video_file))::int AS videos, COUNT(horse_id)::int AS linked,
       ROUND(AVG(price) FILTER (WHERE sale_status='VENDIDO'))::numeric AS avg_price, MAX(currency) AS currency
     FROM sale_lots GROUP BY sale_name ORDER BY MIN(sale_date) DESC NULLS LAST`,
  ))
}))

router.post('/sale-lots', requireRole('ADMIN'), upload.single('video'), wrap(async (req, res) => {
  const d = lotData(req.body || {})
  if (!d.sale_name) return res.status(400).json({ error: 'Indica el nombre de la subasta' })
  if (!(await validSource(d.source_key))) return res.status(400).json({ error: 'Fuente no válida' })
  if (req.file && !req.file.mimetype.startsWith('video/')) return res.status(400).json({ error: 'El archivo debe ser un vídeo' })
  if (req.file) d.video_file = `/uploads/${req.file.filename}`
  const cols = Object.keys(d)
  const l = await db.one(`INSERT INTO sale_lots(${cols.join(',')}) VALUES (${cols.map((_, n) => `$${n + 1}`).join(',')}) RETURNING *`, cols.map((k) => d[k]))
  audit(req.user.id, 'SaleLot', l.id, 'CREAR', { sale: l.saleName, lot: l.lot })
  res.status(201).json(l)
}))

router.patch('/sale-lots/:id', requireRole('ADMIN'), upload.single('video'), wrap(async (req, res) => {
  const b = req.body || {}
  const sets = []; const vals = [req.params.id]
  const put = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`) }
  if (b.horseId !== undefined) {
    if (b.horseId && !(await db.one('SELECT id FROM horses WHERE id::text=$1', [b.horseId]))) return res.status(400).json({ error: 'Caballo no encontrado' })
    put('horse_id', b.horseId || null)
  }
  if (b.videoUrl !== undefined) put('video_url', txt(b.videoUrl))
  if (b.saleStatus !== undefined) { if (!LOT_STATUS.includes(b.saleStatus)) return res.status(400).json({ error: 'Estado no válido' }); put('sale_status', b.saleStatus) }
  if (b.notes !== undefined) put('notes', txt(b.notes))
  if (req.file) { if (!req.file.mimetype.startsWith('video/')) return res.status(400).json({ error: 'El archivo debe ser un vídeo' }); put('video_file', `/uploads/${req.file.filename}`) }
  if (!sets.length) return res.status(400).json({ error: 'Nada que cambiar' })
  const l = await db.one(`UPDATE sale_lots SET ${sets.join(', ')} WHERE id::text=$1 RETURNING *`, vals)
  if (!l) return res.status(404).json({ error: 'Lote no encontrado' })
  audit(req.user.id, 'SaleLot', l.id, 'EDITAR', { ...b, video: Boolean(req.file) })
  res.json(l)
}))

router.delete('/sale-lots/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const l = await db.one('DELETE FROM sale_lots WHERE id::text=$1 RETURNING id, sale_name, lot', [req.params.id])
  if (!l) return res.status(404).json({ error: 'Lote no encontrado' })
  audit(req.user.id, 'SaleLot', l.id, 'BORRAR', { sale: l.saleName, lot: l.lot })
  res.json({ ok: true })
}))

// Candidatos para enlazar un lote con un caballo del archivo (por nombre o por padre + madre + año)
router.get('/sale-lots/:id/candidates', wrap(async (req, res) => {
  const l = await db.one('SELECT * FROM sale_lots WHERE id::text=$1', [req.params.id])
  if (!l) return res.status(404).json({ error: 'Lote no encontrado' })
  res.json(await db.query(
    `SELECT id, ref, name, birth_date, sire_name, dam_name, discipline FROM horses
     WHERE ($1::text IS NOT NULL AND lower(name)=lower($1))
        OR ($2::text IS NOT NULL AND $3::text IS NOT NULL AND lower(sire_name)=lower($2) AND lower(dam_name)=lower($3)
            AND ($4::int IS NULL OR EXTRACT(YEAR FROM birth_date)=$4))
     LIMIT 20`, [l.horseName, l.sireName, l.damName, l.birthYear],
  ))
}))

// ─── Importación CSV ───
const TEMPLATES = {
  resultados: ['ref', 'fei_id', 'caballo', 'nacimiento', 'sexo', 'raza', 'disciplina', 'padre', 'madre', 'abuelo_materno', 'competicion', 'fecha', 'pais', 'prueba', 'nivel',
    'estado', 'puesto', 'participantes', 'nota', 'faltas', 'tiempo_s', 'distancia_m', 'velocidad_kmh', 'pista', 'rating', 'organismo_rating', 'cuerpos', 'peso_kg', 'speed_index',
    'penalizaciones', 'motivo_eliminacion', 'media_prueba', 'limpios_prueba', 'premio_eur'],
  subastas: ['fuente', 'subasta', 'fecha', 'lote', 'disciplina', 'caballo', 'padre', 'madre', 'abuelo_materno', 'sexo', 'ano_nacimiento', 'vendedor', 'comprador',
    'precio', 'moneda', 'estado', 'breeze_s', 'breeze_distancia', 'video_url', 'notas'],
}

router.get('/import/:kind/template', wrap(async (req, res) => {
  const cols = TEMPLATES[req.params.kind]
  if (!cols) return res.status(404).json({ error: 'Plantilla no disponible' })
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="plantilla-${req.params.kind}.csv"`)
  res.send(toCsv(cols))
}))

const SEX = { M: 'MACHO', MACHO: 'MACHO', C: 'MACHO', COLT: 'MACHO', STALLION: 'MACHO', H: 'HEMBRA', HEMBRA: 'HEMBRA', F: 'HEMBRA', FILLY: 'HEMBRA', MARE: 'HEMBRA', YEGUA: 'HEMBRA', CASTRADO: 'CASTRADO', G: 'CASTRADO', GELDING: 'CASTRADO' }

async function findOrCreateHorse(r, userId, created) {
  const ref = txt(r.ref); const fei = txt(r.fei_id); const name = txt(r.caballo)?.toUpperCase()
  if (ref) { const h = await db.one('SELECT * FROM horses WHERE ref=$1', [ref]); if (h) return h }
  if (fei) { const h = await db.one('SELECT * FROM horses WHERE fei_id=$1', [fei]); if (h) return h }
  if (!name) throw new Error('Falta el nombre del caballo')
  const year = num(String(r.nacimiento || '').slice(0, 4))
  const h = await db.one('SELECT * FROM horses WHERE lower(name)=lower($1) AND ($2::int IS NULL OR EXTRACT(YEAR FROM birth_date)=$2) ORDER BY created_at LIMIT 1', [name, year])
  if (h) return h
  const disc = discipline(r.disciplina) ? r.disciplina : null
  if (!disc) throw new Error(`Disciplina no válida para crear ${name}`)
  const birth = date(r.nacimiento) || (year ? `${year}-01-01` : null)
  if (!birth) throw new Error(`Falta la fecha o el año de nacimiento para crear ${name}`)
  const nh = await db.one(
    `INSERT INTO horses(name, birth_date, sex, country, breed, discipline, sire_name, dam_name, damsire_name, fei_id, owner_id, admin_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Creado por importación CSV') RETURNING *`,
    [name, birth, SEX[String(r.sexo || '').toUpperCase()] || 'MACHO', txt(r.pais) || '—', isBreed(r.raza) ? r.raza : 'OTRA', disc,
      txt(r.padre)?.toUpperCase() || null, txt(r.madre)?.toUpperCase() || null, txt(r.abuelo_materno)?.toUpperCase() || null, fei, userId],
  )
  created.push(nh.name)
  return nh
}

router.post('/import/:kind', requireRole('ADMIN'), csvUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube el archivo CSV (guárdalo en Excel como «CSV UTF-8»)' })
  const rows = parseCsv(req.file.buffer.toString('utf8'))
  if (!rows.length) return res.status(400).json({ error: 'El archivo está vacío o no tiene cabecera' })
  if (rows.length > 20000) return res.status(400).json({ error: 'Máximo 20.000 filas por archivo' })
  const errors = []; const created = []; let ok = 0
  if (req.params.kind === 'resultados') {
    for (const [i, r] of rows.entries()) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const h = await findOrCreateHorse(r, req.user.id, created)
        const data = my.normalizeResult({
          competition: r.competicion, date: date(r.fecha), country: r.pais, category: r.prueba, level: r.nivel, status: r.estado || 'CLASIFICADO',
          position: r.puesto, fieldSize: r.participantes, score: r.nota, faults: r.faltas, timeS: r.tiempo_s, distanceM: r.distancia_m, speedKmh: r.velocidad_kmh,
          going: r.pista, rating: r.rating, ratingAuthority: r.organismo_rating, lengthsBeaten: r.cuerpos, weightKg: r.peso_kg, speedIndex: r.speed_index,
          penalties: r.penalizaciones, eliminationReason: r.motivo_eliminacion, eventMeanScore: r.media_prueba, eventClearCount: r.limpios_prueba, earningsEur: r.premio_eur,
        }, null)
        const miss = my.missingResult(data)
        if (miss.length) throw new Error(`Faltan: ${miss.join(', ')}`)
        const cols = Object.keys(data)
        // eslint-disable-next-line no-await-in-loop
        await db.query(
          `INSERT INTO results(horse_id, discipline, ${cols.join(', ')}, source, verified) VALUES ($1,$2,${cols.map((_, n) => `$${n + 3}`).join(',')},'IMPORTACION',TRUE)`,
          [h.id, discipline(r.disciplina) ? r.disciplina : h.discipline, ...cols.map((k) => data[k])],
        )
        ok += 1
      } catch (e) { errors.push({ row: i + 2, error: e.message }) }
    }
  } else if (req.params.kind === 'subastas') {
    for (const [i, r] of rows.entries()) {
      try {
        const d = lotData({
          sourceKey: r.fuente, saleName: r.subasta, saleDate: r.fecha, lot: r.lote, discipline: r.disciplina, horseName: r.caballo, sireName: r.padre, damName: r.madre,
          damsireName: r.abuelo_materno, sex: r.sexo, birthYear: r.ano_nacimiento, consignor: r.vendedor, buyer: r.comprador, price: r.precio, currency: r.moneda,
          saleStatus: r.estado, breezeTimeS: r.breeze_s, breezeDistance: r.breeze_distancia, videoUrl: r.video_url, notes: r.notas,
        })
        if (!d.sale_name) throw new Error('Falta el nombre de la subasta')
        // eslint-disable-next-line no-await-in-loop
        if (!(await validSource(d.source_key))) throw new Error(`Fuente desconocida: ${d.source_key}`)
        const cols = Object.keys(d)
        // eslint-disable-next-line no-await-in-loop
        await db.query(`INSERT INTO sale_lots(${cols.join(',')}) VALUES (${cols.map((_, n) => `$${n + 1}`).join(',')})`, cols.map((k) => d[k]))
        ok += 1
      } catch (e) { errors.push({ row: i + 2, error: e.message }) }
    }
  } else return res.status(404).json({ error: 'Importación no disponible' })
  audit(req.user.id, 'Import', req.params.kind, 'IMPORTAR', { filas: rows.length, ok, errores: errors.length, caballosCreados: created.length })
  res.json({ rows: rows.length, ok, created, errors: errors.slice(0, 200) })
}))

// ─── Análisis de vídeo con IA ───
async function runAndStore({ disciplineKey, subject, videoUrl, photos, horseId, videoId, lotId, userId }) {
  try {
    const r = await analyzeVideo({ disciplineKey, subject, videoUrl, photos, uploadDir: UPLOAD_DIR })
    return db.one(
      `INSERT INTO video_analyses(horse_id, video_id, sale_lot_id, discipline, model, filming_ok, result, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [horseId || null, videoId || null, lotId || null, disciplineKey, r.model, r.result.filmingOk === true, JSON.stringify(r.result), userId],
    )
  } catch (e) {
    await db.query('INSERT INTO video_analyses(horse_id, video_id, sale_lot_id, discipline, error, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [horseId || null, videoId || null, lotId || null, disciplineKey, e.message, userId])
    throw Object.assign(new Error(`No se ha podido analizar el vídeo: ${e.message}`), { status: e.status || 502 })
  }
}

router.post('/videos/:id/analyze', wrap(async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ error: 'La IA no está configurada' })
  const v = await db.one('SELECT v.*, h.name, h.discipline, h.breed, h.birth_date, h.sex FROM horse_videos v JOIN horses h ON h.id=v.horse_id WHERE v.id::text=$1', [req.params.id])
  if (!v) return res.status(404).json({ error: 'Vídeo no encontrado' })
  const photos = await db.query('SELECT view, url FROM horse_photos WHERE horse_id=$1', [v.horseId])
  const a = await runAndStore({
    disciplineKey: v.discipline, subject: `${v.name}, ${v.sex.toLowerCase()}, nacido en ${String(v.birthDate).slice(0, 4)}, raza ${v.breed}; vídeo de tipo ${v.kind.toLowerCase()}`,
    videoUrl: v.url, photos, horseId: v.horseId, videoId: v.id, userId: req.user.id,
  })
  audit(req.user.id, 'VideoAnalysis', a.id, 'ANALIZAR', { caballo: v.name, modelo: a.model })
  res.status(201).json(a)
}))

router.post('/sale-lots/:id/analyze', wrap(async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ error: 'La IA no está configurada' })
  const l = await db.one('SELECT * FROM sale_lots WHERE id::text=$1', [req.params.id])
  if (!l) return res.status(404).json({ error: 'Lote no encontrado' })
  if (!l.videoFile) return res.status(400).json({ error: 'Sube antes una copia del vídeo al lote: la IA analiza archivos, no enlaces externos' })
  const a = await runAndStore({
    disciplineKey: l.discipline || 'CARRERAS_PSI', subject: `lote ${l.lot || ''} de ${l.saleName}${l.horseName ? ` (${l.horseName})` : ''}, por ${l.sireName || '?'} y ${l.damName || '?'}${l.birthYear ? `, nacido en ${l.birthYear}` : ''}${l.breezeTimeS ? `, breeze ${l.breezeTimeS} s en ${l.breezeDistance || '?'}` : ''}`,
    videoUrl: l.videoFile, photos: [], horseId: l.horseId, lotId: l.id, userId: req.user.id,
  })
  audit(req.user.id, 'VideoAnalysis', a.id, 'ANALIZAR', { lote: l.lot, subasta: l.saleName, modelo: a.model })
  res.status(201).json(a)
}))

router.get('/analyses', wrap(async (req, res) => {
  const { horseId = '', lotId = '' } = req.query
  res.json(await db.query(
    `SELECT a.*, v.kind AS video_kind, v.title AS video_title FROM video_analyses a LEFT JOIN horse_videos v ON v.id=a.video_id
     WHERE ($1='' OR a.horse_id::text=$1) AND ($2='' OR a.sale_lot_id::text=$2) ORDER BY a.created_at DESC LIMIT 100`, [horseId, lotId],
  ))
}))

// ─── Vídeo desde un enlace (el servidor lo descarga y lo guarda para poder analizarlo) ───
router.post('/horses/:id/videos/from-url', wrap(async (req, res) => {
  const h = await db.one('SELECT id, name FROM horses WHERE id::text=$1', [req.params.id])
  if (!h) return res.status(404).json({ error: 'Caballo no encontrado' })
  const b = req.body || {}
  const v = await fetchVideo(b.url)
  const kind = VIDEO_KINDS.includes(b.kind) ? b.kind : 'ENTRENAMIENTO'
  const row = await db.one('INSERT INTO horse_videos(horse_id, kind, title, url) VALUES ($1,$2,$3,$4) RETURNING *',
    [h.id, kind, String(b.title || v.title || '').trim().slice(0, 200) || null, v.url])
  audit(req.user.id, 'Horse', h.id, 'VIDEO_ENLACE', { origen: v.source })
  res.status(201).json(row)
}))

router.post('/sale-lots/:id/fetch-video', requireRole('ADMIN'), wrap(async (req, res) => {
  const l = await db.one('SELECT id, video_url FROM sale_lots WHERE id::text=$1', [req.params.id])
  if (!l) return res.status(404).json({ error: 'Lote no encontrado' })
  const url = (req.body && req.body.url) || l.videoUrl
  if (!url) return res.status(400).json({ error: 'El lote no tiene enlace de vídeo' })
  const v = await fetchVideo(url)
  const out = await db.one('UPDATE sale_lots SET video_file=$2, video_url=COALESCE(video_url,$3) WHERE id=$1 RETURNING *', [l.id, v.url, v.source])
  audit(req.user.id, 'SaleLot', l.id, 'VIDEO_ENLACE', { origen: v.source })
  res.json(out)
}))

// ─── Informe de potro ───
router.post('/horses/:id/young-report', wrap(async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ error: 'La IA no está configurada' })
  const h = await db.one('SELECT * FROM horses WHERE id::text=$1', [req.params.id])
  if (!h) return res.status(404).json({ error: 'Caballo no encontrado' })
  const photos = await db.query('SELECT view, url FROM horse_photos WHERE horse_id=$1', [h.id])
  const videoId = req.body?.videoId
  const video = videoId ? await db.one('SELECT * FROM horse_videos WHERE id::text=$1 AND horse_id=$2', [videoId, h.id])
    : await db.one('SELECT * FROM horse_videos WHERE horse_id=$1 ORDER BY uploaded_at DESC LIMIT 1', [h.id])
  if (!video && !photos.length) return res.status(400).json({ error: 'Sube al menos un vídeo o las fotos del caballo' })
  const rates = (await getSetting('base_rates')) || {}
  const g = await young.generate({ db, horse: h, photos, video, uploadDir: UPLOAD_DIR, baseRates: rates[h.discipline] || [] })
  const r = await db.one(
    'INSERT INTO young_reports(horse_id, discipline, model, version, inputs, result, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [h.id, h.discipline, g.model, young.VERSION, JSON.stringify(g.inputs), JSON.stringify(g.result), req.user.id],
  )
  audit(req.user.id, 'YoungReport', r.id, 'GENERAR', { caballo: h.name, percentil: g.result.quality?.percentile ?? null })
  res.status(201).json(r)
}))

router.get('/young-reports', wrap(async (req, res) => {
  res.json(await db.query('SELECT * FROM young_reports WHERE horse_id::text=$1 ORDER BY created_at DESC', [String(req.query.horseId || '')]))
}))

router.patch('/young-reports/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const { status, adminNotes } = req.body || {}
  if (status && !['BORRADOR', 'PUBLICADO', 'RETIRADO'].includes(status)) return res.status(400).json({ error: 'Estado no válido' })
  const r = await db.one(
    `UPDATE young_reports SET status=COALESCE($2,status), admin_notes=COALESCE($3,admin_notes),
       published_at=CASE WHEN $2='PUBLICADO' THEN now() ELSE published_at END WHERE id::text=$1 RETURNING *`, [req.params.id, status || null, adminNotes ?? null],
  )
  if (!r) return res.status(404).json({ error: 'Informe no encontrado' })
  audit(req.user.id, 'YoungReport', r.id, 'ESTADO', { status, adminNotes })
  res.json(r)
}))

// ─── Rastreador de vídeos ───
const crawler = require('../lib/crawler')
let crawling = false
async function crawlerSettings() {
  const rows = await db.query("SELECT key, value FROM settings WHERE key LIKE 'crawler_%'")
  const st = { ...require('../lib/crawlerDefaults').CRAWLER_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) }
  // Variables de Railway (mandan sobre el panel): CRAWLER_ENABLED, CRAWLER_EVERY_HOURS, CRAWLER_AUTO_DOWNLOAD, CRAWLER_MAX_AUTO
  const env = process.env
  if (env.CRAWLER_ENABLED) st.crawler_enabled = env.CRAWLER_ENABLED === 'true'
  if (Number(env.CRAWLER_EVERY_HOURS) > 0) st.crawler_every_hours = Number(env.CRAWLER_EVERY_HOURS)
  if (env.CRAWLER_AUTO_DOWNLOAD) st.crawler_auto_download = env.CRAWLER_AUTO_DOWNLOAD === 'true'
  if (Number(env.CRAWLER_MAX_AUTO) >= 0 && env.CRAWLER_MAX_AUTO) st.crawler_max_auto = Number(env.CRAWLER_MAX_AUTO)
  return st
}
async function startCrawl(trigger) {
  if (crawling) return false
  crawling = true
  crawler.runCrawler(db, { trigger, settings: await crawlerSettings() }).catch((e) => console.error('rastreador', e)).finally(() => { crawling = false })
  return true
}
router.startCrawl = startCrawl
router.crawlerSettings = crawlerSettings

router.post('/crawler/run', requireRole('ADMIN'), wrap(async (req, res) => {
  if (!(await startCrawl('MANUAL'))) return res.status(409).json({ error: 'Ya hay una búsqueda en marcha' })
  audit(req.user.id, 'Crawler', 'run', 'LANZAR', {})
  res.json({ ok: true, message: 'Búsqueda en marcha: tarda unos minutos. Recarga para ver los resultados.' })
}))

router.get('/crawler/runs', wrap(async (req, res) => {
  res.json({ running: crawling, runs: await db.query('SELECT * FROM crawler_runs ORDER BY started_at DESC LIMIT 10') })
}))

router.get('/crawler/candidates', wrap(async (req, res) => {
  const { status = 'RELEVANTE', discipline: disc = '', q = '' } = req.query
  const params = [status]; const w = ['status=$1']
  if (disc) { params.push(disc); w.push(`discipline=$${params.length}`) }
  if (q) { params.push(`%${q}%`); w.push(`(title ILIKE $${params.length} OR channel ILIKE $${params.length} OR horse_name ILIKE $${params.length} OR sale_name ILIKE $${params.length})`) }
  const [rows, counts] = await Promise.all([
    db.query(`SELECT * FROM video_candidates WHERE ${w.join(' AND ')} ORDER BY relevance DESC NULLS LAST, found_at DESC LIMIT 300`, params),
    db.query('SELECT status, COUNT(*)::int AS n FROM video_candidates GROUP BY status'),
  ])
  res.json({ items: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) })
}))

router.patch('/crawler/candidates/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const st = req.body?.status
  if (!['NUEVO', 'RELEVANTE', 'DESCARTADO'].includes(st)) return res.status(400).json({ error: 'Estado no válido' })
  const c = await db.one('UPDATE video_candidates SET status=$2, updated_at=now() WHERE id::text=$1 RETURNING *', [req.params.id, st])
  if (!c) return res.status(404).json({ error: 'Vídeo no encontrado' })
  res.json(c)
}))

router.post('/crawler/candidates/:id/accept', requireRole('ADMIN'), wrap(async (req, res) => {
  const c = await db.one('SELECT * FROM video_candidates WHERE id::text=$1', [req.params.id])
  if (!c) return res.status(404).json({ error: 'Vídeo no encontrado' })
  const b = req.body || {}
  try {
    const out = await crawler.acceptCandidate(db, c, { as: b.as === 'horse' ? 'horse' : 'lot', horseId: b.horseId, kind: b.kind })
    audit(req.user.id, 'VideoCandidate', c.id, 'ACEPTAR', { como: b.as || 'lot', url: c.url })
    res.json(out)
  } catch (e) {
    await db.query("UPDATE video_candidates SET status='ERROR', error=$2, updated_at=now() WHERE id=$1", [c.id, e.message])
    throw e
  }
}))

module.exports = router
