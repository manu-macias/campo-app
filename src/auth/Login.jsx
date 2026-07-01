import { iniciarSesion } from '../lib/nativeAuth.js'

export default function Login() {
  const entrar = async (provider) => {
    // Web: redirect al origin. Nativo (Capacitor): OAuth en el navegador del
    // sistema + deep link de vuelta. Todo el detalle vive en nativeAuth.js.
    try {
      await iniciarSesion(provider)
    } catch (error) {
      alert('No se pudo iniciar sesión: ' + error.message)
    }
  }

  return (
    <div className="centro">
      <div className="card login">
        <div className="logo">🌱</div>
        <h1>campo-app</h1>
        <p className="muted">Gestión de ventas para grupos de productores.</p>
        <button className="btn google" onClick={() => entrar('google')}>
          Entrar con Google
        </button>
        <button className="btn apple" onClick={() => entrar('apple')}>
           Entrar con Apple
        </button>
      </div>
    </div>
  )
}
