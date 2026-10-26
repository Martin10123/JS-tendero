import { Button } from '@/components/ui/button'

export function Paginacion({
  pagina,
  paginas,
  onChange,
}: {
  pagina: number
  paginas: number
  onChange: (pagina: number) => void
}) {
  if (paginas <= 1) return null
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" disabled={pagina === 0} onClick={() => onChange(pagina - 1)}>
        Anterior
      </Button>
      <span className="text-sm tabular-nums text-muted">
        {pagina + 1} / {paginas}
      </span>
      <Button variant="outline" disabled={pagina >= paginas - 1} onClick={() => onChange(pagina + 1)}>
        Siguiente
      </Button>
    </div>
  )
}
