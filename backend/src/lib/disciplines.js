// Catálogo de TopHorses: disciplinas, razas y qué datos de resultado se recogen en cada una.
// Es la única fuente: el backend valida con él y la web lo recibe en GET /api/catalog.
// Qué mide el informe en cada disciplina se definirá a partir de los datos (fase siguiente).

const GROUPS = [
  { key: 'CARRERAS', name: 'Carreras' },
  { key: 'RESISTENCIA', name: 'Resistencia' },
  { key: 'WESTERN', name: 'Western' },
  { key: 'DEPORTE', name: 'Deporte olímpico' },
];

// fields: datos de resultado propios de la disciplina (además de competición, fecha, categoría, nivel, puesto y participantes)
const DISCIPLINES = [
  {
    key: 'CARRERAS_PSI', group: 'CARRERAS', name: 'Carreras de Pura Sangre', short: 'Pura Sangre',
    breeds: ['PSI'], fields: ['distance_m', 'time_s', 'going', 'lengths_beaten', 'weight_kg', 'rating', 'rating_authority', 'earnings_eur'],
    levels: ['Grupo 1', 'Grupo 2', 'Grupo 3', 'Listed', 'Handicap', 'Condiciones', 'Maiden', 'Venta / reclamar', 'Obstáculos'],
  },
  {
    key: 'CARRERAS_ARABE', group: 'CARRERAS', name: 'Carreras de Pura Raza Árabe', short: 'Árabe carreras',
    breeds: ['PRA'], fields: ['distance_m', 'time_s', 'going', 'lengths_beaten', 'rating', 'rating_authority', 'earnings_eur'],
    levels: ['Grupo 1 PA', 'Grupo 2 PA', 'Grupo 3 PA', 'Listed PA', 'Handicap', 'Condiciones', 'Maiden'],
  },
  {
    key: 'CARRERAS_QH', group: 'CARRERAS', name: 'Carreras de Quarter Horse', short: 'Quarter carreras',
    breeds: ['QH'], fields: ['distance_m', 'time_s', 'speed_index', 'earnings_eur'],
    levels: ['Grado 1', 'Grado 2', 'Grado 3', 'Stakes', 'Allowance', 'Maiden', 'Claiming'],
  },
  {
    key: 'RAID', group: 'RESISTENCIA', name: 'Raid (endurance)', short: 'Raid',
    breeds: ['PRA', 'ANGLO_ARABE', 'HISPANO_ARABE', 'OTRA'], fields: ['distance_m', 'time_s', 'speed_kmh', 'elimination_reason', 'earnings_eur'],
    levels: ['CEN', 'CEI 1*', 'CEI 2*', 'CEI 3*', 'CEIO', 'Campeonato'],
  },
  {
    key: 'REINING', group: 'WESTERN', name: 'Reining', short: 'Reining',
    breeds: ['QH', 'PAINT', 'APPALOOSA', 'OTRA'], fields: ['score', 'penalties', 'event_mean_score', 'earnings_eur'],
    levels: ['Futurity', 'Derby', 'Open', 'Non Pro', 'Rookie', 'CRI / FEI'],
  },
  {
    key: 'DOMA_CLASICA', group: 'DEPORTE', name: 'Doma clásica', short: 'Doma',
    breeds: ['PRE', 'PSL', 'KWPN', 'OLD', 'HANN', 'WESTF', 'TRAK', 'CDE', 'OTRA'], fields: ['score', 'event_mean_score', 'earnings_eur'],
    levels: ['Caballos jóvenes', 'San Jorge', 'Intermedia I', 'Intermedia II', 'Gran Premio', 'CDI', 'Campeonato', 'JJOO / Mundial'],
  },
  {
    key: 'SALTO', group: 'DEPORTE', name: 'Salto de obstáculos', short: 'Salto',
    breeds: ['KWPN', 'HOLST', 'BWP', 'SF', 'OLD', 'HANN', 'WESTF', 'CDE', 'PSI', 'OTRA'], fields: ['faults', 'time_s', 'event_clear_count', 'earnings_eur'],
    levels: ['Caballos jóvenes', '1,20', '1,30', '1,40', '1,50', 'Gran Premio', 'CSI', 'Copa de Naciones', 'JJOO / Mundial'],
  },
  {
    key: 'COMPLETO', group: 'DEPORTE', name: 'Concurso completo', short: 'Completo',
    breeds: ['PSI', 'ANGLO_ARABE', 'KWPN', 'HOLST', 'SF', 'OTRA'], fields: ['score', 'faults', 'time_s', 'event_clear_count', 'elimination_reason'],
    levels: ['Caballos jóvenes', 'CCI1*', 'CCI2*', 'CCI3*', 'CCI4*', 'CCI5*', 'JJOO / Mundial'],
  },
];

const BREEDS = [
  { key: 'PSI', name: 'Pura Sangre Inglés' },
  { key: 'PRA', name: 'Pura Raza Árabe' },
  { key: 'ANGLO_ARABE', name: 'Anglo-árabe' },
  { key: 'HISPANO_ARABE', name: 'Hispano-árabe' },
  { key: 'QH', name: 'Quarter Horse' },
  { key: 'PAINT', name: 'Paint Horse' },
  { key: 'APPALOOSA', name: 'Appaloosa' },
  { key: 'PRE', name: 'Pura Raza Española' },
  { key: 'PSL', name: 'Pura Sangre Lusitano' },
  { key: 'KWPN', name: 'KWPN (Holandés)' },
  { key: 'OLD', name: 'Oldenburgo' },
  { key: 'HANN', name: 'Hannoveriano' },
  { key: 'HOLST', name: 'Holsteiner' },
  { key: 'WESTF', name: 'Westfalia' },
  { key: 'TRAK', name: 'Trakehner' },
  { key: 'BWP', name: 'BWP (Belga)' },
  { key: 'SF', name: 'Silla Francés' },
  { key: 'CDE', name: 'Caballo de Deporte Español' },
  { key: 'OTRA', name: 'Otra / cruzado' },
];

const FIELD_LABELS = {
  distance_m: 'Distancia (m)', time_s: 'Tiempo (s)', going: 'Estado de la pista', rating: 'Rating / handicap',
  earnings_eur: 'Premio (€)', speed_kmh: 'Velocidad media (km/h)', score: 'Nota', faults: 'Faltas',
  lengths_beaten: 'Cuerpos de derrota', weight_kg: 'Peso (kg)', rating_authority: 'Organismo del rating', speed_index: 'Speed Index',
  penalties: 'Penalizaciones', elimination_reason: 'Motivo de eliminación', event_mean_score: 'Media de la prueba', event_clear_count: 'Limpios en la prueba',
};
// Campos de texto (el resto son numéricos)
const TEXT_FIELDS = ['going', 'rating_authority', 'elimination_reason'];

const VIDEO_KINDS = ['ENTRENAMIENTO', 'COMPETICION', 'SUBASTA', 'A_LA_MANO', 'LIBERTAD'];

const discipline = (key) => DISCIPLINES.find((d) => d.key === key) || null;
const isBreed = (key) => BREEDS.some((b) => b.key === key);

module.exports = { GROUPS, DISCIPLINES, BREEDS, FIELD_LABELS, TEXT_FIELDS, VIDEO_KINDS, discipline, isBreed };
