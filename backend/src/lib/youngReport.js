// Informe de potro: la IA puntúa rasgos visibles y señales de salud; el resto se calcula con reglas a la vista.
// Todo lo que no está calibrado con datos de seguimiento se marca como PROVISIONAL.
const ai = require('./ai')
const { YOUNG_TRAITS, YOUNG, HEALTH, FILMING, DISCIPLINE_KNOWLEDGE, GENERAL } = require('./knowledge')
const { discipline: disciplineOf } = require('./disciplines')

const VERSION = 'potro-0.1'

function prompt({ disciplineKey, subject, ageMonths }) {
  const d = disciplineOf(disciplineKey)
  const y = YOUNG[disciplineKey]
  const traits = Object.keys(y.weights)
  const film = FILMING[DISCIPLINE_KNOWLEDGE[disciplineKey]?.video.filming || 'AIRES']
  return `Eres el analista de potros de TopHorses. Valoras un caballo joven SIN historial deportivo, orientado a ${d ? d.name : 'deporte'}, a partir de fotos y fotogramas de vídeo.
Caballo: ${subject}. Edad: ${ageMonths} meses. Exígele lo que corresponde a su edad (un potro no tiene el equilibrio ni la musculatura de un adulto).

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

async function generate({ db, horse, photos, video, uploadDir, baseRates }) {
  const ageMonths = Math.max(0, Math.round((Date.now() - new Date(horse.birthDate).getTime()) / (30.44 * 864e5)))
  const subject = `${horse.name}, ${horse.sex.toLowerCase()}, raza ${horse.breed}${horse.sireName ? `, por ${horse.sireName}` : ''}${horse.damName ? ` y ${horse.damName}` : ''}${horse.damsireName ? ` (${horse.damsireName})` : ''}`
  const out = await ai.runAnalysis({ prompt: prompt({ disciplineKey: horse.discipline, subject, ageMonths }), photos, video, uploadDir, maxProviders: 1 })
  const run = out.runs[0]
  const r = run.result || {}
  const y = YOUNG[horse.discipline]
  const traits = (r.traits || []).map((t) => ({ ...t, name: YOUNG_TRAITS[t.key] || t.key, weight: y.weights[t.key] || 0 })).filter((t) => t.weight)
  const q = qualityIndex(traits, y.weights)
  const levels = y.levels.map((level) => (baseRates || []).find((b) => b.level === level) || { level, rate: null, source: null })
  const health = (r.health || []).filter((h) => HEALTH.levels[h.level])
  const ageYears = Math.floor(ageMonths / 12)
  return {
    model: run.model,
    inputs: { photos: photos.map((p) => p.view), video: video ? video.url : null, ageMonths, media: out.media },
    result: {
      version: VERSION, filmingOk: r.filmingOk === true, filmingNotes: r.filmingNotes || '', summary: r.summary || '', disciplineFit: r.disciplineFit || '',
      traits, quality: q, probabilities: probabilities(levels, q),
      health, healthOverall: health.some((h) => h.level === 'VETERINARIO') ? 'VETERINARIO' : health.some((h) => h.level === 'VIGILAR') ? 'VIGILAR' : 'SIN_HALLAZGOS',
      notEvaluable: HEALTH.notEvaluable,
      market: await marketValue(db, { disciplineKey: horse.discipline, ageYears, breed: horse.breed }),
      confidence: !q ? 'BAJA' : q.coverage >= 80 && r.filmingOk ? 'MEDIA' : 'BAJA',
      provisional: ['Percentil: escala provisional (5 = media de su edad) hasta calibrar con potros seguidos en el tiempo',
        'Probabilidades: tasa base × ajuste por percentil, modelo no calibrado prospectivamente', 'Valor futuro a 4–6 años: pendiente de reunir precios por nivel'],
    },
  }
}

module.exports = { generate, VERSION }
