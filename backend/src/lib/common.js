const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

// Servicios (céntimos). El precio del informe se fija en Railway (INFORME_PRICE_EUR); 0 = fase de pruebas sin coste.
// Los paquetes de suscripción se añadirán cuando esté definido qué incluye cada uno.
const eurToCents = (v) => Math.max(0, Math.round(Number(v || 0) * 100));
const SERVICES = {
  INFORME: { name: 'Informe TopHorses', price: eurToCents(process.env.INFORME_PRICE_EUR), days: 3 },
};

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm)|application\/pdf)$/.test(file.mimetype)),
});

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Sesión requerida' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Sesión caducada' }); }
  // Se comprueba la cuenta en cada petición: un usuario bloqueado o con el rol cambiado lo nota al momento
  db.one('SELECT id, role, is_active FROM users WHERE id=$1', [payload.id]).then((u) => {
    if (!u || !u.isActive) return res.status(401).json({ error: 'Cuenta desactivada. Contacta con TopHorses.' });
    req.user = { ...payload, role: u.role };
    return next();
  }).catch(next);
};

const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) { try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* anónimo */ } }
  next();
};

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Sin permisos' });

const audit = (userId, entity, entityId, action, data, client) =>
  db.query('INSERT INTO audit_log(user_id, entity, entity_id, action, data) VALUES ($1,$2,$3,$4,$5)',
    [userId || null, entity, String(entityId), action, data ? JSON.stringify(data) : null], client).catch((e) => console.error('audit', e.message));

const ageYears = (birth, at = new Date()) => {
  const b = new Date(birth);
  let a = at.getFullYear() - b.getFullYear();
  if (at < new Date(at.getFullYear(), b.getMonth(), b.getDate())) a -= 1;
  return a;
};

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Ajustes de la dirección (clave/valor). Añadir aquí cada ajuste nuevo con su valor por defecto.
// base_rates: tasas base por disciplina y nivel (se rellenan con datos de convenio)
const SETTINGS_DEFAULTS = { base_rates: require('./knowledge').DEFAULT_BASE_RATES };
async function getSetting(key, client) {
  const r = await db.one('SELECT value FROM settings WHERE key=$1', [key], client);
  return r ? r.value : SETTINGS_DEFAULTS[key];
}

module.exports = { db, SETTINGS_DEFAULTS, getSetting, SERVICES, UPLOAD_DIR, upload, authenticate, optionalAuth, requireRole, audit, ageYears, wrap };
