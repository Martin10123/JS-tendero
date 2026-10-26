import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type Usuario } from './api'

type Sesion = {
  usuario: Usuario | null
  listo: boolean
  entrar: (telefono: string, clave: string) => Promise<void>
  salir: () => void
}

const Contexto = createContext<Sesion | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setListo(true)
      return
    }
    api<Usuario>('/auth/yo')
      .then(setUsuario)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setListo(true))
  }, [])

  async function entrar(telefono: string, clave: string) {
    const respuesta = await api<{ token: string; usuario: Usuario }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ telefono, clave }),
    })
    localStorage.setItem('token', respuesta.token)
    setUsuario(respuesta.usuario)
  }

  function salir() {
    localStorage.removeItem('token')
    setUsuario(null)
  }

  return <Contexto.Provider value={{ usuario, listo, entrar, salir }}>{children}</Contexto.Provider>
}

export function useAuth() {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('Auth fuera de proveedor')
  return valor
}
