export type Rol = 'dueno' | 'empleado'

export type Usuario = {
  id: string
  nombre: string
  rol: Rol
  tiendaId: string
  tiendaNombre: string
  slug: string
  telefono: string
  telefonoWhatsapp?: string | null
}

export type Producto = {
  id: string
  categoriaId: string
  categoria: string | null
  nombre: string
  codigoBarras: string | null
  unidad: 'und' | 'kg' | 'lb' | 'l'
  precio: number
  costo?: number
  stockActual: number
  stockMinimo: number
  esFavorito: boolean
  visibleCatalogo: boolean
  activo: boolean
}

export type Cliente = {
  id: string
  nombre: string
  telefono: string | null
  limiteCredito: number
  score: number
  saldo: number
  antiguedad: string | null
}

export class ApiError extends Error {}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const respuesta = await fetch(`/api${path}`, { ...options, headers })
  if (respuesta.status === 401 && !path.startsWith('/public') && !path.startsWith('/auth/login')) {
    localStorage.removeItem('token')
    if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/t/')) {
      location.href = '/login'
    }
  }
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({ message: 'No se pudo completar' }))
    const mensaje = Array.isArray(cuerpo.message) ? cuerpo.message.join(', ') : cuerpo.message
    throw new ApiError(mensaje || 'No se pudo completar')
  }
  const tipo = respuesta.headers.get('content-type') || ''
  if (tipo.includes('spreadsheet') || tipo.includes('octet-stream')) return (await respuesta.blob()) as T
  if (respuesta.status === 204) return undefined as T
  return respuesta.json()
}
