import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: necesario para que funcione tanto en web como empaquetado
// dentro de Capacitor (los assets se cargan desde file://).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5180 },
})
