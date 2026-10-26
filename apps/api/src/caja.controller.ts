import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, Roles } from './auth.guard';
import { AuthUser, fromMilli, registrarMovimiento } from './lib';
import { PrismaService } from './prisma.service';
import { TiendaEvents } from './tienda.events';

@Controller()
export class CajaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: TiendaEvents,
  ) {}

  @Get('caja')
  async actual(@CurrentUser() user: AuthUser) {
    const abierta = await this.prisma.cierreCaja.findFirst({
      where: { tiendaId: user.tiendaId, efectivoContado: null },
      orderBy: { fecha: 'desc' },
    });
    const recientes = await this.prisma.cierreCaja.findMany({
      where: { tiendaId: user.tiendaId, NOT: { efectivoContado: null } },
      orderBy: { fecha: 'desc' },
      take: 7,
    });
    return {
      abierta: abierta ? await this.conEsperado(user.tiendaId, abierta) : null,
      recientes,
    };
  }

  @Post('caja/abrir')
  async abrir(@CurrentUser() user: AuthUser, @Body() body: { efectivoInicial?: number }) {
    const ya = await this.prisma.cierreCaja.findFirst({
      where: { tiendaId: user.tiendaId, efectivoContado: null },
    });
    if (ya) throw new BadRequestException('Ya hay una caja abierta');
    const inicial = Number(body.efectivoInicial);
    if (!Number.isInteger(inicial) || inicial < 0) {
      throw new BadRequestException('El efectivo inicial debe ser un entero');
    }
    return this.prisma.cierreCaja.create({
      data: { tiendaId: user.tiendaId, efectivoInicial: inicial },
    });
  }

  @Post('caja/cerrar')
  async cerrar(
    @CurrentUser() user: AuthUser,
    @Body() body: { efectivoContado?: number; notas?: string },
  ) {
    const abierta = await this.prisma.cierreCaja.findFirst({
      where: { tiendaId: user.tiendaId, efectivoContado: null },
      orderBy: { fecha: 'desc' },
    });
    if (!abierta) throw new BadRequestException('No hay una caja abierta');
    const contado = Number(body.efectivoContado);
    if (!Number.isInteger(contado) || contado < 0) {
      throw new BadRequestException('El conteo debe ser un entero en pesos');
    }
    const esperado = await this.esperado(user.tiendaId, abierta.fecha, abierta.efectivoInicial);
    return this.prisma.cierreCaja.update({
      where: { id: abierta.id },
      data: {
        efectivoEsperado: esperado,
        efectivoContado: contado,
        diferencia: contado - esperado,
        notas: body.notas?.trim() || null,
      },
    });
  }

  @Roles('dueno')
  @Post('caja/conteos')
  async contar(
    @CurrentUser() user: AuthUser,
    @Body() body: { productoId?: string; cantidadContada?: number; ajustar?: boolean },
  ) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: String(body.productoId), tiendaId: user.tiendaId },
    });
    if (!producto) throw new BadRequestException('Producto no encontrado');
    const contada = Math.round(Number(body.cantidadContada) * 1000);
    if (!Number.isFinite(contada) || contada < 0) {
      throw new BadRequestException('La cantidad contada no es válida');
    }
    const diferencia = contada - producto.stockActual;
    const conteo = await this.prisma.$transaction(async (tx) => {
      if (body.ajustar && diferencia !== 0) {
        await registrarMovimiento(tx, {
          tiendaId: user.tiendaId,
          productoId: producto.id,
          tipo: diferencia < 0 ? 'merma' : 'ajuste',
          delta: diferencia,
          costoUnitario: producto.costo,
          usuarioId: user.sub,
          referenciaTipo: 'conteo',
          nota: 'Conteo de inventario',
        });
      }
      return tx.conteoInventario.create({
        data: {
          tiendaId: user.tiendaId,
          productoId: producto.id,
          cantidadSistema: producto.stockActual,
          cantidadContada: contada,
          diferencia,
          ajustado: Boolean(body.ajustar) && diferencia !== 0,
        },
      });
    });
    this.eventos.emitir(user.tiendaId);
    return {
      ...conteo,
      cantidadSistema: fromMilli(conteo.cantidadSistema),
      cantidadContada: fromMilli(conteo.cantidadContada),
      diferencia: fromMilli(conteo.diferencia),
    };
  }

  private async conEsperado(
    tiendaId: string,
    caja: { id: string; fecha: Date; efectivoInicial: number },
  ) {
    return {
      ...caja,
      efectivoEsperado: await this.esperado(tiendaId, caja.fecha, caja.efectivoInicial),
    };
  }

  private async esperado(tiendaId: string, desde: Date, inicial: number) {
    const [ventas, abonos] = await Promise.all([
      this.prisma.venta.aggregate({
        where: { tiendaId, estado: 'confirmada', metodoPago: 'efectivo', fecha: { gte: desde } },
        _sum: { total: true },
      }),
      this.prisma.abono.aggregate({
        where: { tiendaId, metodoPago: 'efectivo', fecha: { gte: desde } },
        _sum: { monto: true },
      }),
    ]);
    return inicial + (ventas._sum.total ?? 0) + (abonos._sum.monto ?? 0);
  }
}
