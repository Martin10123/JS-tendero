import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { api } from '@/lib/api'

type Mensaje = {
  id: string
  direccion: string
  contenido: string
  estado: string
  interpretacionJson?: { pregunta?: string; accion?: string; productos?: { nombre: string; cantidad: number }[] } | null
}

export function Whatsapp() {
  const [texto, setTexto] = useState('Vendí 2 leche y 1 pan, fiado a Marta')
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [respuesta, setRespuesta] = useState('')

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
    await cargar()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
      <p className="text-sm text-muted">La IA propone. Tú confirmas. Nada se escribe solo.</p>
      <Card className="space-y-2 p-4">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="brand" onClick={() => void enviar()}>Interpretar</Button>
          <Button variant="outline" onClick={() => void api('/jobs/cobros', { method: 'POST' }).then(() => cargar())}>Cobros</Button>
          <Button variant="outline" onClick={() => void api('/jobs/resumen', { method: 'POST' }).then(() => cargar())}>Resumen</Button>
        </div>
        <label className="block text-sm">
          Foto de factura
          <input
            type="file"
            accept="image/*"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const archivo = e.target.files?.[0]
              if (!archivo) return
              const datos = new FormData()
              datos.append('archivo', archivo)
              void api('/whatsapp/factura', { method: 'POST', body: datos }).then(() => cargar())
            }}
          />
        </label>
        {respuesta && <p className="text-sm">{respuesta}</p>}
      </Card>
      <div className="space-y-2">
        {mensajes.map((mensaje) => (
          <Card key={mensaje.id} className="p-3 text-sm">
            <p className="text-xs text-muted">{mensaje.direccion} · {mensaje.estado}</p>
            <p className="mt-1">{mensaje.contenido}</p>
            {mensaje.estado === 'pendiente' && !mensaje.interpretacionJson?.pregunta && mensaje.direccion === 'entrante' && (
              <div className="mt-2 flex gap-2">
                <Button size="default" variant="brand" onClick={() => void api(`/whatsapp/${mensaje.id}/confirmar`, { method: 'POST' }).then(cargar)}>Confirmar</Button>
                <Button variant="outline" onClick={() => void api(`/whatsapp/${mensaje.id}/rechazar`, { method: 'POST' }).then(cargar)}>No</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
