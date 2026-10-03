// Búsquedas por defecto (editables en el panel)
const DEFAULT_QUERIES = [
  { discipline: 'CARRERAS_PSI', q: 'OBS breeze up 2026 hip' },
  { discipline: 'CARRERAS_PSI', q: 'Fasig-Tipton Midlantic breeze 2026' },
  { discipline: 'CARRERAS_PSI', q: 'Tattersalls Craven breeze up 2026' },
  { discipline: 'CARRERAS_PSI', q: 'Arqana breeze up 2026' },
  { discipline: 'CARRERAS_PSI', q: 'Inglis Ready2Race breeze 2026' },
  { discipline: 'CARRERAS_PSI', q: 'yearling walk video sale 2026' },
  { discipline: 'CARRERAS_ARABE', q: 'purebred arabian racehorse sale Arqana' },
  { discipline: 'CARRERAS_QH', q: 'quarter horse racing 2 year old breeze sale' },
  { discipline: 'REINING', q: 'NRHA futurity sale 2025 reining' },
  { discipline: 'REINING', q: 'reining 2 year old first ride' },
  { discipline: 'SALTO', q: 'Holsteiner Fohlenauktion 2026' },
  { discipline: 'SALTO', q: 'Freispringen 3jährige Hengste 2026' },
  { discipline: 'SALTO', q: 'Oldenburger Springpferde Auktion 2026' },
  { discipline: 'SALTO', q: 'KWPN veulenveiling 2026 springen' },
  { discipline: 'DOMA_CLASICA', q: 'Hannoveraner Fohlenauktion Verden 2026 Dressur' },
  { discipline: 'DOMA_CLASICA', q: 'Dressurfohlen Auktion 2026' },
  { discipline: 'DOMA_CLASICA', q: 'young dressage horse 3 year old first ride sale' },
  { discipline: 'DOMA_CLASICA', q: 'potro PRE venta vídeo 2026' },
  { discipline: 'COMPLETO', q: 'eventing young horse sale 2026' },
  { discipline: 'RAID', q: 'young endurance arabian horse for sale' },
]


const CRAWLER_DEFAULTS = {
  crawler_enabled: false,        // búsqueda automática periódica
  crawler_every_hours: 24,       // cada cuántas horas
  crawler_per_query: 15,         // vídeos por búsqueda en YouTube
  crawler_pages_per_site: 25,    // páginas por web de subasta
  crawler_min_relevance: 70,     // a partir de qué relevancia se marca como relevante
  crawler_auto_download: false,  // descargar solos los más relevantes como lotes
  crawler_max_auto: 5,           // máximo de descargas automáticas por pasada
  crawler_queries: DEFAULT_QUERIES,
}

module.exports = { DEFAULT_QUERIES, CRAWLER_DEFAULTS }
