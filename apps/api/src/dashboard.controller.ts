import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Roles } from './auth.guard';
import { AuthUser, antiguedad, fromMilli, rangoDia, totalLinea } from './lib';
import { PrismaService } from './prisma.service';

@Controller()
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard/hoy')
  async hoy(@CurrentUser() user: AuthUser) {
    const { inicio, fin } = rangoDia();
    const previo = rangoDia(new Date(), -7);
    const [ventas, anteriores] = await Promise.all([
      this.ventasEntre(user.tiendaId, inicio, fin),
      this.ventasEntre(user.tiendaId, previo.inicio, previo.fin),
    ]);
    const actual = this.resumen(ventas, user.rol);
    const semana = this.resumen(anteriores, user.rol);
    const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, ventas: 0, monto: 0 }));
    for (const venta of ventas) {
      const hora = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Bogota',
          hour: 'numeric',
          hourCycle: 'h23',
        }).format(venta.fecha),
      );
      horas[hora].ventas += 1;
      horas[hora].monto += venta.total;
    }
    return { ...actual, semanaPasada: semana, horas };
  }

  @Get('dashboard/productos')
  async productos(@CurrentUser() user: AuthUser) {
    const desde = new Date(Date.now() - 30 * 86400000);
    const items = await this.prisma.ventaItem.findMany({
      where: { tiendaId: user.tiendaId, venta: { estado: 'confirmada', fecha: { gte: desde } } },
      include: { producto: true, venta: true },
    });
    const mapa = new Map<string, { nombre: string; cantidad: number; ventas: number; margen: number }>();
    for (const item of items) {
      const previo = mapa.get(item.productoId) ?? {
        nombre: item.producto.nombre,
        cantidad: 0,
        ventas: 0,
        margen: 0,
      };
      previo.cantidad += item.cantidad;
      previo.ventas += totalLinea(item.precioUnitario, item.cantidad);
      previo.margen += totalLinea(item.precioUnitario - item.costoUnitario, item.cantidad);
      mapa.set(item.productoId, previo);
    }
    const ranking = [...mapa.entries()].map(([id, valor]) => ({
      id,
      nombre: valor.nombre,
      cantidad: fromMilli(valor.cantidad),
      ventas: valor.ventas,
      ...(user.rol === 'dueno' ? { margen: valor.margen } : {}),
    }));
    const vendidos = new Set(mapa.keys());
    const catalogo = await this.prisma.producto.findMany({
      where: { tiendaId: user.tiendaId, activo: true },
    });
    const dormidos = catalogo
      .filter((producto) => !vendidos.has(producto.id))
      .map((producto) => ({ id: producto.id, nombre: producto.nombre, stockActual: fromMilli(producto.stockActual) }));
    const bajoStock = catalogo
      .filter((producto) => producto.stockActual <= producto.stockMinimo)
      .map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        stockActual: fromMilli(producto.stockActual),
        stockMinimo: fromMilli(producto.stockMinimo),
      }));
    const porVencer = await this.prisma.lote.findMany({
      where: {
        tiendaId: user.tiendaId,
        cantidadRestante: { gt: 0 },
        fechaVencimiento: { lte: new Date(Date.now() + 7 * 86400000) },
      },
      include: { producto: true },
      orderBy: { fechaVencimiento: 'asc' },
    });
    return {
      masVendidos: [...ranking].sort((a, b) => b.cantidad - a.cantidad).slice(0, 8),
      menosVendidos: [...ranking].sort((a, b) => a.cantidad - b.cantidad).slice(0, 8),
      mayorMargen:
        user.rol === 'dueno'
          ? [...ranking].sort((a, b) => (b.margen ?? 0) - (a.margen ?? 0)).slice(0, 8)
          : [],
      dormidos,
      bajoStock,
      porVencer: porVencer.map((lote) => ({
        producto: lote.producto.nombre,
        cantidad: fromMilli(lote.cantidadRestante),
        fechaVencimiento: lote.fechaVencimiento,
      })),
    };
  }

  @Get('dashboard/fiados')
  async fiados(@CurrentUser() user: AuthUser) {
    const abiertos = await this.prisma.fiado.findMany({
      where: { tiendaId: user.tiendaId, estado: 'abierto' },
      include: { cliente: true },
    });
    const cubetas = { '0-15': 0, '15-30': 0, '30+': 0 };
    const porCliente = new Map<string, { nombre: string; saldo: number }>();
    for (const fiado of abiertos) {
      cubetas[antiguedad(fiado.fecha) as keyof typeof cubetas] += fiado.saldo;
      const previo = porCliente.get(fiado.clienteId) ?? { nombre: fiado.cliente.nombre, saldo: 0 };
      previo.saldo += fiado.saldo;
      porCliente.set(fiado.clienteId, previo);
    }
    const desde = new Date(Date.now() - 30 * 86400000);
    const abonos = await this.prisma.abono.findMany({
      where: { tiendaId: user.tiendaId, fecha: { gte: desde } },
      include: { cliente: true },
    });
    const abonadores = new Map<string, { nombre: string; monto: number }>();
    for (const abono of abonos) {
      const previo = abonadores.get(abono.clienteId) ?? { nombre: abono.cliente.nombre, monto: 0 };
      previo.monto += abono.monto;
      abonadores.set(abono.clienteId, previo);
    }
    return {
      totalPorCobrar: abiertos.reduce((suma, fiado) => suma + fiado.saldo, 0),
      antiguedad: cubetas,
      quienesDebenMas: [...porCliente.values()].sort((a, b) => b.saldo - a.saldo).slice(0, 8),
      quienesAbonanMas: [...abonadores.values()].sort((a, b) => b.monto - a.monto).slice(0, 8),
    };
  }

  @Roles('dueno')
  @Get('dashboard/compras')
  async compras(@CurrentUser() user: AuthUser) {
    const compras = await this.prisma.compra.findMany({
      where: { tiendaId: user.tiendaId, estado: { not: 'cancelada' } },
      include: { proveedor: true },
    });
    const porProveedor = new Map<string, { nombre: string; total: number; deuda: number }>();
    for (const compra of compras) {
      const previo = porProveedor.get(compra.proveedorId) ?? {
        nombre: compra.proveedor.nombre,
        total: 0,
        deuda: 0,
      };
      previo.total += compra.total;
      previo.deuda += compra.saldoProveedor;
      porProveedor.set(compra.proveedorId, previo);
    }
    return {
      porProveedor: [...porProveedor.values()].sort((a, b) => b.total - a.total),
      deuda: compras.reduce((suma, compra) => suma + compra.saldoProveedor, 0),
    };
  }

  @Get('alertas')
  async alertas(@CurrentUser() user: AuthUser) {
    const [productos, lotes, fiados] = await Promise.all([
      this.prisma.producto.findMany({ where: { tiendaId: user.tiendaId, activo: true } }),
      this.prisma.lote.findMany({
        where: {
          tiendaId: user.tiendaId,
          cantidadRestante: { gt: 0 },
          fechaVencimiento: { lte: new Date(Date.now() + 7 * 86400000) },
        },
        include: { producto: true },
      }),
      this.prisma.fiado.findMany({
        where: { tiendaId: user.tiendaId, estado: 'abierto' },
        include: { cliente: true },
      }),
    ]);
    return {
      bajoStock: productos
        .filter((producto) => producto.stockActual <= producto.stockMinimo)
        .map((producto) => ({ nombre: producto.nombre, stockActual: fromMilli(producto.stockActual) })),
      porVencer: lotes.map((lote) => ({
        nombre: lote.producto.nombre,
        fechaVencimiento: lote.fechaVencimiento,
      })),
      fiadosViejos: fiados
        .filter((fiado) => antiguedad(fiado.fecha) === '30+')
        .map((fiado) => ({ nombre: fiado.cliente.nombre, saldo: fiado.saldo, fecha: fiado.fecha })),
    };
  }

  private ventasEntre(tiendaId: string, inicio: Date, fin: Date) {
    return this.prisma.venta.findMany({
      where: { tiendaId, estado: 'confirmada', fecha: { gte: inicio, lt: fin } },
      include: { items: true },
    });
  }

  private resumen(
    ventas: { total: number; metodoPago: string; items: { precioUnitario: number; costoUnitario: number; cantidad: number }[] }[],
    rol: string,
  ) {
    const totales = { efectivo: 0, transferencia: 0, fiado: 0, mixto: 0 };
    let utilidad = 0;
    for (const venta of ventas) {
      totales[venta.metodoPago as keyof typeof totales] += venta.total;
      for (const item of venta.items) {
        utilidad += totalLinea(item.precioUnitario - item.costoUnitario, item.cantidad);
      }
    }
    const total = ventas.reduce((suma, venta) => suma + venta.total, 0);
    return {
      ventas: total,
      numero: ventas.length,
      ticketPromedio: ventas.length ? Math.round(total / ventas.length) : 0,
      metodos: {
        efectivo: totales.efectivo,
        digital: totales.transferencia,
        fiado: totales.fiado + totales.mixto,
      },
      ...(rol === 'dueno' ? { utilidad } : {}),
    };
  }
}
