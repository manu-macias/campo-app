// Login con OAuth que funciona igual en web y en app nativa (Capacitor).
//
// Web: Supabase redirige al `origin` y, de vuelta, `detectSessionInUrl` cierra
// la sesión solo.
// Nativo (Android/iOS): no hay `origin` ni redirect de navegador. Abrimos el
// OAuth en el navegador del sistema y volvemos a la app por un deep link con
// esquema propio (`campoapp://login-callback`). Ahí intercambiamos el `code`
// (flujo PKCE) por una sesión, dentro del WebView de la app (que es quien tiene
// guardado el code_verifier).

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '../supabaseClient.js'

export const esNativo = Capacitor.isNativePlatform()

// Debe coincidir con el esquema declarado en capacitor.config.json y estar
// cargado en Supabase → Authentication → URL Configuration → Redirect URLs.
const REDIRECT_NATIVO = 'campoapp://login-callback'

export async function iniciarSesion(provider) {
  if (!esNativo) {
    // Web: redirect clásico al origin.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
    return
  }

  // Nativo: pedimos la URL de OAuth pero NO dejamos que el WebView redirija;
  // la abrimos nosotros en el navegador del sistema.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT_NATIVO, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (data?.url) await Browser.open({ url: data.url })
}

// Se registra una sola vez al arrancar la app. Escucha el deep link de vuelta
// y completa el login. Devuelve una función para desregistrar el listener.
export function iniciarDeepLinkAuth() {
  if (!esNativo) return () => {}

  const handle = App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.startsWith(REDIRECT_NATIVO)) return
    try {
      // PKCE: el callback trae `?code=...`. Si el proveedor devolviera tokens en
      // el fragmento (#access_token), lo contemplamos como fallback.
      const u = new URL(url)
      const code = u.searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
      } else if (u.hash.includes('access_token')) {
        const params = new URLSearchParams(u.hash.slice(1))
        const { error } = await supabase.auth.setSession({
          access_token: params.get('access_token'),
          refresh_token: params.get('refresh_token'),
        })
        if (error) throw error
      }
    } catch (e) {
      console.error('Fallo al completar el login nativo:', e)
    } finally {
      // Cerramos el navegador del sistema, ya volvimos a la app.
      Browser.close().catch(() => {})
    }
  })

  return () => { handle.then(h => h.remove()) }
}
