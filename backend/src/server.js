require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { UPLOAD_DIR } = require('./lib/common');
const ai = require('./lib/ai');

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en las variables de entorno');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

const origins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: origins }));

// Stripe necesita el body sin parsear
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), require('./routes/my').webhook);

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 600 }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
// La lectura de documentos con IA cuesta dinero: máximo 30 por hora desde la misma conexión
// Descargar vídeos desde enlaces consume ancho de banda: máximo 20 por hora desde la misma conexión
app.use(/\/videos\/from-url$|\/fetch-video$/, rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Demasiadas descargas seguidas. Prueba dentro de un rato.' } }));
app.use(['/api/my/documents/extract', /^\/api\/my\/horses\/[^/]+\/documents$/, /^\/api\/my\/horses\/[^/]+\/results$/], rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: { error: 'Demasiados documentos seguidos. Prueba dentro de un rato.' } }));

app.get('/api/health', (req, res) => res.json({ status: 'OK', service: 'TopHorses API', ai: ai.isConfigured() ? 'configurada' : 'pendiente de integración' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/public'));
app.use('/api/my', require('./routes/my'));
app.use('/api/admin', require('./routes/data'));
app.use('/api/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === '22P02') return res.status(404).json({ error: 'Registro no encontrado' });
  if (err.code === '23505') return res.status(409).json({ error: 'Ese dato ya existe' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Archivo demasiado grande' });
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3001;
require('./lib/bootstrap')()
  .then(() => {
    app.listen(PORT, () => console.log(`TopHorses API escuchando en puerto ${PORT}`))
    // Rastreador programado: cada hora mira si toca otra pasada (si está activado en el panel)
    const data = require('./routes/data')
    const db = require('./lib/db')
    setInterval(async () => {
      try {
        const st = await data.crawlerSettings()
        if (!st.crawler_enabled) return
        const last = await db.one('SELECT started_at FROM crawler_runs ORDER BY started_at DESC LIMIT 1')
        if (!last || Date.now() - new Date(last.startedAt).getTime() > st.crawler_every_hours * 3600e3) await data.startCrawl('PROGRAMADO')
      } catch (e) { console.error('programador del rastreador', e.message) }
    }, 60 * 60 * 1000)
    // Primera comprobación a los 2 minutos de arrancar (para no esperar una hora tras activarlo)
    setTimeout(async () => {
      try {
        const st = await data.crawlerSettings()
        if (!st.crawler_enabled) return
        const last = await db.one('SELECT started_at FROM crawler_runs ORDER BY started_at DESC LIMIT 1')
        if (!last || Date.now() - new Date(last.startedAt).getTime() > st.crawler_every_hours * 3600e3) await data.startCrawl('PROGRAMADO')
      } catch (e) { console.error('programador del rastreador', e.message) }
    }, 2 * 60 * 1000)
  })
  .catch((e) => { console.error('Error al arrancar:', e); process.exit(1); });
