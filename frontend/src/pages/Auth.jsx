import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, useAuth } from '../api.jsx'

function useAfterLogin() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  return (user) => {
    const next = params.get('next')
    nav(next && next.startsWith('/') ? next : ['ADMIN', 'EVALUADOR'].includes(user.role) ? '/admin' : '/panel')
  }
}

export function Login() {
  const { login } = useAuth()
  const after = useAfterLogin()
  const [params] = useSearchParams()
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { const r = await api('/auth/login', { method: 'POST', body: f }); login(r.token, r.user); after(r.user) } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <section className="section">
      <div className="wrap auth-box">
        <div className="card">
          <span className="eyebrow">Área privada</span>
          <h2 style={{ fontSize: '2rem' }}>Acceder</h2>
          <form className="form mt24" onSubmit={submit}>
            <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="pw">Contraseña</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
            {err && <p className="notice bad">{err}</p>}
            <button className="btn btn-ink btn-block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          </form>
          <p className="muted mt24 center">¿No tienes cuenta? <Link className="link" to={`/alta${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Crear cuenta</Link></p>
        </div>
      </div>
    </section>
  )
}

export function Register() {
  const { login } = useAuth()
  const after = useAfterLogin()
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', country: 'España', city: '', company: '', password: '' })
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!ok) return setErr('Debes aceptar las condiciones para crear la cuenta')
    setBusy(true)
    try { const r = await api('/auth/register', { method: 'POST', body: f }); login(r.token, r.user); after(r.user) } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <section className="section">
      <div className="wrap auth-box" style={{ maxWidth: 620 }}>
        <div className="card">
          <span className="eyebrow">Clientes</span>
          <h2 style={{ fontSize: '2rem' }}>Crear cuenta</h2>
          <form className="form mt24" onSubmit={submit}>
            <div className="grid g2" style={{ gap: 16 }}>
              <div className="field"><label>Nombre *</label><input className="input" required value={f.firstName} onChange={set('firstName')} /></div>
              <div className="field"><label>Apellidos *</label><input className="input" required value={f.lastName} onChange={set('lastName')} /></div>
              <div className="field"><label>Email *</label><input className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></div>
              <div className="field"><label>Teléfono</label><input className="input" type="tel" value={f.phone} onChange={set('phone')} /></div>
              <div className="field"><label>País *</label><input className="input" required value={f.country} onChange={set('country')} /></div>
              <div className="field"><label>Ciudad</label><input className="input" value={f.city} onChange={set('city')} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Cuadra, yeguada o empresa</label><input className="input" value={f.company} onChange={set('company')} placeholder="Opcional" /></div>
            </div>
            <div className="field"><label>Contraseña * (mínimo 8 caracteres)</label><input className="input" type="password" minLength={8} required autoComplete="new-password" value={f.password} onChange={set('password')} /></div>
            <label className="small" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ marginTop: 4 }} />
              <span>Entiendo que los informes de TopHorses son análisis de datos que ayudan a decidir y no garantizan resultados, y que mi documentación se trata de forma privada.</span>
            </label>
            {err && <p className="notice bad">{err}</p>}
            <button className="btn btn-ink btn-block" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
          </form>
          <p className="muted mt24 center">¿Ya tienes cuenta? <Link className="link" to="/acceder">Acceder</Link></p>
        </div>
      </div>
    </section>
  )
}
