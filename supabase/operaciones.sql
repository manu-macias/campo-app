-- campo-app · Fase 8: operaciones (ventas individuales vs conjuntas)
-- ----------------------------------------------------------------------------
-- Una "operación" es una venta. Puede ser INDIVIDUAL (un solo socio) o CONJUNTA
-- (dos o más socios reparten la misma venta). Hasta ahora cada fila de `ventas`
-- era un socio suelto y el historial adivinaba qué filas iban juntas mirando la
-- fecha + el grano — poco fiable si dos socios venden por separado el mismo día.
--
-- La solución: enlazar las filas que pertenecen a la misma operación con un
-- `operacion_id` compartido. Individual = 1 fila con su id propio; conjunta =
-- N filas (una por socio) con el MISMO id. El tipo se deriva contando socios.
--
-- Cómo aplicarlo: Supabase → SQL Editor → correr este archivo completo.
-- Idempotente y con backfill: las ventas viejas quedan agrupadas por fecha+grano
-- (el mejor esfuerzo posible con datos previos) y siguen andando.
-- Correr DESPUÉS de granos.sql.
-- ----------------------------------------------------------------------------

-- Enlace de operación: mismo id => misma venta (individual o conjunta).
alter table public.ventas
  add column if not exists operacion_id uuid;

-- Backfill de datos previos: cada (fecha, grano) del mismo grupo/campaña se toma
-- como una sola operación. No es perfecto para el pasado, pero deja el historial
-- coherente; de acá en más el id lo pone la app al registrar.
update public.ventas v
set operacion_id = sub.oid
from (
  select grupo_id, campania_id, fecha, coalesce(grano, 'soja') as grano,
         gen_random_uuid() as oid
  from public.ventas
  where operacion_id is null
  group by grupo_id, campania_id, fecha, coalesce(grano, 'soja')
) sub
where v.operacion_id is null
  and v.grupo_id = sub.grupo_id
  and v.campania_id = sub.campania_id
  and v.fecha = sub.fecha
  and coalesce(v.grano, 'soja') = sub.grano;

-- De ahora en más toda venta nace con su operación asignada.
alter table public.ventas
  alter column operacion_id set default gen_random_uuid();

-- Índice para agrupar rápido el historial por operación.
create index if not exists ventas_operacion_idx on public.ventas (operacion_id);
