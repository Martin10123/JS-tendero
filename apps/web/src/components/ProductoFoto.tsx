import { cn } from '@/lib/utils'

const fotos: { clave: string; emoji: string; fondo: string }[] = [
  { clave: 'polvo', emoji: '🥛', fondo: '#efe4cf' },
  { clave: 'leche', emoji: '🥛', fondo: '#f4efe6' },
  { clave: 'queso', emoji: '🧀', fondo: '#f6e7b2' },
  { clave: 'huevo', emoji: '🥚', fondo: '#f7f1df' },
  { clave: 'pan', emoji: '🍞', fondo: '#f0d2a8' },
  { clave: 'arroz', emoji: '🍚', fondo: '#f7f3ea' },
  { clave: 'aceite', emoji: '🫒', fondo: '#f3efc0' },
  { clave: 'café', emoji: '☕', fondo: '#e4cbb6' },
  { clave: 'cafe', emoji: '☕', fondo: '#e4cbb6' },
  { clave: 'azúcar', emoji: '🍬', fondo: '#f7f4ee' },
  { clave: 'azucar', emoji: '🍬', fondo: '#f7f4ee' },
  { clave: 'pasta', emoji: '🍝', fondo: '#f6e4b8' },
  { clave: 'frijol', emoji: '🫘', fondo: '#e7d3b8' },
  { clave: 'atún', emoji: '🐟', fondo: '#e7eef2' },
  { clave: 'atun', emoji: '🐟', fondo: '#e7eef2' },
  { clave: 'galleta', emoji: '🍪', fondo: '#f3dcc4' },
  { clave: 'chocolate', emoji: '🍫', fondo: '#ead4c4' },
  { clave: 'sal', emoji: '🧂', fondo: '#f4f1ea' },
  { clave: 'arepa', emoji: '🫓', fondo: '#f6e7c8' },
  { clave: 'gaseosa', emoji: '🥤', fondo: '#f8e0d4' },
  { clave: 'agua', emoji: '💧', fondo: '#e5f0ea' },
  { clave: 'cerveza', emoji: '🍺', fondo: '#f3e6c4' },
  { clave: 'jabón', emoji: '🧼', fondo: '#e7f0ea' },
  { clave: 'jabon', emoji: '🧼', fondo: '#e7f0ea' },
  { clave: 'papel', emoji: '🧻', fondo: '#f6f3ee' },
  { clave: 'detergente', emoji: '🧴', fondo: '#e3efe6' },
  { clave: 'tomate', emoji: '🍅', fondo: '#f8ddd4' },
  { clave: 'banano', emoji: '🍌', fondo: '#f8efc2' },
]

function fotoDe(nombre: string) {
  const texto = nombre.toLowerCase()
  return fotos.find((item) => texto.includes(item.clave)) ?? { emoji: '🛍️', fondo: '#f3eee6' }
}

export function ProductoFoto({ nombre, className }: { nombre: string; className?: string }) {
  const foto = fotoDe(nombre)
  return (
    <span
      className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-2xl text-[1.65rem] leading-none', className)}
      style={{ background: `radial-gradient(circle at 30% 20%, #fff, ${foto.fondo} 72%)` }}
      aria-hidden
    >
      <span className="drop-shadow-sm">{foto.emoji}</span>
    </span>
  )
}
