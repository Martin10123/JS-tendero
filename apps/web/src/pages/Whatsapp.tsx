import { useEffect, useMemo, useState } from 'react'
import { Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { api } from '@/lib/api'
import { pesos } from '@/lib/money'

type ProductoMsg = { nombre?: string; cantidad?: number; precio?: number }
type Interp = {
  pregunta?: string | null
  accion?: string
  origen?: string
  pedidoPublico?: boolean
  metodoPago?: string
  monto?: number
  productos?: ProductoMsg[]
}
type Mensaje = {
  id: string
  telefono: string
  direccion: string
  contenido: string
  tipo: string
  estado: string
  createdAt: string
  interpretacionJson?: Interp | null
}

const FILTROS = ['Todos', 'Pedidos', 'Por confirmar'] as const

export function Whatsapp() {
  const [texto, setTexto] = useState('')
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [respuesta, setRespuesta] = useState('')
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('Todos')

  async function cargar() {
    setMensajes(await api<Mensaje[]>('/whatsapp/mensajes'))
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function enviar() {
    const resultado = await api<{ respuesta?: string }>('/whatsapp/entrada', {
      method: 'POST',
      body: JSON.stringify({ texto }),
    })
    setRespuesta(resultado.respuesta || 'Listo')
    setTexto('')
    await cargar()
  }

  const visibles = useMemo(() => {
    if (filtro === 'Pedidos') return mensajes.filter(esPedido)
    if (filtro === 'Por confirmar') return mensajes.filter((mensaje) => puedeConfirmar(mensaje))
    return mensajes
  }, [mensajes, filtro])

  const porConfirmar = mensajes.filter((mensaje) => puedeConfirmar(mensaje)).length

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
          <p className="text-sm text-muted">Pedidos del catálogo y lo que propone la tienda. Tú confirmas.</p>
        </div>
        {porConfirmar > 0 && <Badge className="bg-saffron/25">{porConfirmar} por confirmar</Badge>}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {FILTROS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFiltro(item)}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${filtro === item ? 'bg-ink text-cream' : 'bg-cream text-muted'}`}
              >
                {item}
              </button>
            ))}
          </div>
          {visibles.length ? (
            visibles.map((mensaje) => <Tarjeta key={mensaje.id} mensaje={mensaje} onCambio={cargar} />)
          ) : (
            <Card className="p-6 text-sm text-muted">Nada en esta lista.</Card>
          )}
        </section>

        <Card className="space-y-3 p-4 lg:sticky lg:top-0">
          <div>
            <p className="font-semibold">Escríbelo</p>
            <p className="text-sm text-muted">Como se lo dirías a alguien en la tienda.</p>
          </div>
          <Textarea placeholder="Vendí 2 leche y 1 pan, fiado a Marta" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Button variant="brand" disabled={!texto.trim()} onClick={() => void enviar()}>
            Interpretar
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void api('/jobs/cobros', { method: 'POST' }).then(() => cargar())}>
              Cobros
            </Button>
            <Button variant="outline" onClick={() => void api('/jobs/resumen', { method: 'POST' }).then(() => cargar())}>
              Resumen
            </Button>
          </div>
          <label className="block text-sm">
            Foto de factura
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm text-muted"
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                if (!archivo) return
                const datos = new FormData()
                datos.append('archivo', archivo)
                void api('/whatsapp/factura', { method: 'POST', body: datos }).then(() => cargar())
              }}
            />
          </label>
          {respuesta && <p className="rounded-2xl bg-paper px-3 py-2 text-sm">{respuesta}</p>}
        </Card>
      </div>
    </div>
  )
}

function Tarjeta({ mensaje, onCambio }: { mensaje: Mensaje; onCambio: () => Promise<void> }) {
  const data = mensaje.interpretacionJson
  const productos = (data?.productos ?? []).filter((item) => item.nombre)
  const total = totalDe(productos)
  const hora = new Date(mensaje.createdAt).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const pedido = esPedido(mensaje)
  const nota = mensaje.contenido === 'Pedido desde el catálogo' ? '' : mensaje.contenido

  return (
    <Card className={`p-4 ${pedido ? 'border-saffron/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted capitalize">{hora}</p>
          <p className="mt-0.5 font-semibold">{titulo(mensaje)}</p>
          <p className="text-sm text-muted">{subtitulo(mensaje)}</p>
        </div>
        <div className="text-right">
          {total !== null && <p className="text-lg font-semibold tabular-nums">{pesos(total)}</p>}
          {data?.monto && !total && data.accion === 'registrar_abono' && (
            <p className="text-lg font-semibold tabular-nums">{pesos(data.monto)}</p>
          )}
          <Badge className={tonoEstado(mensaje)}>{textoEstado(mensaje)}</Badge>
        </div>
      </div>
      {!!productos.length && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {productos.map((item, indice) => (
            <li key={`${mensaje.id}-${indice}`} className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium">
              {piezas(item.cantidad || 0)} {item.nombre}
              {item.precio ? ` · ${pesos(item.precio * (item.cantidad || 0))}` : ''}
            </li>
          ))}
        </ul>
      )}
      {nota && !productos.length && <p className="mt-3 text-sm leading-relaxed">{nota}</p>}
      {nota && !!productos.length && <p className="mt-2 text-sm text-muted">{nota}</p>}
      {data?.pregunta && <p className="mt-3 text-sm text-clay">{data.pregunta}</p>}
      {puedeConfirmar(mensaje) && (
        <div className="mt-3 flex gap-2">
          <Button variant="brand" onClick={() => void api(`/whatsapp/${mensaje.id}/confirmar`, { method: 'POST' }).then(onCambio)}>
            Confirmar
          </Button>
          <Button variant="outline" onClick={() => void api(`/whatsapp/${mensaje.id}/rechazar`, { method: 'POST' }).then(onCambio)}>
            No va
          </Button>
        </div>
      )}
    </Card>
  )
}

function esPedido(mensaje: Mensaje) {
  const data = mensaje.interpretacionJson
  return Boolean(data?.pedidoPublico || data?.origen === 'catalogo' || mensaje.contenido === 'Pedido desde el catálogo')
}

function puedeConfirmar(mensaje: Mensaje) {
  return mensaje.estado === 'pendiente' && mensaje.direccion === 'entrante' && !mensaje.interpretacionJson?.pregunta
}

function titulo(mensaje: Mensaje) {
  const data = mensaje.interpretacionJson
  if (esPedido(mensaje)) return 'Pedido del catálogo'
  if (mensaje.tipo === 'imagen') return 'Foto de factura'
  if (data?.accion === 'registrar_abono') return 'Abono'
  if (data?.accion === 'registrar_compra') return 'Compra'
  if (data?.accion === 'registrar_venta') return mensaje.estado === 'pendiente' ? 'Venta para confirmar' : 'Venta'
  if (mensaje.contenido.startsWith('Resumen')) return 'Resumen del día'
  if (mensaje.contenido.toLowerCase().includes('cobro')) return 'Cobro'
  if (mensaje.direccion === 'saliente') return 'Aviso'
  return 'Mensaje'
}

function subtitulo(mensaje: Mensaje) {
  const data = mensaje.interpretacionJson
  if (esPedido(mensaje)) return `Pidió el ${fono(mensaje.telefono)}`
  if (data?.metodoPago === 'fiado') return 'Fiado'
  if (data?.metodoPago === 'transferencia') return 'Transferencia'
  if (data?.metodoPago === 'efectivo' && mensaje.direccion === 'entrante') return 'Efectivo'
  if (mensaje.direccion === 'saliente') return 'Salió de la tienda'
  return fono(mensaje.telefono)
}

function textoEstado(mensaje: Mensaje) {
  if (mensaje.direccion === 'saliente') return 'Enviado'
  if (mensaje.estado === 'confirmado') return 'Confirmado'
  if (mensaje.estado === 'rechazado') return 'No va'
  if (mensaje.estado === 'error') return 'Falló'
  return 'Por confirmar'
}

function tonoEstado(mensaje: Mensaje) {
  if (mensaje.direccion === 'saliente') return 'bg-paper text-muted'
  if (mensaje.estado === 'confirmado') return 'bg-moss/15 text-moss'
  if (mensaje.estado === 'rechazado' || mensaje.estado === 'error') return 'bg-clay/15 text-clay'
  return 'bg-saffron/25 text-ink'
}

function totalDe(productos: ProductoMsg[]) {
  if (!productos.length || productos.some((item) => item.precio == null)) return null
  return productos.reduce((suma, item) => suma + (item.precio || 0) * (item.cantidad || 0), 0)
}

function fono(valor: string) {
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length === 10) return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`
  if (digitos.length === 12 && digitos.startsWith('57')) return `${digitos.slice(2, 5)} ${digitos.slice(5, 8)} ${digitos.slice(8)}`
  return valor
}

function piezas(valor: number) {
  const redondo = Math.round(valor * 10) / 10
  return Number.isInteger(redondo) ? String(redondo) : redondo.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}
