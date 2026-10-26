import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { PeriodoMeta } from '@prisma/client';
import { Workbook } from 'exceljs';
import { Response } from 'express';
import { CurrentUser, Roles } from './auth.guard';
import { AuthUser, rangoDia } from './lib';
import { PrismaService } from './prisma.service';

@Controller()
@Roles('dueno')
export class CrecimientoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('promociones')
  promociones(@CurrentUser() user: AuthUser) {
    return this.prisma.promocion.findMany({
      where: { tiendaId: user.tiendaId },
      orderBy: { vigenteDesde: 'desc' },
    });
  }

  @Post('promociones')
  crearPromo(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const nombre = String(body.nombre ?? '').trim();
    const ids = (body.productoIds as string[]) ?? [];
    const descuento = Number(body.descuento);
    if (!nombre || !ids.length) throw new BadRequestException('La promo necesita nombre y productos');
    if (!Number.isInteger(descuento) || descuento <= 0 || descuento >= 100) {
      throw new BadRequestException('El descuento es un porcentaje entero entre 1 y 99');
    }
    return this.prisma.promocion.create({
      data: {
        tiendaId: user.tiendaId,
        nombre,
        tipo: 'porcentaje',
        productoIds: ids,
        descuento,
        vigenteDesde: body.vigenteDesde ? new Date(String(body.vigenteDesde)) : new Date(),
        vigenteHasta: body.vigenteHasta
          ? new Date(String(body.vigenteHasta))
          : new Date(Date.now() + 7 * 86400000),
        activa: true,
      },
    });
  }

  @Get('metas')
  metas(@CurrentUser() user: AuthUser) {
    return this.prisma.meta.findMany({ where: { tiendaId: user.tiendaId }, orderBy: { fechaInicio: 'desc' } });
  }

  @Post('metas')
  async crearMeta(@CurrentUser() user: AuthUser, @Body() body: { periodo?: string; montoObjetivo?: number }) {
    const periodo = String(body.periodo ?? 'dia');
    if (!['dia', 'semana', 'mes'].includes(periodo)) throw new BadRequestException('Periodo no válido');
    const monto = Number(body.montoObjetivo);
    if (!Number.isInteger(monto) || monto <= 0) throw new BadRequestException('La meta debe ser un entero');
    return this.prisma.meta.create({
      data: {
        tiendaId: user.tiendaId,
        periodo: periodo as PeriodoMeta,
        fechaInicio: new Date(),
        montoObjetivo: monto,
      },
    });
  }

  @Get('metas/progreso')
  async progreso(@CurrentUser() user: AuthUser) {
    const meta = await this.prisma.meta.findFirst({
      where: { tiendaId: user.tiendaId },
      orderBy: { fechaInicio: 'desc' },
    });
    if (!meta) return { meta: null, vendido: 0, avance: 0 };
    const ahora = new Date();
    let inicio = meta.fechaInicio;
    if (meta.periodo === 'dia') inicio = rangoDia(ahora).inicio;
    if (meta.periodo === 'semana') inicio = new Date(rangoDia(ahora).inicio.getTime() - 6 * 86400000);
    if (meta.periodo === 'mes') {
      const parte = rangoDia(ahora).parte.slice(0, 7);
      inicio = new Date(`${parte}-01T00:00:00-05:00`);
    }
    const suma = await this.prisma.venta.aggregate({
      where: { tiendaId: user.tiendaId, estado: 'confirmada', fecha: { gte: inicio } },
      _sum: { total: true },
    });
    const vendido = suma._sum.total ?? 0;
    return { meta, vendido, avance: Math.min(100, Math.round((vendido / meta.montoObjetivo) * 100)) };
  }

  @Get('fidelizacion/:clienteId')
  async puntos(@CurrentUser() user: AuthUser, @Param('clienteId') clienteId: string) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, tiendaId: user.tiendaId },
    });
    if (!cliente) throw new BadRequestException('Cliente no encontrado');
    const movimientos = await this.prisma.fidelizacionMovimiento.findMany({
      where: { clienteId, tiendaId: user.tiendaId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const puntos = movimientos.reduce((suma, movimiento) => suma + movimiento.puntos, 0);
    return { cliente: cliente.nombre, puntos, movimientos };
  }

  @Get('reportes/contador')
  async reporte(
    @CurrentUser() user: AuthUser,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Res() res: Response,
  ) {
    const inicio = new Date(`${desde || rangoDia().parte}T00:00:00-05:00`);
    const finBase = new Date(`${hasta || rangoDia().parte}T00:00:00-05:00`);
    const fin = new Date(finBase.getTime() + 86400000);
    const [ventas, compras] = await Promise.all([
      this.prisma.venta.findMany({
        where: { tiendaId: user.tiendaId, estado: 'confirmada', fecha: { gte: inicio, lt: fin } },
        include: { items: true },
        orderBy: { fecha: 'asc' },
      }),
      this.prisma.compra.findMany({
        where: { tiendaId: user.tiendaId, fechaPedido: { gte: inicio, lt: fin } },
        include: { proveedor: true },
        orderBy: { fechaPedido: 'asc' },
      }),
    ]);
    const libro = new Workbook();
    const hojaVentas = libro.addWorksheet('Ventas');
    hojaVentas.addRow(['Fecha', 'Total', 'Método', 'IVA estimado']);
    for (const venta of ventas) {
      hojaVentas.addRow([
        venta.fecha.toISOString(),
        venta.total,
        venta.metodoPago,
        Math.round((venta.total * 19) / 119),
      ]);
    }
    const hojaCompras = libro.addWorksheet('Compras');
    hojaCompras.addRow(['Fecha', 'Proveedor', 'Total', 'Estado', 'Saldo']);
    for (const compra of compras) {
      hojaCompras.addRow([
        compra.fechaPedido.toISOString(),
        compra.proveedor.nombre,
        compra.total,
        compra.estado,
        compra.saldoProveedor,
      ]);
    }
    const buffer = Buffer.from(await libro.xlsx.writeBuffer());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="contador.xlsx"');
    res.send(buffer);
  }
}
