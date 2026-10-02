import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../api.jsx'
import { Logo } from './ui.jsx'

const NAV = [
  ['/disciplinas', 'Disciplinas'],
  ['/como-funciona', 'Cómo funciona'],
  ['/servicios', 'Servicios'],
]

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="TopHorses, inicio">
      <Logo />
      <span>
        <div className="brand-name">TopHorses</div>
        <div className="brand-sub">DATOS DEL CABALLO DEPORTIVO</div>
      </span>
    </Link>
  )
}

function Header() {
  const { user, logout, isStaff } = useAuth()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])

  const account = user
    ? <>
        <Link className="btn btn-gold" to={isStaff ? '/admin' : '/panel'}>{isStaff ? 'Panel de gestión' : 'Mi panel'}</Link>
        <button className="btn btn-line-light" onClick={() => { logout(); nav('/') }}>Salir</button>
      </>
    : <>
        <Link className="btn btn-line-light" to="/acceder">Acceder</Link>
        <Link className="btn btn-gold" to="/alta">Crear cuenta</Link>
      </>

  return (
    <header className="header">
      <div className="wrap">
        <Brand />
        <nav className="nav" aria-label="Principal">
          {NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </nav>
        <div className="header-cta">{account}</div>
        <button className="burger" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menú">{open ? '✕' : '☰'}</button>
      </div>
      {open && (
        <div className="mobile-nav">
          {NAV.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
          <div className="row">{account}</div>
        </div>
      )}
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <Brand />
            <p className="mt24">Análisis de datos del caballo deportivo: resultados, genealogía, vídeo y mercado, en un mismo informe. Carreras, raid, reining, doma, salto y completo.</p>
          </div>
          <div>
            <h4>Disciplinas</h4>
            <Link to="/disciplinas#CARRERAS">Carreras</Link>
            <Link to="/disciplinas#RESISTENCIA">Raid</Link>
            <Link to="/disciplinas#WESTERN">Reining</Link>
            <Link to="/disciplinas#DEPORTE">Doma, salto y completo</Link>
          </div>
          <div>
            <h4>TopHorses</h4>
            <Link to="/como-funciona">Cómo funciona</Link>
            <Link to="/servicios">Servicios</Link>
            <Link to="/alta">Crear cuenta</Link>
          </div>
          <div>
            <h4>Clientes</h4>
            <Link to="/acceder">Acceder</Link>
            <Link to="/panel">Mi panel</Link>
          </div>
        </div>
        <div className="bottom">
          <span>© {new Date().getFullYear()} TopHorses.</span>
          <span>Los informes son análisis de datos: ayudan a decidir, no garantizan resultados.</span>
        </div>
      </div>
    </footer>
  )
}

export default function Layout() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) { setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); return }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return (
    <>
      <Header />
      <main><Outlet /></main>
      <Footer />
    </>
  )
}
