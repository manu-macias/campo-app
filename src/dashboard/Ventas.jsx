import { useMemo, useState } from 'react'
import { registrarVenta } from '../lib/db.js'
import { calcFacturacion, FMT, ultimoPrecio } from '../lib/scoring.js'

export default function Ventas({ grupo, campania, socios, ventas, precios, onCambio }) {
  // El precio de la venta es SIEMPRE la última pizarra oficial de soja: no se
  // puede tipear ni ajustar a mano. Se usa ultimoPrecio (no la última fila) para
  // saltear los días sin soja. Si no hay ninguna pizarra, no se puede facturar.
  const precioHoy = ultimoPrecio(precios).soja
  const [form, setForm] = useState({
    socioId: '', fecha: new Date().toISOString().slice(0, 10), tn: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  const fact = useMemo(() => calcFacturacion(ventas), [ventas])
  const totalTn = useMemo(() => ventas.reduce((a, v) => a + Number(v.toneladas), 0), [ventas])

  // Agregado por socio.
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
      setForm(f => ({ ...f, tn: '' }))
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
          <input type="number" min="0" step="0.5" placeholder="Toneladas"
            value={form.tn} onChange={e => setForm(f => ({ ...f, tn: e.target.value }))} />
          <div className="venta-precio" title="Precio oficial del día — no editable">
            {precioHoy ? '$' + FMT(precioHoy) + ' /tn' : 'Sin precio del día'}
          </div>
        </div>
        <button className="btn primary" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Registrar venta'}
        </button>
        {msg && <div className={msg.ok ? 'ok' : 'error'}>{msg.txt}</div>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">{campania.nombre} · contrato {FMT(campania.toneladas_totales)} tn</div>
        {porSocio.length === 0 ? (
          <div className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>Todavía no hay ventas registradas.</div>
        ) : (
          <table className="tabla">
            <thead>
              <tr><th style={{ textAlign: 'left' }}>Socio</th><th>Vendido</th><th>Facturado</th></tr>
            </thead>
            <tbody>
              {porSocio.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'left' }}>{r.nombre}</td>
                  <td>{r.tn} tn</td>
                  <td className="soja">${FMT(r.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="resumen">
          <span>Total vendido: <b>{totalTn} tn</b></span>
          <span>Facturado total: <b className="soja">${FMT(fact.total)}</b></span>
          {fact.ultimo && <span>Último mes ({fact.ultimo.mes}): <b className="soja">${FMT(fact.ultimo.importe)}</b></span>}
        </div>
      </div>
    </div>
  )
}
