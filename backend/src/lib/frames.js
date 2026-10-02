// Extrae fotogramas repartidos a lo largo del vídeo, cada uno con su minuto (mm:ss),
// para que la IA pueda citar el momento exacto como evidencia.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch { /* se usa el ffmpeg del sistema */ }

const run = (args) => new Promise((resolve) => {
  execFile(FFMPEG, args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ err, out: `${stdout}${stderr}` }));
});

const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

async function duration(file) {
  const { out } = await run(['-hide_banner', '-i', file]);
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

// Devuelve [{ t: '00:12', dataUrl }] o [] si no se puede leer el vídeo
async function extractFrames(file, count = 8) {
  if (!file || !fs.existsSync(file)) return [];
  const dur = await duration(file);
  if (!dur || dur <= 0) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cib-frames-'));
  const frames = [];
  try {
    for (let i = 0; i < count; i += 1) {
      const t = Math.min(dur - 0.1, (dur * (i + 0.5)) / count);
      const out = path.join(dir, `f${i}.jpg`);
      // eslint-disable-next-line no-await-in-loop
      await run(['-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '4', '-y', out]);
      if (fs.existsSync(out)) frames.push({ t: mmss(t), dataUrl: `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}` });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return frames;
}

// Ráfagas de fotogramas consecutivos (p. ej. 6 seguidos a 10 por segundo): permiten ver la secuencia
// de apoyos de un tranco completo, que en fotogramas sueltos se pierde.
async function extractBursts(file, { bursts = 2, len = 6, fps = 10 } = {}) {
  if (!file || !fs.existsSync(file) || bursts <= 0) return [];
  const dur = await duration(file);
  if (!dur || dur < 2) return [];
  const out = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cib-burst-'));
  try {
    for (let b = 0; b < bursts; b += 1) {
      const start = Math.max(0, Math.min(dur - len / fps - 0.1, (dur * (b + 1)) / (bursts + 1) - len / fps / 2));
      const pattern = path.join(dir, `b${b}_%02d.jpg`);
      // eslint-disable-next-line no-await-in-loop
      await run(['-hide_banner', '-loglevel', 'error', '-ss', start.toFixed(2), '-i', file, '-vf', `fps=${fps},scale='min(960,iw)':-2`, '-frames:v', String(len), '-q:v', '4', '-y', pattern]);
      const frames = [];
      for (let i = 1; i <= len; i += 1) {
        const f = path.join(dir, `b${b}_${String(i).padStart(2, '0')}.jpg`);
        if (fs.existsSync(f)) frames.push({ t: `${mmss(start + (i - 1) / fps)}.${Math.floor(((start + (i - 1) / fps) % 1) * 10 + 1e-6)}`, dataUrl: `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` });
      }
      if (frames.length) out.push({ start: mmss(start), step: 1 / fps, frames });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

// Ajusta una foto al máximo que Claude aprovecha cuando van más de 20 imágenes en una petición (2000 px por lado). Devuelve dataUrl o null.
async function resizeImage(file, max = 2000) {
  if (!file || !fs.existsSync(file)) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cib-img-'));
  const out = path.join(dir, 'r.jpg');
  try {
    await run(['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `scale='min(${max},iw)':'min(${max},ih)':force_original_aspect_ratio=decrease`, '-q:v', '3', '-frames:v', '1', '-y', out]);
    if (!fs.existsSync(out)) return null;
    return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { resizeImage, extractFrames, extractBursts, mmss };
