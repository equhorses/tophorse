// Descarga un vídeo desde un enlace y lo guarda en /uploads para que la IA pueda analizarlo.
// - Enlace directo a un archivo (.mp4, .mov, .webm): descarga normal.
// - Página de vídeo (web de subasta, YouTube, Vimeo…): yt-dlp, que se descarga solo la primera vez en /data/bin.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const { UPLOAD_DIR } = require('./common')

const MAX_BYTES = 300 * 1024 * 1024
const BIN_DIR = process.env.BIN_DIR || path.resolve(UPLOAD_DIR, '..', 'bin')
const YTDLP = path.join(BIN_DIR, 'yt-dlp')
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'
let FFMPEG = null
try { FFMPEG = require('ffmpeg-static') } catch { /* sin ffmpeg-static */ }

const isDirect = (u) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(u)

function checkUrl(url) {
  let u
  try { u = new URL(String(url || '').trim()) } catch { throw Object.assign(new Error('Enlace no válido'), { status: 400 }) }
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('El enlace debe empezar por http o https'), { status: 400 })
  if (!process.env.VIDEO_FETCH_ALLOW_LOCAL && /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith('.internal')) throw Object.assign(new Error('Enlace no permitido'), { status: 400 })
  return u.toString()
}

async function downloadDirect(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw Object.assign(new Error(`La web devolvió ${res.status}`), { status: 502 })
  const type = res.headers.get('content-type') || ''
  if (!/video|octet-stream/.test(type)) throw Object.assign(new Error('El enlace no es un archivo de vídeo'), { status: 400 })
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw Object.assign(new Error('El vídeo pasa de 300 MB'), { status: 413 })
  const ext = (/\.(mp4|mov|m4v|webm)/i.exec(url)?.[1] || 'mp4').toLowerCase()
  const name = `${crypto.randomUUID()}.${ext}`
  const dest = path.join(UPLOAD_DIR, name)
  let bytes = 0
  const counter = new (require('stream').Transform)({ transform(chunk, enc, cb) { bytes += chunk.length; if (bytes > MAX_BYTES) cb(new Error('El vídeo pasa de 300 MB')); else cb(null, chunk) } })
  try { await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(dest)) } catch (e) { fs.rmSync(dest, { force: true }); throw Object.assign(e, { status: 413 }) }
  return { file: name, bytes }
}

async function ensureYtDlp() {
  if (fs.existsSync(YTDLP)) return YTDLP
  fs.mkdirSync(BIN_DIR, { recursive: true })
  const res = await fetch(YTDLP_URL, { redirect: 'follow' })
  if (!res.ok) throw Object.assign(new Error(`No se pudo instalar el descargador de vídeo (${res.status})`), { status: 502 })
  const tmp = `${YTDLP}.tmp`
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp))
  fs.chmodSync(tmp, 0o755)
  fs.renameSync(tmp, YTDLP)
  return YTDLP
}

async function downloadPage(url) {
  const bin = await ensureYtDlp()
  const id = crypto.randomUUID()
  const tmpDir = path.join(UPLOAD_DIR, `.dl-${id}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const args = ['--no-playlist', '--no-progress', '-f', 'b[height<=720][ext=mp4]/b[height<=720]/bv*[height<=720]+ba/b', '--merge-output-format', 'mp4',
    '--max-filesize', '300M', '-o', path.join(tmpDir, 'video.%(ext)s'), '--print', 'after_move:title']
  if (FFMPEG) args.push('--ffmpeg-location', FFMPEG)
  args.push(url)
  const title = await new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 6 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error(`No se pudo descargar el vídeo: ${(stderr || err.message).split('\n').filter(Boolean).slice(-1)[0] || 'error'}`), { status: 502 }))
      else resolve(stdout.trim().split('\n').pop() || null)
    })
  })
  const got = fs.readdirSync(tmpDir).find((f) => /^video\.(mp4|webm|mkv|mov)$/.test(f))
  if (!got) { fs.rmSync(tmpDir, { recursive: true, force: true }); throw Object.assign(new Error('No se encontró el vídeo descargado'), { status: 502 }) }
  const name = `${id}${path.extname(got)}`
  fs.renameSync(path.join(tmpDir, got), path.join(UPLOAD_DIR, name))
  fs.rmSync(tmpDir, { recursive: true, force: true })
  return { file: name, title }
}

async function fetchVideo(rawUrl) {
  const url = checkUrl(rawUrl)
  const r = isDirect(url) ? await downloadDirect(url) : await downloadPage(url)
  return { url: `/uploads/${r.file}`, title: r.title || null, source: url }
}

module.exports = { fetchVideo, ensureYtDlp }
