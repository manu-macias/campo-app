-- campo-app · Row-Level Security (RLS)
-- ----------------------------------------------------------------------------
-- Garantiza que cada usuario acceda SOLO a los datos de su grupo. Esto se
-- fuerza en la base de datos, no en el cliente — es lo que hace segura una
-- app multi-usuario. Correr DESPUÉS de schema.sql.
-- ----------------------------------------------------------------------------

-- Helper: ¿el grupo g pertenece al usuario actual?
-- "security definer" evita la recursión de RLS al consultar grupos adentro
-- de una policy (la función corre con permisos del creador, no del usuario).
create or replace function public.es_mi_grupo(g uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.grupos
    where id = g and owner_id = auth.uid()
  );
$$;

-- Activar RLS en todas las tablas.
alter table public.grupos    enable row level security;
alter table public.perfiles  enable row level security;
alter table public.socios    enable row level security;
alter table public.campanias enable row level security;
alter table public.ventas    enable row level security;
alter table public.precios   enable row level security;

-- ── grupos: el dueño ve y edita lo suyo ──────────────────────
create policy grupos_select on public.grupos
  for select using (owner_id = auth.uid());
create policy grupos_insert on public.grupos
  for insert with check (owner_id = auth.uid());
create policy grupos_update on public.grupos
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy grupos_delete on public.grupos
  for delete using (owner_id = auth.uid());

-- ── perfiles: cada usuario, el suyo ──────────────────────────
create policy perfiles_all on public.perfiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- ── socios / campanias / ventas: filtradas por el grupo del usuario ──
create policy socios_all on public.socios
  for all using (es_mi_grupo(grupo_id)) with check (es_mi_grupo(grupo_id));
create policy campanias_all on public.campanias
  for all using (es_mi_grupo(grupo_id)) with check (es_mi_grupo(grupo_id));
create policy ventas_all on public.ventas
  for all using (es_mi_grupo(grupo_id)) with check (es_mi_grupo(grupo_id));

-- ── precios: lectura para cualquier usuario logueado; escritura solo server ──
-- El job de precios escribe con la service_role key, que saltea RLS, así que
-- no hace falta una policy de insert/update acá.
create policy precios_select on public.precios
  for select to authenticated using (true);
