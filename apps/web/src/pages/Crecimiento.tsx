import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Producto } from '@/lib/api'
import { pesos } from '@/lib/money'

export function Crecimiento() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [productoId, setProductoId] = useState('')
  const [nombre, setNombre] = useState('Combo de la tarde')
  const [descuento, setDescuento] = useState('10')
  const [meta, setMeta] = useState('250000')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    void api<Producto[]>('/productos').then((lista) => {
      setProductos(lista)
      if (lista[0]) setProductoId(lista[0].id)
    })
  }, [])

  async function reporte() {
    const blob = await api<Blob>('/reportes/contador')
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = 'contador.xlsx'
    enlace.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Crecer</h1>
      <Card className="grid gap-2 p-4">
        <p className="font-semibold">Promoción</p>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <select className="min-h-10 rounded-xl border border-ink/15 bg-cream px-3 text-sm" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
        </select>
        <Input value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="% " />
        <Button
          variant="brand"
          onClick={() =>
            void api('/promociones', {
              method: 'POST',
              body: JSON.stringify({ nombre, productoIds: [productoId], descuento: Number(descuento) }),
            }).then(() => setAviso('La promo ya baja el precio en el mostrador'))
          }
        >
          Activar promo
        </Button>
      </Card>
      <Card className="grid gap-2 p-4">
        <p className="font-semibold">Meta del día</p>
        <Input value={meta} onChange={(e) => setMeta(e.target.value)} />
        <Button onClick={() => void api('/metas', { method: 'POST', body: JSON.stringify({ periodo: 'dia', montoObjetivo: Number(meta) }) }).then(() => setAviso('Meta guardada. Se ve en Hoy.'))}>
          Guardar meta
        </Button>
      </Card>
      <Card className="p-4">
        <p className="font-semibold">Para el contador</p>
        <p className="mt-1 text-sm text-muted">Ventas, compras e IVA estimado del día.</p>
        <Button className="mt-3" variant="outline" onClick={() => void reporte()}>Bajar Excel</Button>
      </Card>
      {aviso && <p className="text-sm text-moss">{aviso}</p>}
    </div>
  )
}
