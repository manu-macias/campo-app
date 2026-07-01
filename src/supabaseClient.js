import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Si falta la config, no rompemos la app: lo detectamos para mostrar un aviso.
export const supabaseConfigurado = Boolean(url && key)

const nativo = Capacitor.isNativePlatform()

export const supabase = supabaseConfigurado
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // PKCE: el callback trae un `code` que intercambiamos por la sesión.
        // Sirve para web y es lo que hace posible el login nativo por deep link.
        flowType: 'pkce',
        // Web: al volver del redirect, Supabase intercambia el code solo.
        // Nativo: el deep link lo maneja nativeAuth.js a mano (ver ese archivo).
        detectSessionInUrl: !nativo,
      },
    })
  : null
