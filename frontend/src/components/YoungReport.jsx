// Vista del informe de potro (la misma en el panel de gestión y en el del cliente)
import { fmtDate } from '../data/content.js'

const HEALTH = { SIN_HALLAZGOS: ['Sin hallazgos relevantes', 'ok'], VIGILAR: ['A vigilar', 'example'], VETERINARIO: ['Recomendada valoración veterinaria', 'bad'] }
const pc = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`)
const eur = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-ES')} €`)
const per100 = (x) => (x == null ? null : Math.max(0, Math.round(x * 100)))

function Bar({ value }) {
  return (
    <div style={{ background: 'var(--line)', height: 8, borderRadius: 4, overflow: 'hidden', minWidth: 80 }}>
      <div style={{ width: `${Math.max(2, Math.min(100, value))}%`, height: '100%', background: 'var(--gold)' }} />
    </div>
  )
}

export default function YoungReportView({ report, disciplineName }) {
  const r = report.result || {}
  const q = r.quality
  const [hLabel, hCls] = HEALTH[r.healthOverall] || ['—', 'light']
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span className="eyebrow">Informe de potro · {disciplineName}</span>
          <p className="small muted">{fmtDate(report.publishedAt || report.createdAt)} · versión {r.version} · confianza {String(r.confidence || '').toLowerCase()}</p>
          {r.stage && <p className="small mt8"><strong>Etapa: {r.stage.name}</strong> · fiabilidad esperada a esta edad: {String(r.stage.reliability).toLowerCase()}. <span className="muted">{r.stage.note}</span></p>}
        </div>
        <span className={`badge ${hCls}`}>Salud: {hLabel}</span>
      </div>
      {r.summary && <p className="lead" style={{ margin: 0 }}>{r.summary}</p>}
      {r.disciplineFit && <p className="notice info small">{r.disciplineFit}</p>}

      <div className="grid g2" style={{ gap: 24, alignItems: 'start' }}>
        <div>
          <h4>Calidad frente a potros de su edad</h4>
          {q ? (
            <>
              <p className="mt8"><strong style={{ fontSize: '2rem', fontFamily: 'var(--serif)' }}>Percentil {q.percentile}</strong></p>
              <p className="small muted">Está por encima de {q.percentile} de cada 100 potros de su edad, según lo que se ve en el material (índice {q.index} sobre 10, rasgos vistos {q.coverage} %).</p>
            </>
          ) : <p className="small muted mt8">El material no permite valorar los rasgos principales.</p>}
          <table className="table mt16"><tbody>{(r.traits || []).map((t) => (
            <tr key={t.key}>
              <td className="small t-name">{t.name}</td>
              <td style={{ width: 120 }}>{t.score != null ? <Bar value={t.score * 10} /> : <span className="small muted">no se ve</span>}</td>
              <td className="small">{t.score != null ? `${t.score}/10` : ''}</td>
              <td className="small muted">{t.observation}</td>
            </tr>
          ))}</tbody></table>
        </div>
        <div>
          <h4>Probabilidad de llegar a cada nivel</h4>
          <table className="table mt8">
            <thead><tr><th>Nivel</th><th>De 100 potros como él</th><th>Media de su raza</th></tr></thead>
            <tbody>{(r.probabilities || []).map((p) => (
              <tr key={p.level}>
                <td className="small t-name">{p.level}</td>
                <td className="small">{p.mid != null ? <><strong>≈ {per100(p.mid)}</strong> <span className="muted">(entre {per100(p.low)} y {per100(p.high)})</span></> : <span className="muted">sin tasa base todavía</span>}</td>
                <td className="small">{p.base != null ? <>{pc(p.base)}{p.vsBase ? <span className="muted"> · ×{p.vsBase}</span> : null}</> : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="small muted mt8">Siempre partimos de la media real de su raza y la ajustamos con lo que se ve del potro. Las fuentes de cada media están en la metodología.</p>

          <h4 className="mt24">Valor de mercado actual</h4>
          {r.market?.enough ? (
            <>
              <p className="mt8"><strong>{eur(r.market.p50)}</strong> <span className="small muted">(la mayoría entre {eur(r.market.p10)} y {eur(r.market.p90)})</span></p>
              <p className="small muted">Con {r.market.n} potros comparables vendidos en subasta (no cuentan las recompras).</p>
            </>
          ) : <p className="small muted mt8">Aún no hay suficientes ventas comparables en el archivo ({r.market?.n || 0} de {r.market?.min || 8} necesarias).</p>}
        </div>
      </div>

      <div>
        <h4>Salud biomecánica observable</h4>
        <p className="small muted">Son señales para comentar con el veterinario, no un diagnóstico ni un apto de precompra.</p>
        <table className="table mt8"><tbody>{(r.health || []).map((h, i) => {
          const [l, c] = HEALTH[h.level] || [h.level, 'light']
          return <tr key={i}><td className="small t-name">{h.signal}</td><td><span className={`badge ${c}`}>{l}</span></td><td className="small muted">{h.observation}</td></tr>
        })}</tbody></table>
        <p className="small mt16"><strong>No se puede evaluar en vídeo:</strong></p>
        <ul className="small" style={{ paddingLeft: 18, margin: '6px 0 0' }}>{(r.notEvaluable || []).map((x) => <li key={x}>{x}</li>)}</ul>
      </div>

      <details>
        <summary className="link small" style={{ cursor: 'pointer' }}>Metodología y avisos</summary>
        <ul className="small" style={{ paddingLeft: 18 }}>
          {(r.probabilities || []).filter((p) => p.source).map((p) => <li key={p.level}>Media de «{p.level}»: {p.source}</li>)}
          {(r.provisional || []).map((x) => <li key={x}>{x}</li>)}
          <li>Material: {r.filmingOk ? 'cumple el protocolo de grabación' : 'no cumple del todo el protocolo de grabación; las valoraciones son descriptivas'}{r.filmingNotes ? ` (${r.filmingNotes})` : ''}.</li>
          <li>Este informe ayuda a decidir; no garantiza resultados ni sustituye al examen veterinario de precompra.</li>
        </ul>
      </details>
    </div>
  )
}
