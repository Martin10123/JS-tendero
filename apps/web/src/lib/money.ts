export function pesos(valor: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor || 0)
}

export function cantidad(valor: number, unidad: string) {
  const texto = unidad === 'und' ? String(Math.round(valor)) : String(Math.round(valor * 10) / 10)
  return `${texto} ${unidad}`
}
