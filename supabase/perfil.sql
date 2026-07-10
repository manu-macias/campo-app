-- campo-app · Fase 7: sección "Mi Perfil" — salir de un grupo y eliminar cuenta
-- ----------------------------------------------------------------------------
-- Operaciones con candados de seguridad (security definer), para que un usuario
-- pueda irse de un grupo o borrar su cuenta sin dejar a otros sin acceso ni
-- huérfanos los grupos compartidos.
--
-- El resto de "Mi Perfil" (editar nombre, cambiar de grupo activo, unirse con
-- código) usa operaciones directas ya cubiertas por la RLS existente.
--
-- Cómo aplicarlo: Supabase → SQL Editor → correr este archivo completo.
-- Idempotente. Correr DESPUÉS de miembros.sql.
-- ----------------------------------------------------------------------------

-- Salir de un grupo. Candado: no puede salir el ÚNICO admin si hay otros
-- integrantes (dejaría el grupo sin administrador). Si al salir el grupo queda
-- sin nadie, se elimina (con sus datos, vía cascade).
create or replace function public.salir_del_grupo(g uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sin sesión'; end if;
  if not exists (select 1 from miembros where grupo_id = g and user_id = uid) then
    raise exception 'No sos miembro de este grupo';
  end if;
  if exists (select 1 from miembros where grupo_id = g and user_id = uid and rol = 'admin')
     and (select count(*) from miembros where grupo_id = g) > 1
     and (select count(*) from miembros where grupo_id = g and rol = 'admin') = 1 then
    raise exception 'Sos el único admin. Pasá el rol de admin a otro integrante antes de salir.';
  end if;

  delete from miembros where grupo_id = g and user_id = uid;
  delete from grupos gr where gr.id = g
    and not exists (select 1 from miembros where grupo_id = g);

  -- Si el perfil apuntaba a este grupo, lo movemos a otro del usuario (o null).
  update perfiles set grupo_id = (
    select m.grupo_id from miembros m where m.user_id = uid limit 1
  ) where id = uid and grupo_id = g;
end $$;

-- Eliminar cuenta: saca al usuario de todos sus grupos y borra su perfil,
-- dejando su cuenta de la app "en cero". Candado: si es el único admin de un
-- grupo compartido (con otros integrantes), se bloquea. Los grupos donde queda
-- sin integrantes se eliminan por completo. NO borra el usuario de auth (el
-- login de Google se gestiona desde Google); al volver a entrar, onboarding limpio.
create or replace function public.eliminar_cuenta()
returns void language plpgsql security definer
set search_path = public as $$
declare uid uuid := auth.uid(); r record;
begin
  if uid is null then raise exception 'Sin sesión'; end if;

  for r in select grupo_id from miembros where user_id = uid and rol = 'admin' loop
    if (select count(*) from miembros where grupo_id = r.grupo_id) > 1
       and (select count(*) from miembros where grupo_id = r.grupo_id and rol = 'admin') = 1 then
      raise exception 'Sos el único admin de un grupo con otros integrantes. Pasá el rol de admin a otro antes de eliminar tu cuenta.';
    end if;
  end loop;

  -- Grupos donde estoy, para limpiar los que queden vacíos tras mi salida.
  create temp table _mis_grupos on commit drop as
    select grupo_id from miembros where user_id = uid;

  delete from miembros where user_id = uid;
  delete from grupos gr where gr.id in (select grupo_id from _mis_grupos)
    and not exists (select 1 from miembros where grupo_id = gr.id);
  delete from perfiles where id = uid;
end $$;

grant execute on function public.salir_del_grupo(uuid) to authenticated;
grant execute on function public.eliminar_cuenta() to authenticated;
