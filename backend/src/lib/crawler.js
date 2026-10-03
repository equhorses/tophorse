// Rastreador automático de vídeos de caballos.
// 1) Busca en YouTube (con yt-dlp, sin clave de API) con las búsquedas configuradas por disciplina.
// 2) Recorre las webs de subastas de la pestaña Fuentes y recoge los enlaces de vídeo (YouTube, Vimeo, .mp4).
// 3) La IA criba los nuevos por título y contexto: si es relevante, disciplina, etapa, subasta, lote y caballo.
// 4) Opcional: descarga los más relevantes como lotes de subasta para que se puedan analizar.
const { execFile } = require('child_process')
const { ensureYtDlp, fetchVideo } = require('./videoFetch')
const { providers, callModel, parseJson } = require('./ai')

const UA = 'Mozilla/5.0 (compatible; TopHorsesBot/0.1; +https://tophorse.vercel.app)'
const STAGES = ['POTRO', 'YEARLING', 'DOS_ANOS', 'JOVEN', 'PRIMERA_MONTA', 'COMPETICION', 'OTRO']

const { DEFAULT_QUERIES } = require('./crawlerDefaults')

function run(bin, args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).split('\n').filter(Boolean).slice(-1)[0])) : resolve(stdout)))
  })
}

async function searchYoutube(q, n = 15) {
  const bin = await ensureYtDlp()
  const out = await run(bin, ['--flat-playlist', '--dump-single-json', '--no-warnings', `ytsearch${n}:${q}`])
  const data = JSON.parse(out)
  return (data.entries || []).filter((e) => e && e.id).map((e) => ({
    url: `https://www.youtube.com/watch?v=${e.id}`, platform: 'YOUTUBE', title: e.title || null, channel: e.channel || e.uploader || null,
    description: (e.description || '').slice(0, 500) || null, duration_s: e.duration ? Math.round(e.duration) : null, published: e.upload_date || null,
  }))
}

// Normaliza enlaces de vídeo encontrados en una página
function videoLinks(html, base) {
  const found = new Map()
  const add = (url, platform, title) => { if (!found.has(url)) found.set(url, { url, platform, title }) }
  const abs = (u) => { try { return new URL(u.replace(/&amp;/g, '&'), base).toString() } catch { return null } }
  for (const m of html.matchAll(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/g)) add(`https://www.youtube.com/watch?v=${m[1]}`, 'YOUTUBE')
  for (const m of html.matchAll(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,})/g)) add(`https://vimeo.com/${m[1]}`, 'VIMEO')
  for (const m of html.matchAll(/(?:href|src)=["']([^"']+\.(?:mp4|webm|mov|m4v)(?:\?[^"']*)?)["']/gi)) { const u = abs(m[1]); if (u) add(u, 'WEB') }
  return [...found.values()]
}

const KEYWORDS = /video|lot|hip|catalog|catalogue|auction|auktion|sale|venta|veiling|breeze|result|ergebnis|fohlen|foal|yearling|kollektion|collection/i

async function getPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
  if (!res.ok || !/html/.test(res.headers.get('content-type') || '')) return null
  return (await res.text()).slice(0, 2_000_000)
}

// Recorre la página de inicio de una fuente y hasta maxPages enlaces internos con palabras clave
async function crawlSite(startUrl, maxPages = 25) {
  const origin = new URL(startUrl).origin
  const seen = new Set(); const queue = [startUrl]; const results = []
  while (queue.length && seen.size < maxPages) {
    const url = queue.shift()
    if (seen.has(url)) continue
    seen.add(url)
    let html
    try { html = await getPage(url) } catch { html = null }
    if (!html) continue
    const pageTitle = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || '').trim().slice(0, 200)
    videoLinks(html, url).forEach((v) => results.push({ ...v, title: v.title || pageTitle || null, page_url: url }))
    if (seen.size === 1) {
      for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
        let u; try { u = new URL(m[1].replace(/&amp;/g, '&'), url) } catch { continue }
        if (u.origin === origin && KEYWORDS.test(u.pathname + u.search) && !/\.(pdf|jpg|png|zip)$/i.test(u.pathname)) queue.push(u.toString())
      }
    }
  }
  return results
}

// Criba con IA por texto (barata): relevancia, disciplina, etapa, subasta, lote, caballo
async function triage(cands) {
  const provs = providers()
  if (!provs.length || !cands.length) return []
  const list = cands.map((c, i) => `${i}. título: ${c.title || '—'} | canal: ${c.channel || '—'} | página: ${c.pageUrl || '—'} | búsqueda: ${c.query || '—'} | descripción: ${(c.description || '').slice(0, 200)}`).join('\n')
  const text = `Eres el clasificador de vídeos de TopHorses. Decide qué vídeos sirven para estudiar caballos JÓVENES o en venta (potros, yearlings, breeze-ups de 2 años, caballos jóvenes en libertad o en su primera monta, lotes de subastas) y en qué disciplina.
Disciplinas: CARRERAS_PSI, CARRERAS_ARABE, CARRERAS_QH, RAID, REINING, DOMA_CLASICA, SALTO, COMPLETO. Etapas: ${STAGES.join(', ')}.
Relevancia 0-100: 90+ vídeo individual de un caballo concreto (lote, breeze, presentación) con nombre o número; 50-80 vídeo de un caballo pero sin identificar; <40 resúmenes, carreras de adultos, publicidad, tutoriales.
Lee SOLO lo que pone; si no se sabe, null.
${list}
Responde SOLO con JSON: {"items":[{"i":0,"relevance":0,"discipline":null,"stage":null,"saleName":null,"lot":null,"horseName":null,"reason":"breve"}]}`
  // Usa la primera IA que responda (si la principal falla, la secundaria)
  const errors = []
  for (const p of provs) {
    try {
      const body = await callModel(p, { model: p.model, messages: [{ role: 'user', content: [{ type: 'text', text }] }] })
      return parseJson(body.choices?.[0]?.message?.content).items || []
    } catch (e) { errors.push(e.message) }
  }
  throw new Error(errors.join(' | '))
}

async function runCrawler(db, { trigger = 'MANUAL', settings }) {
  const runRow = await db.one("INSERT INTO crawler_runs(trigger) VALUES ($1) RETURNING id", [trigger])
  const log = []; let found = 0; let added = 0; let triaged = 0; let downloaded = 0
  const note = (m) => { log.push({ at: new Date().toISOString(), m }); console.log(`[rastreador] ${m}`) }
  const insert = async (c, extra) => {
    found += 1
    const r = await db.one(
      `INSERT INTO video_candidates(url, platform, title, channel, description, duration_s, published, source_key, query, page_url, discipline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (url) DO NOTHING RETURNING id`,
      [c.url, c.platform, c.title, c.channel || null, c.description || null, c.duration_s || null, c.published || null, extra.sourceKey || null, extra.query || null, c.page_url || null, extra.discipline || null],
    )
    if (r) added += 1
  }
  try {
    for (const { discipline, q } of settings.crawler_queries || DEFAULT_QUERIES) {
      try { for (const c of await searchYoutube(q, settings.crawler_per_query || 15)) await insert(c, { query: q, discipline }) } catch (e) { note(`YouTube «${q}»: ${e.message}`) }
    }
    const sources = await db.query("SELECT key, crawl_urls, disciplines FROM data_sources WHERE status <> 'DESCARTADA' AND array_length(crawl_urls,1) > 0")
    for (const s of sources) {
      for (const u of s.crawlUrls) {
        try {
          const list = await crawlSite(u, settings.crawler_pages_per_site || 25)
          for (const c of list) await insert(c, { sourceKey: s.key, discipline: s.disciplines.length === 1 ? s.disciplines[0] : null })
        } catch (e) { note(`${s.key}: ${e.message}`) }
      }
    }
    note(`Encontrados ${found}, nuevos ${added}`)
    // Criba de los nuevos, por tandas de 25
    const pending = await db.query("SELECT * FROM video_candidates WHERE status='NUEVO' AND triage IS NULL ORDER BY found_at DESC LIMIT 300")
    for (let i = 0; i < pending.length; i += 25) {
      const batch = pending.slice(i, i + 25)
      try {
        const items = await triage(batch)
        for (const it of items) {
          const c = batch[it.i]; if (!c) continue
          const rel = Math.max(0, Math.min(100, Number(it.relevance) || 0))
          await db.query(
            `UPDATE video_candidates SET triage=$2, relevance=$3::int, discipline=COALESCE($4, discipline), stage=$5, sale_name=$6, lot=$7, horse_name=$8,
               status=CASE WHEN $3::int >= $9::int THEN 'RELEVANTE' WHEN $3::int < 40 THEN 'DESCARTADO' ELSE 'NUEVO' END, updated_at=now() WHERE id=$1`,
            [c.id, JSON.stringify(it), rel, it.discipline || null, STAGES.includes(it.stage) ? it.stage : null, it.saleName || null, it.lot ? String(it.lot) : null, it.horseName || null, settings.crawler_min_relevance || 70],
          )
          triaged += 1
        }
      } catch (e) { note(`Criba: ${e.message}`) }
    }
    // Descarga automática de los más relevantes (opcional y limitada)
    if (settings.crawler_auto_download) {
      const top = await db.query("SELECT * FROM video_candidates WHERE status='RELEVANTE' AND video_file IS NULL ORDER BY relevance DESC, found_at DESC LIMIT $1", [settings.crawler_max_auto || 5])
      for (const c of top) {
        try { await acceptCandidate(db, c, {}); downloaded += 1 } catch (e) { await db.query("UPDATE video_candidates SET status='ERROR', error=$2 WHERE id=$1", [c.id, e.message]); note(`Descarga ${c.url}: ${e.message}`) }
      }
    }
    await db.query('UPDATE crawler_runs SET finished_at=now(), found=$2, added=$3, triaged=$4, downloaded=$5, log=$6 WHERE id=$1', [runRow.id, found, added, triaged, downloaded, JSON.stringify(log)])
  } catch (e) {
    await db.query('UPDATE crawler_runs SET finished_at=now(), error=$2, log=$3 WHERE id=$1', [runRow.id, e.message, JSON.stringify(log)])
  }
  return runRow.id
}

// Aceptar un candidato: descarga el vídeo y lo archiva como lote de subasta (por defecto) o como vídeo de un caballo
async function acceptCandidate(db, c, { as = 'lot', horseId, kind }) {
  const v = await fetchVideo(c.url)
  if (as === 'horse') {
    if (!horseId) throw Object.assign(new Error('Elige el caballo'), { status: 400 })
    await db.query('INSERT INTO horse_videos(horse_id, kind, title, url) VALUES ($1,$2,$3,$4)', [horseId, kind || 'ENTRENAMIENTO', (c.title || '').slice(0, 200) || null, v.url])
    return db.one("UPDATE video_candidates SET status='DESCARGADO', video_file=$2, horse_id=$3, updated_at=now() WHERE id=$1 RETURNING *", [c.id, v.url, horseId])
  }
  const lot = await db.one(
    `INSERT INTO sale_lots(source_key, sale_name, lot, discipline, horse_name, video_url, video_file, notes, sale_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'VENDIDO') RETURNING id`,
    [c.sourceKey, c.saleName || c.title || 'Vídeo encontrado por el rastreador', c.lot, c.discipline, c.horseName ? c.horseName.toUpperCase() : null, c.url, v.url,
      `Encontrado por el rastreador (${c.platform}${c.channel ? `, ${c.channel}` : ''}). Revisar precio y estado de venta.`],
  )
  return db.one("UPDATE video_candidates SET status='DESCARGADO', video_file=$2, sale_lot_id=$3, updated_at=now() WHERE id=$1 RETURNING *", [c.id, v.url, lot.id])
}

module.exports = { runCrawler, acceptCandidate, DEFAULT_QUERIES, videoLinks, crawlSite, searchYoutube, triage }
