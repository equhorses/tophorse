// Lectura de documentación con IA (carta genealógica, certificado de libro, pasaporte equino, ficha de subasta, resultados).
// La IA SOLO propone datos: el cliente los revisa y la dirección los verifica. Nunca inventa lo que no se lee.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOAD_DIR } = require('./common');
const { providers, callModel, parseJson } = require('./ai');
const { BREEDS, discipline: disciplineOf } = require('./disciplines');

// Carpeta privada, FUERA de /uploads (que es pública)
const DOCS_DIR = process.env.DOCS_DIR || path.resolve(UPLOAD_DIR, '..', 'private-docs');
fs.mkdirSync(DOCS_DIR, { recursive: true });

const FIELDS = ['name', 'birthDate', 'sex', 'coat', 'breed', 'microchip', 'ueln', 'officialRegistry', 'studbook',
  'sireName', 'damName', 'damsireName', 'breederName', 'country'];

// Mueve el archivo subido por multer a la carpeta privada
function storePrivate(file) {
  const name = `${crypto.randomUUID()}${path.extname(file.originalname || '').toLowerCase() || '.bin'}`;
  const dest = path.join(DOCS_DIR, name);
  try { fs.renameSync(file.path, dest) } catch { fs.copyFileSync(file.path, dest); fs.unlinkSync(file.path) }
  return name;
}
const privatePath = (name) => path.join(DOCS_DIR, path.basename(name));

async function toImages(file, mime) {
  if (mime === 'application/pdf') {
    const { pdfToPng } = require('pdf-to-png-converter');
    const pages = await pdfToPng(file, { pagesToProcess: [1, 2], viewportScale: 2 });
    return pages.map((p) => `data:image/png;base64,${p.content.toString('base64')}`);
  }
  const { resizeImage } = require('./frames');
  return [(await resizeImage(file)) || `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`];
}

const ROLE_TEXT = {
  EJEMPLAR: 'el documento del PROPIO EJEMPLAR que se da de alta',
  PADRE: 'el documento del PADRE del ejemplar',
  MADRE: 'el documento de la MADRE del ejemplar',
};

function prompt(role) {
  return `Eres el asistente administrativo de TopHorses. Recibes ${ROLE_TEXT[role]}: puede ser una carta genealógica o certificado de un libro genealógico (Jockey Club, Weatherbys, France Galop, WAHO/libro árabe, AQHA, ANCCE, APSL, KWPN, Oldenburg, Hannover, Holsteiner, etc.), un pasaporte equino, una ficha de catálogo de subasta u otro documento oficial.
Lee SOLO lo que está escrito. Si un dato no aparece o no se lee con claridad, pon null. No deduzcas ni inventes nada.
Formato: fechas en AAAA-MM-DD; sex en MACHO, HEMBRA o CASTRADO; nombres de caballos en MAYÚSCULAS tal como aparecen.
"breed": una de estas claves según la raza que indique el documento: ${BREEDS.map((b) => `${b.key} (${b.name})`).join(', ')}.
"officialRegistry": número del caballo en su libro; "studbook": nombre del libro genealógico; "damsireName": padre de la madre.
No devuelvas datos personales del propietario (nombre, DNI, dirección).
Responde SOLO con JSON válido:
{"docType":"carta genealógica|pasaporte equino|catálogo de subasta|otro","legible":true,"fields":{${FIELDS.map((f) => `"${f}":null`).join(',')}},"notes":"lo que no se lee bien o parece raro"}`;
}

async function extract({ name, mime, role }) {
  const list = providers();
  if (!list.length) return { error: 'IA no configurada: rellena los datos a mano' };
  const p = list[0];
  try {
    const images = await toImages(privatePath(name), mime);
    const content = [{ type: 'text', text: prompt(role) }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))];
    const body = await callModel(p, { model: p.model, messages: [{ role: 'user', content }] });
    const out = parseJson(body.choices?.[0]?.message?.content);
    const fields = {};
    FIELDS.forEach((k) => { const v = out.fields?.[k]; fields[k] = v === undefined || v === '' ? null : v; });
    if (fields.breed && !BREEDS.some((b) => b.key === fields.breed)) fields.breed = null;
    return { model: p.model, docType: out.docType || null, legible: out.legible !== false, fields, notes: out.notes || '' };
  } catch (e) {
    return { model: p.model, error: e.message };
  }
}

// Comparación documento ↔ datos declarados, para que el evaluador vea lo que no cuadra
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const digits = (v) => String(v ?? '').replace(/\D/g, '');
function cmp(label, declared, read, mode = 'text') {
  if (!read) return { label, declared: declared || null, read: null, status: 'SIN_DATO' };
  if (!declared) return { label, declared: null, read, status: 'NO_DECLARADO' };
  const a = mode === 'num' ? digits(declared) : norm(declared);
  const b = mode === 'num' ? digits(read) : norm(read);
  return { label, declared, read, status: a && b && (a === b || (mode === 'text' && (a.includes(b) || b.includes(a)))) ? 'OK' : 'DISTINTO' };
}

function compare(horse, doc) {
  const f = doc.extracted?.fields;
  if (!f) return [];
  if (doc.role === 'PADRE') return [cmp('Nombre del padre', horse.sireName, f.name)];
  if (doc.role === 'MADRE') return [cmp('Nombre de la madre', horse.damName, f.name), cmp('Abuelo materno', horse.damsireName, f.sireName)];
  return [
    cmp('Nombre', horse.name, f.name),
    cmp('Fecha de nacimiento', horse.birthDate, f.birthDate, 'num'),
    cmp('Sexo', horse.sex, f.sex),
    cmp('Microchip', horse.microchip, f.microchip, 'num'),
    cmp('Nº libro oficial', horse.officialRegistry, f.officialRegistry, 'num'),
    cmp('Padre', horse.sireName, f.sireName),
    cmp('Madre', horse.damName, f.damName),
    cmp('Abuelo materno', horse.damsireName, f.damsireName),
  ];
}

// Campos numéricos de resultado que puede devolver la IA
const RESULT_NUM = ['position', 'fieldSize', 'score', 'faults', 'timeS', 'distanceM', 'speedKmh', 'rating', 'earningsEur'];

// Lectura de un resultado (clasificación, acta, ficha de carrera, certificado de federación) en cualquier disciplina
async function extractResult({ file, mime, horseName, disciplineKey }) {
  const list = providers();
  if (!list.length) return { error: 'IA no configurada' };
  const p = list[0];
  const d = disciplineOf(disciplineKey);
  const text = `Eres el asistente administrativo de TopHorses. Recibes un documento oficial con un resultado ecuestre de ${d ? d.name : 'una disciplina hípica'} (clasificación, acta, ficha de carrera o certificado).
Busca el resultado del caballo "${horseName}" (puede aparecer con prefijos, sufijos o país entre paréntesis). Lee SOLO lo que está escrito; si un dato no aparece, pon null. No inventes ni calcules nada que no esté.
- competition: nombre de la competición, hipódromo o concurso
- date: fecha AAAA-MM-DD
- country: país
- category: prueba, carrera o categoría
- level: nivel (por ejemplo: ${d ? d.levels.join(', ') : 'Grupo 1, CEI 3*, CSI 5*, Gran Premio'})
- position: puesto (solo el número); null si fue eliminado o retirado
- fieldSize: número de participantes
- status: CLASIFICADO, ELIMINADO, RETIRADO o NO_SALIO
- score: nota o porcentaje (solo el número)
- faults: faltas (solo el número)
- timeS: tiempo total en segundos (convierte 1:35.42 a 95.42)
- distanceM: distancia en metros (convierte km, furlongs o yardas a metros: 1 furlong = 201 m, 1 yarda = 0,9144 m)
- speedKmh: velocidad media en km/h
- going: estado de la pista tal como aparece
- rating: rating o handicap oficial
- earningsEur: premio obtenido por el caballo, en euros si está en euros (si está en otra moneda, pon el número y dilo en notes)
- lengthsBeaten: cuerpos de derrota respecto al ganador (0 si ganó)
- weightKg: peso llevado en kg (convierte libras o stones a kg si hace falta)
- ratingAuthority: organismo que emite el rating (France Galop, BHA, ERA, Jockey Club Español…)
- speedIndex: Speed Index (carreras de Quarter Horse)
- penalties: penalizaciones (reining)
- eliminationReason: motivo de eliminación o retirada tal como aparece (cojera, metabólico, caída, rehúse…)
- eventMeanScore: nota media de la prueba si aparece
- eventClearCount: número de recorridos limpios en la prueba (cuéntalos si la clasificación completa está en el documento)
- horseFound: true si aparece ese caballo en el documento
Responde SOLO con JSON: {"horseFound":true,"competition":null,"date":null,"country":null,"category":null,"level":null,"position":null,"fieldSize":null,"status":null,"score":null,"faults":null,"timeS":null,"distanceM":null,"speedKmh":null,"going":null,"rating":null,"earningsEur":null,"lengthsBeaten":null,"weightKg":null,"ratingAuthority":null,"speedIndex":null,"penalties":null,"eliminationReason":null,"eventMeanScore":null,"eventClearCount":null,"notes":"lo que no se lee bien o parece raro"}`;
  try {
    const images = await toImages(file, mime);
    const body = await callModel(p, { model: p.model, messages: [{ role: 'user', content: [{ type: 'text', text }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))] }] });
    return { model: p.model, ...parseJson(body.choices?.[0]?.message?.content) };
  } catch (e) {
    return { model: p.model, error: e.message };
  }
}

module.exports = { DOCS_DIR, storePrivate, privatePath, extract, extractResult, compare, FIELDS, RESULT_NUM };
