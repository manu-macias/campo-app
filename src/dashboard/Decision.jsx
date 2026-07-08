import { useMemo, useState } from 'react'
import { calcScore, veredicto, ultimoPrecio } from '../lib/scoring.js'
import { SecLabel, Slider, PriceCard } from './controls.jsx'

const COLOR = { green: 'var(--soja)', red: 'var(--danger)', blue: '#60a5fa', yellow: 'var(--dolar)', gray: 'var(--muted)' }

export default function Decision({ precios }) {
  // Último precio real de cada serie (saltea las filas cola con soja/dólar null).
  const ult = useMemo(() => ultimoPrecio(precios), [precios])

  // Promedio de referencia: últimos 90 días de la serie (si hay datos).
  const prom = useMemo(() => {
    const rec = precios.slice(-90)
    const avg = (k) => {
      const xs = rec.map(p => p[k]).filter(x => x != null)
      return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0
    }
    return { soja: avg('soja'), dolar: avg('dolar') }
  }, [precios])

  const [v, setV] = useState({
    soja_hoy: ult.soja || 0,
    dolar_hoy: ult.dolar || 0,
    soja_prom: prom.soja,
    dolar_prom: prom.dolar,
    stock_d: 3, stock_s: 3, urgencia: 3, expect_s: 3,
  })
  const set = (k) => (val) => setV(p => ({ ...p, [k]: val }))

  const { score, razones } = calcScore(v)
  const ver = veredicto(score)
  const pct = Math.max(5, Math.min(95, 50 + score * 18))

  return (
    <div>
      <SecLabel>Precios de hoy{ult.fechaSoja ? ' · actualizado ' + ult.fechaSoja.slice(8, 10) + '/' + ult.fechaSoja.slice(5, 7) : ''}</SecLabel>
      <div className="grid2">
        <PriceCard label="Soja BCR Rosario" value={v.soja_hoy} unit="$/tn" accent="var(--soja)" />
        <PriceCard label="Dólar oficial" value={v.dolar_hoy} unit="$/USD" accent="var(--dolar)" />
      </div>

      <SecLabel>Promedios de referencia (últimos 90 días)</SecLabel>
      <div className="grid2">
        <PriceCard label="Soja promedio" value={v.soja_prom} unit="$/tn" sub="calculado" />
        <PriceCard label="Dólar promedio" value={v.dolar_prom} unit="$/USD" sub="calculado" />
      </div>

      <div className={'verdict v-' + ver.cls}>
        <div className="verdict-title">{ver.title}</div>
        <div className="verdict-sub">{ver.sub}</div>
        <div className="gauge">
          <span className="gauge-end">Vender dólares</span>
          <div className="gauge-bar"><div className="gauge-dot" style={{ left: pct + '%' }} /></div>
          <span className="gauge-end">Vender soja</span>
        </div>
      </div>

      {razones.length > 0 && (
        <>
          <SecLabel>Por qué esta recomendación</SecLabel>
          <div className="card">
            {razones.map((r, i) => (
              <div className="razon" key={i}>
                <span className="dot" style={{ background: COLOR[r.c] }} />
                <span><b>{r.t}</b> — {r.d}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SecLabel>Tu contexto</SecLabel>
      <div className="grid2">
        <Slider label="Stock de dólares" value={v.stock_d} onChange={set('stock_d')} hint="1 = pocos · 5 = de sobra" />
        <Slider label="Stock de soja" value={v.stock_s} onChange={set('stock_s')} hint="1 = poca · 5 = mucha" />
        <Slider label="Urgencia de pesos" value={v.urgencia} onChange={set('urgencia')} hint="1 = tengo tiempo · 5 = ya" />
        <Slider label="Expectativa soja" value={v.expect_s} onChange={set('expect_s')} hint="1 = va a bajar · 5 = a subir" />
      </div>
    </div>
  )
}
