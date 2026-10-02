// Lectura de CSV (Excel en español exporta con ';'; se detecta el separador). Soporta comillas y saltos de línea entre comillas.
function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] || ''
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows = []
  let row = []; let cell = ''; let q = false
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1 } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, n) => [h, (r[n] ?? '').trim()])))
}

const toCsv = (cols) => `﻿${cols.join(';')}\r\n`

module.exports = { parseCsv, toCsv }

// Número escrito en formato español o inglés: "4.500", "1,250,000", "95,42", "72.5 %", "1.250.000 €"
function parseNumber(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim().replace(/[^\d,.-]/g, '')
  if (!s || s === '-') return null
  const commas = (s.match(/,/g) || []).length
  const dots = (s.match(/\./g) || []).length
  if (commas && dots) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (commas > 1) s = s.replace(/,/g, '')
  else if (dots > 1) s = s.replace(/\./g, '')
  else if (commas === 1) s = /^-?\d{1,3},\d{3}$/.test(s) ? s.replace(',', '') : s.replace(',', '.')
  else if (dots === 1 && /^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace('.', '') // 4.500 → 4500 (miles al estilo español)
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// Tiempo: "1:35.42" o "1'35''42" → 95.42 s; "95,42" → 95.42
function parseTime(v) {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  const m = /^(\d+)[:'′](\d{1,2})(?:[.,"″']+(\d+))?$/.exec(s.replace(/''/g, '"'))
  if (m) return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(`0.${m[3]}`) : 0)
  return parseNumber(s)
}

module.exports.parseNumber = parseNumber
module.exports.parseTime = parseTime
