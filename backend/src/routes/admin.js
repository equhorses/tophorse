// Dirección y analistas: solicitudes, caballos, resultados, usuarios, pagos, exportaciones y ajustes
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const DOCS = require('../lib/documents');
const { validateHorse, HORSE_KEYS } = require('../lib/horses');
const { discipline } = require('../lib/disciplines');
const { db, SETTINGS_DEFAULTS, upload, authenticate, requireRole, audit, wrap } = require('../lib/common');
const my = require('./my');

router.use(authenticate, requireRole('ADMIN', 'EVALUADOR'));

const REQ_STATUS = ['PENDIENTE_PAGO', 'PAGADA', 'EN_REVISION', 'REQUIERE_DOCUMENTACION', 'RESUELTA', 'RECHAZADA'];

router.get('/stats', wrap(async (req, res) => {
  const s = await db.one(`SELECT
    (SELECT COUNT(*)::int FROM horses WHERE status <> 'BAJA') AS horses,
    (SELECT COUNT(*)::int FROM horses WHERE created_at > now() - interval '30 days') AS horses_month,
    (SELECT COUNT(*)::int FROM results) AS results,
    (SELECT COUNT(*)::int FROM results WHERE NOT verified) AS unverified_results,
    (SELECT COUNT(*)::int FROM horse_videos) AS videos,
    (SELECT COUNT(*)::int FROM horse_documents WHERE created_at > date_trunc('month', now())) AS docs_month,
    (SELECT COUNT(*)::int FROM service_requests WHERE status IN ('PENDIENTE_PAGO','PAGADA','EN_REVISION','REQUIERE_DOCUMENTACION')) AS pending,
    (SELECT COUNT(*)::int FROM users) AS users,
    (SELECT COUNT(*)::int FROM users WHERE created_at > now() - interval '30 days') AS users_month,
    (SELECT COALESCE(SUM(amount),0)::int FROM payments WHERE status='COMPLETADO') / 100.0 AS revenue,
    (SELECT COALESCE(SUM(amount),0)::int FROM payments WHERE status='COMPLETADO' AND paid_at > date_trunc('month', now())) / 100.0 AS revenue_month`);
  // Archivo de datos por disciplina: lo que alimentará los informes
  const byDiscipline = await db.query(
    `SELECT d.discipline, COUNT(DISTINCT d.horse_id)::int AS horses, COUNT(r.id)::int AS results,
       (SELECT COUNT(*)::int FROM horse_videos v JOIN horses h2 ON h2.id=v.horse_id WHERE h2.discipline=d.discipline) AS videos
     FROM (SELECT id AS horse_id, discipline FROM horses WHERE status <> 'BAJA') d
     LEFT JOIN results r ON r.horse_id=d.horse_id GROUP BY d.discipline`,
  );
  res.json({ ...s, byDiscipline });
}));

// ─── Ajustes ───
const allSettings = async () => {
  const rows = await db.query('SELECT key, value FROM settings');
  return { ...SETTINGS_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
};
router.get('/settings', requireRole('ADMIN'), wrap(async (req, res) => res.json(await allSettings())));
router.patch('/settings', requireRole('ADMIN'), wrap(async (req, res) => {
  const b = req.body || {};
  const keys = Object.keys(b).filter((k) => k in SETTINGS_DEFAULTS);
  if (!keys.length) return res.status(400).json({ error: 'Ajuste no válido' });
  for (const k of keys) {
    if (typeof b[k] !== typeof SETTINGS_DEFAULTS[k]) return res.status(400).json({ error: `Valor no válido para ${k}` });
    // eslint-disable-next-line no-await-in-loop
    await db.query(`INSERT INTO settings(key, value, updated_at, updated_by) VALUES ($1,$2::jsonb,now(),$3)
                    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=EXCLUDED.updated_by`, [k, JSON.stringify(b[k]), req.user.id]);
    audit(req.user.id, 'Setting', k, 'CAMBIAR', { valor: b[k] });
  }
  res.json(await allSettings());
}));

// ─── Solicitudes de informe ───
router.get('/requests', wrap(async (req, res) => {
  res.json(await db.query(
    `SELECT r.*, u.first_name || ' ' || u.last_name AS user_name, u.email AS user_email, h.name AS horse_name, h.ref, h.discipline,
       (SELECT status FROM payments p WHERE p.request_id=r.id ORDER BY created_at DESC LIMIT 1) AS payment_status
     FROM service_requests r JOIN users u ON u.id=r.user_id LEFT JOIN horses h ON h.id=r.horse_id ORDER BY r.created_at DESC`,
  ));
}));

router.patch('/requests/:id', wrap(async (req, res) => {
  const { status, adminNotes } = req.body || {};
  if (!REQ_STATUS.includes(status)) return res.status(400).json({ error: 'Estado no válido' });
  const r = await db.one(
    `UPDATE service_requests SET status=$2, admin_notes=COALESCE($3, admin_notes),
       resolved_at=CASE WHEN $2 IN ('RESUELTA','RECHAZADA') THEN now() ELSE NULL END
     WHERE id::text=$1 RETURNING *`, [req.params.id, status, adminNotes ?? null],
  );
  if (!r) return res.status(404).json({ error: 'Solicitud no encontrada' });
  audit(req.user.id, 'ServiceRequest', r.id, 'ESTADO', { status, adminNotes });
  res.json(r);
}));

// ─── Caballos ───
router.get('/horses', wrap(async (req, res) => {
  const { q = '', status = '', breed = '', discipline: disc = '' } = req.query;
  const params = []; const w = ['TRUE'];
  if (q) { params.push(`%${q}%`); w.push(`(h.name ILIKE $${params.length} OR h.ref ILIKE $${params.length} OR h.microchip ILIKE $${params.length} OR h.sire_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR h.external_owner ILIKE $${params.length})`); }
  if (status) { params.push(status); w.push(`h.status=$${params.length}`); }
  if (breed) { params.push(breed); w.push(`h.breed=$${params.length}`); }
  if (disc) { params.push(disc); w.push(`h.discipline=$${params.length}`); }
  res.json(await db.query(
    `SELECT h.id, h.ref, h.name, h.breed, h.discipline, h.birth_date, h.sex, h.status, h.sire_name, h.dam_name,
       h.external_owner, h.created_at, u.first_name || ' ' || u.last_name AS owner_name, u.email AS owner_email,
       (SELECT COUNT(*)::int FROM horse_photos p WHERE p.horse_id=h.id) AS photo_count,
       (SELECT COUNT(*)::int FROM horse_videos v WHERE v.horse_id=h.id) AS video_count,
       (SELECT COUNT(*)::int FROM results r WHERE r.horse_id=h.id) AS result_count
     FROM horses h JOIN users u ON u.id=h.owner_id WHERE ${w.join(' AND ')} ORDER BY h.created_at DESC LIMIT 1000`, params,
  ));
}));

router.get('/horses/:id', wrap(async (req, res) => {
  const h = await db.one(
    `SELECT h.*, u.first_name || ' ' || u.last_name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
     FROM horses h JOIN users u ON u.id=h.owner_id WHERE h.id::text=$1`, [req.params.id],
  );
  if (!h) return res.status(404).json({ error: 'Caballo no encontrado' });
  const [photos, videos, results, docs, requests] = await Promise.all([
    db.query('SELECT * FROM horse_photos WHERE horse_id=$1', [h.id]),
    db.query('SELECT * FROM horse_videos WHERE horse_id=$1 ORDER BY uploaded_at DESC', [h.id]),
    db.query(`SELECT ${my.RESULT_COLS}, source FROM results WHERE horse_id=$1 ORDER BY date DESC`, [h.id]),
    db.query('SELECT id, role, doc_type, original_name, mime, extracted, ai_model, ai_error, created_at FROM horse_documents WHERE horse_id=$1 ORDER BY created_at', [h.id]),
    db.query('SELECT id, service, status, created_at FROM service_requests WHERE horse_id=$1 ORDER BY created_at DESC', [h.id]),
  ]);
  const documents = docs.map((d) => ({ ...d, checks: DOCS.compare(h, d) }));
  res.json({ ...h, photos, videos, results, documents, requests });
}));

async function ownerFrom(b, fallbackId) {
  const email = String(b.ownerEmail || '').trim().toLowerCase();
  if (!email) return { id: fallbackId };
  const u = await db.one('SELECT id FROM users WHERE email=$1', [email]);
  if (!u) throw Object.assign(new Error(`No hay ninguna cuenta con el email ${email}. Créala en Usuarios o deja el campo vacío.`), { status: 400 });
  return { id: u.id };
}

router.post('/horses', requireRole('ADMIN'), wrap(async (req, res) => {
  const b = req.body || {};
  const v = validateHorse(b);
  if (v.error) return res.status(400).json({ error: v.error });
  const owner = await ownerFrom(b, req.user.id);
  const data = { ...v.data, external_owner: String(b.externalOwner || '').trim() || null, admin_notes: b.adminNotes || null };
  const cols = Object.keys(data);
  const h = await db.one(
    `INSERT INTO horses(${cols.join(', ')}, owner_id) VALUES (${cols.map((_, n) => `$${n + 1}`).join(',')}, $${cols.length + 1}) RETURNING *`,
    [...cols.map((k) => data[k]), owner.id],
  );
  audit(req.user.id, 'Horse', h.id, 'CREAR_DIRECCION', { name: h.name, titular: b.ownerEmail || b.externalOwner || 'dirección' });
  res.status(201).json(h);
}));

const toCamel = (s) => s.replace(/_(\w)/g, (_, c) => c.toUpperCase());

router.patch('/horses/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const b = req.body || {};
  const h = await db.one('SELECT * FROM horses WHERE id::text=$1', [req.params.id]);
  if (!h) return res.status(404).json({ error: 'Caballo no encontrado' });
  const sets = []; const vals = [h.id]; const changes = {};
  const put = (col, val) => { vals.push(val); sets.push(`${col}=$${vals.length}`); changes[col] = val; };
  if (HORSE_KEYS.some((k) => b[k] !== undefined)) {
    const merged = Object.fromEntries(HORSE_KEYS.map((k) => [k, h[k]]));
    HORSE_KEYS.forEach((k) => { if (b[k] !== undefined) merged[k] = b[k]; });
    const v = validateHorse(merged);
    if (v.error) return res.status(400).json({ error: v.error });
    Object.entries(v.data).forEach(([col, val]) => { if (String(val ?? '') !== String(h[toCamel(col)] ?? '')) put(col, val); });
  }
  if (b.externalOwner !== undefined) put('external_owner', String(b.externalOwner).trim() || null);
  if (b.adminNotes !== undefined) put('admin_notes', b.adminNotes || null);
  if (b.status !== undefined) {
    if (!['ACTIVO', 'RETIRADO', 'BAJA'].includes(b.status)) return res.status(400).json({ error: 'Estado no válido' });
    put('status', b.status);
  }
  if (String(b.ownerEmail || '').trim()) {
    const owner = await ownerFrom(b, req.user.id);
    if (owner.id !== h.ownerId) put('owner_id', owner.id);
  }
  if (!sets.length) return res.json(h);
  const out = await db.one(`UPDATE horses SET ${sets.join(', ')}, updated_at=now() WHERE id=$1 RETURNING *`, vals);
  audit(req.user.id, 'Horse', h.id, 'EDITAR_DIRECCION', { caballo: h.name, cambios: changes });
  res.json(out);
}));

// ─── Resultados ───
router.get('/results', wrap(async (req, res) => {
  const { discipline: disc = '', pending = '' } = req.query;
  const params = []; const w = ['TRUE'];
  if (disc) { params.push(disc); w.push(`r.discipline=$${params.length}`); }
  if (pending === '1') w.push('NOT r.verified');
  res.json(await db.query(
    `SELECT r.*, h.name AS horse_name, h.ref FROM results r JOIN horses h ON h.id=r.horse_id
     WHERE ${w.join(' AND ')} ORDER BY r.verified ASC, r.date DESC LIMIT 1000`, params,
  ));
}));

// La dirección también puede registrar resultados (con o sin documento; con documento y sin datos, lee la IA)
router.post('/horses/:id/results', upload.single('document'), wrap(async (req, res) => {
  const h = await db.one('SELECT * FROM horses WHERE id::text=$1', [req.params.id]);
  if (!h) return res.status(404).json({ error: 'Caballo no encontrado' });
  const b = req.body || {};
  const disc = discipline(b.discipline) ? b.discipline : h.discipline;
  const ex = req.file && !(b.competition && b.date) ? await DOCS.extractResult({ file: req.file.path, mime: req.file.mimetype, horseName: h.name, disciplineKey: disc }) : null;
  const data = my.normalizeResult(b, ex);
  if (my.missingResult(data).length) return res.status(422).json({ error: 'Faltan datos: competición, fecha y puesto (si se clasificó)', partial: { ...(ex && !ex.error ? ex : {}), ...b, discipline: disc } });
  const cols = Object.keys(data);
  const r = await db.one(
    `INSERT INTO results(horse_id, discipline, ${cols.join(', ')}, document_url, source, ai_extracted, verified)
     VALUES ($1,$2,${cols.map((_, n) => `$${n + 3}`).join(',')},$${cols.length + 3},'DIRECCION',$${cols.length + 4},TRUE) RETURNING *`,
    [h.id, disc, ...cols.map((k) => data[k]), req.file ? `/uploads/${req.file.filename}` : null, ex ? JSON.stringify(ex) : null],
  );
  audit(req.user.id, 'Result', r.id, 'CREAR_DIRECCION', { caballo: h.name, competition: data.competition });
  res.status(201).json(r);
}));

router.post('/results/:id/verify', requireRole('ADMIN'), wrap(async (req, res) => {
  const r = await db.one('UPDATE results SET verified=TRUE WHERE id::text=$1 RETURNING *', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Resultado no encontrado' });
  audit(req.user.id, 'Result', r.id, 'VERIFICAR', {});
  res.json(r);
}));

router.delete('/results/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const r = await db.one('DELETE FROM results WHERE id::text=$1 RETURNING id, competition', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Resultado no encontrado' });
  audit(req.user.id, 'Result', r.id, 'BORRAR', { competition: r.competition, motivo: req.body?.reason || null });
  res.json({ ok: true });
}));

// ─── Usuarios ───
const ROLES = ['ADMIN', 'EVALUADOR', 'TITULAR'];
const USER_COLS = 'u.id, u.email, u.first_name, u.last_name, u.role, u.phone, u.country, u.city, u.company, u.is_active, u.created_at';
router.get('/users', requireRole('ADMIN'), wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = 'TRUE';
  if (q) { params.push(`%${q}%`); where = '(u.email ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR u.phone ILIKE $1 OR u.company ILIKE $1)'; }
  res.json(await db.query(
    `SELECT ${USER_COLS}, (SELECT COUNT(*)::int FROM horses h WHERE h.owner_id=u.id) AS horse_count,
       (SELECT COUNT(*)::int FROM service_requests r WHERE r.user_id=u.id) AS request_count
     FROM users u WHERE ${where} ORDER BY u.created_at DESC LIMIT 500`, params,
  ));
}));

router.get('/users/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const u = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id::text=$1`, [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const [horses, requests] = await Promise.all([
    db.query('SELECT id, ref, name, breed, discipline, status FROM horses WHERE owner_id=$1 ORDER BY created_at DESC', [u.id]),
    db.query('SELECT id, service, status, created_at FROM service_requests WHERE user_id=$1 ORDER BY created_at DESC', [u.id]),
  ]);
  res.json({ ...u, horses, requests });
}));

const tempPassword = () => crypto.randomBytes(6).toString('base64url');

router.post('/users', requireRole('ADMIN'), wrap(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !String(b.firstName || '').trim() || !String(b.lastName || '').trim()) return res.status(400).json({ error: 'Email, nombre y apellidos son obligatorios' });
  const role = ROLES.includes(b.role) ? b.role : 'TITULAR';
  const password = b.password && String(b.password).length >= 8 ? String(b.password) : tempPassword();
  const u = await db.one(
    `INSERT INTO users(email, password, role, first_name, last_name, phone, country, city, company) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, email, role, first_name, last_name`,
    [email, await bcrypt.hash(password, 10), role, b.firstName.trim(), b.lastName.trim(), b.phone || null, (b.country || 'España').trim(), b.city || null, b.company || null],
  );
  audit(req.user.id, 'User', u.id, 'CREAR', { email, role });
  res.status(201).json({ ...u, tempPassword: b.password ? null : password });
}));

router.patch('/users/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const b = req.body || {};
  const self = req.params.id === req.user.id;
  if (self && (b.isActive === false || (b.role && b.role !== 'ADMIN'))) return res.status(400).json({ error: 'No puedes bloquearte ni quitarte la dirección a ti mismo' });
  if (b.role && !ROLES.includes(b.role)) return res.status(400).json({ error: 'Rol no válido' });
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return res.status(400).json({ error: 'Email no válido' });
  const map = { email: 'email', firstName: 'first_name', lastName: 'last_name', phone: 'phone', country: 'country', city: 'city', company: 'company', role: 'role', isActive: 'is_active' };
  const sets = []; const vals = [req.params.id];
  Object.entries(map).forEach(([k, col]) => {
    if (b[k] === undefined) return;
    vals.push(k === 'email' ? String(b[k]).trim().toLowerCase() : k === 'isActive' ? Boolean(b[k]) : (b[k] === '' ? null : b[k]));
    sets.push(`${col}=$${vals.length}`);
  });
  if (!sets.length) return res.status(400).json({ error: 'Nada que cambiar' });
  const u = await db.one(`UPDATE users SET ${sets.join(', ')} WHERE id::text=$1 RETURNING id, email, role, is_active`, vals);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  audit(req.user.id, 'User', u.id, 'EDITAR', b);
  res.json(u);
}));

router.post('/users/:id/password', requireRole('ADMIN'), wrap(async (req, res) => {
  const password = tempPassword();
  const u = await db.one('UPDATE users SET password=$2 WHERE id::text=$1 RETURNING id, email', [req.params.id, await bcrypt.hash(password, 10)]);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  audit(req.user.id, 'User', u.id, 'CLAVE_REINICIADA', { email: u.email });
  res.json({ email: u.email, tempPassword: password });
}));

// ─── Pagos ───
router.get('/payments', requireRole('ADMIN'), wrap(async (req, res) => {
  res.json(await db.query(
    `SELECT p.id, p.amount, p.currency, p.status, p.created_at, p.paid_at, p.stripe_id, r.service, u.email AS user_email,
       u.first_name || ' ' || u.last_name AS user_name
     FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN service_requests r ON r.id=p.request_id ORDER BY p.created_at DESC LIMIT 1000`,
  ));
}));

// ─── Exportar a CSV (se abre en Excel) ───
const EXPORTS = {
  caballos: `SELECT h.ref AS "Ref", h.name AS "Nombre", h.discipline AS "Disciplina", h.breed AS "Raza", h.sex AS "Sexo", h.birth_date AS "Nacimiento",
      h.coat AS "Capa", h.country AS "País", h.sire_name AS "Padre", h.dam_name AS "Madre", h.damsire_name AS "Abuelo materno", h.breeder_name AS "Criador",
      h.microchip AS "Microchip", h.ueln AS "UELN", h.official_registry AS "Nº libro", h.studbook AS "Libro", h.trainer_name AS "Entrenador", h.status AS "Estado",
      COALESCE(h.external_owner, u.first_name || ' ' || u.last_name) AS "Propietario", u.email AS "Email", h.created_at AS "Alta"
    FROM horses h JOIN users u ON u.id=h.owner_id ORDER BY h.created_at`,
  resultados: `SELECT h.ref AS "Ref", h.name AS "Caballo", r.discipline AS "Disciplina", r.competition AS "Competición", r.date AS "Fecha", r.country AS "País",
      r.category AS "Prueba", r.level AS "Nivel", r.status AS "Estado", r.position AS "Puesto", r.field_size AS "Participantes", r.score AS "Nota", r.faults AS "Faltas",
      r.time_s AS "Tiempo (s)", r.distance_m AS "Distancia (m)", r.speed_kmh AS "Velocidad (km/h)", r.going AS "Pista", r.rating AS "Rating", r.earnings_eur AS "Premio (€)",
      r.source AS "Origen del dato", r.verified AS "Verificado"
    FROM results r JOIN horses h ON h.id=r.horse_id ORDER BY r.date`,
  usuarios: `SELECT email AS "Email", first_name AS "Nombre", last_name AS "Apellidos", company AS "Empresa", role AS "Rol", phone AS "Teléfono", country AS "País", city AS "Ciudad",
      is_active AS "Activo", created_at AS "Alta" FROM users ORDER BY created_at`,
  pagos: `SELECT p.created_at AS "Fecha", u.email AS "Usuario", r.service AS "Servicio", p.amount / 100.0 AS "Importe", p.currency AS "Moneda", p.status AS "Estado", p.paid_at AS "Pagado"
    FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN service_requests r ON r.id=p.request_id ORDER BY p.created_at`,
  solicitudes: `SELECT r.created_at AS "Fecha", r.service AS "Servicio", r.status AS "Estado", u.email AS "Cliente", h.name AS "Caballo", r.notes AS "Notas", r.admin_notes AS "Notas dirección"
    FROM service_requests r JOIN users u ON u.id=r.user_id LEFT JOIN horses h ON h.id=r.horse_id ORDER BY r.created_at`,
};
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : typeof v === 'boolean' ? (v ? 'sí' : 'no') : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
router.get('/export/:kind', requireRole('ADMIN'), wrap(async (req, res) => {
  const sql = EXPORTS[req.params.kind];
  if (!sql) return res.status(404).json({ error: 'Listado no disponible' });
  const r = await db.pool.query(sql);
  const head = r.fields.map((f) => csvCell(f.name)).join(';');
  const lines = r.rows.map((row) => r.fields.map((f) => csvCell(row[f.name])).join(';'));
  audit(req.user.id, 'Export', req.params.kind, 'EXPORTAR', { listado: req.params.kind, filas: r.rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tophorses-${req.params.kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${[head, ...lines].join('\r\n')}`);
}));

router.get('/audit', requireRole('ADMIN'), wrap(async (req, res) => {
  res.json(await db.query(
    `SELECT a.*, u.first_name || ' ' || u.last_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.at DESC LIMIT 200`,
  ));
}));

module.exports = router;
