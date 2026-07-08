// Lógica de decisión portada de los prototipos (agro-dashboard / herramientas-campo).
// Pondera precio de soja y dólar relativos a su promedio, más el contexto del
// productor (stock, urgencia, expectativa).

export const FMT = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR')
export const PCT = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%'

// Último precio CONOCIDO de cada serie. La serie de dólar tiene fechas más
// nuevas que la de soja (dólar corre todos los días, incluidos fines de semana;
// la pizarra de soja solo días hábiles y con rezago), así que la última fila por
// fecha suele tener dólar y soja en null. Por eso NO se usa precios[último]:
// se escanea desde el final y se toma, por separado, el último valor no nulo de
// cada serie. Corta apenas tiene ambos. Con serie vacía devuelve todo null.
export function ultimoPrecio(precios) {
  let soja = null, dolar = null, fechaSoja = null, fechaDolar = null
  for (let i = precios.length - 1; i >= 0; i--) {
    const p = precios[i]
    if (soja == null && p.soja != null) { soja = Number(p.soja); fechaSoja = p.fecha }
    if (dolar == null && p.dolar != null) { dolar = Number(p.dolar); fechaDolar = p.fecha }
    if (soja != null && dolar != null) break
  }
  return { soja, dolar, fechaSoja, fechaDolar }
}

export function calcScore(v) {
  const { soja_hoy, dolar_hoy, soja_prom, dolar_prom, stock_d, stock_s, urgencia, expect_s } = v
  if (!soja_hoy || !dolar_hoy || !soja_prom || !dolar_prom) {
    return { score: 0, soja_rel: 0, dolar_rel: 0, razones: [] }
  }
  const soja_rel = (soja_hoy - soja_prom) / soja_prom
  const dolar_rel = (dolar_hoy - dolar_prom) / dolar_prom
  let score = 0
  const razones = []

  score += soja_rel * 3.5
  if (soja_rel > 0.02) razones.push({ c: 'green', t: `Soja ${PCT(soja_rel)} sobre su promedio`, d: 'buen momento para liquidar' })
  else if (soja_rel < -0.02) razones.push({ c: 'red', t: `Soja ${PCT(soja_rel)} bajo su promedio`, d: 'conviene guardarla' })

  score -= dolar_rel * 2.5
  if (dolar_rel > 0.02) razones.push({ c: 'green', t: `Dólar ${PCT(dolar_rel)} sobre su promedio`, d: 'buen momento para vender dólares' })
  else if (dolar_rel < -0.02) razones.push({ c: 'red', t: `Dólar ${PCT(dolar_rel)} bajo su promedio`, d: 'guardá los dólares' })

  score -= (stock_d - 3) * 0.35
  if (stock_d >= 4) razones.push({ c: 'blue', t: 'Buen stock de dólares', d: 'podés vender sin quedar descubierto' })
  if (stock_d <= 2) razones.push({ c: 'yellow', t: 'Poco stock de dólares', d: 'cuidado con vender muchos' })

  score += (stock_s - 3) * 0.25
  if (stock_s >= 4) razones.push({ c: 'green', t: 'Mucha soja en stock', d: 'podés vender sin apuro' })

  score -= (expect_s - 3) * 0.6
  if (expect_s >= 4) razones.push({ c: 'blue', t: 'Esperás que suba la soja', d: 'guardala y vendé dólares ahora' })
  if (expect_s <= 2) razones.push({ c: 'yellow', t: 'Esperás que baje la soja', d: 'mejor vender ahora que después' })

  if (urgencia >= 4) razones.push({ c: 'gray', t: 'Alta urgencia de pesos', d: 'actuá rápido con lo que esté mejor' })

  return { score, soja_rel, dolar_rel, razones }
}

export function veredicto(score) {
  const claro = Math.abs(score) > 1.2
  let v = { title: 'Situación neutral', sub: 'Los precios están cerca de los promedios.', cls: 'neutro' }
  if (score > 0.3) {
    v = {
      title: claro ? '¡Vendé soja!' : 'Leve ventaja: vender soja',
      sub: claro ? 'La soja está sobre su promedio. Buen momento para liquidar.' : 'Pequeña ventaja de vender soja.',
      cls: 'soja',
    }
  }
  if (score < -0.3) {
    v = {
      title: claro ? '¡Vendé dólares!' : 'Leve ventaja: vender dólares',
      sub: claro ? 'El dólar está caro vs promedio. Guardá la soja y liquidá dólares.' : 'Pequeña ventaja de vender dólares.',
      cls: 'dolares',
    }
  }
  return v
}

// Facturación a partir de las ventas (cada una ya tiene su precio capturado).
export function calcFacturacion(ventas) {
  let total = 0
  const porMes = {}
  for (const v of ventas) {
    const imp = Number(v.importe) || Number(v.toneladas) * Number(v.precio_soja)
    total += imp
    const mes = (v.fecha || '').slice(0, 7) // YYYY-MM
    porMes[mes] = (porMes[mes] || 0) + imp
  }
  const meses = Object.keys(porMes).sort()
  const ultimo = meses.length ? { mes: meses[meses.length - 1], importe: porMes[meses[meses.length - 1]] } : null
  return { total, ultimo, porMes }
}
