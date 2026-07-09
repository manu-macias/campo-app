import { supabase } from '../supabaseClient.js'

// Trae el perfil del usuario logueado, con su grupo embebido (o null si todavía
// no hizo el onboarding).
export async function getPerfil() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('perfiles')
    .select('*, grupos(*)')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  return data
}

// Crea grupo + perfil + socios + campaña, en orden. Deja al usuario listo para
// usar la app. Si algo falla, lanza el error para mostrarlo en la UI.
export async function completarOnboarding({ nombreUsuario, nombreGrupo, socios, campania }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')

  // 1) grupo (raíz del tenant) — owner_id = el usuario actual
  const { data: grupo, error: e1 } = await supabase
    .from('grupos')
    .insert({ owner_id: user.id, nombre: nombreGrupo.trim() })
    .select()
    .single()
  if (e1) throw e1

  // 2) perfil (upsert por si ya existía una fila previa)
  const { error: e2 } = await supabase
    .from('perfiles')
    .upsert({ id: user.id, nombre: nombreUsuario.trim(), grupo_id: grupo.id })
  if (e2) throw e2

  // 3) socios
  const filasSocios = socios
    .filter(s => s.nombre.trim())
    .map(s => ({
      grupo_id: grupo.id,
      nombre: s.nombre.trim(),
      participacion_tipo: 'tn',
      participacion_valor: Number(s.tn) || 0,
    }))
  if (filasSocios.length) {
    const { error: e3 } = await supabase.from('socios').insert(filasSocios)
    if (e3) throw e3
  }

  // 4) campaña / contrato
  const { error: e4 } = await supabase.from('campanias').insert({
    grupo_id: grupo.id,
    nombre: campania.nombre.trim(),
    anio_inicio: Number(campania.anioInicio),
    toneladas_totales: Number(campania.toneladas) || 0,
  })
  if (e4) throw e4

  return grupo
}

// ── Datos del dashboard (Fase 3) ──────────────────────────────

export async function getCampaniaActiva(grupoId) {
  const { data } = await supabase
    .from('campanias')
    .select('*')
    .eq('grupo_id', grupoId)
    .eq('activa', true)
    .order('anio_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function getSocios(grupoId) {
  const { data } = await supabase
    .from('socios').select('*').eq('grupo_id', grupoId).order('created_at')
  return data || []
}

export async function getVentas(campaniaId) {
  const { data } = await supabase
    .from('ventas')
    .select('*, socios(nombre)')
    .eq('campania_id', campaniaId)
    .order('fecha')
  return data || []
}

// Serie de precios compartida (la llena un job server-side). Puede venir vacía.
export async function getPrecios() {
  const { data } = await supabase.from('precios').select('*').order('fecha')
  return data || []
}

// ── Grupos compartidos (Fase 5) ───────────────────────────────
// Requiere haber corrido supabase/miembros.sql (tabla miembros + RPCs).

// Miembros del grupo (quién tiene cuenta conectada y con qué rol).
// Lanza el error si la tabla no existe todavía (migración sin aplicar).
export async function getMiembros(grupoId) {
  const { data, error } = await supabase
    .from('miembros').select('*').eq('grupo_id', grupoId)
  if (error) throw error
  return data || []
}

// Invitaciones vigentes (solo el admin las ve por RLS; para socios da []).
export async function getInvitacionesPendientes(grupoId) {
  const { data } = await supabase
    .from('invitaciones').select('*')
    .eq('grupo_id', grupoId)
    .is('usada_at', null)
    .gt('expira_at', new Date().toISOString())
  return data || []
}

// Genera un código de invitación para un socio del reparto (solo admin).
export async function crearInvitacion(grupoId, socioId = null) {
  const { data, error } = await supabase
    .rpc('crear_invitacion', { g: grupoId, s: socioId })
  if (error) throw error
  return data // el código
}

// Canjea un código de invitación y deja el perfil apuntando al grupo.
export async function unirseConCodigo({ codigo, nombreUsuario }) {
  const { data, error } = await supabase
    .rpc('unirse_con_codigo', { c: codigo.trim() })
  if (error) throw error
  if (nombreUsuario?.trim()) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('perfiles')
        .update({ nombre: nombreUsuario.trim() }).eq('id', user.id)
    }
  }
  return data // grupo_id
}

export async function registrarVenta({ grupoId, campaniaId, socioId, fecha, toneladas, precioSoja }) {
  const { error } = await supabase.from('ventas').insert({
    grupo_id: grupoId,
    campania_id: campaniaId,
    socio_id: socioId,
    fecha,
    toneladas: Number(toneladas),
    precio_soja: Number(precioSoja),
  })
  if (error) throw error
}
