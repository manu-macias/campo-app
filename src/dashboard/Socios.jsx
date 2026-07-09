import { useEffect, useState } from 'react'
import { getMiembros, getInvitacionesPendientes, crearInvitacion, agregarSocio, unirseConCodigo } from '../lib/db.js'

// Pantalla "Socios": el reparto del grupo con el estado de conexión de cada
// socio (cuenta conectada / invitación enviada / sin cuenta). El admin genera
// códigos de invitación de un solo uso y los comparte por WhatsApp.
export default function Socios({ grupo, socios, usuarioId, onCambio }) {
  const [miembros, setMiembros] = useState([])
  const [invitaciones, setInvitaciones] = useState([])
  const [sinMigracion, setSinMigracion] = useState(false)
  const [creando, setCreando] = useState(null)   // socio_id con invitación en curso
  const [error, setError] = useState(null)
  const [nuevo, setNuevo] = useState(null)       // { nombre, tn } — form "agregar socio"
  const [codigo, setCodigo] = useState(null)     // string — form "unirme a otro grupo"
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    try {
      const [m, inv] = await Promise.all([
        getMiembros(grupo.id),
        getInvitacionesPendientes(grupo.id),
      ])
      setMiembros(m); setInvitaciones(inv)
    } catch {
      // La tabla miembros todavía no existe: falta aplicar la migración.
      setSinMigracion(true)
    }
  }
  useEffect(() => { cargar() }, [grupo.id])

  const soyAdmin = miembros.some(m => m.user_id === usuarioId && m.rol === 'admin')

  const invitacionDe = (socio) =>
    invitaciones.find(i => i.socio_id === socio.id) || null

  const estadoDe = (socio) => {
    if (miembros.some(m => m.socio_id === socio.id)) return 'conectado'
    if (invitacionDe(socio)) return 'pendiente'
    return 'sin-cuenta'
  }

  const invitar = async (socio) => {
    setCreando(socio.id); setError(null)
    try {
      await crearInvitacion(grupo.id, socio.id)
      await cargar() // la invitación nueva aparece como pendiente con su código
    } catch (e) {
      setError(e.message || 'No se pudo crear la invitación.')
    } finally {
      setCreando(null)
    }
  }

  const compartir = (socio, cod) => {
    const msg = `Hola ${socio.nombre}! Sumate a "${grupo.nombre}" en campo-app 🌱\n` +
      `1) Entrá a ${window.location.origin} y logueate con Google\n` +
      `2) Andá a la pestaña Socios (o "Tengo un código de invitación" si sos nuevo)\n` +
      `3) Usá este código: ${cod}\n(el código vence en 7 días)`
    if (navigator.share) {
      navigator.share({ text: msg }).catch(() => {})
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
    }
  }

  // Suma un socio nuevo al reparto (solo admin) y refresca el dashboard.
  const guardarSocio = async () => {
    if (!nuevo?.nombre?.trim()) return
    setGuardando(true); setError(null)
    try {
      await agregarSocio({ grupoId: grupo.id, nombre: nuevo.nombre, tn: nuevo.tn })
      setNuevo(null)
      await onCambio?.()
    } catch (e) {
      setError(e.message || 'No se pudo agregar el socio.')
    } finally {
      setGuardando(false)
    }
  }

  // Canjea un código estando YA logueado (usuario con cuenta/grupo previo):
  // lo suma al grupo nuevo y recarga la app apuntando a ese grupo.
  const canjearCodigo = async () => {
    if (!codigo?.trim()) return
    setGuardando(true); setError(null)
    try {
      await unirseConCodigo({ codigo })
      window.location.reload()
    } catch (e) {
      setError(e.message || 'No se pudo validar el código.')
      setGuardando(false)
    }
  }

  if (sinMigracion) {
    return (
      <div className="card muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        Para habilitar los grupos compartidos falta aplicar la migración
        <code> supabase/miembros.sql</code> en el SQL Editor de Supabase.
      </div>
    )
  }

  const CHIP = {
    'conectado':  { cls: 'conectado', txt: 'Conectado' },
    'pendiente':  { cls: 'pendiente', txt: 'Invitación enviada' },
    'sin-cuenta': { cls: 'sin',       txt: 'Sin cuenta' },
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">{grupo.nombre} · {socios.length} socios</div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 6px' }}>
          Cada socio puede tener su propia cuenta y ver las ventas del grupo.
          {soyAdmin ? ' Invitalo con un código y mandáselo por WhatsApp.' : ''}
        </p>

        {socios.map((s) => {
          const estado = estadoDe(s)
          const inv = invitacionDe(s)
          const chip = CHIP[estado]
          return (
            <div key={s.id}>
              <div className="socio-item">
                <div style={{ minWidth: 0 }}>
                  <div className="nombre">{s.nombre}</div>
                  {Number(s.participacion_valor) > 0 && (
                    <div className="part">
                      {s.participacion_valor}{s.participacion_tipo === 'pct' ? '%' : ' tn'} del contrato
                    </div>
                  )}
                </div>
                <span className={'chip ' + chip.cls}>{chip.txt}</span>
                {soyAdmin && estado === 'sin-cuenta' && (
                  <button className="btn-chico" disabled={creando === s.id}
                    onClick={() => invitar(s)}>
                    {creando === s.id ? 'Creando…' : 'Invitar'}
                  </button>
                )}
                {soyAdmin && estado === 'pendiente' && (
                  <button className="btn-chico lima" onClick={() => compartir(s, inv.codigo)}>
                    Compartir
                  </button>
                )}
              </div>
              {soyAdmin && estado === 'pendiente' && (
                <div className="codigo-box">
                  Código: <b>{inv.codigo}</b> · vence el{' '}
                  {new Date(inv.expira_at).toLocaleDateString('es-AR')}
                </div>
              )}
            </div>
          )
        })}

        {soyAdmin && (
          nuevo === null ? (
            <button className="btn-chico" style={{ marginTop: 12 }}
              onClick={() => setNuevo({ nombre: '', tn: '' })}>
              + Agregar socio
            </button>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div className="socio-row" style={{ marginBottom: 8 }}>
                <input className="nombre" type="text" value={nuevo.nombre} placeholder="Nombre"
                  onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} />
                <input className="tn" type="number" min="0" value={nuevo.tn} placeholder="tn"
                  onChange={e => setNuevo(n => ({ ...n, tn: e.target.value }))} />
              </div>
              <div className="row">
                <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setNuevo(null)}>Cancelar</button>
                <button className="btn primary" style={{ marginTop: 0 }}
                  disabled={guardando || !nuevo.nombre.trim()}
                  onClick={guardarSocio}>{guardando ? 'Guardando…' : 'Agregar'}</button>
              </div>
            </div>
          )
        )}

        {error && <div className="error">{error}</div>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">¿Te invitaron a otro grupo?</div>
        {codigo === null ? (
          <button className="btn-chico" onClick={() => setCodigo('')}>
            Usar un código de invitación
          </button>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 10px' }}>
              Pegá el código que te mandaron y pasás a ver ese grupo.
            </p>
            <div className="field">
              <input type="text" className="codigo-input" value={codigo} maxLength={12}
                autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ej. K7PMQ2XW" />
            </div>
            <div className="row">
              <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => { setCodigo(null); setError(null) }}>Cancelar</button>
              <button className="btn primary" style={{ marginTop: 0 }}
                disabled={guardando || codigo.trim().length < 6}
                onClick={canjearCodigo}>{guardando ? 'Verificando…' : 'Unirme'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
