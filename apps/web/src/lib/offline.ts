import Dexie, { type Table } from 'dexie'
import { api, type Cliente, type Producto } from './api'

export type Operacion = {
  id: string
  tipo: 'venta' | 'abono'
  payload: Record<string, unknown>
  creado: number
}

class MostradorDB extends Dexie {
  productos!: Table<Producto, string>
  clientes!: Table<Cliente, string>
  cola!: Table<Operacion, string>

  constructor() {
    super('mostrador')
    this.version(1).stores({
      productos: 'id, nombre, esFavorito, codigoBarras',
      clientes: 'id, nombre',
      cola: 'id, creado',
    })
  }
}

export const db = new MostradorDB()

export async function guardarCatalogo(productos: Producto[], clientes: Cliente[]) {
  await db.transaction('rw', db.productos, db.clientes, async () => {
    await db.productos.clear()
    await db.clientes.clear()
    await db.productos.bulkPut(productos)
    await db.clientes.bulkPut(clientes)
  })
  await reaplicarCola()
}

async function reaplicarCola() {
  const cola = await db.cola.toArray()
  for (const operacion of cola) {
    if (operacion.tipo !== 'venta') continue
    const items = (operacion.payload.items as { productoId: string; cantidad: number }[]) ?? []
    for (const item of items) {
      const producto = await db.productos.get(item.productoId)
      if (producto) {
        await db.productos.update(producto.id, { stockActual: producto.stockActual - item.cantidad })
      }
    }
  }
}

export async function precargar() {
  const [productos, clientes] = await Promise.all([
    api<Producto[]>('/productos'),
    api<Cliente[]>('/clientes'),
  ])
  await guardarCatalogo(productos, clientes)
  return { productos, clientes }
}

export async function encolar(tipo: Operacion['tipo'], id: string, payload: Record<string, unknown>) {
  await db.cola.put({ id, tipo, payload, creado: Date.now() })
  if (tipo === 'venta') {
    const items = (payload.items as { productoId: string; cantidad: number }[]) ?? []
    for (const item of items) {
      const producto = await db.productos.get(item.productoId)
      if (producto) await db.productos.update(producto.id, { stockActual: producto.stockActual - item.cantidad })
    }
  }
}

export async function sincronizar() {
  const cola = await db.cola.orderBy('creado').toArray()
  if (!cola.length || !navigator.onLine) return { pendientes: cola.length }
  const respuesta = await api<{ resultados: { id: string; ok: boolean }[] }>('/sync', {
    method: 'POST',
    body: JSON.stringify({
      operaciones: cola.map((operacion) => ({ tipo: operacion.tipo, id: operacion.id, payload: operacion.payload })),
    }),
  })
  for (const resultado of respuesta.resultados) {
    if (resultado.ok) await db.cola.delete(resultado.id)
  }
  if (navigator.onLine) await precargar()
  const pendientes = await db.cola.count()
  return { pendientes }
}
