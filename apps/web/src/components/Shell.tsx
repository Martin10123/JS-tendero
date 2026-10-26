import {
  LayoutDashboard,
  Menu,
  MessageCircle,
  Package,
  ScanBarcode,
  ShoppingBasket,
  Store,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { sincronizar } from '@/lib/offline'
import { cn } from '@/lib/utils'

const enlaces = [
  { to: '/pos', label: 'Mostrador', icon: ScanBarcode, corto: true },
  { to: '/clientes', label: 'Fiados', icon: Users, corto: true },
  { to: '/dashboard', label: 'Hoy', icon: LayoutDashboard, corto: true },
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/caja', label: 'Caja', icon: Wallet },
  { to: '/compras', label: 'Compras', icon: Truck, dueno: true },
  { to: '/catalogo', label: 'Catálogo', icon: ShoppingBasket },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, dueno: true },
  { to: '/crecimiento', label: 'Crecer', icon: Store, dueno: true },
]

export function Shell() {
  const { usuario, listo, salir } = useAuth()
  const [menu, setMenu] = useState(false)
  const [pendientes, setPendientes] = useState(0)
  const navegar = useNavigate()

  useEffect(() => {
    const alVolver = () => {
      if (navigator.onLine) void sincronizar().then((r) => setPendientes(r.pendientes))
    }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [])

  if (!listo) return <div className="grid min-h-dvh place-items-center text-muted">Abriendo la tienda…</div>
  if (!usuario) return <Navigate to="/login" replace />

  const visibles = enlaces.filter((enlace) => !enlace.dueno || usuario.rol === 'dueno')
  const cortos = visibles.filter((enlace) => enlace.corto)

  return (
    <div className="relative min-h-dvh bg-paper text-ink md:flex md:h-dvh md:overflow-hidden">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -left-24 top-[-10%] h-80 w-80 rounded-full bg-saffron/15 blur-3xl" />
        <div className="absolute right-[-10%] bottom-0 h-72 w-72 rounded-full bg-moss/10 blur-3xl" />
      </div>
      <aside className="relative hidden h-dvh w-56 shrink-0 flex-col border-r border-ink/10 bg-paper/80 px-4 py-6 backdrop-blur-xl md:flex">
        <p className="px-2 text-xs font-semibold tracking-[0.18em] text-muted uppercase">Mostrador</p>
        <p className="mt-1 px-2 font-semibold">{usuario.tiendaNombre}</p>
        <nav className="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {visibles.map((enlace) => (
            <NavLink
              key={enlace.to}
              to={enlace.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium',
                  isActive ? 'bg-ink text-cream' : 'hover:bg-cream',
                )
              }
            >
              <enlace.icon className="h-4 w-4" />
              {enlace.label}
            </NavLink>
          ))}
        </nav>
        <button className="mt-4 shrink-0 px-3 text-left text-sm text-muted" onClick={() => { salir(); navegar('/login') }}>
          Salir · {usuario.nombre}
        </button>
      </aside>
      <div className="relative min-w-0 flex-1 pb-24 md:h-dvh md:overflow-y-auto md:pb-0">
        <header className="flex items-center justify-between px-4 py-4 md:hidden">
          <div>
            <p className="text-xs tracking-[0.16em] text-muted uppercase">Mostrador</p>
            <p className="font-semibold">{usuario.tiendaNombre}</p>
          </div>
          {pendientes > 0 && <span className="text-xs text-clay">{pendientes} por subir</span>}
        </header>
        <main className="px-4 md:px-6 md:py-4">
          <Outlet />
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-ink/10 bg-cream/90 backdrop-blur-xl md:hidden">
        {cortos.map((enlace) => (
          <NavLink
            key={enlace.to}
            to={enlace.to}
            className={({ isActive }) =>
              cn('grid min-h-16 place-items-center text-xs font-medium', isActive ? 'text-ink' : 'text-muted')
            }
          >
            <enlace.icon className="h-5 w-5" />
            {enlace.label}
          </NavLink>
        ))}
        <button className="grid min-h-16 place-items-center text-xs font-medium text-muted" onClick={() => setMenu(true)}>
          <Menu className="h-5 w-5" />
          Menú
        </button>
      </nav>
      {menu && (
        <div className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={() => setMenu(false)}>
          <div
            className="absolute inset-x-3 bottom-3 rounded-3xl border border-ink/10 bg-cream p-4 shadow-2xl"
            onClick={(evento) => evento.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Más</p>
              <Button variant="ghost" size="icon" onClick={() => setMenu(false)} aria-label="Cerrar menú">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-1">
              {visibles.filter((enlace) => !enlace.corto).map((enlace) => (
                <NavLink
                  key={enlace.to}
                  to={enlace.to}
                  onClick={() => setMenu(false)}
                  className="flex min-h-11 items-center gap-2 rounded-xl px-2"
                >
                  <enlace.icon className="h-4 w-4" />
                  {enlace.label}
                </NavLink>
              ))}
              <button className="min-h-11 px-2 text-left text-sm text-muted" onClick={() => { salir(); navegar('/login') }}>
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
