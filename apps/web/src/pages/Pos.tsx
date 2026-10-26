import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, Loader2, Minus, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Paginacion } from '@/components/Paginacion'
import { ProductoFoto } from '@/components/ProductoFoto'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ApiError, type Cliente, type Producto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cantidad, pesos } from '@/lib/money'
import { db, encolar, precargar, sincronizar } from '@/lib/offline'

type Linea = { producto: Producto; cantidad: number; suelto: boolean }

function empaqueDe(nombre: string) {
  const n = Number(nombre.match(/x\s*(\d+)/i)?.[1] ?? 0)
  return n > 1 ? n : 0
}

function valorLinea(linea: Linea) {
  const n = empaqueDe(linea.producto.nombre)
  if (linea.suelto && n) return Math.round((linea.producto.precio * linea.cantidad) / n)
  return linea.producto.precio * linea.cantidad
}

function itemVenta(linea: Linea) {
  const n = empaqueDe(linea.producto.nombre)
  if (!linea.suelto || !n) return { productoId: linea.producto.id, cantidad: linea.cantidad }
  const milli = Math.max(1, Math.round((linea.cantidad * 1000) / n))
  const deseado = Math.round((linea.producto.precio * linea.cantidad) / n)
  let precio = Math.max(1, Math.round((deseado * 1000) / milli))
  const cobra = (valor: number) => Math.round((valor * milli) / 1000)
  while (cobra(precio) < deseado) precio += 1
  while (precio > 1 && cobra(precio) > deseado) precio -= 1
  return { productoId: linea.producto.id, cantidad: milli / 1000, precioUnitario: precio }
}

export function Pos() {
  const { usuario } = useAuth()
  const [productos, setProductos] = useState<Producto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [q, setQ] = useState('')
  const [carrito, setCarrito] = useState<Linea[]>([])
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia' | 'fiado'>('efectivo')
  const [clienteId, setClienteId] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [escaner, setEscaner] = useState(false)
  const [cobro, setCobro] = useState(false)
  const [recibido, setRecibido] = useState('')
  const [cierre, setCierre] = useState<{ titulo: string; detalle: string } | null>(null)
  const [pagina, setPagina] = useState(0)
  const [porPagina, setPorPagina] = useState(6)
  const video = useRef<HTMLVideoElement>(null)

  async function cargar() {
    if (!navigator.onLine) {
      setProductos(await db.productos.toArray())
      setClientes(await db.clientes.toArray())
      return
    }
    try {
      const datos = await precargar()
      setProductos(datos.productos)
      setClientes(datos.clientes)
      await sincronizar()
    } catch {
      setProductos(await db.productos.toArray())
      setClientes(await db.clientes.toArray())
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  useEffect(() => {
    const medir = () => {
      const ancho = window.innerWidth
      const alto = window.innerHeight
      const columnas = ancho >= 1280 ? 5 : ancho >= 1024 ? 4 : ancho >= 640 ? 3 : 2
      const reservado = ancho < 1024 ? 340 : 140
      const filas = Math.max(ancho < 768 ? 4 : 5, Math.floor((alto - reservado) / 82))
      setPorPagina(columnas * filas)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  useEffect(() => {
    if (!escaner || !video.current) return
    const lector = new BrowserMultiFormatReader()
    let activo = true
    let controles: { stop: () => void } | undefined
    void lector.decodeFromVideoDevice(undefined, video.current, (resultado) => {
      if (!activo || !resultado) return
      const codigo = resultado.getText()
      const producto = productos.find((item) => item.codigoBarras === codigo)
      if (producto) {
        sumar(producto)
        setEscaner(false)
      } else setError('Ese código no está en la tienda')
    }).then((control) => {
      controles = control
      if (!activo) control.stop()
    })
    return () => {
      activo = false
      controles?.stop()
    }
  }, [escaner, productos])

  const lista = useMemo(() => {
    const texto = q.trim().toLowerCase()
    const base = texto ? productos.filter((item) => item.nombre.toLowerCase().includes(texto)) : productos
    return [...base].sort((a, b) => Number(b.esFavorito) - Number(a.esFavorito) || a.nombre.localeCompare(b.nombre, 'es'))
  }, [productos, q])

  const paginas = Math.max(1, Math.ceil(lista.length / porPagina))
  const paginaSegura = Math.min(pagina, paginas - 1)
  const visibles = lista.slice(paginaSegura * porPagina, paginaSegura * porPagina + porPagina)

  function buscar(valor: string) {
    setQ(valor)
    setPagina(0)
  }

  const total = carrito.reduce((suma, linea) => suma + valorLinea(linea), 0)
  const pago = Number(recibido.replace(/\D/g, '')) || 0
  const vuelto = pago - total
  const billetes = [2000, 5000, 10000, 20000, 50000, 100000].filter((billete) => billete > total).slice(0, 4)

  function sumar(producto: Producto, delta = 1) {
    setError('')
    setCarrito((actual) => {
      const previa = actual.find((linea) => linea.producto.id === producto.id)
      if (!previa) return delta > 0 ? [...actual, { producto, cantidad: delta, suelto: false }] : actual
      const cantidad = previa.cantidad + delta
      if (cantidad <= 0) return actual.filter((linea) => linea.producto.id !== producto.id)
      return actual.map((linea) => (linea.producto.id === producto.id ? { ...linea, cantidad } : linea))
    })
  }

  function venderSuelto(productoId: string, suelto: boolean) {
    setCarrito((actual) =>
      actual.map((linea) => (linea.producto.id === productoId ? { ...linea, suelto, cantidad: 1 } : linea)),
    )
  }

  function abrirCobro() {
    setError('')
    setAviso('')
    setCierre(null)
    setRecibido('')
    if (!carrito.length) return
    if (metodo === 'fiado' && !clienteId) {
      setError('Elige a quién se lo fías')
      return
    }
    setCobro(true)
  }

  function cerrarCobro() {
    if (cargando) return
    setCobro(false)
    setCierre(null)
    setRecibido('')
  }

  async function cobrar() {
    setError('')
    setAviso('')
    if (!carrito.length) return
    if (metodo === 'fiado' && !clienteId) {
      setError('Elige a quién se lo fías')
      return
    }
    if (metodo === 'efectivo' && pago < total) return
    const id = crypto.randomUUID()
    const payload = {
      items: carrito.map(itemVenta),
      metodoPago: metodo,
      clienteId: metodo === 'fiado' ? clienteId : undefined,
      origen: 'pos',
    }
    setCargando(true)
    try {
      const cliente = clientes.find((item) => item.id === clienteId)
      if (!navigator.onLine) {
        await encolar('venta', id, payload)
        setProductos(await db.productos.toArray())
        setCierre({ titulo: 'Guardada en el celular', detalle: 'Sube sola cuando vuelva la red.' })
      } else {
        await api('/ventas', { method: 'POST', body: JSON.stringify({ ...payload, id }) })
        await cargar()
        setCierre(
          metodo === 'efectivo'
            ? { titulo: vuelto > 0 ? 'Devuelve' : 'Listo', detalle: vuelto > 0 ? pesos(vuelto) : 'Pagó justo' }
            : metodo === 'fiado'
              ? { titulo: 'Fiado', detalle: `${cliente?.nombre ?? 'El cliente'} queda debiendo ${pesos(total)}` }
              : { titulo: 'Listo', detalle: `Transferencia de ${pesos(total)}` },
        )
      }
      setCarrito([])
      setClienteId('')
    } catch (causa) {
      if (causa instanceof ApiError && navigator.onLine) setError(causa.message)
      else {
        await encolar('venta', id, payload)
        setAviso('No pude enviarla. Quedó guardada para sincronizar.')
        setCarrito([])
      }
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted" />
            <Input className="pl-8" placeholder="Buscar producto" value={q} onChange={(e) => buscar(e.target.value)} />
          </div>
          <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Escanear código" onClick={() => setEscaner(true)}>
            <Camera className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-2 content-start gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibles.map((producto) => {
            const elegida = carrito.find((linea) => linea.producto.id === producto.id)?.cantidad ?? 0
            return (
              <button
                key={producto.id}
                onClick={() => sumar(producto)}
                className={`relative rounded-xl border p-2 text-left shadow-[0_16px_40px_-28px_rgba(28,22,18,0.6)] backdrop-blur-xl transition active:scale-[0.98] ${
                  elegida
                    ? 'border-saffron bg-saffron/20 ring-2 ring-saffron'
                    : 'border-ink/10 bg-cream/80'
                }`}
              >
                {elegida > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-[#c2412d] px-1 text-[11px] font-bold text-white tabular-nums">
                    {elegida}
                  </span>
                )}
                <ProductoFoto nombre={producto.nombre} className="mb-1 h-8 w-full text-base" />
                <p className="text-sm font-semibold leading-tight">{producto.nombre}</p>
                <p className="text-xs tabular-nums">{pesos(producto.precio)}</p>
                <p className="text-[11px] text-muted">{cantidad(producto.stockActual, producto.unidad)}</p>
              </button>
            )
          })}
        </div>
        <div className="mt-3 pb-56 lg:pb-0">
          <Paginacion pagina={paginaSegura} paginas={paginas} onChange={setPagina} />
        </div>
      </section>
      <aside className="fixed inset-x-0 bottom-16 z-10 flex max-h-[46dvh] flex-col border-t border-ink/10 bg-cream/95 p-3 backdrop-blur-xl md:bottom-0 md:left-56 lg:sticky lg:top-0 lg:bottom-auto lg:left-auto lg:max-h-[calc(100dvh-2rem)] lg:rounded-3xl lg:border lg:border-ink/10 lg:bg-cream/80 lg:p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <p className="text-sm font-semibold">Cuenta{carrito.length > 0 ? ` · ${carrito.reduce((n, linea) => n + linea.cantidad, 0)}` : ''}</p>
          <p className="text-base font-semibold tabular-nums">{pesos(total)}</p>
        </div>
        <ul className="min-h-0 space-y-1.5 overflow-auto lg:max-h-[calc(100dvh-16rem)]">
          {carrito.map((linea) => (
            <li key={linea.producto.id} className="flex items-center gap-1.5 rounded-2xl border border-saffron/50 bg-saffron/20 px-2 py-1.5">
              <ProductoFoto nombre={linea.producto.nombre} className="h-10 w-10 text-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{linea.producto.nombre}</p>
                {empaqueDe(linea.producto.nombre) > 0 && (
                  <div className="mt-0.5 flex gap-1">
                    <button
                      type="button"
                      className={`h-5 rounded px-1.5 text-[10px] font-semibold ${linea.suelto ? 'bg-cream text-muted' : 'bg-ink text-cream'}`}
                      onClick={() => venderSuelto(linea.producto.id, false)}
                    >
                      x{empaqueDe(linea.producto.nombre)}
                    </button>
                    <button
                      type="button"
                      className={`h-5 rounded px-1.5 text-[10px] font-semibold ${linea.suelto ? 'bg-ink text-cream' : 'bg-cream text-muted'}`}
                      onClick={() => venderSuelto(linea.producto.id, true)}
                    >
                      und
                    </button>
                  </div>
                )}
                <p className="text-xs font-medium tabular-nums">{pesos(valorLinea(linea))}</p>
              </div>
              <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cream" aria-label="Quitar uno" onClick={() => sumar(linea.producto, -1)}>
                <Minus className="h-4 w-4" />
              </button>
              <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-[#c2412d] px-1.5 text-sm font-bold text-white tabular-nums">
                {linea.cantidad}
              </span>
              <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-cream" aria-label="Sumar uno" onClick={() => sumar(linea.producto)}>
                <Plus className="h-4 w-4" />
              </button>
              <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" aria-label="Quitar" onClick={() => setCarrito((actual) => actual.filter((item) => item.producto.id !== linea.producto.id))}>
                <Trash2 className="h-4 w-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 shrink-0">
        <div className="grid grid-cols-3 gap-1">
          {(['efectivo', 'transferencia', 'fiado'] as const).map((opcion) => (
            <button
              key={opcion}
              onClick={() => setMetodo(opcion)}
              className={`min-h-9 rounded-lg text-xs font-semibold capitalize ${metodo === opcion ? 'bg-ink text-cream' : 'bg-paper'}`}
            >
              {opcion}
            </button>
          ))}
        </div>
        {metodo === 'fiado' && (
          <select
            className="mt-2 min-h-9 w-full rounded-lg border border-ink/15 bg-cream px-2 text-sm"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">¿A quién?</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre} · debe {pesos(cliente.saldo)} · score {cliente.score}
              </option>
            ))}
          </select>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-clay">{error}</p>}
        {aviso && <p className="mt-2 text-sm text-moss">{aviso}</p>}
        <Button variant="brand" className="mt-3 w-full" onClick={abrirCobro} disabled={!carrito.length}>
          Cobrar
        </Button>
        {usuario?.rol === 'empleado' && <Badge className="mt-2">Sin costos</Badge>}
        </div>
      </aside>
      {cobro && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={cerrarCobro}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cobro-titulo"
            className="w-full max-w-md rounded-3xl border border-ink/10 bg-cream p-5 shadow-2xl"
            onClick={(evento) => evento.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="cobro-titulo" className="text-lg font-semibold">{cierre ? cierre.titulo : 'Confirmar venta'}</p>
                <p className="text-sm text-muted">{cierre ? 'Ya quedó registrada' : `${carrito.length} producto${carrito.length === 1 ? '' : 's'}`}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Cerrar" onClick={cerrarCobro}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {cierre ? (
              <div className="mt-5">
                <p className="text-center text-4xl font-semibold tracking-tight tabular-nums">{cierre.detalle}</p>
                <Button variant="brand" className="mt-6 w-full" onClick={cerrarCobro}>Nueva venta</Button>
              </div>
            ) : (
              <div className="mt-4">
                <ul className="max-h-36 space-y-1 overflow-auto text-sm">
                  {carrito.map((linea) => (
                    <li key={linea.producto.id} className="flex justify-between gap-3">
                      <span className="truncate">{linea.suelto ? `${linea.cantidad} und` : linea.cantidad} {linea.producto.nombre}</span>
                      <span className="shrink-0 tabular-nums">{pesos(valorLinea(linea))}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-end justify-between border-t border-ink/10 pt-3">
                  <p className="text-sm text-muted capitalize">{metodo}</p>
                  <p className="text-2xl font-semibold tabular-nums">{pesos(total)}</p>
                </div>
                {metodo === 'efectivo' && (
                  <div className="mt-4">
                    <label className="text-sm font-medium" htmlFor="recibido">¿Con cuánto paga?</label>
                    <Input
                      id="recibido"
                      className="mt-1 text-lg tabular-nums"
                      inputMode="numeric"
                      placeholder="Billete o monto"
                      value={recibido}
                      autoFocus
                      onChange={(evento) => setRecibido(evento.target.value.replace(/\D/g, ''))}
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button type="button" className="min-h-9 rounded-lg bg-paper px-3 text-xs font-semibold" onClick={() => setRecibido(String(total))}>
                        Justo
                      </button>
                      {billetes.map((billete) => (
                        <button key={billete} type="button" className="min-h-9 rounded-lg bg-paper px-3 text-xs font-semibold tabular-nums" onClick={() => setRecibido(String(billete))}>
                          {pesos(billete)}
                        </button>
                      ))}
                    </div>
                    <p className={`mt-3 text-center text-sm ${pago > 0 && vuelto < 0 ? 'text-clay' : 'text-muted'}`}>
                      {pago <= 0 ? 'Elige el billete o escribe el monto' : vuelto < 0 ? `Falta ${pesos(-vuelto)}` : vuelto === 0 ? 'Sin vuelto' : 'Vuelto'}
                    </p>
                    {pago >= total && vuelto > 0 && (
                      <p className="text-center text-3xl font-semibold tabular-nums">{pesos(vuelto)}</p>
                    )}
                  </div>
                )}
                {metodo === 'fiado' && (
                  <p className="mt-3 text-sm">
                    {clientes.find((cliente) => cliente.id === clienteId)?.nombre} queda debiendo {pesos(total)}.
                  </p>
                )}
                {metodo === 'transferencia' && <p className="mt-3 text-sm">Confirma que ya entró la transferencia.</p>}
                {error && <p role="alert" className="mt-2 text-sm text-clay">{error}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={cerrarCobro}>Volver</Button>
                  <Button variant="brand" onClick={() => void cobrar()} disabled={cargando || (metodo === 'efectivo' && pago < total)}>
                    {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirmar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {escaner && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-night/80 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-night p-4 text-cream">
            <video ref={video} className="aspect-video w-full rounded-2xl bg-black" muted playsInline />
            <Button className="mt-3 w-full" variant="outline" onClick={() => setEscaner(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
