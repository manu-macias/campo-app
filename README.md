# 🌱 campo-app

App de gestión para grupos de productores agropecuarios: login real, perfil propio, alta de socios y del contrato de arrendamiento, y registro de ventas de soja con facturación exacta (precio capturado al momento de cada venta).

Es la evolución multi-usuario de dos prototipos previos ([agro-dashboard](https://github.com/manu-macias/agro-dashboard) y herramientas-campo): la misma lógica de decisión y precios, pero con cuentas reales y datos aislados por grupo.

> **Estado:** Fase 1 — modelo de datos. Todavía no hay UI; este repo arranca por la base de datos, que es lo que define la seguridad y la estructura de todo lo demás.

---

## Arquitectura

```
Productor                                  ┌─ Auth (Google + Apple OAuth)
   │ login                                 │
   ▼                                       ├─ Postgres (los datos)
App React ──── Capacitor ────▶ Supabase ◀──┤
   ├─ Web (PWA)                            └─ RLS (aislamiento por grupo)
   ├─ Android (Play Store)
   └─ iOS (App Store)
```

- **Un solo código base (React)** que corre como web y, vía **Capacitor**, como app nativa Android/iOS publicable en ambas tiendas.
- **Supabase** resuelve login + base de datos + seguridad en una sola pieza, con plan gratis. El mismo backend sirve para web y nativo.
- **Row-Level Security (RLS):** cada usuario accede solo a los datos de su grupo, forzado en la base de datos (no en el cliente).
- **precios** es la única tabla **compartida/global** (serie diaria de soja y dólar); el resto es **por cuenta**.

## Modelo de datos

| Tabla | Qué guarda | Alcance |
|-------|------------|---------|
| `grupos` | La explotación / grupo de socios (raíz del tenant) | por cuenta |
| `perfiles` | Datos del usuario (1:1 con `auth.users`) + grupo activo | por cuenta |
| `socios` | Integrantes del grupo: nombre + participación (tn o %) | por cuenta |
| `campanias` | Contrato de arrendamiento anual: tn totales, año | por cuenta |
| `ventas` | Cada venta: socio, fecha, tn, **precio del día**, importe | por cuenta |
| `precios` | Serie diaria de soja (BCR) y dólar oficial | **compartida** |

`ventas.importe` es una columna calculada (`toneladas × precio_soja`), así la facturación sale exacta sin depender del precio actual.

Archivos:
- [`supabase/schema.sql`](supabase/schema.sql) — las tablas e índices.
- [`supabase/rls.sql`](supabase/rls.sql) — RLS + policies (aplicar **después** del schema).
- [`supabase/seed.example.sql`](supabase/seed.example.sql) — plantilla de datos de ejemplo.

## Cómo montar la base de datos

1. Crear un proyecto en [supabase.com](https://supabase.com) (gratis).
2. **Authentication → Providers → Google:** habilitarlo (con un OAuth client de Google Cloud).
3. **SQL Editor:** correr [`schema.sql`](supabase/schema.sql) y luego [`rls.sql`](supabase/rls.sql).
4. Verificar en **Authentication → Policies** que RLS quede activo en las 6 tablas.

Para probar el aislamiento: logueate con dos cuentas distintas y confirmá que cada una solo ve su propio grupo.

## Cómo correr la app

```bash
npm install
cp .env.example .env      # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5180
```

Sin `.env` configurado, la app muestra un aviso en vez de romper. Con las credenciales puestas: pantalla de login (Google/Apple) → si es tu primer ingreso, el wizard de onboarding → home.

Estructura:
```
src/
├── App.jsx              gate de sesión (login / onboarding / home)
├── supabaseClient.js    cliente de Supabase
├── auth/Login.jsx       login Google + Apple
├── onboarding/          wizard: bienvenida → grupo → socios → contrato
├── dashboard/           tabs Decisión · Ventas · Precios + controles
├── lib/db.js            altas/consultas en Supabase
└── lib/scoring.js       algoritmo de decisión + facturación (portado de los prototipos)
```

## Job de precios (Fase 4a)

[`scripts/update_prices.py`](scripts/update_prices.py) puebla la tabla `precios` de Supabase con la serie diaria de soja (API Cámara Arbitral BCR) y dólar oficial (dolarapi.com + ArgentinaDatos para historia). Es la misma lógica que `herramientas-campo/scripts/update_prices.py`, adaptada para escribir en Supabase (upsert por `fecha`, vía PostgREST) en vez de `prices.json`.

- Sin dependencias (solo stdlib de Python 3).
- Escribe con la **SERVICE_ROLE key** (necesaria porque la policy de `precios` solo permite `SELECT` a `authenticated`). Esa key nunca va al cliente ni al repo: se configura como secret de GitHub.
- Corre vía [`.github/workflows/update-precios.yml`](.github/workflows/update-precios.yml), cron lun-vie 18:30 ART (o manual con "Run workflow").

Para activarlo, una vez que el repo esté en GitHub, cargar en **Settings → Secrets and variables → Actions**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → `service_role`, **secret**)

Correrlo a mano en local:
```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx python3 scripts/update_prices.py
```

## 📱 Móvil y publicación en stores

Objetivo: una sola app que sea **web + Android (Play Store) + iOS (App Store)**, con un único código base React envuelto con [Capacitor](https://capacitorjs.com).

A tener en cuenta para publicar:
- **Cuentas de desarrollador:** Apple Developer Program (US$99/año) y Google Play (US$25, único). Compilar iOS requiere una Mac.
- **Sign in with Apple:** si se ofrece login con Google, Apple exige también ofrecer login con Apple (guía 4.8). Por eso el auth contempla Google **y** Apple desde el diseño.
- **No-webview:** Apple rechaza apps que son solo el sitio embebido (guía 4.2). Hay que sumar funciones nativas (push, splash, offline básico).
- **OAuth nativo:** el login en iOS/Android usa deep links / esquema de URL propio (Supabase lo soporta), distinto del redirect web.

Esta capa es de **cliente y configuración**; no afecta el modelo de datos ni la RLS.

### Estado del empaquetado (Fase 4b)

Capacitor ya está integrado. El build de Vite (`dist/`, con `base:'./'`) se empaqueta como app nativa.

- **Config:** [`capacitor.config.json`](capacitor.config.json) — `appId` `ar.campoapp.app`, esquema propio `campoapp://` para el deep link de OAuth.
- **OAuth nativo:** [`src/lib/nativeAuth.js`](src/lib/nativeAuth.js) maneja el login en web y nativo. En nativo abre el OAuth en el navegador del sistema (`@capacitor/browser`) y captura la vuelta por deep link `campoapp://login-callback` (`@capacitor/app` → `appUrlOpen`), intercambiando el `code` con **flujo PKCE**. El cliente Supabase usa `flowType: 'pkce'` y `detectSessionInUrl` solo en web.
- **Android:** proyecto generado en [`android/`](android/); el intent-filter del esquema `campoapp` ya está en el `AndroidManifest.xml`.
- **iOS:** todavía **no** generado — `npx cap add ios` requiere [CocoaPods](https://capacitorjs.com/docs/getting-started/environment-setup#homebrew) instalado (`brew install cocoapods`).

> **Nota de versiones:** Capacitor está fijado en **v7** porque la v8 exige Node ≥ 22 y el entorno usa Node 20. Al subir Node se puede migrar a v8.

Comandos:
```bash
npm run build            # genera dist/
npm run sync             # build + cap sync (copia dist a las plataformas)
npm run android          # build + sync + abre Android Studio
npm run ios              # build + sync + abre Xcode (requiere CocoaPods + Mac)
```

**Configurar en Supabase** (Authentication → URL Configuration → Redirect URLs), sumar el deep link nativo además del origin web:
```
campoapp://login-callback
```

Pendiente para publicar de verdad: íconos/splash, "Sign in with Apple" nativo en iOS, y las cuentas de desarrollador (Apple US$99/año, Google US$25).

## Decisiones de diseño (Fase 1)

- **1 usuario = dueño de 1 grupo.** Los `socios` son registros (nombres), no usuarios de la app. Compartir un grupo entre varias cuentas (roles dueño/lector) queda para más adelante.
- **Solo soja, 1 campaña activa.** El modelo deja lugar para multi-grano y multi-campaña sin rehacerlo.
- **El precio se captura al vender** (`ventas.precio_soja`), no se recalcula — facturación inmutable.

## Roadmap

- [x] **Fase 1** — Modelo de datos (schema + RLS)
- [x] **Fase 2** — App React (Vite) + login Google/Apple + wizard de onboarding (bienvenida, grupo, socios, contrato).
- [x] **Fase 3** — Dashboard: decisión (scoring + veredicto), registro de ventas con precio del día y facturación por socio (total + último mes), gráfico diario soja/dólar.
- [x] **Fase 4a** — Job de precios server-side (poblar la tabla `precios` con BCR + dólar).
- [x] **Fase 4b** — Capacitor integrado + OAuth nativo por deep link + proyecto Android generado. Falta iOS (CocoaPods), íconos/splash y publicar en las stores.
- [ ] **Fase 5** — Multi-campaña, multi-grano, roles (dueño vs. socio lector), exportar

## Qué se reusa de los prototipos

Algoritmo de decisión y scoring, gráfico soja/dólar, captura de precio al vender y el pipeline de precios diarios (API Cámara Arbitral BCR + dólar oficial). Lo único que cambia es de dónde salen y a dónde van los datos: de Google Sheets a Supabase.
