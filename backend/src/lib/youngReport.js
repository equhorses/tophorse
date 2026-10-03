// Informe de potro: la IA puntúa rasgos visibles y señales de salud; el resto se calcula con reglas a la vista.
// Todo lo que no está calibrado con datos de seguimiento se marca como PROVISIONAL.
const ai = require('./ai')
const { YOUNG_TRAITS, YOUNG, HEALTH, FILMING, DISCIPLINE_KNOWLEDGE, GENERAL, stageFor } = require('./knowledge')
const { discipline: disciplineOf } = require('./disciplines')

const VERSION = 'potro-0.3'
const path = require('path')
const { probe } = require('./frames')

function prompt({ disciplineKey, subject, ageMonths, stage }) {
  const d = disciplineOf(disciplineKey)
  const traits = Object.keys(stage.weights)
  const film = FILMING[DISCIPLINE_KNOWLEDGE[disciplineKey]?.video.filming || 'AIRES']
  return `Eres el analista de potros de TopHorses. Valoras un caballo joven SIN historial deportivo, orientado a ${d ? d.name : 'deporte'}, a partir de fotos y fotogramas de vídeo.
Caballo: ${subject}. Edad: ${ageMonths} meses. Etapa: ${stage.name}. Exígele lo que corresponde a su edad y etapa (un potro no tiene el equilibrio ni la musculatura de un adulto; un caballo en primera monta aún no tiene la reunión de uno hecho).
Material esperado en esta etapa: ${stage.material}
Contexto: ${stage.note}

PRINCIPIOS: ${GENERAL.principles.join(' ')}
Protocolo de grabación válido para medir: ${film.view}; ${film.fps}; ${film.calibration}.

TAREA 1 · Puntúa de 1 a 10 (5 = potro normal de su edad, 7 = muy bueno, 9-10 = excepcional) SOLO estos rasgos, si se ven en el material; si un rasgo no se ve, score=null:
${traits.map((t) => `- ${t}: ${YOUNG_TRAITS[t]}`).join('\n')}
Para cada uno: observación concreta y en qué foto o segundo del vídeo se basa. No inventes.

TAREA 2 · Señales de salud observables (nunca diagnóstico). Para cada una: level SIN_HALLAZGOS, VIGILAR o VETERINARIO, confianza y observación:
${HEALTH.observable.map((h) => `- ${h}`).join('\n')}
Recuerda: la asimetría leve es frecuente en caballos sanos; los aplomos de potro cambian con la edad.

Responde SOLO con JSON válido:
{"filmingOk":false,"filmingNotes":"","traits":[${traits.map((t) => `{"key":"${t}","score":null,"confidence":"ALTA|MEDIA|BAJA","observation":"","basis":""}`).join(',')}],"health":[{"signal":"","level":"SIN_HALLAZGOS","confidence":"BAJA","observation":""}],"disciplineFit":"si el material sugiere otra disciplina más adecuada, dilo aquí; si no, vacío","summary":"4-6 frases claras para el propietario"}`
}

// Normal estándar: función de distribución (aproximación de Abramowitz-Stegun)
function cdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const p = 0.3989423 * Math.exp(-z * z / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

// Índice de calidad ponderado → z (5 = media, 1,5 puntos = 1 desviación, supuesto provisional; z limitado a ±2,5)
function qualityIndex(traits, weights) {
  let sum = 0; let w = 0
  for (const [k, wt] of Object.entries(weights)) {
    const t = traits.find((x) => x.key === k)
    if (t && typeof t.score === 'number' && t.score >= 1 && t.score <= 10) { sum += t.score * wt; w += wt }
  }
  if (!w) return null
  const index = sum / w
  const covered = w / Object.values(weights).reduce((a, b) => a + b, 0)
  const z = Math.max(-2.5, Math.min(2.5, (index - 5) / 1.5))
  return { index: Math.round(index * 10) / 10, z, percentile: Math.max(1, Math.min(99, Math.round(cdf(z) * 100))), coverage: Math.round(covered * 100) }
}

// Probabilidad por nivel: tasa base × multiplicador según el percentil, con horquilla amplia.
// Multiplicador provisional: exp(0,4·z) (percentil 84 ≈ ×1,5 la media; máximo ≈ ×2,7). Se sustituirá por el modelo calibrado.
function probabilities(baseRates, q) {
  return baseRates.map((b) => {
    if (!q || b.rate == null) return { level: b.level, base: b.rate ?? null, source: b.source || null, low: null, mid: null, high: null }
    const m = Math.exp(0.4 * q.z)
    const mid = Math.min(0.9, b.rate * m)
    return { level: b.level, base: b.rate, source: b.source, low: mid * 0.6, mid, high: Math.min(0.95, mid * 1.5), vsBase: Math.round(m * 10) / 10 }
  })
}

const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return Math.round(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)) }

// Valor de mercado: lotes vendidos (no recompras) de la misma disciplina y edad parecida, en euros
async function marketValue(db, { disciplineKey, ageYears, breed }) {
  const rows = await db.query(
    `SELECT sale_name, sale_date, lot, horse_name, sire_name, price, currency, (EXTRACT(YEAR FROM sale_date)::int - birth_year) AS age
     FROM sale_lots WHERE sale_status='VENDIDO' AND price IS NOT NULL AND discipline=$1 AND birth_year IS NOT NULL AND sale_date IS NOT NULL
       AND ABS((EXTRACT(YEAR FROM sale_date)::int - birth_year) - $2) <= 1 ORDER BY sale_date DESC LIMIT 500`, [disciplineKey, ageYears],
  )
  const eur = rows.filter((r) => r.currency === 'EUR')
  const prices = eur.map((r) => Number(r.price))
  const MIN = 8
  return {
    n: eur.length, otherCurrency: rows.length - eur.length, enough: eur.length >= MIN, min: MIN,
    p10: eur.length >= MIN ? pct(prices, 0.1) : null, p50: eur.length >= MIN ? pct(prices, 0.5) : null, p90: eur.length >= MIN ? pct(prices, 0.9) : null,
    comparables: eur.slice(0, 8).map((r) => ({ sale: r.saleName, date: r.saleDate, lot: r.lot, horse: r.horseName, sire: r.sireName, price: Number(r.price), age: r.age })),
    breed,
  }
}

// Peso de la genética frente al vídeo según la etapa: cuanto más joven, más pesan los padres
const GENETIC_WEIGHT = { POTRO: 0.6, YEARLING: 0.5, JOVEN: 0.45, DOS_ANOS: 0.3, PRIMERA_MONTA: 0.3 }
const LEVEL_ORDER = ['SIN_HALLAZGOS', 'VIGILAR', 'VETERINARIO']
const worst = (list) => list.reduce((w, l) => (LEVEL_ORDER.indexOf(l) > LEVEL_ORDER.indexOf(w) ? l : w), 'SIN_HALLAZGOS')

// Media parental con índices en base 100 ± 20 (FN, CDE, SWB…): padre 1/2, abuelo materno 1/4, resto media
function genetics(pd) {
  if (!pd) return null
  const val = (x) => (x && x.scale === 'BASE100' && Number.isFinite(Number(x.value)) ? Number(x.value) : null)
  const sire = val(pd.sireIndex); const damsire = val(pd.damsireIndex)
  if (sire == null && damsire == null) return { usable: false, sire: pd.sireIndex || null, damsire: pd.damsireIndex || null, damProduce: pd.damProduce || null, notes: pd.notes || null }
  const pm = 0.5 * (sire ?? 100) + 0.25 * (damsire ?? 100) + 0.25 * 100
  return { usable: true, sire: pd.sireIndex || null, damsire: pd.damsireIndex || null, damProduce: pd.damProduce || null, notes: pd.notes || null, parentMean: Math.round(pm * 10) / 10, z: (pm - 100) / 20 }
}

// Control del material: duración, resolución y fotogramas por segundo
async function materialCheck(video, uploadDir) {
  if (!video) return { ok: false, issues: ['Sin vídeo: solo se valora con fotos'] }
  const info = await probe(path.join(uploadDir, path.basename(video.url))).catch(() => ({}))
  const issues = []
  if (info.seconds != null && info.seconds < 15) issues.push(`Vídeo corto (${Math.round(info.seconds)} s): mejor 30–60 s con todos los aires`)
  if (info.height != null && Math.min(info.width, info.height) < 480) issues.push(`Resolución baja (${info.width}×${info.height}): mejor 720p o más`)
  if (info.fps != null && info.fps < 25) issues.push(`Pocos fotogramas por segundo (${info.fps}): mejor 50–60 fps o más`)
  return { ...info, ok: !issues.length, issues, fpsForMeasuring: info.fps != null && info.fps >= 50 }
}

// Combina las lecturas de varias IAs: media por rasgo, discrepancias y la señal de salud más prudente
function combineRuns(runs) {
  const first = runs[0].result || {}
  if (runs.length === 1) return { ...first, readings: 1, discrepancies: [] }
  const keys = new Set(runs.flatMap((r) => (r.result.traits || []).map((t) => t.key)))
  const discrepancies = []
  const traits = [...keys].map((key) => {
    const list = runs.map((r) => (r.result.traits || []).find((t) => t.key === key)).filter(Boolean)
    const nums = list.map((t) => t.score).filter((x) => typeof x === 'number')
    if (nums.length > 1 && Math.max(...nums) - Math.min(...nums) > 2) discrepancies.push({ key, scores: nums })
    return { ...list[0], score: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : null, scores: nums }
  })
  const signals = new Map()
  runs.forEach((r) => (r.result.health || []).forEach((h) => {
    const prev = signals.get(h.signal)
    if (!prev || LEVEL_ORDER.indexOf(h.level) > LEVEL_ORDER.indexOf(prev.level)) signals.set(h.signal, h)
  }))
  return { ...first, traits, health: [...signals.values()], filmingOk: runs.every((r) => r.result.filmingOk === true), readings: runs.length, discrepancies }
}

async function generate({ db, horse, photos, video, uploadDir, baseRates }) {
  const ageMonths = Math.max(0, Math.round((Date.now() - new Date(horse.birthDate).getTime()) / (30.44 * 864e5)))
  const subject = `${horse.name}, ${horse.sex.toLowerCase()}, raza ${horse.breed}${horse.sireName ? `, por ${horse.sireName}` : ''}${horse.damName ? ` y ${horse.damName}` : ''}${horse.damsireName ? ` (${horse.damsireName})` : ''}`
  const stage = stageFor(horse.discipline, ageMonths)
  const material = await materialCheck(video, uploadDir)
  // Doble lectura: todas las IAs configuradas (AI_* y AI2_*) valoran por separado
  const out = await ai.runAnalysis({ prompt: prompt({ disciplineKey: horse.discipline, subject, ageMonths, stage }), photos, video, uploadDir })
  const r = combineRuns(out.runs)
  const y = YOUNG[horse.discipline]
  const traits = (r.traits || []).map((t) => ({ ...t, name: YOUNG_TRAITS[t.key] || t.key, weight: stage.weights[t.key] || 0 })).filter((t) => t.weight)
  const qVideo = qualityIndex(traits, stage.weights)
  // Genética de los padres combinada con el vídeo según la etapa
  const gen = genetics(horse.pedigreeData)
  let q = qVideo
  if (gen?.usable) {
    const wg = GENETIC_WEIGHT[stage.key] ?? 0.4
    const z = qVideo ? (1 - wg) * qVideo.z + wg * gen.z : gen.z
    q = { ...(qVideo || { index: null, coverage: 0 }), z, percentile: Math.max(1, Math.min(99, Math.round(cdf(z) * 100))), videoPercentile: qVideo?.percentile ?? null, geneticWeight: wg }
  }
  const levels = y.levels.map((level) => (baseRates || []).find((b) => b.level === level) || { level, rate: null, source: null })
  const health = (r.health || []).filter((h) => HEALTH.levels[h.level])
  // Informe veterinario más reciente aportado
  const vetDoc = await db.one("SELECT extracted, created_at FROM horse_documents WHERE horse_id=$1 AND role='VETERINARIO' AND extracted IS NOT NULL ORDER BY created_at DESC LIMIT 1", [horse.id])
  const vet = vetDoc?.extracted?.vet || null
  // Evolución: informes anteriores del mismo caballo
  const prev = await db.query("SELECT created_at, result FROM young_reports WHERE horse_id=$1 AND status <> 'RETIRADO' ORDER BY created_at DESC LIMIT 5", [horse.id])
  const evolution = prev.map((p) => ({
    date: p.createdAt, stage: p.result?.stage?.name || null, percentile: p.result?.quality?.percentile ?? null,
    traits: Object.fromEntries((p.result?.traits || []).filter((t) => typeof t.score === 'number').map((t) => [t.key, t.score])),
  }))
  const last = evolution[0]
  traits.forEach((t) => { if (last && typeof last.traits[t.key] === 'number' && typeof t.score === 'number') t.delta = Math.round((t.score - last.traits[t.key]) * 10) / 10 })
  // Confianza: parte de la etapa y sube con buen material, genética y lecturas que coinciden
  let pts = 0
  if (r.filmingOk && material.ok) pts += 1
  if (gen?.usable) pts += 1
  if (r.readings > 1 && !r.discrepancies.length) pts += 1
  if (qVideo && qVideo.coverage >= 80) pts += 1
  const cap = stage.reliability === 'MEDIA' ? 'ALTA' : 'MEDIA'
  const confidence = pts >= 3 ? cap : pts >= 2 ? 'MEDIA' : 'BAJA'
  const ageYears = Math.floor(ageMonths / 12)
  return {
    model: out.runs.map((x) => x.model).join(' + '),
    inputs: { photos: photos.map((p) => p.view), video: video ? video.url : null, ageMonths, media: out.media },
    result: {
      version: VERSION, stage: { key: stage.key, name: stage.name, reliability: stage.reliability, material: stage.material, note: stage.note },
      filmingOk: r.filmingOk === true, filmingNotes: r.filmingNotes || '', summary: r.summary || '', disciplineFit: r.disciplineFit || '',
      readings: r.readings, discrepancies: r.discrepancies.map((d) => ({ ...d, name: YOUNG_TRAITS[d.key] || d.key })),
      material, traits, quality: q, genetics: gen, evolution,
      probabilities: probabilities(levels, q),
      health, vet, healthOverall: worst([...health.map((h) => h.level), ...(vet?.overall && LEVEL_ORDER.includes(vet.overall) ? [vet.overall] : [])]),
      notEvaluable: vet ? HEALTH.notEvaluable.filter((x) => !(vet.examType && /radiogr/i.test(vet.examType) && /Osteocondrosis/.test(x))) : HEALTH.notEvaluable,
      market: await marketValue(db, { disciplineKey: horse.discipline, ageYears, breed: horse.breed }),
      confidence,
      provisional: ['Percentil: escala provisional (5 = media de su edad) hasta calibrar con potros seguidos en el tiempo',
        'Probabilidades: tasa base × ajuste por percentil, modelo no calibrado prospectivamente', 'Valor futuro a 4–6 años: pendiente de reunir precios por nivel',
        ...(gen?.usable ? [`Genética: media parental con índices en base 100 ± 20; pesa un ${Math.round((GENETIC_WEIGHT[stage.key] ?? 0.4) * 100)} % en esta etapa`] : [])],
    },
  }
}

module.exports = { generate, VERSION }
