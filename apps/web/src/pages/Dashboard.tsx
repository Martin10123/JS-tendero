import { useEffect, useMemo, useState } from 'react'
import { AreaHoras, Barras, Dona } from '@/components/Graficos'
import { Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { pesos } from '@/lib/money'

type Hoy = {
  ventas: number
  numero: number
  ticketPromedio: number
  utilidad?: number
  metodos: { efectivo: number; digital: number; fiado: number }
  semanaPasada: { ventas: number; numero: number }
  horas: { hora: number; ventas: number; monto: number }[]
}

type ProductosDash = {
  masVendidos: { nombre: string; cantidad: number; ventas: number }[]
  dormidos: { nombre: string; stockActual: number }[]
  bajoStock: { nombre: string; stockActual: number }[]
  porVencer: { producto: string; fechaVencimiento: string }[]
}

type FiadosDash = {
  totalPorCobrar: number
  antiguedad: Record<string, number>
  quienesDebenMas: { nombre: string; saldo: number }[]
  quienesAbonanMas: { nombre: string; monto: number }[]
}

type VentaHist = {
  id: string
  total: number
  metodoPago: string
  estado: string
  fecha: string
  cliente: { nombre: string } | null
  vendedor: string | null
  items: { nombre: string; cantidad: number }[]
}

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  fiado: 'Fiado',
  mixto: 'Mixto',
}

export function Dashboard() {
  const { usuario } = useAuth()
  const [hoy, setHoy] = useState<Hoy | null>(null)
  const [productos, setProductos] = useState<ProductosDash | null>(null)
  const [fiados, setFiados] = useState<FiadosDash | null>(null)
  const [compras, setCompras] = useState<{ deuda: number; porProveedor: { nombre: string; deuda: number }[] } | null>(null)
  const [meta, setMeta] = useState<{ vendido: number; avance: number; meta: { montoObjetivo: number } | null } | null>(null)
  const [ventas, setVentas] = useState<VentaHist[]>([])
  const [visibles, setVisibles] = useState(8)

  useEffect(() => {
    void (async () => {
      const [dia, catalogo, cuentas, historial] = await Promise.all([
        api<Hoy>('/dashboard/hoy'),
        api<ProductosDash>('/dashboard/productos'),
        api<FiadosDash>('/dashboard/fiados'),
        api<VentaHist[]>('/ventas'),
      ])
      setHoy(dia)
      setProductos(catalogo)
      setFiados(cuentas)
      setVentas(historial)
      if (usuario?.rol === 'dueno') {
        setCompras(await api('/dashboard/compras'))
        setMeta(await api('/metas/progreso'))
      }
    })()
  }, [usuario?.rol])

  const grupos = useMemo(() => agrupar(ventas), [ventas])
  const mostradas = ventas.slice(0, visibles)
  const gruposVisibles = useMemo(() => agrupar(mostradas), [mostradas])
  const pico = hoy?.horas.reduce((mejor, hora) => (hora.monto > mejor.monto ? hora : mejor), { hora: 0, monto: 0, ventas: 0 })
  const fecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">La Esquina</p>
          <h1 className="text-2xl font-semibold tracking-tight">Hoy</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm capitalize text-muted">{fecha}</p>
          <Button variant="outline" onClick={() => document.getElementById('historial')?.scrollIntoView({ behavior: 'smooth' })}>
            Ver historial
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Ventas" valor={pesos(hoy?.ventas ?? 0)} nota={comparar(hoy?.ventas ?? 0, hoy?.semanaPasada.ventas ?? 0)} tono="saffron" />
        <Kpi titulo="Tickets" valor={String(hoy?.numero ?? 0)} nota={`Promedio ${pesos(hoy?.ticketPromedio ?? 0)}`} tono="ink" />
        <Kpi titulo="Efectivo" valor={pesos(hoy?.metodos.efectivo ?? 0)} nota={`Transferencia ${pesos(hoy?.metodos.digital ?? 0)}`} tono="moss" />
        {hoy?.utilidad !== undefined ? (
          <Kpi titulo="Utilidad" valor={pesos(hoy.utilidad)} nota="Con el costo de lo vendido hoy" tono="clay" />
        ) : (
          <Kpi titulo="Fiado de hoy" valor={pesos(hoy?.metodos.fiado ?? 0)} nota="Quedó apuntado" tono="clay" />
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="p-5 xl:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Ventas por hora</p>
              <p className="text-sm text-muted">De 6 de la mañana a 9 de la noche</p>
            </div>
            <p className="text-sm text-muted">
              {pico && pico.monto > 0 ? `Pico a las ${pico.hora}:00 · ${pesos(pico.monto)}` : 'Todavía no hay pico'}
            </p>
          </div>
          <div className="mt-2">
            <AreaHoras puntos={hoy?.horas ?? []} />
          </div>
        </Card>
        <Card className="flex flex-col justify-between p-5 xl:col-span-2">
          <div>
            <p className="font-semibold">Cómo pagaron</p>
            <p className="text-sm text-muted">Efectivo, transferencia y fiado</p>
          </div>
          <div className="mt-4">
            <Dona
              partes={[
                { nombre: 'Efectivo', valor: hoy?.metodos.efectivo ?? 0, color: '#3f6f56' },
                { nombre: 'Transferencia', valor: hoy?.metodos.digital ?? 0, color: '#e2a122' },
                { nombre: 'Fiado', valor: hoy?.metodos.fiado ?? 0, color: '#d4653a' },
              ]}
            />
          </div>
        </Card>
      </div>

      {meta?.meta && (
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Meta del día</p>
              <p className="text-2xl font-semibold tabular-nums">{meta.avance}%</p>
            </div>
            <p className="text-sm tabular-nums text-muted">
              {pesos(meta.vendido)} de {pesos(meta.meta.montoObjetivo)}
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-gradient-to-r from-saffron to-clay" style={{ width: `${Math.min(100, meta.avance)}%` }} />
          </div>
        </Card>
      )}

      <section id="historial" className="scroll-mt-4 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Historial de ventas</h2>
            <p className="text-sm text-muted">{grupos.length ? `${ventas.length} ventas guardadas` : 'Todavía no hay ventas'}</p>
          </div>
        </div>
        {gruposVisibles.map((grupo) => (
          <div key={grupo.clave} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted capitalize">{grupo.titulo}</p>
            <ul className="space-y-2">
              {grupo.ventas.map((venta) => (
                <Ticket key={venta.id} venta={venta} />
              ))}
            </ul>
          </div>
        ))}
        {!ventas.length && (
          <Card className="p-6 text-sm text-muted">Cuando cobres en el mostrador, la venta queda aquí con productos, total y a quién se la hiciste.</Card>
        )}
        {visibles < ventas.length && (
          <Button variant="outline" onClick={() => setVisibles((n) => n + 8)}>
            Ver más
          </Button>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-5">
          <p className="font-semibold">Más vendidos · 30 días</p>
          <p className="mb-4 text-sm text-muted">Lo que más sale del mostrador</p>
          <Barras
            filas={(productos?.masVendidos ?? []).slice(0, 6).map((item) => ({
              nombre: item.nombre,
              valor: item.ventas,
              detalle: `${cuanto(item.cantidad, item.nombre)} · ${pesos(item.ventas)}`,
            }))}
          />
        </Card>
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold">Por cobrar</p>
            <p className="text-lg font-semibold tabular-nums">{pesos(fiados?.totalPorCobrar ?? 0)}</p>
          </div>
          <div className="mt-4">
            <Tramos cubetas={fiados?.antiguedad ?? {}} />
          </div>
          <ul className="mt-4 space-y-2">
            {(fiados?.quienesDebenMas ?? []).slice(0, 4).map((persona) => (
              <li key={persona.nombre} className="flex items-center justify-between text-sm">
                <span>{persona.nombre}</span>
                <span className="font-semibold tabular-nums">{pesos(persona.saldo)}</span>
              </li>
            ))}
            {!fiados?.quienesDebenMas.length && <li className="text-sm text-muted">Nadie debe.</li>}
          </ul>
          {!!fiados?.quienesAbonanMas.length && (
            <p className="mt-4 text-sm text-muted">
              Quienes más abonan: {fiados.quienesAbonanMas.slice(0, 3).map((persona) => `${persona.nombre} ${pesos(persona.monto)}`).join(' · ')}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Aviso titulo="Bajo stock" filas={productos?.bajoStock.map((item) => `${item.nombre} · ${piezas(item.stockActual)}`) ?? []} />
        <Aviso titulo="Por vencer" filas={productos?.porVencer.map((item) => item.producto) ?? []} />
        <Aviso titulo="Plata parada" filas={productos?.dormidos.map((item) => item.nombre) ?? []} />
        {compras && (
          <Aviso
            titulo={`Deuda a proveedores · ${pesos(compras.deuda)}`}
            filas={compras.porProveedor.filter((item) => item.deuda > 0).map((item) => `${item.nombre} · ${pesos(item.deuda)}`)}
          />
        )}
      </div>
    </div>
  )
}

function Ticket({ venta }: { venta: VentaHist }) {
  const hora = new Date(venta.fecha).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
  const anulada = venta.estado === 'anulada'
  return (
    <li className={`rounded-3xl border border-ink/10 bg-cream/80 p-4 shadow-[0_20px_50px_-32px_rgba(28,22,18,0.55)] ${anulada ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{hora}</p>
          <p className="mt-0.5 font-medium">
            {venta.vendedor ?? 'Caja'}{' '}
            {venta.cliente ? (
              <>
                vendió a <span className="font-semibold">{venta.cliente.nombre}</span>
              </>
            ) : (
              'vendió en el mostrador'
            )}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-semibold tabular-nums ${anulada ? 'line-through' : ''}`}>{pesos(venta.total)}</p>
          <Badge className={tonoMetodo(venta.metodoPago)}>{anulada ? 'Anulada' : METODOS[venta.metodoPago] ?? venta.metodoPago}</Badge>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {venta.items.map((item, indice) => (
          <li key={`${venta.id}-${indice}`} className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium">
            {cuanto(item.cantidad, item.nombre)} {item.nombre}
          </li>
        ))}
      </ul>
    </li>
  )
}

function Kpi({ titulo, valor, nota, tono }: { titulo: string; valor: string; nota: string; tono: 'saffron' | 'clay' | 'moss' | 'ink' }) {
  const barra = { saffron: 'bg-saffron', clay: 'bg-clay', moss: 'bg-moss', ink: 'bg-ink' }[tono]
  return (
    <Card className="overflow-hidden p-0">
      <div className={`h-1.5 ${barra}`} />
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{titulo}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{valor}</p>
        <p className="mt-1 text-xs text-muted">{nota}</p>
      </div>
    </Card>
  )
}

function Tramos({ cubetas }: { cubetas: Record<string, number> }) {
  const partes = [
    { nombre: '0 a 15 días', valor: cubetas['0-15'] || 0, color: '#3f6f56' },
    { nombre: '15 a 30', valor: cubetas['15-30'] || 0, color: '#e2a122' },
    { nombre: 'Más de 30', valor: cubetas['30+'] || 0, color: '#d4653a' },
  ]
  const total = partes.reduce((suma, parte) => suma + parte.valor, 0) || 1
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-paper">
        {partes.map((parte) => (
          <div key={parte.nombre} style={{ width: `${(parte.valor / total) * 100}%`, background: parte.color }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {partes.map((parte) => (
          <li key={parte.nombre} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: parte.color }} />
            {parte.nombre} · {pesos(parte.valor)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Aviso({ titulo, filas }: { titulo: string; filas: string[] }) {
  return (
    <Card className="p-4">
      <p className="font-semibold">{titulo}</p>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        {filas.length ? filas.slice(0, 4).map((fila) => <li key={fila}>{fila}</li>) : <li>Nada por ahora</li>}
      </ul>
    </Card>
  )
}

function agrupar(ventas: VentaHist[]) {
  const mapa = new Map<string, { clave: string; titulo: string; ventas: VentaHist[] }>()
  for (const venta of ventas) {
    const clave = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(venta.fecha))
    const grupo = mapa.get(clave) ?? {
      clave,
      titulo: new Date(venta.fecha).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' }),
      ventas: [],
    }
    grupo.ventas.push(venta)
    mapa.set(clave, grupo)
  }
  return [...mapa.values()]
}

function piezas(valor: number) {
  const redondo = Math.round(valor * 10) / 10
  return Number.isInteger(redondo) ? String(redondo) : redondo.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

function cuanto(cantidad: number, nombre: string) {
  const empaque = nombre.match(/x\s*(\d+)/i)
  if (empaque) {
    const n = Number(empaque[1])
    const unidades = Math.round(cantidad * n)
    if (n > 0 && Math.abs(cantidad * n - unidades) < 0.2) {
      if (unidades % n === 0) return String(unidades / n)
      return `${unidades} und`
    }
  }
  return piezas(cantidad)
}

function comparar(actual: number, anterior: number) {
  if (!anterior) return `Semana pasada ${pesos(0)}`
  const pct = Math.round(((actual - anterior) / anterior) * 100)
  if (pct === 0) return 'Igual que la semana pasada'
  if (pct > 0) return `${pct}% por encima de la semana pasada`
  return `${Math.abs(pct)}% por debajo de la semana pasada`
}

function tonoMetodo(metodo: string) {
  if (metodo === 'efectivo') return 'bg-moss/15 text-moss'
  if (metodo === 'fiado') return 'bg-clay/15 text-clay'
  if (metodo === 'transferencia') return 'bg-saffron/25 text-ink'
  return ''
}
