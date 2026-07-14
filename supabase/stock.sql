-- campo-app · Fase 7: stock del contrato (cantidad por grano + dólares)
-- ----------------------------------------------------------------------------
-- El contrato (campaña) pasa a declarar CUÁNTO de cada grano tiene, no solo con
-- qué granos trabaja. Es un valor fijo que define el contrato y no se mueve (a
-- diferencia de las ventas, que van consumiendo). Además se guarda un stock de
-- dólares, que el productor cuenta como un "grano" más.
--
--   cantidades: { "soja": 90, "trigo": 40 }   (toneladas por grano)
--   dolares:    5000                            (US$ en caja)
--
-- Cómo aplicarlo: Supabase → SQL Editor → correr este archivo completo.
-- Idempotente y con backfill. Correr DESPUÉS de granos.sql.
-- ----------------------------------------------------------------------------

alter table public.campanias
  add column if not exists cantidades jsonb   not null default '{}'::jsonb,
  add column if not exists dolares    numeric not null default 0;

-- Backfill: los contratos viejos tenían un único total, que era todo soja.
update public.campanias
set cantidades = jsonb_build_object('soja', toneladas_totales)
where (cantidades is null or cantidades = '{}'::jsonb)
  and coalesce(toneladas_totales, 0) > 0;

-- RLS: campanias ya tiene sus policies (los miembros leen, el admin escribe),
-- las columnas nuevas quedan cubiertas. No hace falta tocar nada más.
