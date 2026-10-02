// Análisis de vídeo con IA usando el conocimiento de la disciplina (lib/knowledge.js).
// Si el vídeo no cumple el protocolo, la IA describe de forma cualitativa y no da cifras.
const ai = require('./ai')
const { promptFor, DISCIPLINE_KNOWLEDGE } = require('./knowledge')
const { discipline: disciplineOf } = require('./disciplines')

function buildPrompt({ disciplineKey, subject }) {
  const d = disciplineOf(disciplineKey)
  const k = DISCIPLINE_KNOWLEDGE[disciplineKey]
  return `Eres el analista de vídeo de TopHorses. Analizas el movimiento de un caballo de ${d ? d.name : 'deporte'} a partir de fotogramas de un vídeo (repartidos y en ráfagas de 0,1 s) y, si las hay, fotos.
Caballo: ${subject}.

${promptFor(disciplineKey)}

INSTRUCCIONES:
- Primero decide si el vídeo cumple el protocolo de grabación (vista, estabilidad, escala). Si no lo cumple, filmingOk=false y en "measures" pon value=null: solo descripción.
- Solo das una cifra si se puede estimar de los fotogramas con una referencia visible; indica en "basis" de qué fotogramas sale. Nunca inventes.
- Valora frente a lo esperable en la disciplina, sin prometer resultados futuros.
- Señala en "vetFlags" cualquier irregularidad o asimetría que convenga revisar con un veterinario (no es un diagnóstico).
Responde SOLO con JSON válido:
{"filmingOk":false,"filmingNotes":"qué cumple y qué no del protocolo","measures":[${(k ? k.video.measures : ['Movimiento']).map((m) => `{"name":${JSON.stringify(m)},"value":null,"unit":null,"confidence":"ALTA|MEDIA|BAJA","observation":"","basis":"t=00:03–00:05"}`).join(',')}],"strengths":[],"concerns":[],"vetFlags":[],"summary":"3-5 frases claras para el informe"}`
}

async function analyzeVideo({ disciplineKey, subject, videoUrl, photos = [], uploadDir }) {
  const out = await ai.runAnalysis({ prompt: buildPrompt({ disciplineKey, subject }), photos, video: { url: videoUrl }, uploadDir, maxProviders: 1 })
  const run = out.runs[0]
  return { model: run.model, result: { ...run.result, media: out.media }, usage: run.usage }
}

module.exports = { analyzeVideo, buildPrompt }
