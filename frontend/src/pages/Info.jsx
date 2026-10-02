// Páginas informativas: disciplinas, cómo funciona y servicios
import { Link } from 'react-router-dom'
import { PageHero } from '../components/ui.jsx'
import { PACKAGES, eur } from '../data/content.js'
import { useCatalog } from '../data/catalog.js'

export function Disciplinas() {
  const cat = useCatalog()
  return (
    <>
      <PageHero eyebrow="Disciplinas" title={<>Todas las disciplinas,<br />cada una con sus datos</>}>
        Carreras de Pura Sangre, Árabe y Quarter Horse, raid, reining, doma clásica, salto y concurso completo.
        En cada una se recogen los datos que de verdad la definen.
      </PageHero>
      {!cat ? <div className="wrap section"><p className="muted">Cargando…</p></div> : cat.groups.map((g, gi) => (
        <section key={g.key} id={g.key} className={`section ${gi % 2 ? '' : 'white'}`}>
          <div className="wrap">
            <span className="eyebrow">{g.name}</span>
            <div className="grid g2 mt24" style={{ gap: 24 }}>
              {cat.disciplines.filter((d) => d.group === g.key).map((d) => (
                <article key={d.key} id={d.key} className="card">
                  <h3>{d.name}</h3>
                  <p className="small muted mt16">Razas</p>
                  <div className="chips mt8">{d.breeds.map((b) => <span key={b} className="chip">{cat.breeds.find((x) => x.key === b)?.name || b}</span>)}</div>
                  <p className="small muted mt16">Datos de cada resultado</p>
                  <div className="chips mt8">
                    {['Puesto', 'Participantes', 'Nivel'].map((x) => <span key={x} className="chip">{x}</span>)}
                    {d.fields.map((f) => <span key={f} className="chip">{cat.fieldLabels[f]}</span>)}
                  </div>
                  <p className="small muted mt16">Niveles</p>
                  <p className="small mt8">{d.levels.join(' · ')}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  )
}

const STEPS = [
  ['Alta del caballo', 'Subes su documentación (carta genealógica, pasaporte o ficha de subasta) y la IA rellena la ficha por ti: nombre, nacimiento, padre, madre, abuelo materno, microchip, libro.'],
  ['Resultados', 'Subes el documento oficial de cada carrera o concurso. La IA lee el puesto, el tiempo, la nota, las faltas, la distancia o el premio, y nuestro equipo lo verifica.'],
  ['Vídeo', 'Entrenamiento, competición, subasta, a la mano o en libertad. La IA analiza el movimiento fotograma a fotograma.'],
  ['Informe', 'Todo se cruza y se compara con caballos del mismo perfil y disciplina. Recibes un informe claro, con el origen de cada dato y sus límites.'],
]

export function ComoFunciona() {
  return (
    <>
      <PageHero eyebrow="Cómo funciona" title={<>Del documento<br />al informe</>}>
        Tú aportas el material; la IA lo lee, lo mide y lo ordena; el informe lo compara con el resto de caballos de su disciplina.
      </PageHero>
      <section className="section white">
        <div className="wrap">
          <div className="steps">
            {STEPS.map(([t, p]) => <div key={t}><h3>{t}</h3><p>{p}</p></div>)}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap grid g2" style={{ gap: 48, alignItems: 'start' }}>
          <div>
            <span className="eyebrow">La IA</span>
            <h2>Lo que hace</h2>
            <ul className="mt24" style={{ paddingLeft: 20 }}>
              <li className="mt8">Lee documentos oficiales y propone los datos; tú los revisas.</li>
              <li className="mt8">Analiza el vídeo con los mismos criterios para todos los caballos de una disciplina.</li>
              <li className="mt8">Compara cada caballo con los de su mismo perfil.</li>
              <li className="mt8">Mejora a medida que crece el archivo de datos y avanzan los modelos de IA.</li>
            </ul>
          </div>
          <div>
            <span className="eyebrow">Garantías</span>
            <h2>Lo que nunca hace</h2>
            <ul className="mt24" style={{ paddingLeft: 20 }}>
              <li className="mt8">Inventar un dato que no aparece en el documento.</li>
              <li className="mt8">Dar por bueno un resultado sin verificar.</li>
              <li className="mt8">Concluir algo cuando los datos no bastan: en ese caso, lo dice.</li>
              <li className="mt8">Publicar tu documentación: es privada.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}

export function Servicios() {
  const cat = useCatalog()
  const informe = cat?.services.find((s) => s.code === 'INFORME')
  return (
    <>
      <PageHero eyebrow="Servicios" title={<>Un informe por caballo<br />o una suscripción</>}>
        Paga solo por lo que necesitas: el informe de un caballo concreto o, si trabajas con muchos, un paquete de suscripción.
      </PageHero>
      <section className="section white">
        <div className="wrap">
          <div className="grid g2" style={{ gap: 24 }}>
            {PACKAGES.map((p) => (
              <div key={p.key} className="card pkg">
                <div className="row between">
                  <h3>{p.name}</h3>
                  {p.soon ? <span className="badge example">Próximamente</span> : informe && <strong>{informe.price === 0 ? 'Gratis en fase de pruebas' : eur(informe.price)}</strong>}
                </div>
                <p className="muted">{p.text}</p>
                {!p.soon && <Link to="/panel" className="btn btn-gold mt16" style={{ alignSelf: 'flex-start' }}>Pedir un informe</Link>}
              </div>
            ))}
          </div>
          <p className="small muted mt32">Los informes son análisis de datos: ayudan a decidir con criterio, no garantizan resultados deportivos ni precios de venta.</p>
        </div>
      </section>
    </>
  )
}
