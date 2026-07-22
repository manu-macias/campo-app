-- campo-app · Fase 9: plazo de cobro (barra de progreso venta → cobro)
-- ----------------------------------------------------------------------------
-- Cada venta puede declarar en cuántos días se cobra la plata desde la fecha de
-- la operación (ej: 10). Con eso, el historial dibuja una barra de progreso que
-- avanza día a día desde la venta (0%) hasta la fecha estimada de cobro (100%).
--
-- Se guarda por fila (mismo valor en todas las líneas de una operación conjunta,
-- igual que fecha/grano/precio). Las ventas viejas quedan en NULL = sin plazo
-- declarado (no muestran barra).
--
-- Cómo aplicarlo: Supabase → SQL Editor → correr este archivo completo.
-- Idempotente. Correr DESPUÉS de operaciones.sql.
-- ----------------------------------------------------------------------------

alter table public.ventas
  add column if not exists dias_cobro int check (dias_cobro is null or dias_cobro >= 0);
