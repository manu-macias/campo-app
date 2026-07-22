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
export async function completarOnboarding({ nombreUsuario, nombreGrupo, socios, campania, granos, cantidades, dolares }) {
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
  // Cantidad por grano (solo los granos elegidos, en tn). El total se deriva
  // sumando, para mantener toneladas_totales que usan otras pantallas.
  const cant = {}
  for (const g of (granos || [])) {
    const v = Number(cantidades?.[g]) || 0
    if (v > 0) cant[g] = v
  }
  const totalTn = Object.values(cant).reduce((a, b) => a + b, 0)
  const { error: e4 } = await supabase.from('campanias').insert({
    grupo_id: grupo.id,
    nombre: campania.nombre.trim(),
    anio_inicio: Number(campania.anioInicio),
    toneladas_totales: totalTn,
    granos: (granos && granos.length) ? granos : ['soja'],
    cantidades: cant,
    dolares: Number(dolares) || 0,
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
  // Los socios desvinculados quedan archivados (activo=false): no aparecen en
  // las listas pero sus ventas históricas conservan el nombre. Se filtra acá
  // (y no en la query) para funcionar aunque la columna aún no exista.
  return (data || []).filter(s => s.activo !== false)
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

// ── Mi Perfil (Fase 7) ─────────────────────────────────────────

// Actualiza el nombre del usuario logueado.
export async function actualizarNombre(nombre) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')
  const { error } = await supabase.from('perfiles')
    .update({ nombre: nombre.trim() }).eq('id', user.id)
  if (error) throw error
}

// Todos los grupos a los que pertenece el usuario, con su rol en cada uno.
export async function getMisGrupos() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('miembros').select('rol, socio_id, grupos(id, nombre)')
    .eq('user_id', user.id)
  return (data || []).filter(m => m.grupos) // por si un grupo fue borrado
}

// Cambia el grupo "activo" (el que muestra el dashboard).
export async function cambiarGrupoActivo(grupoId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')
  const { error } = await supabase.from('perfiles')
    .update({ grupo_id: grupoId }).eq('id', user.id)
  if (error) throw error
}

// Sale de un grupo (con candado de único-admin en el backend).
export async function salirDelGrupo(grupoId) {
  const { error } = await supabase.rpc('salir_del_grupo', { g: grupoId })
  if (error) throw error
}

// Elimina la cuenta del usuario en la app (deja todo en cero).
export async function eliminarCuenta() {
  const { error } = await supabase.rpc('eliminar_cuenta')
  if (error) throw error
  await supabase.auth.signOut()
}

// Agrega un socio al reparto (solo admin por RLS).
export async function agregarSocio({ grupoId, nombre, tn }) {
  const { error } = await supabase.from('socios').insert({
    grupo_id: grupoId,
    nombre: nombre.trim(),
    participacion_tipo: 'tn',
    participacion_valor: Number(tn) || 0,
  })
  if (error) throw error
}

// Desvincula un socio: le corta el acceso y lo saca del reparto (borra o
// archiva según tenga ventas). El perfil de la persona NO se toca.
export async function desvincularSocio(socioId) {
  const { error } = await supabase.rpc('desvincular_socio', { s: socioId })
  if (error) throw error
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

// Registra una operación de venta (Fase 8). `lineas` es un arreglo de
// { socioId, toneladas } — una sola línea = venta INDIVIDUAL; dos o más =
// venta CONJUNTA. Todas comparten fecha, grano, precio y un mismo operacion_id,
// que es lo que después permite mostrarlas juntas y saber que fueron una única
// venta (y no dos ventas sueltas que cayeron el mismo día).
export async function registrarOperacion({ grupoId, campaniaId, fecha, precioSoja, grano, lineas }) {
  const operacionId = (crypto.randomUUID && crypto.randomUUID()) || undefined
  const filas = lineas
    .filter(l => l.socioId && Number(l.toneladas) > 0)
    .map(l => ({
      grupo_id: grupoId,
      campania_id: campaniaId,
      socio_id: l.socioId,
      fecha,
      toneladas: Number(l.toneladas),
      precio_soja: Number(precioSoja), // precio del grano de esta venta
      grano: grano || 'soja',
      ...(operacionId ? { operacion_id: operacionId } : {}),
    }))
  if (!filas.length) throw new Error('No hay líneas válidas para registrar.')
  const { error } = await supabase.from('ventas').insert(filas)
  if (error) throw error
}
