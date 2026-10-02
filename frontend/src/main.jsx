import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import './styles.css'
import { AuthProvider } from './api.jsx'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import { ComoFunciona, Disciplinas, Servicios } from './pages/Info.jsx'
import { Login, Register } from './pages/Auth.jsx'
import Panel from './pages/Panel.jsx'
import Admin from './pages/Admin.jsx'

function NotFound() {
  return <div className="wrap section center"><h2>Página no encontrada</h2><Link to="/" className="btn btn-ink mt24">Volver al inicio</Link></div>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/disciplinas" element={<Disciplinas />} />
            <Route path="/como-funciona" element={<ComoFunciona />} />
            <Route path="/servicios" element={<Servicios />} />
            <Route path="/acceder" element={<Login />} />
            <Route path="/alta" element={<Register />} />
            <Route path="/panel" element={<Panel />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
