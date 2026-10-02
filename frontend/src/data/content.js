// Textos y utilidades comunes de TopHorses
export const BRAND = { name: 'TopHorses', tagline: 'Datos del caballo deportivo' }

export const eur = (n) => (n === 0 ? 'Gratis' : `${Number(n / 100).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`)
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const plazo = (d) => (d === 0 ? 'Al momento' : `${d} días hábiles`)

export const SEXES = { MACHO: 'Macho', HEMBRA: 'Hembra', CASTRADO: 'Castrado' }

export const PHOTO_VIEWS = [
  { key: 'LATERAL_IZQUIERDO', label: 'Lateral izquierdo' },
  { key: 'LATERAL_DERECHO', label: 'Lateral derecho' },
  { key: 'FRONTAL', label: 'Frontal' },
  { key: 'TRASERA', label: 'Trasera' },
  { key: 'SUPERIOR', label: 'Desde arriba' },
]

export const VIDEO_KINDS = {
  ENTRENAMIENTO: 'Entrenamiento', COMPETICION: 'Competición / carrera', SUBASTA: 'Subasta (breeze-up / presentación)', A_LA_MANO: 'A la mano', LIBERTAD: 'En libertad',
}

export const DOC_ROLES = { EJEMPLAR: 'Documento del caballo', PADRE: 'Documento del padre', MADRE: 'Documento de la madre' }

export const REQ_STATUS = {
  PENDIENTE_PAGO: ['Pendiente de pago', 'example'], PAGADA: ['Pagada', 'ok'], EN_REVISION: ['En preparación', 'light'],
  REQUIERE_DOCUMENTACION: ['Falta material', 'bad'], RESUELTA: ['Entregado', 'ok'], RECHAZADA: ['Rechazada', 'bad'],
}

export const HORSE_STATUS = { ACTIVO: 'En activo', RETIRADO: 'Retirado', BAJA: 'Baja' }

export const RESULT_STATUS = { CLASIFICADO: 'Clasificado', ELIMINADO: 'Eliminado', RETIRADO: 'Retirado', NO_SALIO: 'No salió' }

export const ROLE_LABELS = { ADMIN: 'Dirección', EVALUADOR: 'Analista', TITULAR: 'Cliente' }

// Productos (los paquetes de suscripción se definen con los datos; aquí solo el nombre y la idea)
export const PACKAGES = [
  { key: 'INFORME', name: 'Informe por caballo', text: 'El análisis completo de un caballo: datos, resultados comparados, vídeo y referencia de mercado. Se paga por informe.' },
  { key: 'ANALISIS', name: 'Análisis múltiple', text: 'Para quien mira muchos caballos: catálogos de subasta, lotes o una cuadra entera, con todos los informes en un mismo panel.', soon: true },
  { key: 'RIESGO', name: 'Gestor de riesgo', text: 'Antes de comprar: qué dicen los datos, qué falta por comprobar y qué señales piden prudencia.', soon: true },
  { key: 'VENTA', name: 'Venta', text: 'Para vender mejor: el expediente del caballo ordenado y su posición respecto al mercado.', soon: true },
]
