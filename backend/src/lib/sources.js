// Catálogo inicial de fuentes de datos (investigación de octubre de 2026).
// block = orden de carga recomendado: 1 España gratis, 2 vídeo + precio de subastas, 3 licencias de resultados, 4 árabes y raid.
// Se carga al arrancar: añade las que falten y no pisa el estado que haya puesto la dirección.

const ALL = ['CARRERAS_PSI', 'CARRERAS_ARABE', 'CARRERAS_QH', 'RAID', 'REINING', 'DOMA_CLASICA', 'SALTO', 'COMPLETO']
const FEI = ['RAID', 'DOMA_CLASICA', 'SALTO', 'COMPLETO']

const SOURCES = [
  // ── Bloque 1: España, gratis caballo a caballo (pedir permiso por escrito antes de automatizar) ──
  { key: 'ancce_lg', name: 'LG PRE ANCCE (genealogía e índices genéticos PRE)', url: 'https://www.lgancce.com', kind: 'INDICES', disciplines: ['DOMA_CLASICA'], region: 'España', access: 'PUBLICO_CABALLO_A_CABALLO', block: 1, notes: 'Unos 175.000 PRE con índices: 37 caracteres de morfología y 6 de doma, con índice global y fiabilidad. Web y app. Sin descarga masiva.' },
  { key: 'cde_ancades', name: 'CDE · ANCADES (índices BLUP salto, doma, completo y raid)', url: 'https://www.ancades.com', kind: 'INDICES', disciplines: ['SALTO', 'DOMA_CLASICA', 'COMPLETO', 'RAID'], region: 'España', access: 'PUBLICO_CABALLO_A_CABALLO', block: 1, notes: 'Índices en base 100 ± 20 (Universidad de Sevilla). En raid evalúa tiempo, recuperación y probabilidad de completar.' },
  { key: 'mapa_pscj', name: 'Pruebas de Selección de Caballos Jóvenes (MAPA)', url: 'https://www.mapa.gob.es', kind: 'RESULTADOS', disciplines: ['DOMA_CLASICA', 'SALTO', 'COMPLETO', 'RAID'], region: 'España', access: 'PUBLICO', block: 1, notes: 'Resultados publicados por ANCCE, ANCADES, AECCAá, AECCA y UEGHá en sus webs; después pasan al sistema ARCA del MAPA.' },
  { key: 'rfhe', name: 'RFHE · Plataforma de resultados', url: 'https://rfhe.com', kind: 'RESULTADOS', disciplines: FEI, region: 'España', access: 'PUBLICO', block: 1, notes: 'Consulta por jinete y caballo con exportación a Excel (desde 2017, empezó con salto). Comprobar si ya cubre doma, completo y raid.' },
  { key: 'jce', name: 'Jockey Club Español (resultados y valores oficiales)', url: 'https://jockey-club.es', kind: 'RESULTADOS', disciplines: ['CARRERAS_PSI'], region: 'España', access: 'PUBLICO_CABALLO_A_CABALLO', block: 1, notes: 'Valores oficiales de handicap en tablas HTML por edad; resultados y actuaciones por caballo. Portal profesional pro.jockey-club.es por investigar.' },
  { key: 'ecuestre_es', name: 'Ecuestre.es · resultados desde 1999', url: 'https://www.ecuestre.es', kind: 'RESULTADOS', disciplines: FEI, region: 'España', access: 'PUBLICO', block: 1, notes: 'Cobertura y condiciones sin verificar.' },

  // ── Bloque 2: vídeo + precio de subastas ──
  { key: 'obs', name: 'OBS (Ocala Breeders\' Sales) · breeze-ups', url: 'https://obssales.com', kind: 'SUBASTA', disciplines: ['CARRERAS_PSI'], region: 'EE. UU.', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'La mejor fuente para el modelo: vídeo del breeze y al paso, fotos, tiempo de breeze y precio por lote. Ventas de marzo, primavera (≈1.200 lotes) y junio. También en YouTube y la app equineline. Capturar durante la venta.' },
  { key: 'fasig_tipton', name: 'Fasig-Tipton · breeze-ups (Midlantic, Gulfstream)', url: 'https://www.fasigtipton.com', kind: 'SUBASTA', disciplines: ['CARRERAS_PSI'], region: 'EE. UU.', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Vídeo de breeze por lote en YouTube y tiempos por furlong. Normalizar tiempos por sede.' },
  { key: 'tattersalls', name: 'Tattersalls · Craven y Guineas Breeze-Up, October Yearling', url: 'https://www.tattersalls.com', kind: 'SUBASTA', disciplines: ['CARRERAS_PSI'], region: 'Reino Unido', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Vídeos de breeze en la web; precios por lote.' },
  { key: 'arqana', name: 'Arqana · Breeze-Up, Agosto, Árabes de Saint-Cloud', url: 'https://www.arqana.com', kind: 'SUBASTA', disciplines: ['CARRERAS_PSI', 'CARRERAS_ARABE'], region: 'Francia', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Breeze-up en Deauville; venta de árabes de carreras la víspera del Arco (≈100 lotes).' },
  { key: 'inglis', name: 'Inglis · Ready2Race, Easter', url: 'https://inglis.com.au', kind: 'SUBASTA', disciplines: ['CARRERAS_PSI'], region: 'Australia', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Vídeos de breeze de cada caballo en la web nada más terminar la sesión.' },
  { key: 'goffs', name: 'Goffs · Orby, breeze-ups', url: 'https://www.goffs.com', kind: 'SUBASTA', disciplines: ['CARRERAS_PSI'], region: 'Irlanda / Reino Unido', access: 'PUBLICO', has_video: true, has_prices: true, block: 2 },
  { key: 'keeneland', name: 'Keeneland · September Yearling', url: 'https://www.keeneland.com', kind: 'SUBASTA', disciplines: ['CARRERAS_PSI'], region: 'EE. UU.', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Mucho volumen y precio; solo vídeo al paso. El yearling se vende sin nombre: casar por madre, año y padre.' },
  { key: 'magic_millions', name: 'Magic Millions · Gold Coast', url: 'https://magicmillions.com.au', kind: 'SUBASTA', disciplines: ['CARRERAS_PSI'], region: 'Australia', access: 'PUBLICO', has_prices: true, block: 2, notes: 'Estadísticas públicas por venta, sin CSV.' },
  { key: 'verden', name: 'Hannoveraner · subastas de Verden', url: 'https://www.hannoveraner.com', kind: 'SUBASTA', disciplines: ['SALTO', 'DOMA_CLASICA'], region: 'Alemania', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Vídeos oficiales, vídeos del trabajo diario y radiografías por caballo; resultados en PDF.' },
  { key: 'westfalen', name: 'Westfalen · subastas', url: 'https://westfalenpferde.de', kind: 'SUBASTA', disciplines: ['SALTO', 'DOMA_CLASICA'], region: 'Alemania', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Listas de precios en PDF.' },
  { key: 'holsteiner', name: 'Holsteiner Verband · Elite Auction', url: 'https://www.holsteiner-verband.de', kind: 'SUBASTA', disciplines: ['SALTO'], region: 'Alemania', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Listas de precios en PDF por subasta.' },
  { key: 'oldenburg', name: 'Oldenburger · subastas de primavera y élite', url: 'https://www.oldenburger-pferde.com', kind: 'SUBASTA', disciplines: ['DOMA_CLASICA', 'SALTO'], region: 'Alemania', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Ojo a las recompras: el mejor martillo de primavera 2026 (110.000 €) no se vendió.' },
  { key: 'trakehner', name: 'Trakehner Verband · subastas y Hengstmarkt', url: 'https://www.trakehner-verband.de', kind: 'SUBASTA', disciplines: ['DOMA_CLASICA', 'SALTO'], region: 'Alemania', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'PDF con catálogo, nombre, padre, abuelo materno, precio y país (comprobar si es martillo o salida).' },
  { key: 'psi_auction', name: 'PSI Auction (Ankum)', url: 'https://www.psi-auction.de', kind: 'SUBASTA', disciplines: ['SALTO', 'DOMA_CLASICA'], region: 'Alemania', access: 'PUBLICO', has_video: true, has_prices: true, block: 2 },
  { key: 'fences', name: 'Fences (Deauville)', url: 'https://www.fences.fr', kind: 'SUBASTA', disciplines: ['SALTO'], region: 'Francia', access: 'PUBLICO', has_video: true, has_prices: true, block: 2 },
  { key: 'horse24', name: 'Horse24 · subastas online', url: 'https://horse24.com', kind: 'SUBASTA', disciplines: ['SALTO', 'DOMA_CLASICA'], region: 'Europa', access: 'SUSCRIPCION', has_video: true, has_prices: true, block: 2, notes: 'Registro necesario para ver parte de la información por lote.' },
  { key: 'clipmyhorse_auctions', name: 'ClipMyHorse.TV Auctions', url: 'https://www.clipmyhorse.tv', kind: 'SUBASTA', disciplines: ['SALTO', 'DOMA_CLASICA'], region: 'Europa', access: 'SUSCRIPCION', has_video: true, has_prices: true, block: 2, notes: 'Muestra ventas pasadas con precio.' },
  { key: 'nrha_sale', name: 'NRHA Futurity Sale', url: 'https://nrha.com/sales/', kind: 'SUBASTA', disciplines: ['REINING'], region: 'EE. UU.', access: 'PUBLICO', has_video: true, has_prices: true, block: 2, notes: 'Resultados en Google Sheets (2025) y PDF; puja por CCI.Live. Lo más fácil de importar.' },
  { key: 'ruidoso', name: 'Ruidoso Select (Quarter Horse)', url: 'https://www.ruidosodowns.com', kind: 'SUBASTA', disciplines: ['CARRERAS_QH'], region: 'EE. UU.', access: 'PUBLICO', has_prices: true, block: 2, notes: 'Puja online por DVAuction.' },
  { key: 'heritage_place', name: 'Heritage Place (Quarter Horse)', url: 'https://www.heritageplace.com', kind: 'SUBASTA', disciplines: ['CARRERAS_QH'], region: 'EE. UU.', access: 'PUBLICO', has_prices: true, block: 2 },
  { key: 'western_bloodstock', name: 'Western Bloodstock (NCHA, NRCHA)', url: 'https://westernbloodstock.com', kind: 'SUBASTA', disciplines: ['REINING'], region: 'EE. UU.', access: 'PUBLICO', has_prices: true, block: 2 },
  { key: 'ehorses', name: 'eHorses (anuncios con vídeo)', url: 'https://www.ehorses.com', kind: 'VIDEO', disciplines: ['DOMA_CLASICA', 'SALTO', 'COMPLETO'], region: 'Europa', access: 'PUBLICO', has_video: true, block: 2, notes: 'Precios pedidos, no de venta. Útil para vídeo de PRE, Lusitano y KWPN.' },

  // ── Bloque 3: licencias de resultados (el "rendimiento posterior") ──
  { key: 'hippomundo', name: 'Hippomundo', url: 'https://www.hippomundo.com', kind: 'RESULTADOS', disciplines: ['SALTO', 'DOMA_CLASICA', 'COMPLETO'], region: 'Internacional', access: 'SUSCRIPCION', block: 3, notes: 'Resultados internacionales y nacionales enlazados con más de 75 studbooks. Pro ≈70 €/año (2020). La más barata y rápida.' },
  { key: 'horsetelex', name: 'HorseTelex', url: 'https://www.horsetelex.com', kind: 'GENEALOGIA', disciplines: ['SALTO', 'DOMA_CLASICA', 'COMPLETO'], region: 'Internacional', access: 'SUSCRIPCION', block: 3, notes: 'Más de 2 millones de caballos; pedigrí gratis, resultados FEI de pago.' },
  { key: 'fei', name: 'FEI Database', url: 'https://data.fei.org', kind: 'RESULTADOS', disciplines: FEI.concat('REINING'), region: 'Internacional', access: 'CONVENIO', block: 3, notes: 'El FEI ID cruza todo. Servicios web solo para software autorizado; términos de uso por revisar.' },
  { key: 'equiratings', name: 'EquiRatings', url: 'https://equiratings.com', kind: 'RESULTADOS', disciplines: ['SALTO', 'COMPLETO'], region: 'Internacional', access: 'LICENCIA', block: 3, notes: 'Elo, CAS/PAS en salto; ERQI en completo. B2B sin precio.' },
  { key: 'weatherbys', name: 'Weatherbys (carreras y cría GB/IRE)', url: 'https://www.weatherbys.co.uk', kind: 'RESULTADOS', disciplines: ['CARRERAS_PSI'], region: 'Reino Unido / Irlanda', access: 'LICENCIA', block: 3, notes: 'Feeds de pedigrí y resultados; contacto comercial.' },
  { key: 'tpd', name: 'Total Performance Data (sectionals)', url: 'https://www.totalperformancedata.com', kind: 'SENSORES', disciplines: ['CARRERAS_PSI'], region: 'Reino Unido', access: 'LICENCIA', block: 3, notes: 'Tracking de las 59 pistas británicas desde 2024.' },
  { key: 'france_galop', name: 'France Galop (resultados y valeur)', url: 'https://www.france-galop.com', kind: 'RESULTADOS', disciplines: ['CARRERAS_PSI', 'CARRERAS_ARABE'], region: 'Francia', access: 'PUBLICO_CABALLO_A_CABALLO', block: 3, notes: 'Valeur publicada 48 h después de cada carrera. Sin API oficial.' },
  { key: 'equibase', name: 'Equibase', url: 'https://www.equibase.com', kind: 'RESULTADOS', disciplines: ['CARRERAS_PSI', 'CARRERAS_QH'], region: 'EE. UU.', access: 'LICENCIA', block: 3 },
  { key: 'aqha', name: 'AQHA Records Research', url: 'https://www.aqha.com/aqha-records-research', kind: 'RESULTADOS', disciplines: ['CARRERAS_QH', 'REINING'], region: 'EE. UU.', access: 'LICENCIA', block: 3, notes: 'Informes de pago por caballo; pedigrí gratis a 5 generaciones.' },
  { key: 'equistat', name: 'Equi-Stat (ganancias western)', url: 'https://www.equistat.com', kind: 'RESULTADOS', disciplines: ['REINING'], region: 'EE. UU.', access: 'SUSCRIPCION', block: 3, notes: 'Desde 1985, más de 60 disciplinas western.' },
  { key: 'nrha', name: 'NRHA (resultados y LTE)', url: 'https://www.nrha.com', kind: 'RESULTADOS', disciplines: ['REINING'], region: 'EE. UU. / Europa', access: 'CONVENIO', block: 3 },
  { key: 'clipmyhorse_tv', name: 'ClipMyHorse.TV (vídeo de competición)', url: 'https://www.clipmyhorse.tv', kind: 'VIDEO', disciplines: FEI, region: 'Internacional', access: 'SUSCRIPCION', has_video: true, block: 3, notes: 'Mayor archivo de vídeo ecuestre; la FEI tiene participación.' },

  // ── Bloque 4: árabes y raid ──
  { key: 'era', name: 'Emirates Racing Authority (ratings árabes)', url: 'https://emiratesracing.com', kind: 'RESULTADOS', disciplines: ['CARRERAS_ARABE'], region: 'Emiratos', access: 'PUBLICO_CABALLO_A_CABALLO', block: 4, notes: 'Handicapper específico para árabes; rating ajustado tras cada carrera.' },
  { key: 'aro_bha', name: 'ARO / BHA (carreras árabes en Reino Unido)', url: 'https://www.britishhorseracing.com/regulation/arabian-racing/', kind: 'RESULTADOS', disciplines: ['CARRERAS_ARABE'], region: 'Reino Unido', access: 'PUBLICO', block: 4 },
  { key: 'ifahr', name: 'IFAHR (clasificación internacional árabe)', url: 'https://www.ifahr.net', kind: 'RESULTADOS', disciplines: ['CARRERAS_ARABE'], region: 'Internacional', access: 'CONVENIO', block: 4, notes: 'Base global con retrasos por falta de envío de datos de los países.' },
  { key: 'emirates_bloodstock', name: 'Emirates Bloodstock (catálogos de subastas árabes)', url: 'https://www.emiratesbs.com', kind: 'SUBASTA', disciplines: ['CARRERAS_ARABE'], region: 'Emiratos', access: 'PUBLICO', has_prices: false, block: 4, notes: 'Catálogos desde 2013; precios poco transparentes.' },
  { key: 'stud_book_ar', name: 'Stud Book Argentino', url: 'https://jockeyclub.org.ar/en/stud-book/index.htm', kind: 'GENEALOGIA', disciplines: ['CARRERAS_PSI'], region: 'Argentina', access: 'PUBLICO', block: 4, notes: 'Estadísticas y fichas PDF gratis por ejemplar.' },
]

async function seedSources(db) {
  for (const s of SOURCES) {
    // eslint-disable-next-line no-await-in-loop
    await db.query(
      `INSERT INTO data_sources(key, name, url, kind, disciplines, region, access, has_video, has_prices, block, notes, crawl_urls)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (key) DO NOTHING`,
      [s.key, s.name, s.url || null, s.kind, s.disciplines || ALL, s.region || null, s.access, Boolean(s.has_video), Boolean(s.has_prices), s.block || 3, s.notes || null,
        ['SUBASTA', 'VIDEO'].includes(s.kind) && s.url ? [s.url] : []],
    )
  }
}

module.exports = { SOURCES, seedSources }
