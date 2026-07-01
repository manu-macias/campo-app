import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { iniciarDeepLinkAuth } from './lib/nativeAuth.js'
import './styles.css'

// En nativo (Capacitor) escucha el deep link de vuelta del OAuth para completar
// el login. En web es un no-op.
iniciarDeepLinkAuth()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
