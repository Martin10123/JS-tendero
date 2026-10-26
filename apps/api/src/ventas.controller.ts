import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MetodoPago, OrigenVenta, Prisma } from '@prisma/client';
import { CurrentUser } from './auth.guard';
import {
  AuthUser,
  fromMilli,
  guardarScore,
  registrarMovimiento,
  toMilli,
  totalLinea,
} from './lib';
import { PrismaService } from './prisma.service';
import { TiendaEvents } from './tienda.events';

type ItemEntrada = { productoId: string; cantidad: number; precioUnitario?: number };

const METODOS = new Set(['efectivo', 'transferencia', 'fiado', 'mixto']);
const ORIGENES = new Set(['pos', 'whatsapp', 'catalogo']);

@Controller('ventas')
export class VentasController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: TiendaEvents,
  ) {}

  @Get()
  async listar(@CurrentUser() user: AuthUser, @Query('fecha') fecha?: string) {
    const donde: Prisma.VentaWhereInput = { tiendaId: user.tiendaId };
    if (fecha) {
      const inicio = new Date(`${fecha}T00:00:00-05:00`);
      donde.fecha = { gte: inicio, lt: new Date(inicio.getTime() + 86400000) };
    }
    const ventas = await this.prisma.venta.findMany({
      where: donde,
      include: { items: { include: { producto: true } }, cliente: true, usuario: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' },
      take: 100,
    });
    return ventas.map((venta) => this.presentar(venta, user.rol));
  }

  @Post()
  async crear(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const venta = await this.registrar(user, body);
    this.eventos.emitir(user.tiendaId);
    return venta;
  }

  @Post(':id/anular')
  async anular(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, tiendaId: user.tiendaId },
      include: { fiado: true, items: true },
    });
    if (!venta) throw new BadRequestException('Venta no encontrada');
    if (venta.estado === 'anulada') return this.presentar(venta, user.rol);
    if (venta.fiado && venta.fiado.saldo !== venta.fiado.montoOriginal) {
      throw new BadRequestException('Ese fiado ya tiene abonos. No se puede anular la venta');
    }
    await this.prisma.$transaction(async (tx) => {
      const movimientos = await tx.movimientoInventario.findMany({
        where: { referenciaId: venta.id, tipo: 'venta' },
      });
      for (const movimiento of movimientos) {
        await registrarMovimiento(tx, {
          tiendaId: user.tiendaId,
          productoId: movimiento.productoId,
          loteId: movimiento.loteId,
          tipo: 'devolucion',
          delta: -movimiento.cantidad,
          costoUnitario: movimiento.costoUnitario,
          referenciaTipo: 'anulacion',
          referenciaId: venta.id,
          usuarioId: user.sub,
          nota: 'Anulación de venta',
        });
        if (movimiento.loteId) {
          await tx.lote.update({
            where: { id: movimiento.loteId },
            data: { cantidadRestante: { increment: -movimiento.cantidad } },
          });
        }
      }
      await tx.venta.update({ where: { id: venta.id }, data: { estado: 'anulada' } });
      if (venta.fiado) {
        await tx.fiado.update({
          where: { id: venta.fiado.id },
          data: { saldo: 0, estado: 'anulado' },
        });
      }
      await tx.fidelizacionMovimiento.deleteMany({ where: { ventaId: venta.id } });
    });
    if (venta.clienteId) await guardarScore(this.prisma, venta.clienteId);
    this.eventos.emitir(user.tiendaId);
    const fresca = await this.prisma.venta.findUniqueOrThrow({
      where: { id: venta.id },
      include: { items: { include: { producto: true } }, cliente: true },
    });
    return this.presentar(fresca, user.rol);
  }

  async registrar(user: AuthUser, body: Record<string, unknown>) {
    const items = (body.items as ItemEntrada[]) ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('La venta no tiene productos');
    }
    const metodo = String(body.metodoPago ?? '');
    if (!METODOS.has(metodo)) throw new BadRequestException('Método de pago no válido');
    const origen = String(body.origen ?? 'pos');
    if (!ORIGENES.has(origen)) throw new BadRequestException('Origen no válido');
    const clienteId = body.clienteId ? String(body.clienteId) : undefined;
    if ((metodo === 'fiado' || metodo === 'mixto') && !clienteId) {
      throw new BadRequestException('El fiado exige un cliente');
    }
    if (body.id) {
      const previa = await this.prisma.venta.findFirst({
        where: { id: String(body.id), tiendaId: user.tiendaId },
        include: { items: { include: { producto: true } }, cliente: true },
      });
      if (previa) return this.presentar(previa, user.rol);
    }

    try {
      const venta = await this.prisma.$transaction(async (tx) => {
        const promos = await tx.promocion.findMany({
          where: {
            tiendaId: user.tiendaId,
            activa: true,
            vigenteDesde: { lte: new Date() },
            vigenteHasta: { gte: new Date() },
          },
        });
        const lineas: {
          productoId: string;
          cantidad: number;
          precioUnitario: number;
          costoUnitario: number;
          subtotal: number;
        }[] = [];
        for (const item of items) {
          const producto = await tx.producto.findFirst({
            where: { id: item.productoId, tiendaId: user.tiendaId, activo: true },
          });
          if (!producto) throw new BadRequestException('Hay un producto que no existe');
          const cantidad = toMilli(item.cantidad);
          let precio = item.precioUnitario === undefined ? producto.precio : pesosEntero(item.precioUnitario);
          const promo = promos.find(
            (p) => p.tipo === 'porcentaje' && p.productoIds.includes(producto.id),
          );
          if (promo && item.precioUnitario === undefined) {
            precio = Math.round((precio * (100 - promo.descuento)) / 100);
          }
          lineas.push({
            productoId: producto.id,
            cantidad,
            precioUnitario: precio,
            costoUnitario: producto.costo,
            subtotal: totalLinea(precio, cantidad),
          });
        }
        const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);
        const montoFiado =
          metodo === 'fiado' ? total : metodo === 'mixto' ? pesosEntero(body.montoFiado) : 0;
        if (montoFiado > total) throw new BadRequestException('El fiado no puede superar el total');
        if (montoFiado > 0 && clienteId) {
          const cliente = await tx.cliente.findFirst({
            where: { id: clienteId, tiendaId: user.tiendaId, activo: true },
          });
          if (!cliente) throw new BadRequestException('Cliente no encontrado');
          const deuda = await tx.fiado.aggregate({
            where: { clienteId, estado: 'abierto' },
            _sum: { saldo: true },
          });
          const saldo = deuda._sum.saldo ?? 0;
          if (cliente.limiteCredito > 0 && saldo + montoFiado > cliente.limiteCredito) {
            if (!body.forzarCredito) {
              throw new BadRequestException('Supera el límite de crédito');
            }
            if (user.rol !== 'dueno') {
              throw new ForbiddenException('Solo el dueño puede superar el límite');
            }
          }
        }

        const venta = await tx.venta.create({
          data: {
            id: body.id ? String(body.id) : undefined,
            tiendaId: user.tiendaId,
            clienteId: clienteId ?? null,
            usuarioId: user.sub,
            total,
            metodoPago: metodo as MetodoPago,
            origen: origen as OrigenVenta,
            items: {
              create: lineas.map((linea) => ({
                tiendaId: user.tiendaId,
                productoId: linea.productoId,
                cantidad: linea.cantidad,
                precioUnitario: linea.precioUnitario,
                costoUnitario: linea.costoUnitario,
              })),
            },
          },
        });

        for (const linea of lineas) {
          await this.descontar(tx, user, venta.id, linea.productoId, linea.cantidad, linea.costoUnitario);
        }
        if (montoFiado > 0 && clienteId) {
          await tx.fiado.create({
            data: {
              tiendaId: user.tiendaId,
              clienteId,
              ventaId: venta.id,
              montoOriginal: montoFiado,
              saldo: montoFiado,
            },
          });
        }
        if (clienteId && total > 0) {
          const puntos = Math.floor(total / 1000);
          if (puntos > 0) {
            await tx.fidelizacionMovimiento.create({
              data: {
                tiendaId: user.tiendaId,
                clienteId,
                ventaId: venta.id,
                puntos,
                motivo: 'Venta',
              },
            });
          }
        }
        return venta.id;
      });
      if (clienteId && (metodo === 'fiado' || metodo === 'mixto')) {
        await guardarScore(this.prisma, clienteId);
      }
      const completa = await this.prisma.venta.findUniqueOrThrow({
        where: { id: venta },
        include: { items: { include: { producto: true } }, cliente: true },
      });
      this.eventos.emitir(user.tiendaId);
      return this.presentar(completa, user.rol);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && body.id) {
        const previa = await this.prisma.venta.findFirst({
          where: { id: String(body.id), tiendaId: user.tiendaId },
          include: { items: { include: { producto: true } }, cliente: true },
        });
        if (previa) return this.presentar(previa, user.rol);
      }
      throw error;
    }
  }

  private async descontar(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    ventaId: string,
    productoId: string,
    cantidad: number,
    costo: number,
  ) {
    let resto = cantidad;
    const lotes = await tx.lote.findMany({
      where: { productoId, tiendaId: user.tiendaId, cantidadRestante: { gt: 0 } },
      orderBy: { fechaVencimiento: 'asc' },
    });
    const partes: { loteId: string | null; take: number }[] = [];
    for (const lote of lotes) {
      if (resto <= 0) break;
      const take = Math.min(resto, lote.cantidadRestante);
      await tx.lote.update({
        where: { id: lote.id },
        data: { cantidadRestante: { decrement: take } },
      });
      partes.push({ loteId: lote.id, take });
      resto -= take;
    }
    if (resto > 0) partes.push({ loteId: null, take: resto });
    for (const parte of partes) {
      await registrarMovimiento(tx, {
        tiendaId: user.tiendaId,
        productoId,
        loteId: parte.loteId,
        tipo: 'venta',
        delta: -parte.take,
        costoUnitario: costo,
        referenciaTipo: 'venta',
        referenciaId: ventaId,
        usuarioId: user.sub,
      });
    }
  }

  presentar(venta: any, rol: string) {
    return {
      id: venta.id,
      total: venta.total,
      metodoPago: venta.metodoPago,
      origen: venta.origen,
      estado: venta.estado,
      fecha: venta.fecha,
      cliente: venta.cliente ? { id: venta.cliente.id, nombre: venta.cliente.nombre } : null,
      vendedor: venta.usuario?.nombre ?? null,
      items: (venta.items ?? []).map((item: any) => ({
        productoId: item.productoId,
        nombre: item.producto?.nombre,
        cantidad: fromMilli(item.cantidad),
        precioUnitario: item.precioUnitario,
        ...(rol === 'dueno' ? { costoUnitario: item.costoUnitario } : {}),
      })),
    };
  }
}

function pesosEntero(valor: unknown) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new BadRequestException('El valor debe ser un entero en pesos');
  return n;
}
