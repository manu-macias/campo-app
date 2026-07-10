import { useMemo, useState } from 'react'
import { registrarVenta } from '../lib/db.js'
import { calcFacturacion, FMT, ultimoPrecioDe, GRANOS, labelGrano } from '../lib/scoring.js'
import { compartirTicketReparto } from '../lib/ticket.js'

// Toneladas con hasta 2 decimales (FMT redondea a entero: sirve solo para $).
const FTN = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const fmtFecha = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

export default function Ventas({ grupo, campania, socios, ventas, precios, onCambio }) {
  // Granos del contrato (los contratos viejos, sin migrar, quedan como soja).
  const granos = (campania?.granos?.length ? campania.granos : ['soja'])
  const multi = granos.length > 1

  const [form, setForm] = useState({
    socioId: '', fecha: new Date().toISOString().slice(0, 10), tn: '', pesos: '',
    grano: granos[0],
  })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [abierto, setAbierto] = useState({}) // qué repartos del historial están expandidos
  const toggleDia = (k) => setAbierto(a => ({ ...a, [k]: !a[k] }))

  // Precio oficial del grano elegido (última pizarra no nula; no editable).
  const precioHoy = ultimoPrecioDe(precios, form.grano).precio

  // Calculadora bidireccional tn ↔ pesos al precio del grano elegido. Se deja
  // tal cual el campo que se está tipeando; el otro se recalcula.
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
  // Al cambiar de grano, recalcula los pesos con el precio del nuevo grano.
  const onGrano = (grano) => {
    const p = ultimoPrecioDe(precios, grano).precio
    setForm(f => {
      const n = parseFloat(f.tn)
      const pesos = p && f.tn !== '' && !isNaN(n) ? String(Math.round(n * p)) : ''
      return { ...f, grano, pesos }
    })
  }

  const fact = useMemo(() => calcFacturacion(ventas), [ventas])

  // Toneladas vendidas por grano (para el total, que no se puede mezclar).
  const tnPorGrano = useMemo(() => {
    const m = {}
    for (const v of ventas) m[v.grano || 'soja'] = (m[v.grano || 'soja'] || 0) + Number(v.toneladas)
    return m
  }, [ventas])

  // Historial: cada "reparto" es una fecha + un grano (así el total en tn tiene
  // sentido y el ticket es de un solo grano). Los socios se agrupan adentro.
  const repartos = useMemo(() => {
    const map = {}
    for (const v of ventas) {
      const grano = v.grano || 'soja'
      const key = v.fecha + '|' + grano
      const imp = Number(v.importe) || Number(v.toneladas) * Number(v.precio_soja)
      if (!map[key]) map[key] = { key, fecha: v.fecha, grano, tn: 0, importe: 0, socios: {} }
      map[key].tn += Number(v.toneladas)
      map[key].importe += imp
      const nombre = v.socios?.nombre || '—'
      if (!map[key].socios[nombre]) map[key].socios[nombre] = { nombre, tn: 0, importe: 0 }
      map[key].socios[nombre].tn += Number(v.toneladas)
      map[key].socios[nombre].importe += imp
    }
    return Object.values(map)
      .map(d => ({ ...d, socios: Object.values(d.socios) }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.grano.localeCompare(b.grano)))
  }, [ventas])

  // Resumen por socio: importe total ($, se puede sumar) + toneladas por grano.
  const porSocio = useMemo(() => {
    const m = {}
    for (const v of ventas) {
      const k = v.socio_id
      const nombre = v.socios?.nombre || '—'
      const grano = v.grano || 'soja'
      if (!m[k]) m[k] = { nombre, importe: 0, tnPorGrano: {} }
      m[k].importe += Number(v.importe) || Number(v.toneladas) * Number(v.precio_soja)
      m[k].tnPorGrano[grano] = (m[k].tnPorGrano[grano] || 0) + Number(v.toneladas)
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
      setMsg({ ok: false, txt: `No hay precio de ${labelGrano(form.grano)} cargado; no se puede facturar.` }); return
    }
    setGuardando(true); setMsg(null)
    try {
      await registrarVenta({
        grupoId: grupo.id, campaniaId: campania.id, socioId: form.socioId,
        fecha: form.fecha, toneladas: form.tn, precioSoja: precioHoy, grano: form.grano,
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

  // Texto de toneladas por grano: "3 Soja · 2 Trigo" (o "3 tn" si es un solo grano).
  const tnGranoTexto = (mapa) => Object.entries(mapa)
    .map(([g, tn]) => multi ? `${FTN(tn)} ${labelGrano(g)}` : `${FTN(tn)} tn`)
    .join(' · ') || '—'

  return (
    <div>
      <div className="card">
        <div className="card-title">Registrar venta</div>

        {multi && (
          <div className="grano-chips" style={{ marginBottom: 10 }}>
            {granos.map(id => (
              <button type="button" key={id}
                className={'grano-chip' + (form.grano === id ? ' on' : '')}
                onClick={() => onGrano(id)}>{labelGrano(id)}</button>
            ))}
          </div>
        )}

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
            <>Cotización {multi ? labelGrano(form.grano) + ' ' : ''}de hoy <b>${FMT(precioHoy)}/tn</b>{form.tn && form.pesos
              ? <> · {form.tn} tn = <b className="soja">${FMT(form.pesos)}</b></>
              : ' · tipeá toneladas o pesos y se calcula solo'}</>
          ) : `Sin precio de ${labelGrano(form.grano)} — no se puede registrar la venta`}
        </div>
        <button className="btn primary" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Registrar venta'}
        </button>
        {msg && <div className={msg.ok ? 'ok' : 'error'}>{msg.txt}</div>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">
          {campania.nombre}
          {multi ? ' · ' + granos.map(labelGrano).join(', ') : ' · contrato ' + FMT(campania.toneladas_totales) + ' tn'}
        </div>

        {repartos.length === 0 ? (
          <div className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>Todavía no hay ventas registradas.</div>
        ) : (
          repartos.map((d) => (
            <div className="venta-dia" key={d.key}>
              <button className="venta-dia-head" onClick={() => toggleDia(d.key)} aria-expanded={!!abierto[d.key]}>
                <span className={'venta-dia-chev' + (abierto[d.key] ? ' open' : '')} aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </span>
                <span className="venta-dia-fecha">
                  {multi && <span className="grano-tag">{labelGrano(d.grano)}</span>}
                  Venta del {fmtFecha(d.fecha)}
                </span>
                <span className="venta-dia-tot">{FTN(d.tn)} tn · <b className="soja">${FMT(d.importe)}</b></span>
              </button>
              {abierto[d.key] && (
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
                    fecha: d.fecha, grano: labelGrano(d.grano), filas: d.socios,
                    totalTn: d.tn, totalImporte: d.importe,
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
                    <td>{tnGranoTexto(r.tnPorGrano)}</td>
                    <td className="soja">${FMT(r.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="resumen">
          <span>Total vendido: <b>{tnGranoTexto(tnPorGrano)}</b></span>
          <span>Facturado total: <b className="soja">${FMT(fact.total)}</b></span>
          {fact.ultimo && <span>Último mes ({fact.ultimo.mes}): <b className="soja">${FMT(fact.ultimo.importe)}</b></span>}
        </div>
      </div>
    </div>
  )
}
