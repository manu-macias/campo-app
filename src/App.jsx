import { useEffect, useState } from 'react'
import { supabase, supabaseConfigurado } from './supabaseClient.js'
import { getPerfil } from './lib/db.js'
import Login from './auth/Login.jsx'
import Onboarding from './onboarding/Onboarding.jsx'
import Dashboard from './dashboard/Dashboard.jsx'

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState(null)
  const [perfil, setPerfil] = useState(null)

  // Escuchamos la sesión de Supabase (login / logout / refresh de token).
  useEffect(() => {
    if (!supabaseConfigurado) { setCargando(false); return }
    // getSession() lee el token guardado en el navegador SIN validarlo contra el
    // servidor. Si el usuario fue borrado (ej. al resetear para testear), el token
    // queda "zombie": la app te cree logueado pero cualquier escritura falla. Por
    // eso validamos con getUser() y, si no existe, cerramos sesión → login limpio.
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: u, error } = await supabase.auth.getUser()
        if (error || !u?.user) { await supabase.auth.signOut(); setSesion(null); return }
      }
      setSesion(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Cuando hay sesión, buscamos el perfil para saber si ya hizo el onboarding.
  useEffect(() => {
    if (!supabaseConfigurado) return
    if (!sesion) { setPerfil(null); setCargando(false); return }
    setCargando(true)
    getPerfil().then(p => { setPerfil(p); setCargando(false) }).catch(() => setCargando(false))
  }, [sesion])

  const recargarPerfil = () => getPerfil().then(setPerfil)

  if (!supabaseConfigurado) return <AvisoConfig />
  if (cargando) return <div className="centro muted">Cargando…</div>
  if (!sesion) return <Login />
  if (!perfil?.grupo_id) return <Onboarding usuario={sesion.user} onListo={recargarPerfil} />
  return <Dashboard perfil={perfil} />
}

function AvisoConfig() {
  return (
    <div className="centro">
      <div className="card">
        <h2>Falta configurar Supabase</h2>
        <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
          Copiá <code>.env.example</code> a <code>.env</code> y completá
          <code> VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> con
          los datos de tu proyecto en Supabase. Después reiniciá el dev server.
        </p>
      </div>
    </div>
  )
}
