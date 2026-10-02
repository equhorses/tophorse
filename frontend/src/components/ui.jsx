import { useEffect, useState } from 'react'
import { fileUrl } from '../api.jsx'

// Imagen con respaldo: si el archivo no existe, muestra un marcador
export function Img({ src, alt, dark, label, style, className }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <div className={`placeholder ${dark ? 'dark' : ''} ${className || ''}`} style={style} role="img" aria-label={alt}>{label || alt}</div>
  }
  return <img src={src.startsWith('/uploads') ? fileUrl(src) : src} alt={alt} onError={() => setFailed(true)} style={style} className={className} loading="lazy" />
}

// Monograma provisional de TopHorses (hasta tener logotipo definitivo)
export function Logo({ size = 46 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="#fff" />
        <circle cx="32" cy="32" r="25" fill="none" stroke="#9a6a12" strokeWidth="1.6" />
        <text x="32" y="40" textAnchor="middle" fontFamily="'Playfair Display',Georgia,serif" fontSize="22" fontWeight="700" fill="#0e2a2d">TH</text>
        <path d="M17 46 Q32 52 47 46" fill="none" stroke="#9a6a12" strokeWidth="1.6" />
      </svg>
    </span>
  )
}

// Fondo del hero: líneas de datos (trazas de zancada) en lugar de fotografía
export function HeroArt() {
  const lines = Array.from({ length: 9 }, (_, i) => i)
  return (
    <svg className="hero-art" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {lines.map((i) => {
        const y = 90 + i * 52
        const a = 18 + (i % 3) * 10
        return <path key={i} d={`M0 ${y} C 120 ${y - a}, 200 ${y + a}, 320 ${y} S 520 ${y - a}, 640 ${y} S 760 ${y + a / 2}, 800 ${y}`} fill="none" stroke="#e3a73a" strokeOpacity={0.12 + (i % 4) * 0.06} strokeWidth={i === 4 ? 2.2 : 1.2} />
      })}
      {[120, 260, 400, 540, 680].map((x, i) => <circle key={x} cx={x} cy={298 + (i % 2 ? -14 : 12)} r="4" fill="#e3a73a" fillOpacity=".7" />)}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <line key={i} x1={100 + i * 100} y1="40" x2={100 + i * 100} y2="560" stroke="#fff" strokeOpacity=".04" />)}
    </svg>
  )
}

export function PageHero({ eyebrow, title, children }) {
  return (
    <section className="hero page-hero">
      <div className="hero-bg art"><HeroArt /></div>
      <div className="wrap">
        <span className="eyebrow" style={{ color: 'var(--gold)' }}>{eyebrow}</span>
        <h1>{title}</h1>
        {children && <p className="lead">{children}</p>}
      </div>
    </section>
  )
}

export function Toast({ msg, onDone }) {
  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [msg])
  if (!msg) return null
  return <div className="toast" role="status">{msg}</div>
}

export function Spinner() {
  return <p className="muted">Cargando…</p>
}

export const LinkButton = ({ onClick, children, className = 'link' }) => (
  <button type="button" className={className} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={onClick}>{children}</button>
)
