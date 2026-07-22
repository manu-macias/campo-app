import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: necesario para que funcione tanto en web como empaquetado
// dentro de Capacitor (los assets se cargan desde file://).
export default defineConfig({
  plugins: [react()],
  base: './',
  // host: true expone el dev server en la red local (0.0.0.0), para abrirlo
  // desde el iPhone en Safari: http://<ip-del-mac>:5180 (misma WiFi).
  server: { port: 5180, host: true },
})
