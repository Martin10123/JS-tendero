import { pesos } from '@/lib/money'

type Punto = { hora: number; monto: number }

export function AreaHoras({ puntos }: { puntos: Punto[] }) {
  const datos = puntos.filter((punto) => punto.hora >= 6 && punto.hora <= 21)
  const maximo = Math.max(1, ...datos.map((punto) => punto.monto))
  const ancho = 640
  const alto = 200
  const margen = { l: 52, r: 8, t: 16, b: 28 }
  const coords = datos.map((punto, indice) => {
    const x = margen.l + (indice / Math.max(1, datos.length - 1)) * (ancho - margen.l - margen.r)
    const y = margen.t + (1 - punto.monto / maximo) * (alto - margen.t - margen.b)
    return { ...punto, x, y }
  })
  const linea = coords.map((punto) => `${punto.x},${punto.y}`).join(' ')
  const area = `${coords[0]?.x ?? 0},${alto - margen.b} ${linea} ${coords.at(-1)?.x ?? 0},${alto - margen.b}`
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-52 w-full" role="img" aria-label="Ventas por hora">
      <defs>
        <linearGradient id="area-hoy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2a122" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#e2a122" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.5, 1].map((marca) => {
        const y = margen.t + (1 - marca) * (alto - margen.t - margen.b)
        return (
          <g key={marca}>
            <line x1={margen.l} x2={ancho - margen.r} y1={y} y2={y} stroke="#1c1612" strokeOpacity="0.08" />
            <text x={margen.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#6d6258">
              {eje(maximo * marca)}
            </text>
          </g>
        )
      })}
      <polygon points={area} fill="url(#area-hoy)" />
      <polyline points={linea} fill="none" stroke="#d4653a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((punto) => (
        <g key={punto.hora}>
          <circle cx={punto.x} cy={punto.y} r={punto.monto ? 3.5 : 0} fill="#1c1612" />
          {punto.hora % 3 === 0 && (
            <text x={punto.x} y={alto - 8} textAnchor="middle" fontSize="11" fill="#6d6258">
              {punto.hora}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

function eje(valor: number) {
  if (valor >= 1000000) return `$${Math.round(valor / 100000) / 10} M`
  if (valor >= 1000) return `$${Math.round(valor / 1000)} mil`
  return `$${Math.round(valor)}`
}

export function Dona({ partes }: { partes: { nombre: string; valor: number; color: string }[] }) {
  const total = partes.reduce((suma, parte) => suma + parte.valor, 0) || 1
  const radio = 46
  const circunferencia = 2 * Math.PI * radio
  let avance = 0
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0" role="img" aria-label="Cómo pagaron">
        <circle cx="60" cy="60" r={radio} fill="none" stroke="#1c1612" strokeOpacity="0.08" strokeWidth="14" />
        {partes.map((parte) => {
          const largo = (parte.valor / total) * circunferencia
          const giro = avance
          avance += largo
          return (
            <circle
              key={parte.nombre}
              cx="60"
              cy="60"
              r={radio}
              fill="none"
              stroke={parte.color}
              strokeWidth="14"
              strokeDasharray={`${largo} ${circunferencia - largo}`}
              strokeDashoffset={-giro}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          )
        })}
        <text x="60" y="64" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1c1612">
          Hoy
        </text>
      </svg>
      <ul className="space-y-2 text-sm">
        {partes.map((parte) => (
          <li key={parte.nombre} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: parte.color }} />
              {parte.nombre}
            </span>
            <span className="font-semibold tabular-nums">{pesos(parte.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Barras({ filas }: { filas: { nombre: string; valor: number; detalle: string }[] }) {
  const maximo = Math.max(1, ...filas.map((fila) => fila.valor))
  if (!filas.length) return <p className="text-sm text-muted">Todavía no hay movimiento.</p>
  return (
    <ul className="space-y-3">
      {filas.map((fila) => (
        <li key={fila.nombre}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{fila.nombre}</span>
            <span className="shrink-0 tabular-nums text-muted">{fila.detalle}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-paper">
            <div
              className="h-full rounded-full bg-gradient-to-r from-saffron to-clay"
              style={{ width: `${Math.max(6, (fila.valor / maximo) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
