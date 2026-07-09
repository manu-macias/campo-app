import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getCampaniaActiva, getSocios, getVentas, getPrecios } from '../lib/db.js'
import Decision from './Decision.jsx'
import Ventas from './Ventas.jsx'
import Precios from './Precios.jsx'
import Socios from './Socios.jsx'

const TABS = ['Decisión', 'Ventas', 'Precios', 'Socios']

export default function Dashboard({ perfil }) {
  const grupo = perfil.grupos
  const [tab, setTab] = useState(0)
  const [data, setData] = useState({ campania: null, socios: [], ventas: [], precios: [] })
  const [cargando, setCargando] = useState(true)

  const cargar = async () => {
    const campania = await getCampaniaActiva(grupo.id)
    const [socios, precios] = await Promise.all([getSocios(grupo.id), getPrecios()])
    const ventas = campania ? await getVentas(campania.id) : []
    setData({ campania, socios, ventas, precios })
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  return (
    <div className="app">
      <div className="appbar">
        <div className="brand">🌱 {grupo?.nombre || 'campo-app'}</div>
        <button className="btn ghost btn-sm" onClick={() => supabase.auth.signOut()}>Salir</button>
      </div>

      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={i} className={'tab' + (tab === i ? ' on' : '')} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {cargando ? (
        <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Cargando…</div>
      ) : tab === 0 ? (
        <Decision precios={data.precios} />
      ) : tab === 1 ? (
        <Ventas grupo={grupo} campania={data.campania} socios={data.socios}
          ventas={data.ventas} precios={data.precios} onCambio={cargar} />
      ) : tab === 2 ? (
        <Precios precios={data.precios} />
      ) : (
        <Socios grupo={grupo} socios={data.socios} usuarioId={perfil.id} />
      )}
    </div>
  )
}
