import { useState } from 'react'
import { registrarOperacion } from '../lib/db.js'
import { FMT, ultimoPrecioDe, labelGrano } from '../lib/scoring.js'

const hoy = () => new Date().toISOString().slice(0, 10)
const lineaVacia = () => ({ socioId: '', tn: '', pesos: '' })
// Toneladas con hasta 2 decimales (FMT redondea a entero: sirve solo para $).
const FTN = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })

export default function Ventas({ grupo, campania, socios, precios, onCambio }) {
  // Granos del contrato (los contratos viejos, sin migrar, quedan como soja).
  const granos = (campania?.granos?.length ? campania.granos : ['soja'])
  const multi = granos.length > 1

  const [modo, setModo] = useState('individual') // 'individual' | 'conjunta'
  const [fecha, setFecha] = useState(hoy())
  const [grano, setGrano] = useState(granos[0])
  const [lineas, setLineas] = useState([lineaVacia()])
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  if (!campania) {
    return <div className="card muted">No hay una campaña activa para este grupo.</div>
  }

  // Precio oficial del grano elegido (última pizarra no nula; no editable).
  const precioHoy = ultimoPrecioDe(precios, grano).precio

  // Calculadora bidireccional tn ↔ pesos, por línea, al precio del grano elegido.
  const setLinea = (i, patch) => setLineas(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const onTn = (i, raw) => {
    const n = parseFloat(raw)
    const pesos = precioHoy && raw !== '' && !isNaN(n) ? String(Math.round(n * precioHoy)) : ''
    setLinea(i, { tn: raw, pesos })
  }
  const onPesos = (i, raw) => {
    const n = parseFloat(raw)
    const tn = precioHoy && raw !== '' && !isNaN(n) ? String(Math.round((n / precioHoy) * 100) / 100) : ''
    setLinea(i, { pesos: raw, tn })
  }
  // Al cambiar de grano, recalcula los pesos de todas las líneas con el precio nuevo.
  const onGrano = (g) => {
    const p = ultimoPrecioDe(precios, g).precio
    setGrano(g)
    setLineas(ls => ls.map(l => {
      const n = parseFloat(l.tn)
      const pesos = p && l.tn !== '' && !isNaN(n) ? String(Math.round(n * p)) : ''
      return { ...l, pesos }
    }))
  }

  // Cambio de modo: individual = 1 línea; conjunta = arranca en 2.
  const cambiarModo = (m) => {
    setModo(m)
    setMsg(null)
    setLineas(ls => {
      if (m === 'individual') return [ls[0] || lineaVacia()]
      return ls.length >= 2 ? ls : [...ls, ...Array(2 - ls.length).fill(0).map(lineaVacia)]
    })
  }
  const agregarLinea = () => setLineas(ls => [...ls, lineaVacia()])
  const quitarLinea = (i) => setLineas(ls => (ls.length <= 2 ? ls : ls.filter((_, j) => j !== i)))

  // Socios ya elegidos en otras líneas (para no repetir a alguien en una conjunta).
  const usados = (i) => new Set(lineas.filter((_, j) => j !== i).map(l => l.socioId).filter(Boolean))

  // Total en vivo de la operación (suma de líneas cargadas).
  const totTn = lineas.reduce((a, l) => a + (Number(l.tn) || 0), 0)
  const totPesos = lineas.reduce((a, l) => a + (Number(l.pesos) || 0), 0)

  const guardar = async () => {
    const validas = lineas.filter(l => l.socioId && Number(l.tn) > 0)
    if (modo === 'individual' && validas.length < 1) {
      setMsg({ ok: false, txt: 'Completá socio y toneladas (> 0).' }); return
    }
    if (modo === 'conjunta' && validas.length < 2) {
      setMsg({ ok: false, txt: 'Una venta conjunta necesita al menos 2 socios con toneladas.' }); return
    }
    const ids = validas.map(l => l.socioId)
    if (new Set(ids).size !== ids.length) {
      setMsg({ ok: false, txt: 'Hay un socio repetido en la venta conjunta.' }); return
    }
    if (!(Number(precioHoy) > 0)) {
      setMsg({ ok: false, txt: `No hay precio de ${labelGrano(grano)} cargado; no se puede facturar.` }); return
    }
    setGuardando(true); setMsg(null)
    try {
      await registrarOperacion({
        grupoId: grupo.id, campaniaId: campania.id,
        fecha, precioSoja: precioHoy, grano,
        lineas: validas.map(l => ({ socioId: l.socioId, toneladas: l.tn })),
      })
      const n = validas.length
      setMsg({ ok: true, txt: n > 1 ? `Venta conjunta registrada (${n} socios).` : 'Venta registrada.' })
      setLineas(modo === 'conjunta' ? [lineaVacia(), lineaVacia()] : [lineaVacia()])
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

        {/* Tipo de venta: individual (un socio) o conjunta (varios reparten) */}
        <div className="modo-seg" role="tablist" aria-label="Tipo de venta">
          <button type="button" role="tab" aria-selected={modo === 'individual'}
            className={'modo-seg-btn' + (modo === 'individual' ? ' on' : '')}
            onClick={() => cambiarModo('individual')}>
            <span className="modo-seg-ico" aria-hidden="true">👤</span> Individual
          </button>
          <button type="button" role="tab" aria-selected={modo === 'conjunta'}
            className={'modo-seg-btn' + (modo === 'conjunta' ? ' on' : '')}
            onClick={() => cambiarModo('conjunta')}>
            <span className="modo-seg-ico" aria-hidden="true">👥</span> Conjunta
          </button>
        </div>
        <div className="modo-hint">
          {modo === 'individual'
            ? 'La venta la hace un solo socio.'
            : 'Una misma venta repartida entre varios socios (cada uno con sus toneladas).'}
        </div>

        {multi && (
          <div className="grano-chips" style={{ marginBottom: 10 }}>
            {granos.map(id => (
              <button type="button" key={id}
                className={'grano-chip' + (grano === id ? ' on' : '')}
                onClick={() => onGrano(id)}>{labelGrano(id)}</button>
            ))}
          </div>
        )}

        {/* Fecha (compartida por toda la operación) */}
        <div className="field-fecha">
          <label htmlFor="venta-fecha">Fecha de la venta</label>
          <input id="venta-fecha" type="date" value={fecha} max={hoy()}
            onChange={e => setFecha(e.target.value)} />
        </div>

        {/* Líneas: 1 en individual, N en conjunta */}
        <div className="lineas">
          {lineas.map((l, i) => {
            const ocupados = usados(i)
            return (
              <div className="linea" key={i}>
                {modo === 'conjunta' && <span className="linea-idx">{i + 1}</span>}
                <div className="linea-campos">
                  <select required value={l.socioId} onChange={e => setLinea(i, { socioId: e.target.value })}>
                    <option value="" disabled>Socio</option>
                    {socios.map(s => (
                      <option key={s.id} value={s.id} disabled={ocupados.has(s.id)}>{s.nombre}</option>
                    ))}
                  </select>
                  <input type="number" min="0" step="0.5" placeholder="Tn" inputMode="decimal"
                    value={l.tn} onChange={e => onTn(i, e.target.value)} />
                  <input type="number" min="0" step="1000" placeholder="Pesos" inputMode="numeric"
                    value={l.pesos} onChange={e => onPesos(i, e.target.value)} />
                </div>
                {modo === 'conjunta' && (
                  <button type="button" className="linea-x" aria-label="quitar socio"
                    disabled={lineas.length <= 2} onClick={() => quitarLinea(i)}>×</button>
                )}
              </div>
            )
          })}
        </div>

        {modo === 'conjunta' && (
          <button type="button" className="linea-add" onClick={agregarLinea}>+ Agregar socio</button>
        )}

        <div className="venta-rate">
          {precioHoy ? (
            <>Cotización {multi ? labelGrano(grano) + ' ' : ''}de hoy <b>${FMT(precioHoy)}/tn</b>
              {totTn > 0
                ? <> · {modo === 'conjunta' ? 'total ' : ''}{FTN(totTn)} tn = <b className="soja">${FMT(totPesos)}</b></>
                : ' · tipeá toneladas o pesos y se calcula solo'}</>
          ) : `Sin precio de ${labelGrano(grano)} — no se puede registrar la venta`}
        </div>

        <button className="btn primary" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : (modo === 'conjunta' ? 'Registrar venta conjunta' : 'Registrar venta')}
        </button>
        {msg && <div className={msg.ok ? 'ok' : 'error'}>{msg.txt}</div>}
      </div>

      <div className="card muted historia-cta" style={{ marginTop: 12 }}>
        El detalle de todas las ventas —individuales y conjuntas, por socio y por fecha— está en la pestaña <b>Historia</b>.
      </div>
    </div>
  )
}
