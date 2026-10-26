import { Loader2, Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function Login() {
  const { usuario, entrar } = useAuth()
  const [telefono, setTelefono] = useState('3001111111')
  const [clave, setClave] = useState('demo1234')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  if (usuario) return <Navigate to="/pos" replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setError('')
    setCargando(true)
    try {
      await entrar(telefono, clave)
    } catch (causa) {
      setError(causa instanceof ApiError ? causa.message : 'No hay conexión con la tienda')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-night text-cream">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-16 top-[-10%] h-[55vh] w-[55vh] rounded-full bg-saffron/30 blur-3xl" />
        <div className="absolute right-[-8%] top-[20%] h-[45vh] w-[45vh] rounded-full bg-clay/25 blur-3xl" />
        <div className="absolute bottom-[-15%] left-[30%] h-[40vh] w-[40vh] rounded-full bg-moss/25 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(250,247,242,0.16)_1px,transparent_1px)] bg-[size:22px_22px] opacity-40" />
      </div>
      <div className="relative grid min-h-dvh md:grid-cols-12">
        <section className="hidden flex-col justify-between px-12 py-14 md:col-span-7 md:flex lg:px-16">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl">
              <Store className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold tracking-[0.22em] uppercase">Mostrador</span>
          </div>
          <div className="max-w-xl">
            <p className="text-sm font-medium text-saffron">Tienda de barrio</p>
            <h1 className="mt-3 text-5xl leading-[1.05] font-semibold tracking-tight text-balance lg:text-6xl">
              Cómo le fue hoy, en un vistazo.
            </h1>
            <p className="mt-5 max-w-md text-lg text-cream/75">
              Ventas, fiados y stock en pocos toques. Si se va el internet, la venta queda guardada y sube después.
            </p>
          </div>
          <p className="text-sm text-cream/55">La plata se cuenta. El fiado también.</p>
        </section>
        <section className="flex items-center justify-center px-4 py-8 sm:px-6 md:col-span-5">
          <div className="w-full max-w-md">
            <div className="mb-6 md:hidden">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl">
                  <Store className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold tracking-[0.22em] uppercase">Mostrador</span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Entra a la tienda</h1>
              <p className="mt-2 text-cream/70">Ventas y fiados, aunque falle la red.</p>
            </div>
            <form
              onSubmit={enviar}
              className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-8"
            >
              <h2 className="hidden text-2xl font-semibold tracking-tight md:block">Entra a la tienda</h2>
              <p className="mt-1 hidden text-sm text-cream/70 md:block">Dueño o empleado. El empleado no ve costos.</p>
              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="telefono" className="mb-2 block text-sm text-cream/80">
                    Celular
                  </label>
                  <input
                    id="telefono"
                    inputMode="numeric"
                    autoComplete="username"
                    value={telefono}
                    onChange={(evento) => setTelefono(evento.target.value)}
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-base text-cream transition-all duration-300 placeholder:text-cream/40 focus-visible:border-saffron focus-visible:ring-2 focus-visible:ring-saffron"
                  />
                </div>
                <div>
                  <label htmlFor="clave" className="mb-2 block text-sm text-cream/80">
                    Clave
                  </label>
                  <input
                    id="clave"
                    type="password"
                    autoComplete="current-password"
                    value={clave}
                    onChange={(evento) => setClave(evento.target.value)}
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-base text-cream transition-all duration-300 placeholder:text-cream/40 focus-visible:border-saffron focus-visible:ring-2 focus-visible:ring-saffron"
                  />
                </div>
                {error && (
                  <p role="alert" className="rounded-xl bg-clay/25 px-3 py-2 text-sm text-cream">
                    {error}
                  </p>
                )}
                <Button type="submit" variant="brand" size="lg" className="w-full" disabled={cargando}>
                  {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
              </div>
              <p className="mt-5 text-xs leading-relaxed text-cream/55">
                Prueba: dueña 3001111111, empleado 3002222222. Clave demo1234.
              </p>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
