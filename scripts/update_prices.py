#!/usr/bin/env python3
"""
update_prices.py — actualiza la tabla `precios` de Supabase con la serie
DIARIA de soja y dólar (upsert por `fecha`).

Adaptado de herramientas-campo/scripts/update_prices.py: misma lógica de
fetch (BCR + dólar), pero el destino es Supabase (PostgREST) en vez de
prices.json.

- Dólar Oficial: valor de hoy desde dolarapi.com; la primera vez se
  backfillea la historia diaria completa desde ArgentinaDatos.
- Soja pizarra Rosario ($/tn): serie diaria de la API Cámara Arbitral BCR
  (máx. 1 semana por consulta → se itera semana a semana). Si falla,
  fallback a anclas mensuales + scrape de la pizarra de hoy.

Escribe con la SERVICE_ROLE key (saltea RLS; la policy de `precios` solo
permite SELECT a authenticated). Nunca exponer esa key en el cliente.

Requiere env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
Corre sin dependencias (Python 3, solo stdlib):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/update_prices.py
"""

import urllib.request, re, json, datetime, os

DAYS = 400

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# API de la Cámara Arbitral de la BCR. Devuelve la pizarra DIARIA de soja.
# Límite: máx. 1 semana por consulta → iteramos semana a semana.
# Credenciales públicas, expuestas en el widget de acabase.com.ar.
BCR_LOGIN   = "https://api.bcr.com.ar/gix/v1.0/Login"
BCR_PRECIOS = "https://api.bcr.com.ar/gix/v1.0/PreciosCamara"
BCR_API_KEY = "A6D9A60F-2A13-F111-9448-00155D09E215"
BCR_SECRET  = "6cbaeddacc47754da031c0f1cac97074429285a1ad30c16767b710521fd4d144"
ID_SOJA     = 21

# Anclas históricas de soja (pizarra Rosario $/tn) para que la serie no
# arranque vacía si la API de BCR falla. Solo se usan como fallback.
SOJA_SEED = {
    "2025-03-15": 329000, "2025-04-15": 314000, "2025-05-15": 310000,
    "2025-06-15": 322000, "2025-07-15": 335000, "2025-08-15": 389000,
    "2025-09-15": 436000, "2025-10-15": 482000, "2025-11-15": 485000,
    "2025-12-15": 495000, "2026-01-15": 480000, "2026-02-15": 466000,
    "2026-03-15": 484000, "2026-04-15": 431000, "2026-05-15": 455000,
    "2026-06-15": 470000,
}


def fetch(url, method="GET", headers=None, data=None, timeout=20):
    # User-Agent por defecto: dolarapi.com / ArgentinaDatos devuelven 403 a
    # requests sin identificarse (p. ej. desde runners de GitHub Actions).
    h = {"User-Agent": "Mozilla/5.0 campo-app"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, method=method, data=data, headers=h)
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8")


def soja_hoy():
    html = fetch("https://www.cac.bcr.com.ar/es/precios-de-pizarra",
                  headers={"User-Agent": "Mozilla/5.0 agro"})
    m = re.search(r'board-soja.*?<div class="price">\s*\$([\d.,]+)', html, re.DOTALL)
    if not m:
        raise ValueError("No se encontró el precio de soja en BCR")
    return int(m.group(1).replace(".", "").split(",")[0])


def dolar_hoy():
    data = json.loads(fetch("https://dolarapi.com/v1/dolares/oficial"))
    return int(data["venta"])


def dolar_backfill():
    """Historia diaria del dólar oficial desde ArgentinaDatos → {fecha: valor}."""
    arr = json.loads(fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial"))
    cutoff = (datetime.date.today() - datetime.timedelta(days=DAYS)).isoformat()
    out = {}
    for d in arr:
        if d.get("fecha", "") >= cutoff and d.get("venta"):
            out[d["fecha"]] = round(d["venta"])
    return out


def bcr_login():
    """Token Bearer de la API de la Cámara Arbitral (BCR)."""
    req = urllib.request.Request(BCR_LOGIN, method="POST", data=b"", headers={
        "accept": "application/json", "api_key": BCR_API_KEY, "secret": BCR_SECRET,
    })
    d = json.loads(urllib.request.urlopen(req, timeout=20).read().decode("utf-8"))
    return d["data"]["token"]  # "Bearer eyJ..."


def bcr_soja_semana(token, desde, hasta):
    """Pizarra de soja para un rango de ≤ 7 días → {fecha: precio_int}."""
    url = (f"{BCR_PRECIOS}?idGrano={ID_SOJA}"
           f"&fechaConcertacionDesde={desde}&fechaConcertacionHasta={hasta}&page=1")
    req = urllib.request.Request(url, headers={"accept": "*/*", "Authorization": token})
    d = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
    out = {}
    for it in (d.get("data") or []):
        fecha  = (it.get("fecha_Cotizacion_Dolar") or "")[:10]
        precio = it.get("precio_Cotizacion")
        if fecha and precio:
            out[fecha] = int(round(precio))
    return out


def soja_backfill_bcr(dias):
    """Serie DIARIA de soja pizarra (BCR), iterando de a 1 semana (límite de la API)."""
    token = bcr_login()
    out = {}
    hoy = datetime.date.today()
    cur = hoy - datetime.timedelta(days=dias)
    while cur <= hoy:
        fin = min(cur + datetime.timedelta(days=6), hoy)
        try:
            out.update(bcr_soja_semana(token, cur.isoformat(), fin.isoformat()))
        except Exception as e:
            print(f"  ✗ soja semana {cur}: {e}")
        cur = fin + datetime.timedelta(days=1)
    return out


# ── Supabase (PostgREST) ──────────────────────────────────────────────────

def sb_headers(extra=None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def sb_get_existing(cutoff):
    """Filas ya guardadas desde `cutoff` → {fecha: {"soja":.., "dolar":..}}."""
    url = (f"{SUPABASE_URL}/rest/v1/precios"
           f"?select=fecha,soja,dolar&fecha=gte.{cutoff}&order=fecha.asc")
    rows = json.loads(fetch(url, headers=sb_headers()))
    return {r["fecha"]: {"soja": r.get("soja"), "dolar": r.get("dolar")} for r in rows}


def sb_upsert(rows, chunk=200):
    """Upsert por `fecha` (Prefer: resolution=merge-duplicates)."""
    headers = sb_headers({"Prefer": "resolution=merge-duplicates,return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/precios"
    for i in range(0, len(rows), chunk):
        body = json.dumps(rows[i:i + chunk]).encode("utf-8")
        fetch(url, method="POST", headers=headers, data=body, timeout=30)


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SystemExit("Faltan env vars SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")

    cutoff = (datetime.date.today() - datetime.timedelta(days=DAYS)).isoformat()
    existing = sb_get_existing(cutoff)
    dolar_points = sum(1 for p in existing.values() if p.get("dolar"))
    soja_points  = sum(1 for p in existing.values() if p.get("soja"))

    # to_write: solo las fechas/campos que este run efectivamente calculó
    # (no reescribimos toda la historia — merge-duplicates preserva el resto).
    to_write = {}

    def put(fecha, **kwargs):
        e = to_write.setdefault(fecha, {})
        e.update({k: v for k, v in kwargs.items() if v is not None})

    # Backfill de dólar (solo si la historia está vacía o casi).
    if dolar_points < 30:
        try:
            for fecha, val in dolar_backfill().items():
                put(fecha, dolar=val)
            print(f"✓ backfill dólar: {len(to_write)} días")
        except Exception as e:
            print(f"✗ backfill dólar: {e}")

    # Serie diaria de soja (BCR). Si hay pocos puntos, backfill completo;
    # si ya está densa, solo refrescamos las últimas 2 semanas.
    try:
        dias = DAYS if soja_points < 60 else 14
        soja_serie = soja_backfill_bcr(dias)
        for fecha, val in soja_serie.items():
            put(fecha, soja=val)
        print(f"✓ soja BCR API: {len(soja_serie)} días (backfill {dias}d)")
    except Exception as e:
        print(f"✗ soja BCR API: {e}")
        # Fallback: anclas mensuales + scrape del HTML para hoy.
        for fecha, val in SOJA_SEED.items():
            put(fecha, soja=val)
        try:
            put(datetime.date.today().isoformat(), soja=soja_hoy())
        except Exception as e2:
            print(f"✗ soja hoy (scrape): {e2}")

    # Dólar oficial de hoy.
    today = datetime.date.today().isoformat()
    try:
        put(today, dolar=dolar_hoy())
    except Exception as e:
        print(f"✗ dólar hoy: {e}")

    if not to_write:
        print("Nada para escribir.")
        return

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    items = sorted(to_write.items())

    # PostgREST exige que todos los objetos de un mismo POST tengan las MISMAS
    # claves. Además, con merge-duplicates cada columna enviada se sobreescribe,
    # así que no podemos mandar soja=null en un día que ya tiene soja. Por eso
    # separamos en dos upserts de claves uniformes (soja y dólar); los días con
    # ambos van en los dos y se mergean sin pisarse.
    soja_rows  = [{"fecha": f, "updated_at": now, "soja":  v["soja"]}
                  for f, v in items if v.get("soja")  is not None]
    dolar_rows = [{"fecha": f, "updated_at": now, "dolar": v["dolar"]}
                  for f, v in items if v.get("dolar") is not None]

    if soja_rows:  sb_upsert(soja_rows)
    if dolar_rows: sb_upsert(dolar_rows)

    print(f"→ upsert precios: soja {len(soja_rows)} filas, dólar {len(dolar_rows)} filas")


if __name__ == "__main__":
    main()
