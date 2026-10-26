import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export const MILLI = 1000;

export type AuthUser = {
  sub: string;
  tiendaId: string;
  rol: 'dueno' | 'empleado';
  nombre: string;
};

export function toMilli(cantidad: number) {
  const n = Number(cantidad);
  if (!Number.isFinite(n) || n <= 0) {
    throw new BadRequestException('La cantidad debe ser mayor que cero');
  }
  return Math.round(n * MILLI);
}

export function fromMilli(cantidad: number) {
  return cantidad / MILLI;
}

export function totalLinea(precioUnitario: number, cantidadMilli: number) {
  return Math.round((precioUnitario * cantidadMilli) / MILLI);
}

export function pesos(valor: unknown, campo: string) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException(`${campo} debe ser un entero en pesos`);
  }
  return n;
}

export function rangoDia(fecha = new Date(), dias = 0) {
  const desplazada = new Date(fecha.getTime() + dias * 86400000);
  const parte = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(desplazada);
  const inicio = new Date(`${parte}T00:00:00-05:00`);
  const fin = new Date(inicio.getTime() + 86400000);
  return { inicio, fin, parte };
}

export function diasEntre(desde: Date, hasta = new Date()) {
  return Math.floor((hasta.getTime() - desde.getTime()) / 86400000);
}

export function antiguedad(fecha: Date) {
  const dias = diasEntre(fecha);
  if (dias <= 15) return '0-15';
  if (dias <= 30) return '15-30';
  return '30+';
}

export function calcularScore(fiados: { saldo: number; fecha: Date }[]) {
  let score = 100;
  for (const fiado of fiados) {
    if (fiado.saldo <= 0) continue;
    const dias = diasEntre(fiado.fecha);
    if (dias > 30) score -= 20;
    else if (dias > 15) score -= 8;
  }
  return Math.max(0, Math.min(100, score));
}

export async function guardarScore(prisma: PrismaService, clienteId: string) {
  const fiados = await prisma.fiado.findMany({ where: { clienteId } });
  const score = calcularScore(fiados);
  await prisma.cliente.update({ where: { id: clienteId }, data: { score } });
  return score;
}

export function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

type MovimientoInput = {
  tiendaId: string;
  productoId: string;
  loteId?: string | null;
  tipo: 'venta' | 'compra' | 'ajuste' | 'merma' | 'devolucion';
  delta: number;
  costoUnitario: number;
  referenciaTipo?: string;
  referenciaId?: string;
  usuarioId?: string;
  nota?: string;
};

export async function registrarMovimiento(
  tx: Prisma.TransactionClient,
  input: MovimientoInput,
) {
  const where: Prisma.ProductoWhereInput = {
    id: input.productoId,
    tiendaId: input.tiendaId,
  };
  if (input.delta < 0) where.stockActual = { gte: -input.delta };
  const actualizado = await tx.producto.updateMany({
    where,
    data: { stockActual: { increment: input.delta } },
  });
  if (actualizado.count !== 1) {
    const producto = await tx.producto.findUnique({ where: { id: input.productoId } });
    throw new BadRequestException(
      `Sin stock suficiente de ${producto?.nombre ?? 'ese producto'}`,
    );
  }
  return tx.movimientoInventario.create({
    data: {
      tiendaId: input.tiendaId,
      productoId: input.productoId,
      loteId: input.loteId ?? null,
      tipo: input.tipo,
      cantidad: input.delta,
      costoUnitario: input.costoUnitario,
      referenciaTipo: input.referenciaTipo,
      referenciaId: input.referenciaId,
      usuarioId: input.usuarioId,
      nota: input.nota,
    },
  });
}

export function vistaProducto(producto: any, rol: string) {
  const base = {
    id: producto.id,
    categoriaId: producto.categoriaId,
    categoria: producto.categoria?.nombre ?? producto.categoria ?? null,
    nombre: producto.nombre,
    codigoBarras: producto.codigoBarras,
    unidad: producto.unidad,
    precio: producto.precio,
    stockActual: fromMilli(producto.stockActual),
    stockMinimo: fromMilli(producto.stockMinimo),
    esFavorito: producto.esFavorito,
    visibleCatalogo: producto.visibleCatalogo,
    activo: producto.activo,
  };
  if (rol !== 'dueno') return base;
  return { ...base, costo: producto.costo };
}

export function estadoCatalogo(stockMilli: number, minimoMilli: number) {
  if (stockMilli <= 0) return 'agotado';
  if (stockMilli <= minimoMilli) return 'quedan pocos';
  return 'disponible';
}
