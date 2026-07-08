import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { FMT, ultimoPrecio } from '../lib/scoring.js'

export default function Precios({ precios }) {
  const ref = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!ref.current || !precios.length) return
    if (chartRef.current) chartRef.current.destroy()

    const labels = precios.map(p => p.fecha.slice(8, 10) + '/' + p.fecha.slice(5, 7))
    const sojas = precios.map(p => p.soja)
    const dolars = precios.map(p => p.dolar)
    const last = precios.length - 1
    const lastSoja = sojas.reduce((acc, x, i) => (x != null ? i : acc), -1)

    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Soja $/tn', data: sojas, yAxisID: 'ySoja',
            borderColor: '#a3e635', backgroundColor: 'rgba(163,230,53,0.09)',
            borderWidth: 2.5, tension: 0.1, spanGaps: true, fill: false,
            pointRadius: sojas.map((_, i) => (i === lastSoja ? 5 : 0)),
            pointBackgroundColor: '#a3e635', pointBorderColor: 'transparent',
          },
          {
            label: 'Dólar $/USD', data: dolars, yAxisID: 'yDolar',
            borderColor: '#f5a623', backgroundColor: 'rgba(245,166,35,0.06)',
            borderWidth: 2.5, tension: 0.1, spanGaps: true, fill: false,
            pointRadius: dolars.map((_, i) => (i === last ? 5 : 0)),
            pointBackgroundColor: '#f5a623', pointBorderColor: 'transparent',
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#b6c4ba', font: { size: 11 }, boxWidth: 12, padding: 16 } },
          tooltip: { callbacks: { label: ctx => '  ' + ctx.dataset.label + ': $' + FMT(ctx.parsed.y) } },
        },
        scales: {
          x: { ticks: { color: '#7e8f84', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 }, grid: { color: 'rgba(42,56,46,0.7)' } },
          ySoja: { position: 'left', ticks: { color: '#a3e635', font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: 'rgba(42,56,46,0.7)' } },
          yDolar: { position: 'right', ticks: { color: '#f5a623', font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(1) + 'k' }, grid: { drawOnChartArea: false } },
        },
      },
    })

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [precios])

  if (!precios.length) {
    return (
      <div className="card muted">
        Todavía no hay datos de precios. Se cargan con el job de precios (BCR + dólar),
        que conectaremos en la próxima fase.
      </div>
    )
  }

  const ult = ultimoPrecio(precios)
  return (
    <div>
      <div className="card">
        <div className="card-title">Evolución diaria</div>
        <canvas ref={ref} style={{ maxHeight: 260 }} />
      </div>
      <div className="resumen" style={{ marginTop: 12 }}>
        <span>Soja hoy: <b className="soja">{ult.soja != null ? '$' + FMT(ult.soja) : '—'}</b></span>
        <span>Dólar hoy: <b className="dolar">{ult.dolar != null ? '$' + FMT(ult.dolar) : '—'}</b></span>
      </div>
    </div>
  )
}
