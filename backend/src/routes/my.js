// Panel del cliente: sus caballos, material (fotos, vídeos, documentos), resultados, solicitudes de informe y pagos
const router = require('express').Router();
const { db, SERVICES, upload, authenticate, audit, wrap } = require('../lib/common');
const DOCS = require('../lib/documents');
const { validateHorse } = require('../lib/horses');
const { discipline, VIDEO_KINDS } = require('../lib/disciplines');

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const VIEWS = ['LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'FRONTAL', 'TRASERA', 'SUPERIOR'];

async function ownHorse(req, res) {
  const h = await db.one('SELECT * FROM horses WHERE id::text=$1', [req.params.id]);
  if (!h || (h.ownerId !== req.user.id && req.user.role === 'TITULAR')) { res.status(404).json({ error: 'Caballo no encontrado' }); return null; }
  return h;
}

const RESULT_COLS = 'id, horse_id, discipline, competition, date, country, category, level, position, field_size, status, score, faults, time_s, distance_m, speed_kmh, going, rating, earnings_eur, lengths_beaten, weight_kg, rating_authority, speed_index, penalties, elimination_reason, event_mean_score, event_clear_count, verified, ai_warning, document_url, created_at';

async function withRelations(horses) {
  if (!horses.length) return [];
  const ids = horses.map((h) => h.id);
  const [photos, videos, docs, results] = await Promise.all([
    db.query('SELECT * FROM horse_photos WHERE horse_id = ANY($1)', [ids]),
    db.query('SELECT * FROM horse_videos WHERE horse_id = ANY($1) ORDER BY uploaded_at DESC', [ids]),
    db.query('SELECT id, horse_id, role, doc_type, original_name, created_at FROM horse_documents WHERE horse_id = ANY($1) ORDER BY created_at', [ids]),
    db.query(`SELECT ${RESULT_COLS} FROM results WHERE horse_id = ANY($1) ORDER BY date DESC`, [ids]),
  ]);
  return horses.map((h) => ({
    ...h,
    photos: photos.filter((p) => p.horseId === h.id),
    videos: videos.filter((v) => v.horseId === h.id),
    documents: docs.filter((d) => d.horseId === h.id),
    results: results.filter((r) => r.horseId === h.id),
  }));
}

// Webhook de Stripe (se monta en server.js con body raw, antes de este router)
router.webhook = wrap(async (req, res) => {
  if (!stripe) return res.sendStatus(204);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook error: ${e.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    await db.query("UPDATE payments SET status='COMPLETADO', paid_at=now() WHERE stripe_id=$1", [s.id]);
    if (s.metadata?.requestId) {
      await db.query("UPDATE service_requests SET status='PAGADA' WHERE id=$1 AND status='PENDIENTE_PAGO'", [s.metadata.requestId]);
      audit(s.metadata.userId, 'ServiceRequest', s.metadata.requestId, 'PAGO', { amount: s.amount_total });
    }
  }
  res.json({ received: true });
});

router.use(authenticate);

// ─── Caballos ───
router.get('/horses', wrap(async (req, res) => {
  res.json(await withRelations(await db.query('SELECT * FROM horses WHERE owner_id=$1 ORDER BY created_at DESC', [req.user.id])));
}));

router.post('/horses', wrap(async (req, res) => {
  const b = req.body || {};
  const v = validateHorse(b);
  if (v.error) return res.status(400).json({ error: v.error });
  const cols = Object.keys(v.data);
  const h = await db.one(
    `INSERT INTO horses(${cols.join(', ')}, owner_id) VALUES (${cols.map((_, n) => `$${n + 1}`).join(',')}, $${cols.length + 1}) RETURNING *`,
    [...cols.map((k) => v.data[k]), req.user.id],
  );
  const docIds = Array.isArray(b.documentIds) ? b.documentIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : [];
  if (docIds.length) {
    await db.query('UPDATE horse_documents SET horse_id=$1 WHERE id = ANY($2::uuid[]) AND user_id=$3 AND horse_id IS NULL', [h.id, docIds, req.user.id]);
  }
  audit(req.user.id, 'Horse', h.id, 'CREAR', { name: h.name, discipline: h.discipline, documentos: docIds.length });
  res.status(201).json(h);
}));

router.get('/horses/:id', wrap(async (req, res) => {
  const h = await ownHorse(req, res);
  if (!h) return;
  const [full] = await withRelations([h]);
  full.requests = await db.query('SELECT * FROM service_requests WHERE horse_id=$1 ORDER BY created_at DESC', [h.id]);
  res.json(full);
}));

router.post('/horses/:id/photos/:view', upload.single('file'), wrap(async (req, res) => {
  if (!(await ownHorse(req, res))) return;
  const { view } = req.params;
  if (!VIEWS.includes(view)) return res.status(400).json({ error: 'Vista no válida' });
  if (!req.file || !req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Sube una imagen JPG, PNG o WEBP' });
  const photo = await db.one(
    `INSERT INTO horse_photos(horse_id, view, url) VALUES ($1,$2,$3)
     ON CONFLICT (horse_id, view) DO UPDATE SET url=EXCLUDED.url, uploaded_at=now() RETURNING *`,
    [req.params.id, view, `/uploads/${req.file.filename}`],
  );
  audit(req.user.id, 'Horse', req.params.id, 'FOTO', { view });
  res.json(photo);
}));

router.post('/horses/:id/videos', upload.single('file'), wrap(async (req, res) => {
  if (!(await ownHorse(req, res))) return;
  if (!req.file || !req.file.mimetype.startsWith('video/')) return res.status(400).json({ error: 'Sube un vídeo MP4, MOV o WEBM' });
  const b = req.body || {};
  const kind = VIDEO_KINDS.includes(b.kind) ? b.kind : 'ENTRENAMIENTO';
  const recordedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(b.recordedOn || '')) ? b.recordedOn : null;
  const v = await db.one('INSERT INTO horse_videos(horse_id, kind, title, recorded_on, url, seconds) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.params.id, kind, String(b.title || '').trim() || null, recordedOn, `/uploads/${req.file.filename}`, parseInt(b.seconds, 10) || null]);
  audit(req.user.id, 'Horse', req.params.id, 'VIDEO', { kind });
  res.status(201).json(v);
}));

router.delete('/horses/:id/videos/:videoId', wrap(async (req, res) => {
  if (!(await ownHorse(req, res))) return;
  const v = await db.one('DELETE FROM horse_videos WHERE id::text=$1 AND horse_id=$2 RETURNING id', [req.params.videoId, req.params.id]);
  if (!v) return res.status(404).json({ error: 'Vídeo no encontrado' });
  audit(req.user.id, 'Horse', req.params.id, 'VIDEO_BORRADO', {});
  res.json({ ok: true });
}));

// ─── Resultados: el cliente sube el documento; la IA lo lee; la dirección lo verifica ───
const { parseNumber: num, parseTime } = require('../lib/csv');
const RESULT_STATUS = ['CLASIFICADO', 'ELIMINADO', 'RETIRADO', 'NO_SALIO'];

// Normaliza un resultado (escrito a mano, leído por la IA o mezcla de ambos). Exportado para la dirección.
function normalizeResult(b, ex) {
  const pick = (k) => (b[k] !== undefined && b[k] !== '' ? b[k] : ex && ex[k] != null && ex[k] !== '' ? ex[k] : null);
  const date = pick('date');
  const status = String(pick('status') || 'CLASIFICADO').toUpperCase();
  const int = (k) => (num(pick(k)) != null ? Math.round(num(pick(k))) : null);
  const txt = (k) => (pick(k) != null ? String(pick(k)).trim() || null : null);
  return {
    competition: txt('competition'),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : null,
    country: txt('country'), category: txt('category'), level: txt('level'),
    position: int('position'), field_size: int('fieldSize'),
    status: RESULT_STATUS.includes(status) ? status : 'CLASIFICADO',
    score: num(pick('score')), faults: num(pick('faults')), time_s: parseTime(pick('timeS')),
    distance_m: int('distanceM'), speed_kmh: num(pick('speedKmh')), going: txt('going'), rating: num(pick('rating')), earnings_eur: num(pick('earningsEur')),
    lengths_beaten: num(pick('lengthsBeaten')), weight_kg: num(pick('weightKg')), rating_authority: txt('ratingAuthority'), speed_index: num(pick('speedIndex')),
    penalties: num(pick('penalties')), elimination_reason: txt('eliminationReason'), event_mean_score: num(pick('eventMeanScore')), event_clear_count: int('eventClearCount'),
  };
}

function missingResult(data) {
  const missing = ['competition', 'date'].filter((k) => !data[k]);
  if (data.status === 'CLASIFICADO' && data.position == null) missing.push('position');
  return missing;
}

router.post('/horses/:id/results', upload.single('document'), wrap(async (req, res) => {
  const h = await ownHorse(req, res);
  if (!h) return;
  if (!req.file) return res.status(400).json({ error: 'Adjunta el documento oficial del resultado (clasificación, acta o ficha de la carrera)' });
  const b = req.body || {};
  const disc = discipline(b.discipline) ? b.discipline : h.discipline;
  // Si el cliente no escribe competición y fecha, la IA lee el documento
  const manual = b.competition && b.date;
  const ex = manual ? null : await DOCS.extractResult({ file: req.file.path, mime: req.file.mimetype, horseName: h.name, disciplineKey: disc });
  const data = normalizeResult(b, ex);
  if (missingResult(data).length) {
    return res.status(422).json({
      error: ex?.error ? 'No se ha podido leer el documento: escribe los datos a mano.' : 'La IA no ha podido leer todos los datos: complétalos a mano.',
      partial: { ...(ex && !ex.error ? ex : {}), ...b, discipline: disc },
    });
  }
  const warning = ex && ex.horseFound === false ? `La IA no encuentra a ${h.name} en el documento` : (ex?.notes || null);
  const cols = Object.keys(data);
  const r = await db.one(
    `INSERT INTO results(horse_id, discipline, ${cols.join(', ')}, document_url, source, ai_extracted, ai_warning)
     VALUES ($1,$2,${cols.map((_, n) => `$${n + 3}`).join(',')},$${cols.length + 3},'TITULAR',$${cols.length + 4},$${cols.length + 5}) RETURNING ${RESULT_COLS}`,
    [h.id, disc, ...cols.map((k) => data[k]), `/uploads/${req.file.filename}`, ex ? JSON.stringify(ex) : null, warning],
  );
  audit(req.user.id, 'Result', r.id, 'APORTAR', { caballo: h.name, competition: data.competition, leidoPorIA: Boolean(ex) });
  res.status(201).json(r);
}));

// ─── Documentación: se sube, la IA la lee y propone los datos (el cliente revisa) ───
const DOC_ROLES = ['EJEMPLAR', 'PADRE', 'MADRE'];
const DOC_MIME = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

async function saveDocument(req, res, horseId) {
  const role = String(req.body?.role || 'EJEMPLAR').toUpperCase();
  if (!req.file) return res.status(400).json({ error: 'Sube una foto (JPG/PNG) o un PDF del documento' });
  if (!DOC_MIME.test(req.file.mimetype)) return res.status(400).json({ error: 'Formato no admitido: usa JPG, PNG, WEBP o PDF' });
  if (!DOC_ROLES.includes(role)) return res.status(400).json({ error: 'Tipo de documento no válido' });
  const name = DOCS.storePrivate(req.file);
  const ex = await DOCS.extract({ name, mime: req.file.mimetype, role });
  const d = await db.one(
    `INSERT INTO horse_documents(user_id, horse_id, role, file, mime, original_name, doc_type, extracted, ai_model, ai_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, role, doc_type, created_at`,
    [req.user.id, horseId || null, role, name, req.file.mimetype, req.file.originalname, ex.docType || null,
      ex.fields ? JSON.stringify({ fields: ex.fields, legible: ex.legible, notes: ex.notes }) : null, ex.model || null, ex.error || null],
  );
  if (horseId) audit(req.user.id, 'Horse', horseId, 'DOCUMENTO', { role, docType: ex.docType });
  res.status(201).json({ id: d.id, role, docType: ex.docType || null, fields: ex.fields || null, legible: ex.legible, notes: ex.notes || '', aiError: ex.error || null });
}

// Antes del alta: sirve para rellenar el formulario
router.post('/documents/extract', upload.single('file'), wrap(async (req, res) => saveDocument(req, res, null)));

// Para un caballo ya dado de alta
router.post('/horses/:id/documents', upload.single('file'), wrap(async (req, res) => {
  const h = await ownHorse(req, res);
  if (!h) return;
  return saveDocument(req, res, h.id);
}));

// Ver el archivo: solo quien lo subió o la dirección/analistas
router.get('/documents/:id/file', wrap(async (req, res) => {
  const d = await db.one('SELECT * FROM horse_documents WHERE id::text=$1', [req.params.id]);
  if (!d || (d.userId !== req.user.id && !['ADMIN', 'EVALUADOR'].includes(req.user.role))) return res.status(404).json({ error: 'Documento no encontrado' });
  res.setHeader('Content-Type', d.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(DOCS.privatePath(d.file));
}));

// ─── Solicitudes de informe ───
router.get('/requests/:id/documents/:n', wrap(async (req, res) => {
  const r = await db.one('SELECT * FROM service_requests WHERE id::text=$1', [req.params.id]);
  if (!r || (r.userId !== req.user.id && !['ADMIN', 'EVALUADOR'].includes(req.user.role))) return res.status(404).json({ error: 'Documento no encontrado' });
  const d = (r.documents || [])[Number(req.params.n)];
  if (!d || !d.file) return res.status(404).json({ error: 'Documento no encontrado' });
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(DOCS.privatePath(d.file));
}));

router.get('/requests', wrap(async (req, res) => {
  res.json(await db.query(
    `SELECT r.*, h.name AS horse_name,
       (SELECT status FROM payments p WHERE p.request_id=r.id ORDER BY created_at DESC LIMIT 1) AS payment_status
     FROM service_requests r LEFT JOIN horses h ON h.id=r.horse_id WHERE r.user_id=$1 ORDER BY r.created_at DESC`, [req.user.id],
  ));
}));

router.post('/requests', upload.array('documents', 10), wrap(async (req, res) => {
  const { service, horseId, notes } = req.body || {};
  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Servicio no válido' });
  const horse = horseId && await db.one('SELECT * FROM horses WHERE id::text=$1', [horseId]);
  if (!horse || horse.ownerId !== req.user.id) return res.status(400).json({ error: 'Selecciona uno de tus caballos' });
  const docs = (req.files || []).map((f) => ({ name: f.originalname, file: DOCS.storePrivate(f), mime: f.mimetype }));
  const request = await db.one(
    'INSERT INTO service_requests(user_id, horse_id, service, notes, documents) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, horse.id, service, notes || null, JSON.stringify(docs)],
  );
  audit(req.user.id, 'ServiceRequest', request.id, 'CREAR', { service });

  // Fase de pruebas (precio 0): entra directamente en revisión
  if (svc.price === 0) {
    await db.query("UPDATE service_requests SET status='EN_REVISION' WHERE id=$1", [request.id]);
    return res.status(201).json({ request: { ...request, status: 'EN_REVISION' }, checkoutUrl: null, message: 'Solicitud recibida. Te avisaremos cuando el informe esté listo.' });
  }
  if (!stripe) return res.status(201).json({ request, checkoutUrl: null, message: 'Solicitud registrada. El pago online aún no está activo: te contactaremos para el abono.' });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price_data: { currency: 'eur', unit_amount: svc.price, product_data: { name: `TopHorses · ${svc.name}` } }, quantity: 1 }],
    metadata: { requestId: request.id, userId: req.user.id },
    success_url: `${process.env.FRONTEND_URL.split(',')[0]}/panel?pago=ok`,
    cancel_url: `${process.env.FRONTEND_URL.split(',')[0]}/panel?pago=cancelado`,
  });
  await db.query('INSERT INTO payments(user_id, request_id, stripe_id, amount) VALUES ($1,$2,$3,$4)', [req.user.id, request.id, session.id, svc.price]);
  res.status(201).json({ request, checkoutUrl: session.url });
}));

router.normalizeResult = normalizeResult;
router.missingResult = missingResult;
router.RESULT_COLS = RESULT_COLS;
module.exports = router;
