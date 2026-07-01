-- campo-app · ejemplo de datos (plantilla)
-- ----------------------------------------------------------------------------
-- NO se puede correr tal cual: necesita el id de un usuario real de auth.users
-- (que aparece recién cuando alguien se loguea con Google). Sirve para ver
-- cómo se ven los datos después del onboarding.
--
-- Para probarlo de verdad: logueate una vez en la app, buscá tu id en
-- Supabase → Authentication → Users, y reemplazá <TU_USER_ID> abajo.
-- ----------------------------------------------------------------------------

-- 1) Tu grupo (la explotación)
-- insert into public.grupos (owner_id, nombre)
-- values ('<TU_USER_ID>', 'Campo Los Aromos') returning id;  -- anotá el id

-- 2) Socios del grupo (usá el grupo_id del paso anterior)
-- insert into public.socios (grupo_id, nombre, participacion_tipo, participacion_valor) values
--   ('<GRUPO_ID>', 'Manuel',  'tn', 15),
--   ('<GRUPO_ID>', 'Martina', 'tn', 15),
--   ('<GRUPO_ID>', 'Tomás',   'tn', 15);

-- 3) Campaña / contrato anual
-- insert into public.campanias (grupo_id, nombre, anio_inicio, toneladas_totales)
-- values ('<GRUPO_ID>', '2026/2027', 2026, 90) returning id;  -- anotá el id

-- 4) Una venta (el precio se captura del día; importe se calcula solo)
-- insert into public.ventas (grupo_id, campania_id, socio_id, fecha, toneladas, precio_soja)
-- values ('<GRUPO_ID>', '<CAMPANIA_ID>', '<SOCIO_ID>', current_date, 2.0, 480000);
