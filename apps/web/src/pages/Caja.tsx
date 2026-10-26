import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/card'
import { api, type Producto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { pesos } from '@/lib/money'

type Cierre = {
  id: string
  diferencia: number | null
  efectivoContado: number | null
  efectivoEsperado: number | null
  efectivoInicial: number
  fecha: string
}

type Caja = {
  abierta: { id: string; efectivoInicial: number; efectivoEsperado: number } | null
  recientes: Cierre[]
}

export function Caja() {
  const { usuario } = useAuth()
  const [caja, setCaja] = useState<Caja | null>(null)
  const [inicial, setInicial] = useState('50000')
  const [contado, setContado] = useState('')
  const [productos, setProductos] = useState<Producto[]>([])
  const [productoId, setProductoId] = useState('')
  const [contada, setContada] = useState('')
  const [aviso, setAviso] = useState('')
  const [avisoConteo, setAvisoConteo] = useState('')

  async function cargar() {
    setCaja(await api<Caja>('/caja'))
    if (usuario?.rol === 'dueno') {
      const lista = await api<Producto[]>('/productos')
      setProductos(lista)
      if (!productoId && lista[0]) setProductoId(lista[0].id)
    }
  }

  useEffect(() => {
    void cargar()
  }, [usuario?.rol])

  const abierta = caja?.abierta

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
          <p className="text-sm text-muted">{abierta ? 'El día está abierto' : 'El día está cerrado'}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${abierta ? 'bg-moss/15 text-moss' : 'bg-ink/10 text-ink'}`}>
          {abierta ? 'Abierta' : 'Cerrada'}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          {abierta ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Base</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{pesos(abierta.efectivoInicial)}</p>
                </div>
                <div className="rounded-2xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Debería haber</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{pesos(abierta.efectivoEsperado)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contado">Efectivo que contaste</Label>
                <Input id="contado" inputMode="numeric" placeholder="0" value={contado} onChange={(e) => setContado(e.target.value)} />
              </div>
              <Button
                variant="brand"
                disabled={!contado}
                onClick={() =>
                  void api<{ diferencia: number }>('/caja/cerrar', {
                    method: 'POST',
                    body: JSON.stringify({ efectivoContado: Number(contado) }),
                  }).then(async (cierre) => {
                    setAviso(textoDiferencia(cierre.diferencia))
                    setContado('')
                    await cargar()
                  })
                }
              >
                Cerrar el día
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="base">Efectivo con el que abres</Label>
                <p className="text-sm text-muted">Lo que hay en el cajón antes de la primera venta.</p>
                <Input id="base" inputMode="numeric" value={inicial} onChange={(e) => setInicial(e.target.value)} />
              </div>
              <Button
                variant="brand"
                onClick={() =>
                  void api('/caja/abrir', { method: 'POST', body: JSON.stringify({ efectivoInicial: Number(inicial) }) }).then(async () => {
                    setAviso('')
                    await cargar()
                  })
                }
              >
                Abrir el día
              </Button>
            </>
          )}
          {aviso && <p className="rounded-2xl bg-paper px-3 py-2 text-sm font-medium">{aviso}</p>}
        </Card>

        <Card className="p-5">
          <p className="font-semibold">Cierres anteriores</p>
          <p className="text-sm text-muted">Lo que sobró o faltó al cerrar</p>
          <ul className="mt-4 space-y-2">
            {caja?.recientes.length ? (
              caja.recientes.map((cierre) => {
                const diferencia = cierre.diferencia ?? 0
                return (
                  <li key={cierre.id} className="rounded-2xl bg-paper px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {new Date(cierre.fecha).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-muted">
                          Contado {pesos(cierre.efectivoContado || 0)} · esperado {pesos(cierre.efectivoEsperado || 0)}
                        </p>
                      </div>
                      <p className={`text-sm font-semibold tabular-nums ${diferencia < 0 ? 'text-clay' : 'text-moss'}`}>
                        {textoDiferencia(diferencia)}
                      </p>
                    </div>
                  </li>
                )
              })
            ) : (
              <li className="text-sm text-muted">Todavía no cierras un día.</li>
            )}
          </ul>
        </Card>
      </div>

      {usuario?.rol === 'dueno' && (
        <Card className="space-y-3 p-5">
          <div>
            <p className="font-semibold">Conteo de estante</p>
            <p className="text-sm text-muted">Si lo que contaste no coincide, el stock se ajusta.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="producto">Producto</Label>
              <select
                id="producto"
                className="min-h-10 w-full rounded-xl border border-ink/15 bg-cream px-3 text-sm"
                value={productoId}
                onChange={(e) => setProductoId(e.target.value)}
              >
                {productos.map((producto) => (
                  <option key={producto.id} value={producto.id}>{producto.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contada">Cantidad</Label>
              <Input id="contada" inputMode="decimal" placeholder="0" value={contada} onChange={(e) => setContada(e.target.value)} />
            </div>
            <Button
              variant="outline"
              disabled={!contada}
              onClick={() =>
                void api('/caja/conteos', {
                  method: 'POST',
                  body: JSON.stringify({ productoId, cantidadContada: Number(contada), ajustar: true }),
                }).then(() => {
                  setAvisoConteo('Listo. El stock quedó con lo que contaste.')
                  setContada('')
                })
              }
            >
              Ajustar
            </Button>
          </div>
          {avisoConteo && <p className="text-sm text-moss">{avisoConteo}</p>}
        </Card>
      )}
    </div>
  )
}

function textoDiferencia(diferencia: number) {
  if (diferencia > 0) return `Sobra ${pesos(diferencia)}`
  if (diferencia < 0) return `Falta ${pesos(Math.abs(diferencia))}`
  return 'Cuadró'
}
