import { createContext, useContext, useEffect, useState } from 'react'

// En local se usa el proxy de Vite; en Vercel, VITE_API_URL apunta al backend de Railway
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export const fileUrl = (u) => (!u ? null : /^https?:/.test(u) ? u : `${API_BASE}${u}`)

const getToken = () => { try { return localStorage.getItem('th_token') } catch { return null } }

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body && !form) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status })
  return data
}

// Abre un archivo privado (documentación) con la sesión del usuario
export async function openPrivateFile(path) {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error('No se pudo abrir el documento')
  const url = URL.createObjectURL(await res.blob())
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// Descarga un archivo privado (p. ej. exportación CSV) con la sesión del usuario
export async function downloadPrivate(path, filename) {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error('No se pudo descargar')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('th_user') || 'null') } catch { return null } })

  useEffect(() => {
    if (!getToken()) return
    api('/auth/me').then(setUser).catch((e) => { if (e.status === 401) logout() })
  }, [])

  const login = (token, u) => {
    try { localStorage.setItem('th_token', token); localStorage.setItem('th_user', JSON.stringify(u)) } catch { /* sin almacenamiento */ }
    setUser(u)
  }
  const logout = () => {
    try { localStorage.removeItem('th_token'); localStorage.removeItem('th_user') } catch { /* nada */ }
    setUser(null)
  }
  return <AuthCtx.Provider value={{ user, login, logout, isStaff: ['ADMIN', 'EVALUADOR'].includes(user?.role), isAdmin: user?.role === 'ADMIN' }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)

// Carga simple con estado
export function useFetch(path, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true })
  const reload = () => {
    set((s) => ({ ...s, loading: true }))
    return api(path).then((data) => set({ data, error: null, loading: false })).catch((error) => set({ data: null, error, loading: false }))
  }
  useEffect(() => { if (path) reload() }, [path, ...deps])
  return { ...state, reload }
}
