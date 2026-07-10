import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import {
  actualizarNombre, getMisGrupos, cambiarGrupoActivo,
  salirDelGrupo, eliminarCuenta, unirseConCodigo,
} from '../lib/db.js'

export default function Perfil({ perfil }) {
  const [user, setUser] = useState(null)
  const [nombre, setNombre] = useState(perfil?.nombre || '')
  const [misGrupos, setMisGrupos] = useState([])
  const [codigo, setCodigo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirmSalir, setConfirmSalir] = useState(false)
  const [confirmBorrar, setConfirmBorrar] = useState(0) // 0=oculto, 1=primer aviso, 2=confirmado

  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    setMisGrupos(await getMisGrupos())
  }
  useEffect(() => { cargar() }, [])

  const grupoActual = misGrupos.find(m => m.grupos.id === perfil?.grupo_id)
  const email = user?.email || ''
  const foto = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || ''
  const inicial = (nombre || email || '?').trim().charAt(0).toUpperCase()

  const guardarNombre = async () => {
    if (!nombre.trim()) return
    setGuardando(true); setMsg(null)
    try {
      await actualizarNombre(nombre)
      setMsg({ ok: true, txt: 'Nombre actualizado.' })
    } catch (e) { setMsg({ ok: false, txt: e.message }) }
    finally { setGuardando(false) }
  }

  const cambiar = async (grupoId) => {
    if (grupoId === perfil?.grupo_id) return
    setGuardando(true); setMsg(null)
    try { await cambiarGrupoActivo(grupoId); window.location.reload() }
    catch (e) { setMsg({ ok: false, txt: e.message }); setGuardando(false) }
  }

  const usarCodigo = async () => {
    if (codigo.trim().length < 6) return
    setGuardando(true); setMsg(null)
    try { await unirseConCodigo({ codigo }); window.location.reload() }
    catch (e) { setMsg({ ok: false, txt: e.message }); setGuardando(false) }
  }

  const salir = async () => {
    setGuardando(true); setMsg(null)
    try { await salirDelGrupo(perfil.grupo_id); window.location.reload() }
    catch (e) { setMsg({ ok: false, txt: e.message }); setGuardando(false); setConfirmSalir(false) }
  }

  const borrar = async () => {
    setGuardando(true); setMsg(null)
    try { await eliminarCuenta(); window.location.reload() }
    catch (e) { setMsg({ ok: false, txt: e.message }); setGuardando(false); setConfirmBorrar(0) }
  }

  return (
    <div>
      {/* Identidad */}
      <div className="card">
        <div className="perfil-top">
          {foto
            ? <img className="perfil-foto" src={foto} alt="" />
            : <div className="perfil-foto perfil-inicial">{inicial}</div>}
          <div style={{ minWidth: 0 }}>
            <div className="perfil-nombre">{nombre || 'Sin nombre'}</div>
            <div className="perfil-email">{email}</div>
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Tu nombre</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre" />
        </div>
        <button className="btn primary" disabled={guardando || !nombre.trim() || nombre === perfil?.nombre}
          onClick={guardarNombre}>Guardar nombre</button>
      </div>

      {/* Grupo actual */}
      {grupoActual && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-title">Grupo actual</div>
          <div className="kv"><span>Grupo</span><span>{grupoActual.grupos.nombre}</span></div>
          <div className="kv"><span>Tu rol</span><span>{grupoActual.rol === 'admin' ? 'Administrador' : 'Socio'}</span></div>
          {!confirmSalir ? (
            <button className="btn ghost" onClick={() => { setConfirmSalir(true); setMsg(null) }}>
              Salir de este grupo
            </button>
          ) : (
            <div className="confirm-box">
              <span style={{ flex: 1 }}>Vas a dejar de ver los datos de <b>{grupoActual.grupos.nombre}</b>. Podés volver con una invitación.</span>
              <button className="btn-chico" onClick={() => setConfirmSalir(false)}>Cancelar</button>
              <button className="btn-chico rojo" disabled={guardando} onClick={salir}>
                {guardando ? 'Saliendo…' : 'Salir'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cambiar de grupo */}
      {misGrupos.length > 1 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-title">Cambiar de grupo</div>
          {misGrupos.map(m => (
            <button key={m.grupos.id}
              className={'grupo-item' + (m.grupos.id === perfil?.grupo_id ? ' activo' : '')}
              disabled={guardando} onClick={() => cambiar(m.grupos.id)}>
              <span>{m.grupos.nombre}</span>
              <span className="grupo-rol">
                {m.grupos.id === perfil?.grupo_id ? 'Viendo ahora' : (m.rol === 'admin' ? 'Admin' : 'Socio')}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Unirme a otro grupo */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">Unirme a otro grupo</div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 10px' }}>
          Pegá un código de invitación para sumarte a otro grupo.
        </p>
        <div className="field">
          <input type="text" className="codigo-input" value={codigo} maxLength={12}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ej. K7PMQ2XW" />
        </div>
        <button className="btn primary" disabled={guardando || codigo.trim().length < 6}
          onClick={usarCodigo}>Unirme con código</button>
      </div>

      {msg && <div className={'card ' + (msg.ok ? 'ok' : 'error')} style={{ marginTop: 12 }}>{msg.txt}</div>}

      {/* Sesión y cuenta */}
      <div className="card" style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>

        {confirmBorrar === 0 && (
          <button className="btn-peligro" onClick={() => { setConfirmBorrar(1); setMsg(null) }}>
            Eliminar mi cuenta
          </button>
        )}
        {confirmBorrar === 1 && (
          <div className="confirm-box" style={{ marginTop: 10 }}>
            <span style={{ flex: 1 }}>
              Vas a <b>eliminar tu cuenta</b>: se borran tu perfil y tus datos, y salís de todos los grupos.
              Los grupos donde sos el único integrante se eliminan por completo. No se puede deshacer.
            </span>
            <button className="btn-chico" onClick={() => setConfirmBorrar(0)}>Cancelar</button>
            <button className="btn-chico rojo" onClick={() => setConfirmBorrar(2)}>Continuar</button>
          </div>
        )}
        {confirmBorrar === 2 && (
          <div className="confirm-box" style={{ marginTop: 10 }}>
            <span style={{ flex: 1 }}>¿Seguro? Confirmá por última vez para eliminar tu cuenta.</span>
            <button className="btn-chico" onClick={() => setConfirmBorrar(0)}>No, cancelar</button>
            <button className="btn-chico rojo" disabled={guardando} onClick={borrar}>
              {guardando ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
