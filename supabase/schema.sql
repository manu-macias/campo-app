-- campo-app · esquema de datos (Supabase / Postgres)
-- ----------------------------------------------------------------------------
-- Fase 1: 1 usuario = dueño de 1 grupo (la explotación). Los socios son
-- registros (nombres con su participación), NO necesariamente usuarios de la app.
--
-- Cómo aplicarlo: Supabase → SQL Editor → pegar y correr este archivo,
-- y después correr rls.sql.
-- ----------------------------------------------------------------------------

-- gen_random_uuid() — Supabase ya trae pgcrypto, pero por las dudas:
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- grupos · la explotación / grupo de socios (raíz del "tenant")
-- ─────────────────────────────────────────────────────────────
create table if not exists public.grupos (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  nombre     text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- perfiles · datos del usuario (1:1 con auth.users) + grupo activo
-- Sirve para la bienvenida y para saber a qué grupo pertenece.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text,
  grupo_id   uuid references public.grupos(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- socios · integrantes del grupo (nombre + participación)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.socios (
  id                  uuid primary key default gen_random_uuid(),
  grupo_id            uuid not null references public.grupos(id) on delete cascade,
  nombre              text not null,
  -- participación en el contrato: por toneladas fijas ('tn') o por porcentaje ('pct')
  participacion_tipo  text not null default 'tn' check (participacion_tipo in ('tn','pct')),
  participacion_valor numeric not null default 0,
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- campanias · contrato de arrendamiento (normalmente anual)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.campanias (
  id                uuid primary key default gen_random_uuid(),
  grupo_id          uuid not null references public.grupos(id) on delete cascade,
  nombre            text not null,             -- ej. "2026/2027"
  anio_inicio       int  not null,
  toneladas_totales numeric not null default 0, -- tn de soja del contrato
  activa            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- ventas · cada venta con el PRECIO capturado en el momento
-- (importe se calcula solo: toneladas × precio_soja)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ventas (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  campania_id uuid not null references public.campanias(id) on delete cascade,
  socio_id    uuid not null references public.socios(id) on delete restrict,
  fecha       date not null default current_date,
  toneladas   numeric not null check (toneladas > 0),
  precio_soja numeric not null check (precio_soja >= 0),   -- $/tn del día
  importe     numeric generated always as (toneladas * precio_soja) stored,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- precios · serie diaria COMPARTIDA (no es por cuenta).
-- La actualiza un job server-side (GitHub Action con service_role),
-- igual que hoy hace prices.json en los proyectos anteriores.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.precios (
  fecha      date primary key,
  soja       numeric,   -- pizarra Rosario $/tn (API Cámara Arbitral BCR)
  dolar      numeric,   -- dólar oficial $/USD
  updated_at timestamptz not null default now()
);

-- Índices para los foreign keys que más se consultan.
create index if not exists idx_socios_grupo    on public.socios(grupo_id);
create index if not exists idx_campanias_grupo on public.campanias(grupo_id);
create index if not exists idx_ventas_grupo    on public.ventas(grupo_id);
create index if not exists idx_ventas_campania on public.ventas(campania_id);
create index if not exists idx_ventas_socio    on public.ventas(socio_id);
