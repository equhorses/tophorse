// Conocimiento de TopHorses por disciplina (investigación de octubre de 2026, ver docs/Fuentes de datos TopHorses.md).
// Es lo que la IA usa para leer resultados y analizar vídeos, y lo que el informe explica.
// Regla general: lo que mejor predice es el rendimiento ya demostrado, medido frente a los rivales;
// el pedigrí y el vídeo describen, pero no predicen por sí solos el futuro de un caballo concreto.

const GENERAL = {
  principles: [
    'Lo que más predice es el rendimiento ya demostrado comparado con los rivales de la misma prueba (rating, figura, % de limpios frente a la media, ritmo regular, ganancias).',
    'El pedigrí orienta (distancia, aptitud) pero explica poco: en carreras la heredabilidad de la velocidad ronda 0,07–0,12.',
    'El vídeo aporta una descripción objetiva y comparable del movimiento; a nivel individual su relación con el éxito es débil.',
    'Cada rating, figura o índice se guarda en su escala nativa con el organismo que lo emite y la fecha; nunca se convierten entre escalas sin tabla verificada.',
    'Cada conclusión indica de qué dato sale y su nivel de confianza; si los datos no bastan, se dice.',
  ],
  mandatoryWarnings: [
    'Ninguna métrica de vídeo ni de pedigrí predice con fiabilidad demostrada el futuro de un caballo concreto.',
    'Las medidas de vídeo solo valen si el vídeo cumple el protocolo de grabación; si no, la descripción es cualitativa.',
    'Una asimetría de marcha es una señal para el veterinario, no un diagnóstico ni un apto de precompra.',
  ],
}

// Protocolo de grabación por tipo de gesto (estudios: Sleip 60 fps; maniobras 240 fps)
const FILMING = {
  CARRERA: { view: 'Lateral fija', fps: '120–240 fps', calibration: 'Postes o conos a distancia conocida; sin calibrar solo es fiable la frecuencia de tranco' },
  AIRES: { view: 'Lateral perpendicular, cámara fija sin zoom a 10–20 m', fps: '120 fps (60 mínimo)', calibration: 'Marcas en el suelo cada 2–5 m; al menos 20 trancos por aire' },
  SALTO: { view: 'Lateral perpendicular al obstáculo', fps: '120–240 fps', calibration: 'Altura y anchura del obstáculo conocidas' },
  REINING: { view: 'Lateral para la parada; frontal o cenital para el spin', fps: '240 fps', calibration: 'Marcas en la pista' },
  SOLIDEZ: { view: 'De frente y de espaldas, trote en recta sobre suelo duro', fps: '60 fps en 4K', calibration: 'Cámara a la altura de la cruz; muchos trancos en cada dirección' },
  CONFORMACION: { view: 'Foto lateral con el caballo cuadrado', fps: 'Foto', calibration: 'Objeto de escala en el plano del caballo, lente sin distorsión' },
}

const DISCIPLINE_KNOWLEDGE = {
  CARRERAS_PSI: {
    predictors: [
      'Rating oficial (valeur France Galop, BHA/IHA, Jockey Club Español) y su evolución',
      'Figura de tiempo o sectionals cuando hay licencia (Beyer, Timeform, TPD), cada una en su escala',
      'Cuerpos de ventaja/derrota, going, distancia y peso',
      'Clase de las carreras disputadas (Grupo, Listed, handicap)',
      'Estadísticas de padre y madre y Dosage solo como perfil de distancia',
    ],
    reportOnly: ['Vídeo de breeze o paseo: frecuencia y longitud de tranco', 'Tiempo de breeze normalizado por sede (pista sintética de OBS frente a tierra)', 'Precio frente a lotes comparables'],
    warnings: ['El tiempo de breeze-up es lo que más sube el precio pero apenas predice ganadores de stakes.', 'El pedigrí explica poco del rendimiento.'],
    video: { filming: 'CARRERA', measures: ['Frecuencia de tranco (la más robusta)', 'Longitud de tranco (requiere calibración)', 'Velocidad y regularidad', 'Equilibrio y posición de la cabeza al galope'] },
    resultFields: ['position', 'fieldSize', 'distanceM', 'timeS', 'going', 'rating', 'earningsEur', 'lengthsBeaten', 'weightKg'],
  },
  CARRERAS_ARABE: {
    predictors: ['Rating oficial nacional con su autoridad (ERA, ARO/BHA, France Galop) y fecha', 'Grupo PA de las carreras', 'Resultados en Francia y el Golfo', 'Pedigrí del libro árabe'],
    reportOnly: ['Precio de subasta (Arqana Saint-Cloud) si existe', 'Vídeo de carrera'],
    warnings: ['Las escalas de rating no son equivalentes entre países.', 'La cobertura de resultados de árabes es incompleta en origen.'],
    video: { filming: 'CARRERA', measures: ['Frecuencia y longitud de tranco', 'Regularidad del galope'] },
    resultFields: ['position', 'fieldSize', 'distanceM', 'timeS', 'going', 'rating', 'ratingAuthority', 'earningsEur'],
  },
  CARRERAS_QH: {
    predictors: ['Speed Index por pista y distancia (100 = media de los 3 mejores tiempos ganadores de 3 años)', 'Register of Merit (SI ≥ 80)', 'Eliminatorias y finales de futurity', 'Ganancias', 'Estadísticas de padre (AQHA)'],
    reportOnly: ['Precio en Ruidoso o Heritage Place', 'Vídeo de salida si existe'],
    warnings: ['El Speed Index no es comparable entre hipódromos ni distancias.'],
    video: { filming: 'CARRERA', measures: ['Salida (reacción y primeros trancos)', 'Frecuencia de tranco'] },
    resultFields: ['position', 'fieldSize', 'distanceM', 'timeS', 'speedIndex', 'earningsEur'],
  },
  RAID: {
    predictors: ['Tasa de finalización', 'Motivos de eliminación (cojera frente a metabólico)', 'Velocidad media y su regularidad entre fases (un ritmo regular se asocia a menos eliminaciones)', 'Recuperación cardíaca en los controles veterinarios', 'Progresión de distancias', 'Índice CDE de raid si existe'],
    reportOnly: ['Asimetría de marcha en vídeo de trote como señal de alerta'],
    warnings: ['La asimetría en vídeo no sustituye al veterinario ni está probado que anticipe eliminaciones.'],
    video: { filming: 'SOLIDEZ', measures: ['Asimetría vertical de cabeza (de frente) y de pelvis (de espaldas)', 'Regularidad del trote'] },
    resultFields: ['position', 'fieldSize', 'distanceM', 'timeS', 'speedKmh', 'eliminationReason', 'earningsEur'],
  },
  REINING: {
    predictors: ['Ganancias de por vida (LTE)', 'Puntuación media en finales Open', 'Puntuación por maniobra (−1,5 a +1,5) y penalizaciones', 'Ganancias de la descendencia del padre y récord de la madre'],
    reportOnly: ['Parada deslizante: distancia, duración y velocidad', 'Spin: tiempo por vuelta y estabilidad del pivote', 'Cambios de pie limpios', 'Precio en la NRHA Sale'],
    warnings: ['Las métricas de vídeo de reining no están validadas frente a las notas NRHA.'],
    video: { filming: 'REINING', measures: ['Distancia, duración y velocidad del slide', 'Tiempo por vuelta y estabilidad del pivote en el spin', 'Limpieza de los cambios de pie'] },
    resultFields: ['position', 'fieldSize', 'score', 'penalties', 'earningsEur'],
  },
  DOMA_CLASICA: {
    predictors: ['% por nivel y por juez', 'Edad al llegar a San Jorge y a Gran Premio', 'Notas de caballo joven (trote, galope, capacidad, montabilidad)', 'Índices genéticos ANCCE o CDE con su fiabilidad'],
    reportOnly: ['Cinemática de trote y galope: fase de vuelo, suspensión, overtrack, autoporte, regularidad', 'Morfología lineal'],
    warnings: ['Las notas de caballo joven correlacionan con la doma adulta, pero no garantizan el Gran Premio.'],
    video: { filming: 'AIRES', measures: ['Duración de apoyo y de vuelo', 'Suspensión y overtrack al trote', 'Flexión de carpo y tarso', 'Ángulo cabeza-cuello y autoporte', 'Regularidad y ritmo de los tres aires'] },
    resultFields: ['position', 'fieldSize', 'score', 'eventMeanScore', 'earningsEur'],
  },
  SALTO: {
    predictors: ['% de recorridos limpios por altura frente a la media de la prueba', 'Progresión de altura por edad', 'Nivel de las pruebas', 'Índice CDE o WBFSH del padre'],
    reportOnly: ['Técnica en vídeo: batida, bascule, plegado de anteriores, retroflexión de posteriores, margen sobre la barra', 'Precio de subasta de studbook'],
    warnings: ['La técnica de potro distingue grupos, no predice el caballo individual.'],
    video: { filming: 'SALTO', measures: ['Distancia de batida y de recepción', 'Bascule', 'Plegado de anteriores', 'Retroflexión de posteriores', 'Margen sobre la barra y último tranco'] },
    resultFields: ['position', 'fieldSize', 'faults', 'timeS', 'eventClearCount', 'earningsEur'],
  },
  COMPLETO: {
    predictors: ['Faltas de salto en el cross ponderadas por la dificultad de la prueba y por nivel', '% dentro de tiempo', 'Media de doma', 'Tasa de finalización y caídas', 'Resultados mínimos de clasificación (MER)'],
    reportOnly: ['Vídeo de cross y de salto'],
    warnings: ['Es un indicador de riesgo y consistencia, no de victoria.'],
    video: { filming: 'SALTO', measures: ['Técnica en fijos de cross y en salto', 'Galope y equilibrio entre obstáculos'] },
    resultFields: ['position', 'fieldSize', 'score', 'faults', 'timeS', 'eventClearCount', 'eliminationReason'],
  },
}

// Texto que se añade a las instrucciones de la IA para una disciplina
function promptFor(key) {
  const k = DISCIPLINE_KNOWLEDGE[key]
  if (!k) return GENERAL.principles.join('\n')
  const f = FILMING[k.video.filming]
  return [
    'PRINCIPIOS TOPHORSES:', ...GENERAL.principles.map((p) => `- ${p}`),
    'QUÉ PREDICE EN ESTA DISCIPLINA (de más a menos peso):', ...k.predictors.map((p) => `- ${p}`),
    'QUÉ SE MIDE EN VÍDEO:', ...k.video.measures.map((p) => `- ${p}`),
    `PROTOCOLO DE GRABACIÓN VÁLIDO: ${f.view}; ${f.fps}; ${f.calibration}. Si el vídeo no lo cumple, describe cualitativamente y no des cifras.`,
    'ADVERTENCIAS:', ...[...k.warnings, ...GENERAL.mandatoryWarnings].map((p) => `- ${p}`),
  ].join('\n')
}

module.exports = { GENERAL, FILMING, DISCIPLINE_KNOWLEDGE, promptFor }

// ─── Potros y caballos jóvenes sin historial (investigación de octubre de 2026, docs/Studbooks centroeuropeos y potros.md) ───
// Rasgos que la IA puntúa de 1 a 10 en vídeo y foto, con su peso por disciplina.
// Los pesos siguen la evidencia: en doma pesan los aires (trote y galope) y la montabilidad; en salto, la técnica y la capacidad en libertad.
const YOUNG_TRAITS = {
  tipo: 'Tipo y expresión',
  conformacion: 'Conformación funcional',
  aplomos: 'Aplomos',
  paso: 'Paso',
  trote: 'Trote',
  galope: 'Galope',
  equilibrio: 'Equilibrio y autoporte',
  tecnica_salto: 'Técnica de salto (en libertad)',
  capacidad_salto: 'Capacidad y elasticidad sobre el salto',
  velocidad: 'Mecánica de galope rápido (tranco, frecuencia)',
  actitud: 'Actitud y reacción',
  montabilidad: 'Montabilidad y aceptación del jinete',
}

const YOUNG = {
  CARRERAS_PSI: { weights: { conformacion: 2, aplomos: 2, galope: 3, velocidad: 4, equilibrio: 1, actitud: 1 }, levels: ['Corre', 'Gana una carrera', 'Gana un stakes', 'Gana un Grupo 1'] },
  CARRERAS_ARABE: { weights: { conformacion: 2, aplomos: 2, galope: 3, velocidad: 4, equilibrio: 1, actitud: 1 }, levels: ['Corre', 'Gana una carrera', 'Gana una carrera de Grupo'] },
  CARRERAS_QH: { weights: { conformacion: 2, aplomos: 2, galope: 2, velocidad: 4, actitud: 1 }, levels: ['Corre', 'Register of Merit (SI ≥ 80)', 'Finalista de futurity'] },
  RAID: { weights: { conformacion: 2, aplomos: 3, paso: 1, trote: 3, equilibrio: 1, actitud: 1 }, levels: ['Completa 80 km', 'CEI 2*', 'CEI 3*'] },
  REINING: { weights: { conformacion: 2, aplomos: 2, galope: 3, equilibrio: 3, actitud: 2 }, levels: ['Compite en futurity', 'Gana dinero en futurity', 'Finalista Open'] },
  DOMA_CLASICA: { weights: { tipo: 1, conformacion: 1, aplomos: 1, paso: 2, trote: 3, galope: 3, equilibrio: 2, actitud: 1 }, levels: ['Compite', 'Nivel San Jorge', 'Gran Premio'] },
  SALTO: { weights: { conformacion: 1, aplomos: 1, galope: 2, equilibrio: 1, tecnica_salto: 3, capacidad_salto: 3, actitud: 1 }, levels: ['Compite', '1,40 m', '1,60 m'] },
  COMPLETO: { weights: { conformacion: 1, aplomos: 2, galope: 3, equilibrio: 1, tecnica_salto: 2, capacidad_salto: 2, actitud: 1 }, levels: ['Compite', 'CCI3*', 'CCI4* o superior'] },
}

// Etapas por edad: qué material pedir, qué rasgos pesan y cuánta fiabilidad cabe esperar.
// La fiabilidad sube con la edad: las notas de potro predicen poco; las pruebas de 3–4 años, mucho más (docs/Studbooks…).
const RACING = ['CARRERAS_PSI', 'CARRERAS_ARABE', 'CARRERAS_QH']
const JUMPING = ['SALTO', 'COMPLETO']

function stagesFor(key) {
  if (RACING.includes(key)) {
    return [
      { key: 'POTRO', name: 'Potro (hasta 12 meses)', from: 0, reliability: 'BAJA', material: 'Fotos de las cinco vistas con el potro cuadrado y vídeo al paso y al trote a la mano, de lado y de frente/espaldas.',
        weights: { conformacion: 3, aplomos: 3, paso: 2, tipo: 1, actitud: 1 }, note: 'A esta edad se ve sobre todo conformación, aplomos y paso; el potencial de velocidad aún no se puede medir.' },
      { key: 'YEARLING', name: 'Yearling (12–24 meses)', from: 12, reliability: 'BAJA-MEDIA', material: 'Fotos de las cinco vistas y vídeo de paseo como el de las subastas de yearlings (de lado y de frente/espaldas); si hay, galope en libertad.',
        weights: { conformacion: 3, aplomos: 3, paso: 2, galope: 1, actitud: 1 }, note: 'Es la edad de las ventas de yearlings: el mercado paga conformación y paso, que predicen poco el rendimiento; el informe lo separa.' },
      { key: 'DOS_ANOS', name: 'Dos años en entrenamiento / breeze', from: 24, reliability: 'MEDIA', material: 'Vídeo de lado de un trabajo o breeze a galope rápido, cámara fija o siguiendo sin zoom, mejor con postes de distancia visibles; tiempo si lo hay.',
        weights: { velocidad: 4, galope: 3, equilibrio: 1, aplomos: 1, conformacion: 1, actitud: 1 }, note: 'Se mide la mecánica del galope rápido (frecuencia y longitud de tranco). El tiempo de breeze, por sí solo, predice poco quién gana stakes.' },
    ]
  }
  const jump = JUMPING.includes(key)
  const ridden = key === 'REINING' ? 24 : 30
  return [
    { key: 'POTRO', name: 'Potro (hasta 12 meses)', from: 0, reliability: 'BAJA', material: 'Fotos de las cinco vistas y vídeo suelto o a la mano a los tres aires, de lado, en pista llana.',
      weights: { tipo: 1, conformacion: 2, aplomos: 2, paso: 2, trote: 2, galope: 2, equilibrio: 2 }, note: 'Las notas de potro anticipan las de los 3 años en doma, pero poco el salto; los rangos son amplios y conviene reevaluar al año y a los 3 años.' },
    { key: 'JOVEN', name: `Joven sin montar (12–${ridden} meses)`, from: 12, reliability: 'BAJA-MEDIA',
      material: jump ? 'Vídeo en libertad a los tres aires y salto en libertad (varias pasadas, de lado al obstáculo).' : 'Vídeo en libertad o a la cuerda a los tres aires, de lado, en pista llana.',
      weights: jump ? { conformacion: 1, aplomos: 1, galope: 2, equilibrio: 1, tecnica_salto: 3, capacidad_salto: 3, actitud: 1 } : { conformacion: 1, aplomos: 2, paso: 2, trote: 3, galope: 3, equilibrio: 2, actitud: 1 },
      note: jump ? 'El salto en libertad a los 2–3 años es de los mejores indicadores tempranos en salto.' : 'Los aires en libertad orientan; el equilibrio y la montabilidad se verán en la primera monta.' },
    { key: 'PRIMERA_MONTA', name: `Primera monta (desde ${Math.round(ridden / 12 * 10) / 10} años)`, from: ridden, reliability: 'MEDIA',
      material: key === 'REINING' ? 'Vídeo montado de lado: galope en círculos, primeras paradas y cambios; mejor con marcas en la pista.'
        : jump ? 'Vídeo montado a los tres aires de lado y, si se puede, salto en libertad o pequeños saltos montados.' : 'Vídeo montado de lado a los tres aires en pista llana, sin zoom, con 20 o más trancos por aire.',
      weights: key === 'REINING' ? { galope: 3, equilibrio: 3, montabilidad: 2, aplomos: 1, actitud: 2 }
        : jump ? { galope: 2, equilibrio: 2, montabilidad: 2, tecnica_salto: 2, capacidad_salto: 2, aplomos: 1, actitud: 1 }
          : key === 'RAID' ? { trote: 3, paso: 1, galope: 1, equilibrio: 1, montabilidad: 1, aplomos: 3, actitud: 1 }
            : { paso: 2, trote: 3, galope: 3, equilibrio: 2, montabilidad: 2, aplomos: 1, actitud: 1 },
      note: 'Desde los 3–4 años las pruebas de caballo joven predicen mucho mejor (correlación genética con la competición de 0,47–0,89 según disciplina).' },
  ]
}

function stageFor(key, ageMonths) {
  const list = stagesFor(key)
  return [...list].reverse().find((st) => ageMonths >= st.from) || list[0]
}

// Tasas base por defecto: solo las que tienen fuente. El resto queda vacío hasta tener datos de convenio
// (la dirección las edita en el panel; se guardan en el ajuste "base_rates").
const DEFAULT_BASE_RATES = {
  CARRERAS_PSI: [
    { level: 'Corre', rate: 0.70, source: 'Jockey Club (Nueva York), 65–74 % según generación' },
    { level: 'Gana un stakes', rate: 0.025, source: 'Fuente comercial (Commonwealth) 2–3 %, sin verificar' },
    { level: 'Gana un Grupo 1', rate: 0.002, source: 'Fuente comercial (Commonwealth) ~0,2 %, sin verificar' },
  ],
  DOMA_CLASICA: [{ level: 'Compite', rate: 0.30, source: 'SWB: ~30 % de los potros registrados se clasifica alguna vez' }],
  SALTO: [{ level: 'Compite', rate: 0.30, source: 'SWB: ~30 % de los potros registrados se clasifica alguna vez' }],
  COMPLETO: [{ level: 'Compite', rate: 0.30, source: 'SWB: ~30 % de los potros registrados se clasifica alguna vez (referencia de sangre caliente)' }],
}

// Señales de salud observables y lo que no se puede evaluar por vídeo
const HEALTH = {
  observable: ['Aplomos y desviaciones angulares (ajustado a la edad: muchas se corrigen solas)', 'Asimetría de cabeza y pelvis al trote (frecuente en caballos sanos; solo cuenta si es grande y se repite)',
    'Posible distensión articular (babilla, corvejón, menudillo)', 'Interferencias, campaneo, ritmo irregular', 'Incoordinación, arrastre de pinzas, base inconsistente (valoración neurológica prioritaria)'],
  notEvaluable: ['Osteocondrosis (OC/OCD), quistes y sesamoideos: radiografías a partir de ~12 meses', 'Vía aérea y laringe: endoscopia', 'Corazón: auscultación o ecocardiografía', 'Exploración neurológica completa, flexiones y palpación'],
  levels: { SIN_HALLAZGOS: 'Sin hallazgos relevantes', VIGILAR: 'A vigilar', VETERINARIO: 'Recomendada valoración veterinaria' },
}

module.exports.YOUNG_TRAITS = YOUNG_TRAITS
module.exports.YOUNG = YOUNG
module.exports.DEFAULT_BASE_RATES = DEFAULT_BASE_RATES
module.exports.HEALTH = HEALTH
module.exports.stagesFor = stagesFor
module.exports.stageFor = stageFor
