# campo-app — Resumen funcional

**Aplicación de gestión de venta de granos (soja) para grupos de productores.**
Permite a un grupo de socios registrar sus ventas de soja, seguir la facturación
y repartir el resultado entre los integrantes, con el precio oficial del día
capturado en cada operación.

App web: **https://campo-app-six.vercel.app** (se usa desde el celular o la
computadora, sin instalar nada).

> **Aclaración importante para el contador:** campo-app es una herramienta de
> **gestión y control interno**, NO un sistema de facturación fiscal. **No emite
> comprobantes electrónicos de AFIP/ARCA** (facturas A/B/C, ni Liquidación
> Primaria de Granos). Donde la app dice "facturado" se refiere al **importe
> vendido / ingreso registrado**, no a un comprobante fiscal. Sirve para llevar
> el control de las ventas y el reparto entre socios; la documentación fiscal se
> emite por los canales habituales (acopio, exportador, etc.).

---

## Para quién es

Un **grupo** (una explotación o sociedad de hecho) formado por varios **socios**
que arriendan un campo y venden la soja de la campaña. Ejemplo: Manu, Marti y
Tomás comparten un contrato y reparten lo que se vende.

- Cada socio puede tener **su propia cuenta** (ingreso con Google) y ver los
  datos del grupo en tiempo real.
- Un **administrador** gestiona la estructura (socios, contrato, invitaciones);
  los demás pueden ver todo y registrar ventas.

---

## Qué información registra y guarda

### Ventas (el dato central)
Cada venta queda registrada con:

| Dato | Detalle |
|---|---|
| **Fecha** | Día de la operación |
| **Socio** | A quién corresponde la venta dentro del grupo |
| **Toneladas** | Cantidad vendida |
| **Precio soja $/tn** | **Precio oficial de pizarra (Cámara Arbitral de la Bolsa de Comercio de Rosario) del día**, capturado automáticamente al registrar. **No es editable a mano.** |
| **Importe** | Se calcula solo: toneladas × precio. Queda fijo aunque el precio cambie después. |

**Trazabilidad:** como el precio se toma de la fuente oficial y se congela en el
momento de la venta, el importe de cada operación es reproducible y no se puede
"acomodar" a mano.

### Estructura del grupo
- **Contrato / campaña:** nombre, año y toneladas totales del arrendamiento.
- **Socios:** nombre y participación (en toneladas) de cada uno en el contrato.

### Precios de mercado (serie diaria)
- **Soja:** pizarra Rosario ($/tn), fuente Cámara Arbitral de la BCR.
- **Dólar oficial** ($/USD).
- Se **actualizan automáticamente todos los días hábiles** mediante un proceso
  programado. El usuario no los carga ni los puede modificar: son datos duros.

---

## Qué muestra e informa

### Historial de ventas
- Todas las ventas **agrupadas por fecha** (cada fecha es "una venta" del grupo
  con el desglose de los socios que participaron ese día).
- **Resumen por socio:** total de toneladas vendidas y monto por cada integrante.
- **Totales del grupo:** total vendido (tn), facturado total ($) e importe del
  último mes con actividad.

### Tickets de reparto
Por cada fecha de venta, la app genera un **comprobante de reparto** (imagen)
con la tabla **Quién / Toneladas / Pesos** y el total, listo para **compartir
por WhatsApp** o descargar. Es el detalle de cómo se distribuye lo vendido entre
los socios (uso interno del grupo, no fiscal).

### Ayuda a la decisión (opcional)
Una sección que sugiere, según el precio de la soja y del dólar respecto de sus
promedios recientes, si conviene vender soja o vender dólares. Es orientativo, no
afecta los registros.

### Calculadora de venta
Al registrar, se puede tipear las **toneladas** o los **pesos** y la app calcula
el otro valor automáticamente, siempre al precio oficial del día.

---

## Acceso y seguridad de los datos

- **Ingreso con cuenta de Google** (no hay contraseñas que administrar).
- **Cada grupo ve únicamente sus propios datos.** El aislamiento entre grupos se
  garantiza a nivel de base de datos (no depende del programa), de modo que un
  socio de un grupo no puede acceder a los datos de otro.
- **Roles:** el administrador controla la estructura y las invitaciones; los
  socios operan (ven y registran ventas) pero no pueden alterar la configuración.
- **Invitaciones por código** de un solo uso y con vencimiento, para sumar
  socios de forma controlada. Se puede **desvincular** a un socio (le corta el
  acceso) sin borrar su historial de ventas ni su cuenta personal.

---

## Estado del proyecto

- **En producción y en uso**, actualizándose de forma continua.
- Datos alojados en base de datos administrada (respaldos automáticos).
- Pensada para funcionar como **web + app móvil** (Android / iOS).

### Posible evolución (a evaluar con el contador)
- **Integración con facturación electrónica de ARCA/AFIP** (por ejemplo
  Liquidación Primaria de Granos), para pasar del control interno a la emisión
  de comprobantes. Requiere definiciones fiscales previas (tipo de comprobante,
  CUIT emisor, punto de venta, certificado digital).
- Reportes exportables (planilla / PDF) para la contabilidad.

---

*Documento de resumen funcional. Para dudas sobre el tratamiento fiscal de las
ventas de granos, el reparto entre socios o la eventual integración con ARCA,
está la disposición para conversarlo.*
