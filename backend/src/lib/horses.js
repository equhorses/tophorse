// Validación común del alta/edición de un ejemplar (clientes y dirección usan las mismas reglas)
const { discipline, isBreed } = require('./disciplines');

const SEXES = ['MACHO', 'HEMBRA', 'CASTRADO'];
const t = (v) => (v == null ? '' : String(v).trim());

// Devuelve { error } o { data } con los valores normalizados para la base de datos
function validateHorse(b) {
  if (!t(b.name) || !t(b.birthDate) || !SEXES.includes(b.sex) || !t(b.country)) return { error: 'Faltan datos obligatorios: nombre, nacimiento, sexo y país' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t(b.birthDate)) || Number.isNaN(Date.parse(t(b.birthDate)))) return { error: 'Fecha de nacimiento no válida' };
  if (new Date(t(b.birthDate)) > new Date()) return { error: 'La fecha de nacimiento no puede ser futura' };
  if (!discipline(b.discipline)) return { error: 'Elige la disciplina del caballo' };
  if (!isBreed(b.breed)) return { error: 'Elige la raza del caballo' };
  return {
    data: {
      name: t(b.name).toUpperCase(), birth_date: t(b.birthDate), sex: b.sex, coat: t(b.coat) || null, country: t(b.country),
      breed: b.breed, discipline: b.discipline,
      sire_name: t(b.sireName).toUpperCase() || null, dam_name: t(b.damName).toUpperCase() || null, damsire_name: t(b.damsireName).toUpperCase() || null,
      breeder_name: t(b.breederName) || null, microchip: t(b.microchip) || null, ueln: t(b.ueln) || null,
      official_registry: t(b.officialRegistry) || null, studbook: t(b.studbook) || null, trainer_name: t(b.trainerName) || null,
    },
  };
}

// Claves del cuerpo de la petición que validateHorse entiende (para ediciones parciales)
const HORSE_KEYS = ['name', 'birthDate', 'sex', 'coat', 'country', 'breed', 'discipline', 'sireName', 'damName', 'damsireName', 'breederName',
  'microchip', 'ueln', 'officialRegistry', 'studbook', 'trainerName'];

module.exports = { validateHorse, SEXES, HORSE_KEYS };
