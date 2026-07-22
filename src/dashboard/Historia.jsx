import { useEffect, useMemo, useState } from 'react'
import { FMT, labelGrano } from '../lib/scoring.js'
import { compartirTicketReparto } from '../lib/ticket.js'

const FTN = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const fmtFecha = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
const DIA = 86400000

// Barra de progreso venta → cobro. Avanza contra `now` (que refresca cada 60s
// en el componente padre), así que el timing es preciso al minuto sin costo.
function ProgresoCobro({ fecha, dias, now }) {
  const inicio = new Date(fecha + 'T00:00:00').getTime()
  const fin = inicio + dias * DIA
  const total = fin - inicio
  const pct = total > 0 ? Math.min(100, Math.max(0, ((now - inicio) / total) * 100)) : 100
  const cobrado = now >= fin
  const restMs = fin - now
  const fechaCobro = new Date(fin)
  const fCobro = `${String(fechaCobro.getDate()).padStart(2, '0')}/${String(fechaCobro.getMonth() + 1).padStart(2, '0')}/${fechaCobro.getFullYear()}`

  let texto
  if (cobrado) texto = 'Cobrado'
  else if (restMs >= DIA) texto = `Faltan ${Math.ceil(restMs / DIA)} días`
  else texto = `Falta ${Math.max(1, Math.ceil(restMs / 3600000))} h`

  return (
    <div className={'cobro' + (cobrado ? ' cobrado' : '')}>
      <div className="cobro-bar">
        <div className="cobro-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="cobro-meta">
        <span className="cobro-estado">{texto}</span>
        <span className="cobro-fecha">{cobrado ? 'el ' : 'cobro '}{fCobro} · {dias} d</span>
      </div>
    </div>
  )
}

const VISTAS = [
  { id: 'operaciones', label: 'Operaciones' },
  { id: 'socios', label: 'Por socio' },
]
const FILTROS = [
  { id: 'todas', label: 'Todas' },
  { id: 'individual', label: 'Individuales' },
  { id: 'conjunta', label: 'Conjuntas' },
]

// Icono flecha (chevron) reutilizado en las cabeceras colapsables.
const Chevron = ({ open }) => (
  <span className={'venta-dia-chev' + (open ? ' open' : '')} aria-hidden="true">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  </span>
)

export default function Historia({ campania, socios, ventas }) {
  const granos = (campania?.granos?.length ? campania.granos : ['soja'])
  const multi = granos.length > 1

  const [vista, setVista] = useState('operaciones')
  const [filtro, setFiltro] = useState('todas')
  const [abierto, setAbierto] = useState({}) // qué tarjetas están expandidas
  const toggle = (k) => setAbierto(a => ({ ...a, [k]: !a[k] }))

  // Reloj para las barras de progreso de cobro: refresca cada 60s (barato) para
  // que avancen solas mientras la pantalla está abierta.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  // Una operación = todas las filas que comparten operacion_id. Las ventas
  // viejas (sin id) caen por fecha+grano, que era como se agrupaban antes.
  const operaciones = useMemo(() => {
    const map = {}
    for (const v of ventas) {
      const grano = v.grano || 'soja'
      const key = v.operacion_id || `legacy|${v.fecha}|${grano}`
      const imp = Number(v.importe) || Number(v.toneladas) * Number(v.precio_soja)
      if (!map[key]) map[key] = { key, fecha: v.fecha, grano, tn: 0, importe: 0, diasCobro: v.dias_cobro ?? null, socios: {} }
      map[key].tn += Number(v.toneladas)
      map[key].importe += imp
      const nombre = v.socios?.nombre || '—'
      const sk = v.socio_id || nombre
      if (!map[key].socios[sk]) map[key].socios[sk] = { nombre, tn: 0, importe: 0 }
      map[key].socios[sk].tn += Number(v.toneladas)
      map[key].socios[sk].importe += imp
    }
    return Object.values(map)
      .map(o => {
        const socs = Object.values(o.socios)
        return { ...o, socios: socs, tipo: socs.length >= 2 ? 'conjunta' : 'individual' }
      })
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.grano.localeCompare(b.grano)))
  }, [ventas])

  const opsFiltradas = filtro === 'todas' ? operaciones : operaciones.filter(o => o.tipo === filtro)

  const conteo = useMemo(() => ({
    total: operaciones.length,
    individual: operaciones.filter(o => o.tipo === 'individual').length,
    conjunta: operaciones.filter(o => o.tipo === 'conjunta').length,
    importe: operaciones.reduce((a, o) => a + o.importe, 0),
  }), [operaciones])

  // Registro por socio: qué vendió cada uno, con sus operaciones al detalle.
  const porSocio = useMemo(() => {
    const m = {}
    for (const v of ventas) {
      const k = v.socio_id
      const nombre = v.socios?.nombre || '—'
      const grano = v.grano || 'soja'
      const imp = Number(v.importe) || Number(v.toneladas) * Number(v.precio_soja)
      const opKey = v.operacion_id || `legacy|${v.fecha}|${grano}`
      if (!m[k]) m[k] = { nombre, importe: 0, tnPorGrano: {}, ops: {} }
      m[k].importe += imp
      m[k].tnPorGrano[grano] = (m[k].tnPorGrano[grano] || 0) + Number(v.toneladas)
      if (!m[k].ops[opKey]) m[k].ops[opKey] = { fecha: v.fecha, grano, tn: 0, importe: 0, diasCobro: v.dias_cobro ?? null }
      m[k].ops[opKey].tn += Number(v.toneladas)
      m[k].ops[opKey].importe += imp
    }
    // El tipo de cada op de un socio depende de cuántos socios tuvo esa op en total.
    const opMeta = {}
    for (const o of operaciones) opMeta[o.key] = { tipo: o.tipo, nsoc: o.socios.length }
    return Object.values(m).map(s => ({
      ...s,
      ops: Object.entries(s.ops)
        .map(([key, o]) => ({ ...o, tipo: opMeta[key]?.tipo || 'individual', nsoc: opMeta[key]?.nsoc || 1 }))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    })).sort((a, b) => b.importe - a.importe)
  }, [ventas, operaciones])

  const tnGranoTexto = (mapa) => Object.entries(mapa)
    .map(([g, tn]) => multi ? `${FTN(tn)} ${labelGrano(g)}` : `${FTN(tn)} tn`)
    .join(' · ') || '—'

  const TipoBadge = ({ tipo, n }) => (
    <span className={'tipo-badge ' + tipo}>
      {tipo === 'conjunta' ? `Conjunta · ${n}` : 'Individual'}
    </span>
  )

  if (!campania) {
    return <div className="card muted">No hay una campaña activa para este grupo.</div>
  }

  return (
    <div>
      <div className="card">
        <div className="hist-head">
          <div>
            <div className="hist-title">Historia de ventas</div>
            <div className="hist-sub">{campania.nombre}</div>
          </div>
          <div className="hist-total">
            <span className="soja">${FMT(conteo.importe)}</span>
            <small>{conteo.total} {conteo.total === 1 ? 'operación' : 'operaciones'}</small>
          </div>
        </div>

        {/* Selector de vista: operaciones (cronológico) vs por socio */}
        <div className="seg" role="tablist" aria-label="Vista del historial">
          {VISTAS.map(v => (
            <button key={v.id} role="tab" aria-selected={vista === v.id}
              className={'seg-btn' + (vista === v.id ? ' on' : '')}
              onClick={() => setVista(v.id)}>{v.label}</button>
          ))}
        </div>

        {operaciones.length === 0 ? (
          <div className="hist-empty">
            <div className="hist-empty-ico" aria-hidden="true">🧾</div>
            <div>Todavía no hay ventas registradas.</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Registrá una en la pestaña <b>Ventas</b> y va a aparecer acá.
            </div>
          </div>
        ) : vista === 'operaciones' ? (
          <>
            {/* Filtro por tipo — el eje del pedido: separar conjuntas de individuales */}
            <div className="hist-filtros">
              {FILTROS.map(f => {
                const n = f.id === 'todas' ? conteo.total : conteo[f.id]
                return (
                  <button key={f.id}
                    className={'filtro-chip' + (filtro === f.id ? ' on' : '')}
                    onClick={() => setFiltro(f.id)}>
                    {f.label} <span className="filtro-n">{n}</span>
                  </button>
                )
              })}
            </div>

            {opsFiltradas.length === 0 ? (
              <div className="muted" style={{ fontSize: 13.5, padding: '10px 2px' }}>
                No hay ventas {filtro === 'conjunta' ? 'conjuntas' : 'individuales'} todavía.
              </div>
            ) : opsFiltradas.map((o) => (
              <div className="venta-dia" key={o.key}>
                <button className="venta-dia-head op-head" onClick={() => toggle(o.key)} aria-expanded={!!abierto[o.key]}>
                  <Chevron open={!!abierto[o.key]} />
                  <span className="op-main">
                    <span className="op-row1">
                      {multi && <span className="grano-tag">{labelGrano(o.grano)}</span>}
                      <span className="op-fecha">{fmtFecha(o.fecha)}</span>
                      <TipoBadge tipo={o.tipo} n={o.socios.length} />
                    </span>
                    <span className="op-row2">{FTN(o.tn)} tn · <b className="soja">${FMT(o.importe)}</b></span>
                  </span>
                </button>
                {o.diasCobro != null && <ProgresoCobro fecha={o.fecha} dias={o.diasCobro} now={now} />}
                {abierto[o.key] && (
                  <div className="venta-dia-body">
                    <table className="tabla">
                      <tbody>
                        {o.socios.map((s, i) => (
                          <tr key={i}>
                            <td style={{ textAlign: 'left' }}>{s.nombre}</td>
                            <td>{FTN(s.tn)} tn</td>
                            <td className="soja">${FMT(s.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="venta-ticket-btn" onClick={() => compartirTicketReparto({
                      fecha: o.fecha, grano: labelGrano(o.grano), filas: o.socios,
                      totalTn: o.tn, totalImporte: o.importe,
                      precio: o.tn ? Math.round(o.importe / o.tn) : 0,
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
            ))}
          </>
        ) : (
          /* Vista por socio: registro de lo que hizo cada uno */
          porSocio.map((s, si) => {
            const k = 'socio-' + si
            return (
              <div className="venta-dia" key={k}>
                <button className="venta-dia-head op-head" onClick={() => toggle(k)} aria-expanded={!!abierto[k]}>
                  <Chevron open={!!abierto[k]} />
                  <span className="op-main">
                    <span className="op-row1">
                      <span className="op-fecha">{s.nombre}</span>
                      <span className="socio-nops">{s.ops.length} {s.ops.length === 1 ? 'venta' : 'ventas'}</span>
                    </span>
                    <span className="op-row2">{tnGranoTexto(s.tnPorGrano)} · <b className="soja">${FMT(s.importe)}</b></span>
                  </span>
                </button>
                {abierto[k] && (
                  <div className="venta-dia-body">
                    <div className="socio-op-list">
                      {s.ops.map((o, i) => (
                        <div className="socio-op" key={i}>
                          <div className="op-row1">
                            {multi && <span className="grano-tag">{labelGrano(o.grano)}</span>}
                            <span className="op-fecha">{fmtFecha(o.fecha)}</span>
                            <TipoBadge tipo={o.tipo} n={o.nsoc} />
                          </div>
                          <div className="op-row2">{FTN(o.tn)} tn · <b className="soja">${FMT(o.importe)}</b></div>
                          {o.diasCobro != null && <ProgresoCobro fecha={o.fecha} dias={o.diasCobro} now={now} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
