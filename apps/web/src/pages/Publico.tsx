import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Search } from 'lucide-react'
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
  const grilla = useRef<HTMLDivElement>(null)
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [carrito, setCarrito] = useState<Record<string, number>>({})
  const [telefono, setTelefono] = useState('')
  const [aviso, setAviso] = useState('')
  const [q, setQ] = useState('')
  const [pagina, setPagina] = useState(0)
  const [medidas, setMedidas] = useState({ columnas: 5, filas: 3 })

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

  useEffect(() => {
    const medir = () => {
      const caja = grilla.current
      if (!caja) return
      const columnas = caja.clientWidth >= 760 ? 5 : caja.clientWidth >= 520 ? 3 : 2
      const filas = Math.max(1, Math.floor(caja.clientHeight / 96))
      setMedidas((actual) => (actual.columnas === columnas && actual.filas === filas ? actual : { columnas, filas }))
    }
    medir()
    const obs = new ResizeObserver(medir)
    if (grilla.current) obs.observe(grilla.current)
    return () => obs.disconnect()
  }, [datos])

  const lista = useMemo(() => {
    const texto = q.trim().toLowerCase()
    const base = datos?.productos ?? []
    return texto ? base.filter((item) => item.nombre.toLowerCase().includes(texto)) : base
  }, [datos, q])

  const porPagina = medidas.columnas * medidas.filas
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina))
  const paginaSegura = Math.min(pagina, paginas - 1)
  const visibles = lista.slice(paginaSegura * porPagina, paginaSegura * porPagina + porPagina)

  const lineas = useMemo(() => {
    return Object.entries(carrito)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([id, cantidad]) => {
        const producto = datos?.productos.find((item) => item.id === id)
        return { id, cantidad, nombre: producto?.nombre ?? '', precio: producto?.precio ?? 0 }
      })
  }, [carrito, datos])

  const total = lineas.reduce((suma, linea) => suma + linea.precio * linea.cantidad, 0)
  const piezas = lineas.reduce((suma, linea) => suma + linea.cantidad, 0)

  function cambiar(id: string, delta: number) {
    setAviso('')
    setCarrito((actual) => {
      const siguiente = Math.max(0, (actual[id] || 0) + delta)
      const copia = { ...actual }
      if (siguiente === 0) delete copia[id]
      else copia[id] = siguiente
      return copia
    })
  }

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
    <div className="relative flex h-dvh flex-col overflow-hidden bg-paper">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-16 top-0 h-64 w-64 rounded-full bg-saffron/20 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-64 w-64 rounded-full bg-clay/15 blur-3xl" />
      </div>
      <header className="relative flex shrink-0 items-end justify-between gap-3 px-4 pt-4 pb-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">Catálogo</p>
          <h1 className="text-2xl font-semibold tracking-tight">{datos?.tienda.nombre ?? 'Tienda'}</h1>
        </div>
        <p className="text-sm text-muted">{lista.length} productos</p>
      </header>
      <div className="relative grid min-h-0 flex-1 gap-3 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-h-0 flex-col">
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted" />
            <Input
              className="pl-8"
              placeholder="Buscar producto"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPagina(0)
              }}
            />
          </div>
          <div ref={grilla} className="mt-2 min-h-0 flex-1">
            <div
              className="grid h-full content-start gap-1.5"
              style={{ gridTemplateColumns: `repeat(${medidas.columnas}, minmax(0, 1fr))` }}
            >
              {visibles.map((producto) => {
                const elegida = carrito[producto.id] || 0
                const agotado = producto.estado === 'agotado'
                return (
                  <button
                    key={producto.id}
                    type="button"
                    disabled={agotado}
                    onClick={() => cambiar(producto.id, 1)}
                    className={`relative rounded-xl border p-2 text-left shadow-[0_16px_40px_-28px_rgba(28,22,18,0.6)] backdrop-blur-xl transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                      elegida ? 'border-saffron bg-saffron/20 ring-2 ring-saffron' : 'border-ink/10 bg-cream/80'
                    }`}
                  >
                    {elegida > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-[#c2412d] px-1 text-[11px] font-bold text-white tabular-nums">
                        {elegida}
                      </span>
                    )}
                    <ProductoFoto nombre={producto.nombre} className="mb-1 h-8 w-full text-base" />
                    <p className="truncate text-sm font-semibold leading-tight">{producto.nombre}</p>
                    <p className="text-xs tabular-nums">{pesos(producto.precio)}</p>
                    <p className={`text-[11px] ${producto.estado === 'disponible' ? 'text-moss' : 'text-muted'}`}>{producto.estado}</p>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-2 shrink-0">
            <Paginacion pagina={paginaSegura} paginas={paginas} onChange={setPagina} />
          </div>
        </section>
        <aside className="flex max-h-[42%] min-h-0 flex-col rounded-3xl border border-ink/10 bg-cream/80 p-4 shadow-[0_20px_50px_-32px_rgba(28,22,18,0.55)] backdrop-blur-xl lg:max-h-none">
          <div className="flex shrink-0 items-baseline justify-between gap-3">
            <p className="font-semibold">Tu pedido{piezas > 0 ? ` · ${piezas}` : ''}</p>
            <p className="text-lg font-semibold tabular-nums">{pesos(total)}</p>
          </div>
          <ul className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-auto">
            {lineas.length ? (
              lineas.map((linea) => (
                <li key={linea.id} className="flex items-center gap-2 rounded-2xl border border-saffron/50 bg-saffron/20 px-2 py-1.5">
                  <ProductoFoto nombre={linea.nombre} className="h-10 w-10 text-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{linea.nombre}</p>
                    <p className="text-xs tabular-nums text-muted">{pesos(linea.precio * linea.cantidad)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="grid h-7 w-7 place-items-center rounded-lg bg-cream" aria-label={`Quitar ${linea.nombre}`} onClick={() => cambiar(linea.id, -1)}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">{linea.cantidad}</span>
                    <button type="button" className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-cream" aria-label={`Sumar ${linea.nombre}`} onClick={() => cambiar(linea.id, 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))
            ) : (
              <li className="rounded-2xl bg-paper px-3 py-4 text-sm text-muted">Toca un producto y queda aquí, con su total.</li>
            )}
          </ul>
          <div className="mt-3 shrink-0 space-y-2 border-t border-ink/10 pt-3">
            <label className="text-sm font-medium text-ink/80" htmlFor="whatsapp">
              Tu WhatsApp
            </label>
            <Input id="whatsapp" inputMode="numeric" placeholder="300 000 0000" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!lineas.length} onClick={pedirWhatsapp}>
                WhatsApp
              </Button>
              <Button variant="brand" disabled={!lineas.length || telefono.length < 10} onClick={() => void dejarPedido()}>
                Enviar pedido
              </Button>
            </div>
            {aviso && <p className="text-sm text-moss">{aviso}</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}
