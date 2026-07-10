// Ticket de reparto: dibuja en un canvas la tabla "Reparto de la venta" (quién,
// toneladas, pesos) y lo comparte por el menú nativo del dispositivo (ideal para
// mandarlo por WhatsApp). Si el navegador no soporta compartir archivos, cae en
// descargar la imagen. Todos los importes ya vienen calculados desde la venta.

import { FMT } from './scoring.js'

const FTN = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const FDATE = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// Dibuja el ticket y devuelve una Promise<Blob> (PNG en alta resolución @2x).
function generarTicketBlob({ fecha, grano, filas, totalTn, totalImporte, precio }) {
  const W = 900, rowH = 76, headH = 68, top = 150, totH = 82
  const H = top + headH + filas.length * rowH + 14 + totH + 36

  const cv = document.createElement('canvas')
  cv.width = W * 2; cv.height = H * 2
  const x = cv.getContext('2d')
  x.scale(2, 2)

  const verde = '#1B5E20', verdeClaro = '#E9F4EA', gris = '#6B6B6B'
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H)
  x.textAlign = 'center'

  x.fillStyle = verde; x.font = `800 38px ${FONT}`
  x.fillText('Reparto de la venta', W / 2, 62)
  x.fillStyle = gris; x.font = `400 25px ${FONT}`
  x.fillText('$' + FMT(totalImporte) + '  ·  $' + FMT(precio) + ' por tonelada', W / 2, 106)
  x.font = `400 17px ${FONT}`
  x.fillText((grano ? grano + ' · ' : '') + 'Venta del ' + FDATE(fecha), W / 2, 136)

  const L = 32, TW = W - 64
  const cx = [L + TW * 0.20, L + TW * 0.53, L + TW * 0.82]
  const rr = (x0, y0, w0, h0, r) => {
    x.beginPath(); x.moveTo(x0 + r, y0)
    x.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r); x.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r)
    x.arcTo(x0, y0 + h0, x0, y0, r); x.arcTo(x0, y0, x0 + w0, y0, r); x.closePath()
  }

  // Encabezado de la tabla.
  x.fillStyle = verde; rr(L, top, TW, headH, 14); x.fill()
  x.fillStyle = '#FFFFFF'; x.font = `700 25px ${FONT}`
  ;['Quién', 'Toneladas', 'Pesos'].forEach((t, i) => x.fillText(t, cx[i], top + headH / 2 + 9))

  // Filas por socio (fondo alternado).
  filas.forEach((f, i) => {
    const y = top + headH + i * rowH
    if (i % 2 === 0) { x.fillStyle = verdeClaro; x.fillRect(L, y, TW, rowH) }
    x.fillStyle = '#222222'; x.font = `400 25px ${FONT}`
    x.fillText(f.nombre, cx[0], y + rowH / 2 + 9)
    x.fillText(FTN(f.tn) + ' tn', cx[1], y + rowH / 2 + 9)
    x.fillStyle = verde; x.font = `700 25px ${FONT}`
    x.fillText('$' + FMT(f.importe), cx[2], y + rowH / 2 + 9)
  })

  // Fila TOTAL (recuadrada).
  const ty = top + headH + filas.length * rowH + 14
  x.strokeStyle = verde; x.lineWidth = 2.5; rr(L, ty, TW, totH, 12); x.stroke()
  x.fillStyle = verde; x.font = `700 27px ${FONT}`
  x.fillText('TOTAL', cx[0], ty + totH / 2 + 10)
  x.fillText(FTN(totalTn) + ' tn', cx[1], ty + totH / 2 + 10)
  x.fillText('$' + FMT(totalImporte), cx[2], ty + totH / 2 + 10)

  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'))
}

export async function compartirTicketReparto(datos) {
  const blob = await generarTicketBlob(datos)
  const slug = (datos.grano ? datos.grano.toLowerCase() + '-' : '') + datos.fecha
  const file = new File([blob], `reparto-${slug}.png`, { type: 'image/png' })

  // Compartir nativo (celu): abre el menú del sistema → WhatsApp, mail, etc.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Reparto de la venta', text: 'Reparto del ' + FDATE(datos.fecha) })
      return
    } catch (e) {
      if (e.name === 'AbortError') return // el usuario cerró el menú: no descargamos
    }
  }
  // Fallback (escritorio / sin soporte): descarga la imagen.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
