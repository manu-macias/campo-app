import { useEffect, useState } from 'react'
import { getMiembros, getInvitacionesPendientes, crearInvitacion } from '../lib/db.js'

// Pantalla "Socios": el reparto del grupo con el estado de conexión de cada
// socio (cuenta conectada / invitación enviada / sin cuenta). El admin genera
// códigos de invitación de un solo uso y los comparte por WhatsApp.
export default function Socios({ grupo, socios, usuarioId }) {
  const [miembros, setMiembros] = useState([])
  const [invitaciones, setInvitaciones] = useState([])
  const [sinMigracion, setSinMigracion] = useState(false)
  const [creando, setCreando] = useState(null)   // socio_id con invitación en curso
  const [error, setError] = useState(null)

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

  const compartir = (socio, codigo) => {
    const msg = `Hola ${socio.nombre}! Sumate a "${grupo.nombre}" en campo-app 🌱\n` +
      `1) Entrá a ${window.location.origin} y logueate con Google\n` +
      `2) Elegí "Tengo un código de invitación"\n` +
      `3) Usá este código: ${codigo}\n(el código vence en 7 días)`
    if (navigator.share) {
      navigator.share({ text: msg }).catch(() => {})
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
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

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}
