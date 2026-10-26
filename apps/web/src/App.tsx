import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { Caja } from '@/pages/Caja'
import { Catalogo } from '@/pages/Catalogo'
import { Clientes } from '@/pages/Clientes'
import { Compras } from '@/pages/Compras'
import { Crecimiento } from '@/pages/Crecimiento'
import { Dashboard } from '@/pages/Dashboard'
import { Login } from '@/pages/Login'
import { Pos } from '@/pages/Pos'
import { Productos } from '@/pages/Productos'
import { Publico } from '@/pages/Publico'
import { Whatsapp } from '@/pages/Whatsapp'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/t/:slug" element={<Publico />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="/pos" element={<Pos />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/caja" element={<Caja />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/whatsapp" element={<Whatsapp />} />
        <Route path="/crecimiento" element={<Crecimiento />} />
      </Route>
    </Routes>
  )
}
