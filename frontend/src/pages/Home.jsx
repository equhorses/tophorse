import { Link } from 'react-router-dom'
import { HeroArt } from '../components/ui.jsx'
import { PACKAGES } from '../data/content.js'
import { useCatalog } from '../data/catalog.js'

const PILLARS = [
  ['01', 'Genealogía', 'Padre, madre y abuelo materno, leídos de su documentación oficial y cruzados con lo que han producido.'],
  ['02', 'Resultados', 'Cada carrera, prueba o concurso con su nivel, tiempo, nota, faltas o premio, verificado con su documento.'],
  ['03', 'Movimiento', 'Vídeo de entrenamiento, competición o subasta analizado con IA: zancada, ritmo, equilibrio y mecánica.'],
  ['04', 'Mercado', 'Dónde se sitúa el caballo frente a otros de su perfil, para comprar o vender con una referencia.'],
]

const AUDIENCE = [
  ['Compradores', 'Saber qué hay detrás de un caballo antes de pagar por él.'],
  ['Propietarios y criadores', 'Decidir con datos si seguir, cambiar de disciplina o vender.'],
  ['Entrenadores', 'Seguir la evolución de cada caballo con un expediente ordenado.'],
  ['Agentes y subastas', 'Analizar lotes y catálogos completos en un mismo panel.'],
]

export function DisciplineGrid({ cat }) {
  if (!cat) return <p className="muted">Cargando disciplinas…</p>
  const group = (k) => cat.groups.find((g) => g.key === k)?.name
  return (
    <div className="disc-grid">
      {cat.disciplines.map((d) => (
        <Link key={d.key} to={`/disciplinas#${d.key}`} className="disc">
          <span className="grp">{group(d.group)}</span>
          <h3>{d.name}</h3>
          <div className="chips mt8">{d.breeds.filter((b) => b !== 'OTRA').slice(0, 4).map((b) => <span key={b} className="chip">{cat.breeds.find((x) => x.key === b)?.name || b}</span>)}</div>
        </Link>
      ))}
    </div>
  )
}

export default function Home() {
  const cat = useCatalog()
  return (
    <>
      <section className="hero">
        <div className="hero-bg art"><HeroArt /></div>
        <div className="wrap">
          <div className="hero-tag">✦ Carreras · Raid · Reining · Doma · Salto · Completo</div>
          <h1>Antes de invertir en un caballo, <em>mira sus datos.</em></h1>
          <p className="lead">
            TopHorses reúne y analiza todo lo que dice un caballo: su genealogía, sus resultados, su movimiento en vídeo y su mercado.
            Un informe claro y comparado para decidir con criterio cuándo comprar, vender, entrenar o cambiar de rumbo, sin perder tiempo ni dinero. También en potros sin historial: su calidad frente a los de su edad, sus probabilidades, su salud biomecánica y su valor.
          </p>
          <div className="row mt32">
            <Link className="btn btn-gold" to="/alta">Crear cuenta →</Link>
            <Link className="btn btn-line-light" to="/disciplinas">Ver disciplinas</Link>
          </div>
          <div className="hero-facts">
            <div><span>Disciplinas</span><strong>{cat ? cat.disciplines.length : 8}</strong></div>
            <div><span>Resultados</span><strong>Verificados</strong></div>
            <div><span>Vídeo</span><strong>Analizado con IA</strong></div>
            <div><span>Informe</span><strong>Claro y comparado</strong></div>
          </div>
        </div>
      </section>

      <section className="section dark-band">
        <div className="wrap">
          <span className="eyebrow" style={{ color: 'var(--gold)' }}>Qué analizamos</span>
          <h2>Cuatro fuentes, un solo informe</h2>
          <p className="lead">No es una opinión: cada conclusión del informe indica de qué dato sale, y se compara con caballos del mismo perfil.</p>
          <div className="pillars mt48">
            {PILLARS.map(([n, t, p]) => <div key={n}><span className="n">{n}</span><h3>{t}</h3><p>{p}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section white">
        <div className="wrap">
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div>
              <span className="eyebrow">Disciplinas</span>
              <h2>Cada disciplina, con sus propios datos</h2>
              <p className="lead">Un caballo de carreras se mide por tiempos, distancias y rating; uno de salto, por faltas y alturas; uno de doma o reining, por sus notas. TopHorses recoge en cada caso lo que de verdad cuenta.</p>
            </div>
            <Link to="/disciplinas" className="btn btn-line">Ver todas</Link>
          </div>
          <div className="mt48"><DisciplineGrid cat={cat} /></div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid g2" style={{ gap: 48, alignItems: 'start' }}>
          <div>
            <span className="eyebrow">Para quién</span>
            <h2>Para quien se juega dinero con un caballo</h2>
            <div className="mt32">
              {AUDIENCE.map(([t, p]) => <div key={t} className="feature"><span className="icon-dot">✦</span><div><h3>{t}</h3><p>{p}</p></div></div>)}
            </div>
          </div>
          <div>
            <span className="eyebrow">Rigor</span>
            <h2>Datos con autoridad</h2>
            <ul className="origin-list mt32">
              <li><strong>Fuentes oficiales.</strong> Resultados y genealogía salen de documentos oficiales, y cada dato queda verificado antes de entrar en el análisis.</li>
              <li><strong>La misma regla para todos.</strong> Todos los caballos de una disciplina se analizan con los mismos criterios.</li>
              <li><strong>Cada cifra, con su origen.</strong> El informe dice de dónde sale cada conclusión.</li>
              <li><strong>Límites claros.</strong> Cuando los datos no bastan para concluir algo, el informe lo dice.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section white">
        <div className="wrap">
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div>
              <span className="eyebrow">Servicios</span>
              <h2>Un informe o una suscripción</h2>
            </div>
            <Link to="/servicios" className="btn btn-line">Ver servicios</Link>
          </div>
          <div className="grid g3 mt48">
            {PACKAGES.map((p) => (
              <div key={p.key} className="card pkg">
                {p.soon && <span className="badge example soon">Próximamente</span>}
                <h3>{p.name}</h3>
                <p className="muted small">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
