import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getCampaniaActiva, getSocios, getVentas, getPrecios } from '../lib/db.js'
import Decision from './Decision.jsx'
import Ventas from './Ventas.jsx'
import Precios from './Precios.jsx'
import Socios from './Socios.jsx'
import Perfil from './Perfil.jsx'

// El orden de este array define el orden en la barra (izq. → der.) y cuál es la
// pestaña por defecto (índice 0). El contenido se resuelve por NOMBRE más abajo,
// así reordenar acá alcanza para cambiar la navegación sin tocar nada más.
const TABS = ['Ventas', 'Decisión', 'Precios', 'Socios']

export default function Dashboard({ perfil }) {
  const grupo = perfil.grupos
  const [tab, setTab] = useState(0)
  const [data, setData] = useState({ campania: null, socios: [], ventas: [], precios: [] })
  const [cargando, setCargando] = useState(true)

  const cargar = async () => {
    if (!grupo) return
    const campania = await getCampaniaActiva(grupo.id)
    const [socios, precios] = await Promise.all([getSocios(grupo.id), getPrecios()])
    const ventas = campania ? await getVentas(campania.id) : []
    setData({ campania, socios, ventas, precios })
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  // El perfil apunta a un grupo que ya no puede ver (lo desvincularon o el
  // grupo se borró): se le suelta el puntero y vuelve al onboarding, donde
  // puede crear su grupo o unirse a otro con un código.
  const empezarDeNuevo = async () => {
    await supabase.from('perfiles').update({ grupo_id: null }).eq('id', perfil.id)
    window.location.reload()
  }
  if (!grupo) {
    return (
      <div className="centro">
        <div className="card">
          <h2>Sin acceso al grupo</h2>
          <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            Ya no formás parte de este grupo (te desvincularon o fue eliminado).
            Tus datos personales están intactos: podés crear tu propio grupo o
            unirte a otro con un código de invitación.
          </p>
          <button className="btn primary" onClick={empezarDeNuevo}>Continuar</button>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="appbar">
        <div className="brand">🌱 {grupo?.nombre || 'campo-app'}</div>
        <button className={'perfil-btn' + (tab === 'perfil' ? ' on' : '')}
          aria-label="Mi perfil" onClick={() => setTab('perfil')}>
          {(perfil?.nombre || '?').trim().charAt(0).toUpperCase()}
        </button>
      </div>

      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={i} className={'tab' + (tab === i ? ' on' : '')} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {cargando ? (
        <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Cargando…</div>
      ) : tab === 'perfil' ? (
        <Perfil perfil={perfil} campania={data.campania} />
      ) : TABS[tab] === 'Ventas' ? (
        <Ventas grupo={grupo} campania={data.campania} socios={data.socios}
          ventas={data.ventas} precios={data.precios} onCambio={cargar} />
      ) : TABS[tab] === 'Decisión' ? (
        <Decision precios={data.precios} />
      ) : TABS[tab] === 'Precios' ? (
        <Precios precios={data.precios} />
      ) : TABS[tab] === 'Socios' ? (
        <Socios grupo={grupo} socios={data.socios} usuarioId={perfil.id} onCambio={cargar} />
      ) : null}
    </div>
  )
}
