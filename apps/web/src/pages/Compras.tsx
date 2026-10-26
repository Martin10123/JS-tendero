import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Producto } from '@/lib/api'
import { pesos } from '@/lib/money'

type Proveedor = { id: string; nombre: string }
type Compra = { id: string; total: number; estado: string; proveedor: { nombre: string } }
type Sugerencia = { productoId: string; nombre: string; sugerido: number; stockActual: number }

export function Compras() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [nombre, setNombre] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('6')
  const [costo, setCosto] = useState('')
  const [vence, setVence] = useState('')

  async function cargar() {
    const [prov, lista, items, ideas] = await Promise.all([
      api<Proveedor[]>('/proveedores'),
      api<Compra[]>('/compras'),
      api<Producto[]>('/productos'),
      api<Sugerencia[]>('/compras/sugerencias'),
    ])
    setProveedores(prov)
    setCompras(lista)
    setProductos(items)
    setSugerencias(ideas)
    if (!proveedorId && prov[0]) setProveedorId(prov[0].id)
    if (!productoId && items[0]) setProductoId(items[0].id)
  }

  useEffect(() => {
    void cargar()
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
      <Card className="grid gap-2 p-4 md:grid-cols-[1fr_auto]">
        <Input placeholder="Proveedor nuevo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Button onClick={() => void api('/proveedores', { method: 'POST', body: JSON.stringify({ nombre }) }).then(cargar)}>Agregar</Button>
      </Card>
      <Card className="grid gap-2 p-4">
        <select className="min-h-10 rounded-xl border border-ink/15 bg-cream px-3 text-sm" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
          {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
        </select>
        <select className="min-h-10 rounded-xl border border-ink/15 bg-cream px-3 text-sm" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
        </select>
        <div className="grid gap-2 md:grid-cols-3">
          <Input value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cantidad" />
          <Input value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Costo" />
          <Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </div>
        <Button
          variant="brand"
          onClick={() =>
            void api<Compra>('/compras', {
              method: 'POST',
              body: JSON.stringify({
                proveedorId,
                items: [{ productoId, cantidad: Number(cantidad), costoUnitario: Number(costo), fechaVencimiento: vence || undefined }],
              }),
            }).then(async (compra: Compra) => {
              await api(`/compras/${compra.id}/recibir`, { method: 'POST' })
              await cargar()
            })
          }
        >
          Recibir compra
        </Button>
      </Card>
      <Card className="p-4">
        <p className="font-semibold">Qué pedir</p>
        <ul className="mt-2 space-y-1 text-sm">
          {sugerencias.map((idea) => (
            <li key={idea.productoId}>{idea.nombre}: pedir {idea.sugerido}, hay {idea.stockActual}</li>
          ))}
          {!sugerencias.length && <li className="text-muted">Nada por debajo del mínimo.</li>}
        </ul>
      </Card>
      <ul className="space-y-2 text-sm">
        {compras.map((compra) => (
          <li key={compra.id} className="rounded-2xl bg-cream/80 px-3 py-2">
            {compra.proveedor.nombre} · {pesos(compra.total)} · {compra.estado}
          </li>
        ))}
      </ul>
    </div>
  )
}
