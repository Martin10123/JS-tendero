import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Paginacion } from '@/components/Paginacion'
import { ProductoFoto } from '@/components/ProductoFoto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { pesos } from '@/lib/money'

type Item = { id: string; nombre: string; precio: number; unidad: string; estado: string }
type Respuesta = { tienda: { nombre: string; telefonoWhatsapp: string | null }; productos: Item[] }

export function Publico() {
  const { slug = '' } = useParams()
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [carrito, setCarrito] = useState<Record<string, number>>({})
  const [telefono, setTelefono] = useState('')
  const [aviso, setAviso] = useState('')
  const [pagina, setPagina] = useState(0)

  async function cargar() {
    const respuesta = await fetch(`/api/public/${slug}/productos`)
    if (respuesta.ok) setDatos(await respuesta.json())
  }

  useEffect(() => {
    void cargar()
    const fuente = new EventSource(`/api/public/${slug}/stream`)
    fuente.onmessage = () => void cargar()
    return () => fuente.close()
  }, [slug])

  const lineas = useMemo(() => {
    return Object.entries(carrito)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([id, cantidad]) => {
        const producto = datos?.productos.find((item) => item.id === id)
        return { id, cantidad, nombre: producto?.nombre ?? '', precio: producto?.precio ?? 0 }
      })
  }, [carrito, datos])

  const total = lineas.reduce((suma, linea) => suma + linea.precio * linea.cantidad, 0)
  const porPagina = 6
  const productos = datos?.productos ?? []
  const paginas = Math.max(1, Math.ceil(productos.length / porPagina))
  const paginaSegura = Math.min(pagina, paginas - 1)
  const visibles = productos.slice(paginaSegura * porPagina, paginaSegura * porPagina + porPagina)

  function pedirWhatsapp() {
    const texto = encodeURIComponent(
      `Hola, quiero pedir:\n${lineas.map((linea) => `- ${linea.cantidad} ${linea.nombre}`).join('\n')}\nTotal estimado ${pesos(total)}`,
    )
    const destino = datos?.tienda.telefonoWhatsapp || ''
    window.open(`https://wa.me/${destino}?text=${texto}`, '_blank')
  }

  async function dejarPedido() {
    await fetch(`/api/public/${slug}/pedido`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telefono,
        items: lineas.map((linea) => ({ productoId: linea.id, cantidad: linea.cantidad })),
      }),
    })
    setAviso('Pedido enviado. La tienda lo confirma antes de descontar.')
    setCarrito({})
  }

  return (
    <div className="relative min-h-dvh bg-paper px-4 py-8">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-16 top-0 h-64 w-64 rounded-full bg-saffron/20 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-64 w-64 rounded-full bg-clay/15 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">Catálogo</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{datos?.tienda.nombre ?? 'Tienda'}</h1>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {visibles.map((producto) => {
            const elegida = carrito[producto.id] || 0
            return (
            <article
              key={producto.id}
              className={`relative rounded-3xl border p-4 backdrop-blur-xl ${elegida ? 'border-saffron bg-saffron/20 ring-2 ring-saffron' : 'border-ink/10 bg-cream/80'}`}
            >
              {elegida > 0 && (
                <span className="absolute -top-2 -right-2 grid h-6 min-w-6 place-items-center rounded-full bg-[#c2412d] px-1.5 text-xs font-bold text-white tabular-nums">
                  {elegida}
                </span>
              )}
              <div className="flex items-start gap-3">
                <ProductoFoto nombre={producto.nombre} className="h-16 w-16" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{producto.nombre}</h2>
                    <span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold">{producto.estado}</span>
                  </div>
                  <p className="tabular-nums">{pesos(producto.precio)}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="h-11 w-11 rounded-xl bg-paper" onClick={() => setCarrito((actual) => ({ ...actual, [producto.id]: Math.max(0, (actual[producto.id] || 0) - 1) }))}>−</button>
                <span className="grid h-11 w-8 place-items-center tabular-nums">{carrito[producto.id] || 0}</span>
                <button className="h-11 w-11 rounded-xl bg-ink text-cream" disabled={producto.estado === 'agotado'} onClick={() => setCarrito((actual) => ({ ...actual, [producto.id]: (actual[producto.id] || 0) + 1 }))}>+</button>
              </div>
            </article>
            )
          })}
        </div>
        <div className="mt-4 pb-44">
          <Paginacion pagina={paginaSegura} paginas={paginas} onChange={setPagina} />
        </div>
        <div className="sticky bottom-3 rounded-3xl border border-ink/10 bg-cream/90 p-4 backdrop-blur-xl">
          <p className="font-semibold tabular-nums">Pedido {pesos(total)}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input inputMode="numeric" placeholder="Tu WhatsApp" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            <Button variant="outline" disabled={!lineas.length} onClick={pedirWhatsapp}>Pedir por WhatsApp</Button>
            <Button variant="brand" disabled={!lineas.length || telefono.length < 10} onClick={() => void dejarPedido()}>Enviar pedido</Button>
          </div>
          {aviso && <p className="mt-2 text-sm text-moss">{aviso}</p>}
        </div>
      </div>
    </div>
  )
}
