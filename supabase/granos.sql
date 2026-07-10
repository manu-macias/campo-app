-- campo-app · Fase 6: múltiples granos por contrato
-- ----------------------------------------------------------------------------
-- Los granos se declaran a nivel CONTRATO (campaña): cada campaña dice con qué
-- granos trabaja, y las ventas se registran contra esos granos, cada una con el
-- precio oficial de pizarra de ESE grano el día de la operación.
--
-- Precios: la serie diaria pasa a tener una columna por grano (todas las llena
-- el job de precios desde la API de la Cámara Arbitral de la BCR).
--
-- Cómo aplicarlo: Supabase → SQL Editor → correr este archivo completo.
-- Idempotente y con backfill: lo existente queda como soja y sigue andando.
-- Correr DESPUÉS de miembros.sql / desvincular-socio.sql.
-- ----------------------------------------------------------------------------

-- Precios: una columna por grano (soja ya existía; el dólar se mantiene).
alter table public.precios
  add column if not exists trigo   numeric,
  add column if not exists maiz    numeric,
  add column if not exists girasol numeric,
  add column if not exists sorgo   numeric;

-- Campaña: qué granos maneja el contrato (los existentes quedan solo con soja).
alter table public.campanias
  add column if not exists granos text[] not null default '{soja}';

-- Venta: a qué grano corresponde (las ventas viejas quedan como soja).
-- El precio del grano se sigue guardando en la columna precio_soja, que ahora
-- representa "precio del grano de esta venta" (se mantiene el nombre para no
-- romper la columna calculada importe = toneladas * precio_soja).
alter table public.ventas
  add column if not exists grano text not null default 'soja';
