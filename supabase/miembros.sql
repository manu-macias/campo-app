-- campo-app · Fase 5: grupos compartidos (membresías + invitaciones)
-- ----------------------------------------------------------------------------
-- Cambia el modelo de acceso de "dueño único" a "miembros": varios usuarios
-- (cada uno con su cuenta de Google) comparten el mismo grupo y sus ventas.
--
--   grupos ──< miembros >── auth.users
--      │           │
--      └──< socios ┘   (miembros.socio_id: qué socio del reparto ES el usuario)
--
-- Roles:
--   admin → todo: estructura (socios, campaña), invitar/echar, renombrar grupo.
--   socio → ve todo el grupo y registra ventas. No toca la estructura.
--
-- Cómo aplicarlo: Supabase → SQL Editor → correr este archivo COMPLETO.
-- Es idempotente y hace backfill: los grupos existentes siguen andando igual
-- (su dueño queda como admin). Correr DESPUÉS de schema.sql y rls.sql.
-- ----------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────
-- 1 · Tablas nuevas
-- ─────────────────────────────────────────────────────────────

create table if not exists public.miembros (
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rol        text not null default 'socio' check (rol in ('admin','socio')),
  -- Qué socio del reparto "es" este usuario (opcional: hay socios sin cuenta,
  -- como COMUNES, y podría haber usuarios que no son parte del reparto).
  socio_id   uuid references public.socios(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (grupo_id, user_id)
);

create index if not exists idx_miembros_user on public.miembros(user_id);

-- Invitaciones por código (un solo uso, vencen). El admin genera el código y
-- lo comparte por WhatsApp; el invitado lo canjea con unirse_con_codigo().
create table if not exists public.invitaciones (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  socio_id   uuid references public.socios(id) on delete set null,
  rol        text not null default 'socio' check (rol in ('admin','socio')),
  codigo     text not null unique,
  creada_por uuid not null references auth.users(id) on delete cascade,
  usada_por  uuid references auth.users(id),
  usada_at   timestamptz,
  expira_at  timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create index if not exists idx_invitaciones_grupo on public.invitaciones(grupo_id);

-- ─────────────────────────────────────────────────────────────
-- 2 · Helpers de membresía (security definer: sin recursión de RLS)
-- ─────────────────────────────────────────────────────────────

create or replace function public.soy_miembro(g uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.miembros
    where grupo_id = g and user_id = auth.uid()
  );
$$;

create or replace function public.soy_admin(g uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.miembros
    where grupo_id = g and user_id = auth.uid() and rol = 'admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 3 · Backfill + alta automática del creador como admin
-- ─────────────────────────────────────────────────────────────

-- Los dueños actuales pasan a ser miembros admin de su grupo.
insert into public.miembros (grupo_id, user_id, rol)
select id, owner_id, 'admin' from public.grupos
on conflict (grupo_id, user_id) do nothing;

-- Al crear un grupo nuevo, el creador queda como admin automáticamente.
-- (security definer: el trigger inserta en miembros salteando RLS)
create or replace function public.tg_grupo_creador_admin()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.miembros (grupo_id, user_id, rol)
  values (new.id, new.owner_id, 'admin')
  on conflict (grupo_id, user_id) do nothing;
  return new;
end $$;

drop trigger if exists grupo_creador_admin on public.grupos;
create trigger grupo_creador_admin
  after insert on public.grupos
  for each row execute function public.tg_grupo_creador_admin();

-- ─────────────────────────────────────────────────────────────
-- 4 · RLS: de "dueño" a "miembro"
-- ─────────────────────────────────────────────────────────────

alter table public.miembros     enable row level security;
alter table public.invitaciones enable row level security;

-- grupos: ven los miembros; estructura solo el admin. Crear sigue igual.
drop policy if exists grupos_select on public.grupos;
drop policy if exists grupos_update on public.grupos;
drop policy if exists grupos_delete on public.grupos;
create policy grupos_select on public.grupos
  for select using (soy_miembro(id));
create policy grupos_update on public.grupos
  for update using (soy_admin(id)) with check (soy_admin(id));
create policy grupos_delete on public.grupos
  for delete using (soy_admin(id));
-- (grupos_insert con owner_id = auth.uid() queda como está)

-- socios y campanias: ven los miembros; escribe solo el admin.
drop policy if exists socios_all on public.socios;
create policy socios_select on public.socios
  for select using (soy_miembro(grupo_id));
create policy socios_write on public.socios
  for all using (soy_admin(grupo_id)) with check (soy_admin(grupo_id));

drop policy if exists campanias_all on public.campanias;
create policy campanias_select on public.campanias
  for select using (soy_miembro(grupo_id));
create policy campanias_write on public.campanias
  for all using (soy_admin(grupo_id)) with check (soy_admin(grupo_id));

-- ventas: ven los miembros y TODOS los miembros registran.
-- Corregir/borrar ventas queda para el admin (auditoría simple).
drop policy if exists ventas_all on public.ventas;
create policy ventas_select on public.ventas
  for select using (soy_miembro(grupo_id));
create policy ventas_insert on public.ventas
  for insert with check (soy_miembro(grupo_id));
create policy ventas_update on public.ventas
  for update using (soy_admin(grupo_id)) with check (soy_admin(grupo_id));
create policy ventas_delete on public.ventas
  for delete using (soy_admin(grupo_id));

-- miembros: los miembros ven quién está; echar puede el admin, y cualquiera
-- puede salirse solo. NADIE se inserta directo: el alta pasa por el trigger
-- (creador) o por unirse_con_codigo() (invitado), ambos security definer.
create policy miembros_select on public.miembros
  for select using (soy_miembro(grupo_id));
create policy miembros_update on public.miembros
  for update using (soy_admin(grupo_id)) with check (soy_admin(grupo_id));
create policy miembros_delete on public.miembros
  for delete using (soy_admin(grupo_id) or user_id = auth.uid());

-- invitaciones: solo el admin del grupo las ve y gestiona (el invitado nunca
-- lee esta tabla: canjea el código vía RPC).
create policy invitaciones_admin on public.invitaciones
  for all using (soy_admin(grupo_id)) with check (soy_admin(grupo_id));

-- El helper viejo por dueño ya no lo usa ninguna policy.
drop function if exists public.es_mi_grupo(uuid);

-- ─────────────────────────────────────────────────────────────
-- 5 · RPCs de invitación
-- ─────────────────────────────────────────────────────────────

-- Genera una invitación y devuelve el código (8 caracteres, sin ambiguos).
-- Solo el admin del grupo puede invitar.
create or replace function public.crear_invitacion(g uuid, s uuid default null, r text default 'socio')
returns text language plpgsql security definer
set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin 0/O/1/I
  c   text;
begin
  if not soy_admin(g) then
    raise exception 'Solo el admin del grupo puede invitar';
  end if;
  if r not in ('admin','socio') then
    raise exception 'Rol inválido';
  end if;
  if s is not null and not exists (
    select 1 from socios where id = s and grupo_id = g
  ) then
    raise exception 'Ese socio no pertenece al grupo';
  end if;

  -- Código único (reintenta en el caso improbable de colisión).
  loop
    select string_agg(substr(abc, 1 + floor(random() * 32)::int, 1), '')
      into c from generate_series(1, 8);
    exit when not exists (select 1 from invitaciones where codigo = c);
  end loop;

  insert into invitaciones (grupo_id, socio_id, rol, codigo, creada_por)
  values (g, s, r, c, auth.uid());
  return c;
end $$;

-- Canjea un código: valida, da de alta la membresía y apunta el perfil al
-- grupo. Devuelve el grupo_id al que se unió.
create or replace function public.unirse_con_codigo(c text)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión';
  end if;

  select * into inv
  from invitaciones
  where codigo = upper(trim(c)) and usada_at is null and expira_at > now()
  for update;

  if not found then
    raise exception 'Código inválido, vencido o ya usado';
  end if;
  if exists (
    select 1 from miembros where grupo_id = inv.grupo_id and user_id = auth.uid()
  ) then
    raise exception 'Ya sos miembro de este grupo';
  end if;

  insert into miembros (grupo_id, user_id, rol, socio_id)
  values (inv.grupo_id, auth.uid(), inv.rol, inv.socio_id);

  update invitaciones
  set usada_por = auth.uid(), usada_at = now()
  where id = inv.id;

  -- El perfil pasa a apuntar a este grupo (se crea si es un usuario nuevo
  -- que entró directo con el código, sin pasar por el onboarding de grupo).
  insert into perfiles (id, grupo_id)
  values (auth.uid(), inv.grupo_id)
  on conflict (id) do update set grupo_id = excluded.grupo_id;

  return inv.grupo_id;
end $$;

grant execute on function public.crear_invitacion(uuid, uuid, text) to authenticated;
grant execute on function public.unirse_con_codigo(text) to authenticated;
