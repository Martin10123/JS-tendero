import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { ProductoFoto } from '@/components/ProductoFoto'
import { Card } from '@/components/ui/card'
import { api, type Producto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { pesos } from '@/lib/money'

export function Catalogo() {
  const { usuario } = useAuth()
  const [productos, setProductos] = useState<Producto[]>([])
  const url = `${location.origin}/t/${usuario?.slug ?? ''}`

  useEffect(() => {
    void api<Producto[]>('/productos').then(setProductos)
  }, [])

  async function alternar(producto: Producto) {
    await api(`/productos/${producto.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibleCatalogo: !producto.visibleCatalogo }),
    })
    setProductos(await api<Producto[]>('/productos'))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
      <Card className="flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center">
        <QRCodeSVG value={url} size={128} bgColor="#faf7f2" fgColor="#1c1612" />
        <div>
          <p className="font-semibold">QR de la tienda</p>
          <a className="text-sm underline" href={url}>{url}</a>
          <p className="mt-2 text-sm text-muted">El cliente ve disponible, quedan pocos o agotado. Nunca la cantidad.</p>
        </div>
      </Card>
      <div className="grid grid-cols-2 content-start gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {productos.map((producto) => (
          <Card key={producto.id} className="rounded-xl p-2">
            <ProductoFoto nombre={producto.nombre} className="mb-1 h-8 w-full text-base" />
            <p className="text-sm font-semibold leading-tight">{producto.nombre}</p>
            <p className="text-xs tabular-nums">{pesos(producto.precio)}</p>
            {usuario?.rol === 'dueno' && (
              <button
                className={`mt-1.5 h-6 w-full rounded-md text-[11px] font-semibold ${producto.visibleCatalogo ? 'bg-moss text-cream' : 'bg-paper text-muted'}`}
                onClick={() => void alternar(producto)}
              >
                {producto.visibleCatalogo ? 'Visible' : 'Oculto'}
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
