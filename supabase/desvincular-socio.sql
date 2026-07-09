-- campo-app · Fase 5b: desvincular un socio del grupo
-- ----------------------------------------------------------------------------
-- "Desvincular" NO borra el perfil de la persona (su cuenta sigue existiendo y
-- puede crear o unirse a otro grupo). Lo que hace, en una sola operación:
--   1. Le corta el acceso al grupo (borra su membresía, si tenía cuenta).
--   2. Revoca sus invitaciones pendientes.
--   3. Lo saca del reparto: si no tiene ventas se borra la fila; si tiene,
--      se ARCHIVA (activo = false) para que el historial y los tickets queden.
--
-- Cómo aplicarlo: Supabase → SQL Editor → correr este archivo completo.
-- Correr DESPUÉS de miembros.sql. Es idempotente.
-- ----------------------------------------------------------------------------

-- Soft-delete del reparto: los socios archivados no aparecen en las listas,
-- pero sus ventas históricas siguen mostrando su nombre.
alter table public.socios
  add column if not exists activo boolean not null default true;

create or replace function public.desvincular_socio(s uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare
  g uuid;
begin
  select grupo_id into g from socios where id = s;
  if g is null then
    raise exception 'Socio inexistente';
  end if;
  if not soy_admin(g) then
    raise exception 'Solo el admin del grupo puede desvincular socios';
  end if;
  -- Protección anti-bloqueo: no se desvincula a un socio vinculado a un admin
  -- (el admin se quedaría afuera de su propio grupo).
  if exists (
    select 1 from miembros
    where grupo_id = g and socio_id = s and rol = 'admin'
  ) then
    raise exception 'No se puede desvincular a un administrador del grupo';
  end if;

  -- 1) corta el acceso de la cuenta vinculada (el perfil queda intacto)
  delete from miembros where grupo_id = g and socio_id = s;
  -- 2) revoca invitaciones pendientes
  delete from invitaciones where grupo_id = g and socio_id = s and usada_at is null;
  -- 3) fuera del reparto: borra si no tiene ventas, archiva si tiene
  if exists (select 1 from ventas where socio_id = s) then
    update socios set activo = false where id = s;
  else
    delete from socios where id = s;
  end if;
end $$;

grant execute on function public.desvincular_socio(uuid) to authenticated;
