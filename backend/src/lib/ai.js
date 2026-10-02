// Conector de IA: Claude (API nativa) o cualquier API compatible con OpenAI.
// Admite DOBLE LECTURA: una IA principal (AI_*) y otra secundaria opcional (AI2_*).
// Si no hay ninguna configurada, la web lo indica: nunca se inventan resultados.
const fs = require('fs');
const path = require('path');
const { extractFrames, extractBursts, resizeImage } = require('./frames');

const num = (v, def, min, max) => Math.min(Math.max(parseInt(v ?? def, 10) || def, min), max);

function providers() {
  const list = [];
  for (const prefix of ['AI', 'AI2']) {
    const apiKey = process.env[`${prefix}_API_KEY`];
    const model = process.env[`${prefix}_MODEL`];
    if (!apiKey || !model) continue;
    list.push({
      id: prefix,
      baseUrl: (process.env[`${prefix}_BASE_URL`] || 'https://api.anthropic.com/v1').replace(/\/$/, ''),
      apiKey,
      model,
    });
  }
  return list;
}

const isConfigured = () => providers().length > 0;

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const fileOf = (uploadDir, url) => path.join(uploadDir, path.basename(url));

// Las fotos del móvil pueden pasar de 10 MB y de la resolución que la IA aprovecha: se ajustan a 2000 px por lado
async function photoToDataUrl(uploadDir, url) {
  const file = fileOf(uploadDir, url);
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime || !fs.existsSync(file)) return null;
  return (await resizeImage(file)) || `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

// ── Claude con su API nativa (la capa "compatible con OpenAI" de Anthropic no está pensada para producción) ──
const isAnthropic = (p) => /anthropic\.com/.test(p.baseUrl);

function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  return content.map((c) => {
    if (c.type === 'image_url') {
      const m = /^data:([^;]+);base64,(.*)$/s.exec(c.image_url.url);
      return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : { type: 'image', source: { type: 'url', url: c.image_url.url } };
    }
    return { type: 'text', text: c.text };
  });
}

async function callAnthropic(p, body) {
  const res = await fetch(`${p.baseUrl}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: body.model,
      max_tokens: 8000,
      temperature: 0.2,
      messages: body.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
    }),
  });
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 400);
    const hint = res.status === 401 ? ' (clave no válida)' : /credit balance|billing/i.test(txt) ? ' (saldo insuficiente en la cuenta de Claude)' : res.status === 404 ? ' (revisa el nombre del modelo en AI_MODEL)' : '';
    throw Object.assign(new Error(`Error de ${p.model} ${res.status}${hint}: ${txt}`), { status: 502 });
  }
  const data = await res.json();
  // Se devuelve con la misma forma que las APIs tipo OpenAI para no cambiar el resto del código
  return { choices: [{ message: { content: (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('') } }], usage: data.usage || null };
}

async function callModel(p, body) {
  if (isAnthropic(p)) return callAnthropic(p, body);
  const post = (b) => fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify(b),
  });
  let res = await post({ ...body, temperature: 0.2, max_tokens: 8000, response_format: { type: 'json_object' } });
  // Algunos modelos no aceptan temperature o response_format: se reintenta sin ellos
  if (res.status === 400) res = await post({ ...body, max_tokens: 8000 });
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 400);
    const hint = res.status === 401 ? ' (clave no válida)' : res.status === 402 || /balance|quota|insufficient|credit/i.test(txt) ? ' (saldo insuficiente en la cuenta de IA)' : '';
    throw Object.assign(new Error(`Error de ${p.model} ${res.status}${hint}: ${txt}`), { status: 502 });
  }
  return res.json();
}

function parseJson(text) {
  const clean = String(text || '').replace(/```json|```/g, '');
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end < start) throw Object.assign(new Error('La IA no devolvió un JSON válido'), { status: 502 });
  return JSON.parse(clean.slice(start, end + 1));
}

// Motor de análisis genérico: prepara fotos y vídeo (fotogramas repartidos + ráfagas) una sola vez y los envía
// a todas las IAs configuradas en paralelo con el texto de instrucciones que se le pase (por disciplina).
// Qué mide cada disciplina se define aparte; este motor no decide nada por sí mismo.
async function runAnalysis({ prompt, photos = [], video = null, uploadDir, maxProviders }) {
  const list = providers().slice(0, maxProviders || undefined);
  if (!list.length) throw Object.assign(new Error('IA pendiente de integración: falta AI_API_KEY o AI_MODEL'), { status: 503 });

  const images = (await Promise.all(photos.map(async (p) => ({ view: p.view, dataUrl: await photoToDataUrl(uploadDir, p.url) })))).filter((p) => p.dataUrl);
  const videoFile = video ? fileOf(uploadDir, video.url) : null;
  const spread = videoFile ? await extractFrames(videoFile, num(process.env.AI_VIDEO_FRAMES, 8, 0, 16)) : [];
  const bursts = videoFile ? await extractBursts(videoFile, { bursts: num(process.env.AI_VIDEO_BURSTS, 2, 0, 4) }) : [];

  const content = [{ type: 'text', text: prompt }];
  images.forEach((i) => {
    content.push({ type: 'text', text: `Foto: ${i.view}` });
    content.push({ type: 'image_url', image_url: { url: i.dataUrl } });
  });
  spread.forEach((f) => {
    content.push({ type: 'text', text: `Fotograma del vídeo en ${f.t}` });
    content.push({ type: 'image_url', image_url: { url: f.dataUrl } });
  });
  bursts.forEach((b, i) => {
    content.push({ type: 'text', text: `Ráfaga ${i + 1} (fotogramas consecutivos cada 0,1 s):` });
    b.frames.forEach((f) => {
      content.push({ type: 'text', text: f.t });
      content.push({ type: 'image_url', image_url: { url: f.dataUrl } });
    });
  });

  const media = { frames: spread.map((f) => f.t), bursts: bursts.map((b) => `${b.frames[0].t}–${b.frames[b.frames.length - 1].t}`) };
  const settled = await Promise.allSettled(list.map(async (p) => {
    const body = await callModel(p, { model: p.model, messages: [{ role: 'user', content }] });
    return { model: p.model, result: parseJson(body.choices?.[0]?.message?.content), usage: body.usage || null };
  }));
  const runs = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const errors = settled.filter((s) => s.status === 'rejected').map((s) => s.reason.message);
  if (!runs.length) throw Object.assign(new Error(errors.join(' | ')), { status: 502 });
  return { runs, errors, media };
}

module.exports = { isConfigured, runAnalysis, providers, callModel, parseJson };
