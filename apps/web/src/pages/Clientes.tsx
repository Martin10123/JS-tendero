import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Cliente } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { pesos } from '@/lib/money'
import { encolar } from '@/lib/offline'

type Detalle = {
  puntos: number
  fiados: { id: string; saldo: number; montoOriginal: number; fecha: string; estado: string; antiguedad: string | null }[]
  abonos: { id: string; monto: number; fecha: string; metodoPago: string }[]
}

export function Clientes() {
  const { usuario } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [activo, setActivo] = useState<Cliente | null>(null)
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [nombre, setNombre] = useState('')
  const [monto, setMonto] = useState('')
  const [limite, setLimite] = useState('')
  const [aviso, setAviso] = useState('')

  async function cargar() {
    setClientes(await api<Cliente[]>('/clientes'))
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function abrir(cliente: Cliente) {
    setActivo(cliente)
    setDetalle(await api<Detalle>(`/clientes/${cliente.id}/fiados`))
    setLimite(String(cliente.limiteCredito || ''))
  }

  async function crear() {
    if (!nombre.trim()) return
    await api('/clientes', { method: 'POST', body: JSON.stringify({ nombre }) })
    setNombre('')
    await cargar()
  }

  async function abonar() {
    if (!activo) return
    const id = crypto.randomUUID()
    const payload = { clienteId: activo.id, monto: Number(monto), metodoPago: 'efectivo' }
    if (!navigator.onLine) {
      await encolar('abono', id, payload)
      setAviso('Abono guardado en el celular')
    } else {
      await api(`/clientes/${activo.id}/abonos`, { method: 'POST', body: JSON.stringify({ ...payload, id }) })
      setAviso('Abono aplicado a la deuda más vieja')
      await abrir(activo)
      await cargar()
    }
    setMonto('')
  }

  async function guardarLimite() {
    if (!activo) return
    await api(`/clientes/${activo.id}`, { method: 'PATCH', body: JSON.stringify({ limiteCredito: Number(limite) }) })
    setAviso('Límite actualizado')
    await cargar()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fiados</h1>
        <p className="text-sm text-muted">Quién debe, desde cuándo y cuánto ha abonado.</p>
        <div className="mt-4 grid gap-2">
          {clientes.map((cliente) => (
            <button key={cliente.id} onClick={() => void abrir(cliente)} className="text-left">
              <Card className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold">{cliente.nombre}</p>
                  <p className="text-sm text-muted">Score {cliente.score}{cliente.antiguedad ? ` · ${cliente.antiguedad} días` : ''}</p>
                </div>
                <p className="font-semibold tabular-nums">{pesos(cliente.saldo)}</p>
              </Card>
            </button>
          ))}
        </div>
      </div>
      <Card className="h-fit p-4">
        {activo && detalle ? (
          <div className="space-y-3">
            <p className="font-semibold">{activo.nombre}</p>
            <p className="text-sm text-muted">{detalle.puntos} puntos</p>
            <ul className="space-y-1 text-sm">
              {detalle.fiados.map((fiado) => (
                <li key={fiado.id} className="flex justify-between">
                  <span>{fiado.estado}{fiado.antiguedad ? ` · ${fiado.antiguedad}` : ''}</span>
                  <span className="tabular-nums">{pesos(fiado.saldo)}</span>
                </li>
              ))}
            </ul>
            <Input inputMode="numeric" placeholder="Abono en pesos" value={monto} onChange={(e) => setMonto(e.target.value)} />
            <Button variant="brand" className="w-full" onClick={() => void abonar()}>Abonar</Button>
            {usuario?.rol === 'dueno' && (
              <div className="flex gap-2">
                <Input inputMode="numeric" placeholder="Límite" value={limite} onChange={(e) => setLimite(e.target.value)} />
                <Button variant="outline" onClick={() => void guardarLimite()}>Límite</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-semibold">Cliente nuevo</p>
            <Input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Button className="w-full" onClick={() => void crear()}>Agregar</Button>
          </div>
        )}
        {aviso && <p className="mt-3 text-sm text-moss">{aviso}</p>}
      </Card>
    </div>
  )
}
