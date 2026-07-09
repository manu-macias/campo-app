import { useMemo, useState } from 'react'
import { registrarVenta } from '../lib/db.js'
import { calcFacturacion, FMT, ultimoPrecio } from '../lib/scoring.js'
import { compartirTicketReparto } from '../lib/ticket.js'

// Toneladas con hasta 2 decimales (FMT redondea a entero: sirve solo para $).
const FTN = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const fmtFecha = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

export default function Ventas({ grupo, campania, socios, ventas, precios, onCambio }) {
  // El precio de la venta es SIEMPRE la última pizarra oficial de soja: no se
  // puede tipear ni ajustar a mano. Se usa ultimoPrecio (no la última fila) para
  // saltear los días sin soja. Si no hay ninguna pizarra, no se puede facturar.
  const precioHoy = ultimoPrecio(precios).soja
  const [form, setForm] = useState({
    socioId: '', fecha: new Date().toISOString().slice(0, 10), tn: '', pesos: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [abierto, setAbierto] = useState({}) // qué fechas del historial están expandidas
  const toggleDia = (f) => setAbierto(a => ({ ...a, [f]: !a[f] }))

  // Calculadora bidireccional: tn y pesos son espejo uno del otro al precio de
  // soja del día. Se edita uno y el otro se recalcula; se deja tal cual el campo
  // que el usuario está tipeando (para no romper "1.5" o "0."). tn manda al
  // registrar; los pesos son derivados. Sin precio, no se calcula nada.
  const onTn = (raw) => {
    const n = parseFloat(raw)
    const pesos = precioHoy && raw !== '' && !isNaN(n) ? String(Math.round(n * precioHoy)) : ''
    setForm(f => ({ ...f, tn: raw, pesos }))
  }
  const onPesos = (raw) => {
    const n = parseFloat(raw)
    const tn = precioHoy && raw !== '' && !isNaN(n) ? String(Math.round((n / precioHoy) * 100) / 100) : ''
    setForm(f => ({ ...f, pesos: raw, tn }))
  }

  const fact = useMemo(() => calcFacturacion(ventas), [ventas])
  const totalTn = useMemo(() => ventas.reduce((a, v) => a + Number(v.toneladas), 0), [ventas])

  // Historial agrupado por fecha: cada fecha es "una venta" con varios socios.
  // Si un socio vendió dos veces el mismo día, se suma en una sola línea.
  const porFecha = useMemo(() => {
    const dias = {}
    for (const v of ventas) {
      const f = v.fecha
      const imp = Number(v.importe) || Number(v.toneladas) * Number(v.precio_soja)
      if (!dias[f]) dias[f] = { fecha: f, tn: 0, importe: 0, socios: {} }
      dias[f].tn += Number(v.toneladas)
      dias[f].importe += imp
      const nombre = v.socios?.nombre || '—'
      if (!dias[f].socios[nombre]) dias[f].socios[nombre] = { nombre, tn: 0, importe: 0 }
      dias[f].socios[nombre].tn += Number(v.toneladas)
      dias[f].socios[nombre].importe += imp
    }
    return Object.values(dias)
      .map(d => ({ ...d, socios: Object.values(d.socios) }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)) // más nueva primero
  }, [ventas])

  // Resumen por socio (total de toda la campaña).
  const porSocio = useMemo(() => {
    const m = {}
    for (const v of ventas) {
      const k = v.socio_id
      const nombre = v.socios?.nombre || '—'
      if (!m[k]) m[k] = { nombre, tn: 0, importe: 0 }
      m[k].tn += Number(v.toneladas)
      m[k].importe += Number(v.importe) || Number(v.toneladas) * Number(v.precio_soja)
    }
    return Object.values(m)
  }, [ventas])

  if (!campania) {
    return <div className="card muted">No hay una campaña activa para este grupo.</div>
  }

  const guardar = async () => {
    if (!form.socioId || !(Number(form.tn) > 0)) {
      setMsg({ ok: false, txt: 'Completá socio y toneladas (> 0).' }); return
    }
    if (!(Number(precioHoy) > 0)) {
      setMsg({ ok: false, txt: 'No hay precio de soja cargado; no se puede facturar la venta.' }); return
    }
    setGuardando(true); setMsg(null)
    try {
      await registrarVenta({
        grupoId: grupo.id, campaniaId: campania.id, socioId: form.socioId,
        fecha: form.fecha, toneladas: form.tn, precioSoja: precioHoy,
      })
      setMsg({ ok: true, txt: 'Venta registrada.' })
      setForm(f => ({ ...f, tn: '', pesos: '' }))
      await onCambio()
    } catch (e) {
      setMsg({ ok: false, txt: e.message || 'No se pudo registrar.' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">Registrar venta</div>
        <div className="venta-form">
          <select value={form.socioId} onChange={e => setForm(f => ({ ...f, socioId: e.target.value }))}>
            <option value="">Socio</option>
            {socios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
          <input type="number" min="0" step="0.5" placeholder="Toneladas" inputMode="decimal"
            value={form.tn} onChange={e => onTn(e.target.value)} />
          <input type="number" min="0" step="1000" placeholder="Pesos a liquidar" inputMode="numeric"
            value={form.pesos} onChange={e => onPesos(e.target.value)} />
        </div>
        <div className="venta-rate">
          {precioHoy ? (
            <>Cotización de hoy <b>${FMT(precioHoy)}/tn</b>{form.tn && form.pesos
              ? <> · {form.tn} tn = <b className="soja">${FMT(form.pesos)}</b></>
              : ' · tipeá toneladas o pesos y se calcula solo'}</>
          ) : 'Sin precio del día — no se puede registrar la venta'}
        </div>
        <button className="btn primary" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Registrar venta'}
        </button>
        {msg && <div className={msg.ok ? 'ok' : 'error'}>{msg.txt}</div>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">{campania.nombre} · contrato {FMT(campania.toneladas_totales)} tn</div>

        {porFecha.length === 0 ? (
          <div className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>Todavía no hay ventas registradas.</div>
        ) : (
          porFecha.map((d) => (
            <div className="venta-dia" key={d.fecha}>
              <button className="venta-dia-head" onClick={() => toggleDia(d.fecha)} aria-expanded={!!abierto[d.fecha]}>
                <span className={'venta-dia-chev' + (abierto[d.fecha] ? ' open' : '')} aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </span>
                <span className="venta-dia-fecha">Venta del {fmtFecha(d.fecha)}</span>
                <span className="venta-dia-tot">{FTN(d.tn)} tn · <b className="soja">${FMT(d.importe)}</b></span>
              </button>
              {abierto[d.fecha] && (
                <div className="venta-dia-body">
                  <table className="tabla">
                    <tbody>
                      {d.socios.map((s, i) => (
                        <tr key={i}>
                          <td style={{ textAlign: 'left' }}>{s.nombre}</td>
                          <td>{FTN(s.tn)} tn</td>
                          <td className="soja">${FMT(s.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="venta-ticket-btn" onClick={() => compartirTicketReparto({
                    fecha: d.fecha, filas: d.socios, totalTn: d.tn, totalImporte: d.importe,
                    precio: d.tn ? Math.round(d.importe / d.tn) : 0,
                  }).catch(() => {})}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                      <polyline points="8 7 12 3 16 7" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Compartir ticket de reparto
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        {porSocio.length > 0 && (
          <>
            <div className="sec-label" style={{ marginTop: 18 }}>Resumen por socio</div>
            <table className="tabla">
              <thead>
                <tr><th style={{ textAlign: 'left' }}>Socio</th><th>Vendido</th><th>Facturado</th></tr>
              </thead>
              <tbody>
                {porSocio.map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{r.nombre}</td>
                    <td>{FTN(r.tn)} tn</td>
                    <td className="soja">${FMT(r.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="resumen">
          <span>Total vendido: <b>{FTN(totalTn)} tn</b></span>
          <span>Facturado total: <b className="soja">${FMT(fact.total)}</b></span>
          {fact.ultimo && <span>Último mes ({fact.ultimo.mes}): <b className="soja">${FMT(fact.ultimo.importe)}</b></span>}
        </div>
      </div>
    </div>
  )
}
