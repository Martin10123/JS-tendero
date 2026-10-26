import { useEffect, useState, type FormEvent } from 'react'
import { Paginacion } from '@/components/Paginacion'
import { ProductoFoto } from '@/components/ProductoFoto'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Producto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cantidad, pesos } from '@/lib/money'

type Categoria = { id: string; nombre: string }

export function Productos() {
  const { usuario } = useAuth()
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [aviso, setAviso] = useState('')
  const [form, setForm] = useState({ nombre: '', categoriaId: '', precio: '', costo: '', stockActual: '', unidad: 'und', codigoBarras: '' })
  const [pagina, setPagina] = useState(0)
  const porPagina = 8

  async function cargar() {
    const [lista, cats] = await Promise.all([api<Producto[]>('/productos'), api<Categoria[]>('/categorias')])
    setProductos(lista)
    setCategorias(cats)
    if (!form.categoriaId && cats[0]) setForm((actual) => ({ ...actual, categoriaId: cats[0].id }))
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function crear(evento: FormEvent) {
    evento.preventDefault()
    await api('/productos', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        precio: Number(form.precio),
        costo: Number(form.costo),
        stockActual: Number(form.stockActual || 0),
        esFavorito: true,
        visibleCatalogo: true,
      }),
    })
    setForm({ ...form, nombre: '', precio: '', costo: '', stockActual: '', codigoBarras: '' })
    setAviso('Producto listo. El stock inicial quedó como movimiento.')
    await cargar()
  }

  async function importar(archivo: File) {
    const datos = new FormData()
    datos.append('archivo', archivo)
    const respuesta = await api<{ importados: number }>('/productos/importar', { method: 'POST', body: datos })
    setAviso(`Entraron ${respuesta.importados} filas. El stock se abrió con un ajuste.`)
    await cargar()
  }

  const dueno = usuario?.rol === 'dueno'
  const paginas = Math.max(1, Math.ceil(productos.length / porPagina))
  const paginaSegura = Math.min(pagina, paginas - 1)
  const visibles = productos.slice(paginaSegura * porPagina, paginaSegura * porPagina + porPagina)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted">El stock no se escribe a mano. Entra por carga, compra o conteo.</p>
        </div>
        {dueno && (
          <label className="min-h-11 cursor-pointer rounded-xl border border-ink/15 bg-cream px-4 py-3 text-sm font-semibold">
            Cargar Excel
            <input
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                if (archivo) void importar(archivo)
              }}
            />
          </label>
        )}
      </div>
      {aviso && <p className="text-sm text-moss">{aviso}</p>}
      {dueno && (
        <Card className="p-4">
          <form className="grid gap-2 md:grid-cols-3" onSubmit={crear}>
            <Input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            <select className="min-h-10 rounded-xl border border-ink/15 bg-cream px-3 text-sm" value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
              ))}
            </select>
            <Input placeholder="Código" value={form.codigoBarras} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} />
            <Input placeholder="Precio" inputMode="numeric" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} required />
            <Input placeholder="Costo" inputMode="numeric" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} required />
            <Input placeholder="Stock inicial" inputMode="decimal" value={form.stockActual} onChange={(e) => setForm({ ...form, stockActual: e.target.value })} />
            <Button type="submit" variant="brand">Guardar</Button>
          </form>
        </Card>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {visibles.map((producto) => (
          <Card key={producto.id} className="flex items-center gap-3 px-3 py-3">
            <ProductoFoto nombre={producto.nombre} className="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{producto.nombre}</p>
              <p className="text-sm text-muted">{producto.categoria} · {cantidad(producto.stockActual, producto.unidad)}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{pesos(producto.precio)}</p>
              {producto.costo !== undefined && <p className="text-xs text-muted">Costo {pesos(producto.costo)}</p>}
            </div>
          </Card>
        ))}
      </div>
      <Paginacion pagina={paginaSegura} paginas={paginas} onChange={setPagina} />
    </div>
  )
}
