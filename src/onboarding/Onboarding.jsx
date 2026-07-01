import { useState } from 'react'
import { completarOnboarding } from '../lib/db.js'

const TOTAL_PASOS = 5

export default function Onboarding({ usuario, onListo }) {
  const [paso, setPaso] = useState(0)
  const [nombreUsuario, setNombreUsuario] = useState(usuario?.user_metadata?.full_name || '')
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [cantSocios, setCantSocios] = useState(3)
  const [socios, setSocios] = useState([])
  const [campania, setCampania] = useState({
    nombre: '', anioInicio: new Date().getFullYear(), toneladas: '',
  })
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
      await completarOnboarding({ nombreUsuario, nombreGrupo, socios, campania })
      onListo()
    } catch (e) {
      setError(e.message || 'No se pudo guardar.')
      setGuardando(false)
    }
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
            <button className="btn primary" disabled={!nombreUsuario.trim()}
              onClick={() => setPaso(1)}>Empezar</button>
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
            <div className="row" style={{ marginBottom: 14 }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>Año de inicio</label>
                <input type="number" value={campania.anioInicio}
                  onChange={e => setCampania(c => ({ ...c, anioInicio: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>Toneladas totales</label>
                <input type="number" min="0" value={campania.toneladas}
                  onChange={e => setCampania(c => ({ ...c, toneladas: e.target.value }))}
                  placeholder="Ej. 90" />
              </div>
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setPaso(3)}>Atrás</button>
              <button className="btn primary"
                disabled={guardando || !campania.nombre.trim()}
                onClick={finalizar}>{guardando ? 'Guardando…' : 'Crear mi grupo'}</button>
            </div>
            {error && <div className="error">{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
