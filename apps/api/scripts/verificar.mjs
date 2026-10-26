const base = 'http://localhost:3000/api'

async function json(path, options = {}, token) {
  const respuesta = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const texto = await respuesta.text()
  let cuerpo
  try { cuerpo = texto ? JSON.parse(texto) : null } catch { cuerpo = texto }
  if (!respuesta.ok) throw new Error(`${options.method || 'GET'} ${path} ${respuesta.status} ${JSON.stringify(cuerpo)}`)
  return cuerpo
}

function assert(cond, mensaje) {
  if (!cond) throw new Error(mensaje)
}

const dueno = await json('/auth/login', { method: 'POST', body: JSON.stringify({ telefono: '3001111111', clave: 'demo1234' }) })
const empleado = await json('/auth/login', { method: 'POST', body: JSON.stringify({ telefono: '3002222222', clave: 'demo1234' }) })
const productosEmpleado = await json('/productos', {}, empleado.token)
assert(productosEmpleado[0].costo === undefined, 'el empleado no debe ver costos')
const productos = await json('/productos', {}, dueno.token)
assert(typeof productos[0].costo === 'number', 'el dueño ve costos')
const pan = productos.find((p) => p.nombre.startsWith('Pan'))
const agua = productos.find((p) => p.nombre.startsWith('Agua'))
const stockAntes = pan.stockActual
const id = crypto.randomUUID()
const venta = {
  id,
  items: [{ productoId: pan.id, cantidad: 1 }, { productoId: agua.id, cantidad: 2 }],
  metodoPago: 'efectivo',
  origen: 'pos',
}
const creada = await json('/ventas', { method: 'POST', body: JSON.stringify(venta) }, dueno.token)
const repetida = await json('/ventas', { method: 'POST', body: JSON.stringify(venta) }, dueno.token)
assert(creada.id === repetida.id, 'la venta repetida debe ser la misma')
const panDespues = (await json('/productos', {}, dueno.token)).find((p) => p.id === pan.id)
assert(panDespues.stockActual === stockAntes - 1, `stock pan ${panDespues.stockActual} esperado ${stockAntes - 1}`)

const syncId = crypto.randomUUID()
const sync = await json('/sync', {
  method: 'POST',
  body: JSON.stringify({
    operaciones: [
      { tipo: 'venta', id: syncId, payload: { items: [{ productoId: agua.id, cantidad: 1 }], metodoPago: 'efectivo', origen: 'pos' } },
      { tipo: 'venta', id: syncId, payload: { items: [{ productoId: agua.id, cantidad: 1 }], metodoPago: 'efectivo', origen: 'pos' } },
    ],
  }),
}, dueno.token)
assert(sync.resultados.every((r) => r.ok), 'sync debe aceptar el duplicado')
const aguaFinal = (await json('/productos', {}, dueno.token)).find((p) => p.id === agua.id)
assert(aguaFinal.stockActual === agua.stockActual - 2 - 1, `agua ${aguaFinal.stockActual} vs ${agua.stockActual - 3}`)

const clientes = await json('/clientes', {}, dueno.token)
const marta = clientes.find((c) => c.nombre.startsWith('Marta'))
const fiado = await json('/ventas', {
  method: 'POST',
  body: JSON.stringify({
    id: crypto.randomUUID(),
    items: [{ productoId: pan.id, cantidad: 1 }],
    metodoPago: 'fiado',
    clienteId: marta.id,
    origen: 'pos',
  }),
}, dueno.token)
assert(fiado.metodoPago === 'fiado', 'fiado')
const abono = await json(`/clientes/${marta.id}/abonos`, {
  method: 'POST',
  body: JSON.stringify({ id: crypto.randomUUID(), monto: 9000, metodoPago: 'efectivo' }),
}, dueno.token)
assert(abono.aplicaciones[0].montoAplicado === 9000, 'FIFO aplica a la deuda vieja')
const detalle = await json(`/clientes/${marta.id}/fiados`, {}, dueno.token)
const viejo = detalle.fiados.find((f) => f.montoOriginal === 9000)
assert(viejo.estado === 'saldado', 'la deuda vieja queda saldada')

const hoy = await json('/dashboard/hoy', {}, dueno.token)
assert(hoy.numero >= 1 && typeof hoy.utilidad === 'number', 'dashboard del dueño')
const hoyEmpleado = await json('/dashboard/hoy', {}, empleado.token)
assert(hoyEmpleado.utilidad === undefined, 'dashboard del empleado sin utilidad')

await json('/caja/abrir', { method: 'POST', body: JSON.stringify({ efectivoInicial: 20000 }) }, dueno.token)
const caja = await json('/caja', {}, dueno.token)
assert(caja.abierta.efectivoEsperado >= 20000, 'caja esperada')

const entrada = await json('/whatsapp/entrada', {
  method: 'POST',
  body: JSON.stringify({ texto: 'Vendí 1 pan tajado, fiado a Marta' }),
}, dueno.token)
assert(entrada.estado === 'pendiente', 'whatsapp queda pendiente')
assert(!entrada.interpretacionJson?.pregunta, JSON.stringify(entrada.interpretacionJson))
const confirmada = await json(`/whatsapp/${entrada.id}/confirmar`, { method: 'POST' }, dueno.token)
assert(confirmada.estado === 'confirmado', 'confirmación escribe la venta')

const publico = await json('/public/la-esquina/productos')
assert(publico.productos.every((p) => p.estado && p.stockActual === undefined && p.costo === undefined), 'catálogo sin cantidades')

const promo = await json('/promociones', {
  method: 'POST',
  body: JSON.stringify({ nombre: 'Pan feliz', productoIds: [pan.id], descuento: 10 }),
}, dueno.token)
assert(promo.descuento === 10, 'promo')
const meta = await json('/metas', { method: 'POST', body: JSON.stringify({ periodo: 'dia', montoObjetivo: 300000 }) }, dueno.token)
assert(meta.montoObjetivo === 300000, 'meta')
const progreso = await json('/metas/progreso', {}, dueno.token)
assert(progreso.vendido > 0, 'progreso')
const sugerencias = await json('/compras/sugerencias', {}, dueno.token)
assert(Array.isArray(sugerencias), 'sugerencias')
const cobros = await json('/jobs/cobros', { method: 'POST' }, dueno.token)
assert(typeof cobros.enviados === 'number', 'cobros')
const resumen = await json('/jobs/resumen', { method: 'POST' }, dueno.token)
assert(resumen.enviados >= 1, 'resumen')
const puntos = await json(`/fidelizacion/${marta.id}`, {}, dueno.token)
assert(puntos.puntos > 0, 'puntos')

console.log('ok', {
  venta: creada.total,
  stockPan: panDespues.stockActual,
  fiado: fiado.total,
  cobros: cobros.enviados,
  puntos: puntos.puntos,
})
