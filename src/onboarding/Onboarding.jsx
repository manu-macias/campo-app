import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { completarOnboarding, unirseConCodigo } from '../lib/db.js'
import { GRANOS } from '../lib/scoring.js'

const TOTAL_PASOS = 5

export default function Onboarding({ usuario, onListo }) {
  const [modo, setModo] = useState(null) // null = elegir | 'crear' | 'codigo'
  const [paso, setPaso] = useState(0)
  const [nombreUsuario, setNombreUsuario] = useState(usuario?.user_metadata?.full_name || '')
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [cantSocios, setCantSocios] = useState(3)
  const [socios, setSocios] = useState([])
  const [campania, setCampania] = useState({
    nombre: '', anioInicio: new Date().getFullYear(), dolares: '',
  })
  const [granos, setGranos] = useState(['soja'])
  // Cantidad (tn) por grano del contrato. Se muestra un input por grano elegido.
  const [cantidades, setCantidades] = useState({ soja: '' })
  const toggleGrano = (id) => setGranos(gs =>
    gs.includes(id) ? gs.filter(g => g !== id) : [...gs, id])
  const [codigo, setCodigo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const irAPasoSocios = () => {
    const n = Math.max(1, Math.min(20, Number(cantSocios) || 1))
    setSocios(Array.from({ length: n }, (_, i) => socios[i] || { nombre: '', tn: '' }))
    setPaso(3)
  }
  const setSocio = (i, campo, val) =>
    setSocios(s => s.map((x, j) => (j === i ? { ...x, [campo]: val } : x)))

  const finalizar = async () => {
    setGuardando(true); setError(null)
    try {
      await completarOnboarding({ nombreUsuario, nombreGrupo, socios, campania, granos, cantidades, dolares: campania.dolares })
      onListo()
    } catch (e) {
      setError(e.message || 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const unirme = async () => {
    setGuardando(true); setError(null)
    try {
      await unirseConCodigo({ codigo, nombreUsuario })
      onListo()
    } catch (e) {
      setError(e.message || 'No se pudo validar el código.')
      setGuardando(false)
    }
  }

  // ── Pantalla inicial: crear un grupo nuevo o unirse con un código ──
  if (modo === null) {
    return (
      <div className="centro">
        <div className="card">
          <h2>¡Bienvenido! 👋</h2>
          <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            ¿Arrancás un grupo nuevo o un socio ya te invitó al suyo?
          </p>
          <button className="btn primary" onClick={() => setModo('crear')}>
            Crear mi grupo
          </button>
          <button className="btn ghost" onClick={() => { setModo('codigo'); setError(null) }}>
            Tengo un código de invitación
          </button>
          <button className="btn-texto" onClick={() => supabase.auth.signOut()}>
            Cerrar sesión ({usuario?.email})
          </button>
        </div>
      </div>
    )
  }

  // ── Unirse a un grupo existente con el código recibido ──
  if (modo === 'codigo') {
    return (
      <div className="centro">
        <div className="card">
          <h2>Unirme a un grupo</h2>
          <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            Pegá el código que te mandó el administrador del grupo.
          </p>
          <div className="field" style={{ marginTop: 14 }}>
            <label>¿Cómo te llamás?</label>
            <input type="text" value={nombreUsuario}
              onChange={e => setNombreUsuario(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div className="field">
            <label>Código de invitación</label>
            <input type="text" className="codigo-input" value={codigo} maxLength={12}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ej. K7PMQ2XW" />
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setModo(null)}>Atrás</button>
            <button className="btn primary"
              disabled={guardando || !nombreUsuario.trim() || codigo.trim().length < 6}
              onClick={unirme}>{guardando ? 'Verificando…' : 'Unirme al grupo'}</button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="centro">
      <div className="card">
        <div className="steps">
          {Array.from({ length: TOTAL_PASOS }, (_, i) => (
            <span key={i} className={i <= paso ? 'on' : ''} />
          ))}
        </div>

        {paso === 0 && (
          <>
            <h2>¡Bienvenido! 👋</h2>
            <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              Vamos a configurar tu grupo en un minuto: tu nombre, los socios y el
              contrato de la campaña.
            </p>
            <div className="field" style={{ marginTop: 16 }}>
              <label>¿Cómo te llamás?</label>
              <input type="text" value={nombreUsuario}
                onChange={e => setNombreUsuario(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setModo(null)}>Atrás</button>
              <button className="btn primary" disabled={!nombreUsuario.trim()}
                onClick={() => setPaso(1)}>Empezar</button>
            </div>
          </>
        )}

        {paso === 1 && (
          <>
            <h2>Tu grupo</h2>
            <p className="muted" style={{ fontSize: 14.5 }}>El nombre de la explotación o sociedad.</p>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Nombre del grupo</label>
              <input type="text" value={nombreGrupo}
                onChange={e => setNombreGrupo(e.target.value)} placeholder="Ej. Campo Los Aromos" />
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setPaso(0)}>Atrás</button>
              <button className="btn primary" disabled={!nombreGrupo.trim()}
                onClick={() => setPaso(2)}>Siguiente</button>
            </div>
          </>
        )}

        {paso === 2 && (
          <>
            <h2>¿Cuántos socios son?</h2>
            <p className="muted" style={{ fontSize: 14.5 }}>Después cargás el nombre de cada uno.</p>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Cantidad de socios</label>
              <input type="number" min="1" max="20" value={cantSocios}
                onChange={e => setCantSocios(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setPaso(1)}>Atrás</button>
              <button className="btn primary" onClick={irAPasoSocios}>Siguiente</button>
            </div>
          </>
        )}

        {paso === 3 && (
          <>
            <h2>Los socios</h2>
            <p className="muted" style={{ fontSize: 14.5 }}>
              Nombre y, opcional, las toneladas que le tocan del contrato.
            </p>
            <div style={{ marginTop: 14 }}>
              {socios.map((s, i) => (
                <div className="socio-row" key={i}>
                  <span className="idx">{i + 1}</span>
                  <input className="nombre" type="text" value={s.nombre}
                    onChange={e => setSocio(i, 'nombre', e.target.value)} placeholder="Nombre" />
                  <input className="tn" type="number" min="0" value={s.tn}
                    onChange={e => setSocio(i, 'tn', e.target.value)} placeholder="tn" />
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn ghost" onClick={() => setPaso(2)}>Atrás</button>
              <button className="btn primary"
                disabled={!socios.some(s => s.nombre.trim())}
                onClick={() => setPaso(4)}>Siguiente</button>
            </div>
          </>
        )}

        {paso === 4 && (
          <>
            <h2>El contrato</h2>
            <p className="muted" style={{ fontSize: 14.5 }}>
              Los datos del arrendamiento de la campaña (normalmente anual).
            </p>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Nombre de la campaña</label>
              <input type="text" value={campania.nombre}
                onChange={e => setCampania(c => ({ ...c, nombre: e.target.value }))}
                placeholder="Ej. 2026/2027" />
            </div>
            <div className="field">
              <label>¿Qué granos vas a manejar?</label>
              <div className="grano-chips">
                {GRANOS.map(g => (
                  <button type="button" key={g.id}
                    className={'grano-chip' + (granos.includes(g.id) ? ' on' : '')}
                    onClick={() => toggleGrano(g.id)}>{g.label}</button>
                ))}
              </div>
            </div>

            {granos.length > 0 && (
              <div className="field">
                <label>¿Cuántas toneladas de cada uno? (las del contrato)</label>
                <div className="stock-inputs">
                  {GRANOS.filter(g => granos.includes(g.id)).map(g => (
                    <div className="stock-input-row" key={g.id}>
                      <span className="stock-ico">{g.emoji}</span>
                      <span className="stock-nombre">{g.label}</span>
                      <input type="number" min="0" value={cantidades[g.id] ?? ''}
                        onChange={e => setCantidades(c => ({ ...c, [g.id]: e.target.value }))}
                        placeholder="tn" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="row" style={{ marginBottom: 14 }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>Año de inicio</label>
                <input type="number" value={campania.anioInicio}
                  onChange={e => setCampania(c => ({ ...c, anioInicio: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>Dólares en stock <span className="muted">(opcional)</span></label>
                <input type="number" min="0" value={campania.dolares}
                  onChange={e => setCampania(c => ({ ...c, dolares: e.target.value }))}
                  placeholder="US$" />
              </div>
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setPaso(3)}>Atrás</button>
              <button className="btn primary"
                disabled={guardando || !campania.nombre.trim() || granos.length === 0}
                onClick={finalizar}>{guardando ? 'Guardando…' : 'Crear mi grupo'}</button>
            </div>
            {error && <div className="error">{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
