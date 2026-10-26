import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from './auth.guard';
import { AuthUser, fromMilli, registrarMovimiento, toMilli } from './lib';
import { PrismaService } from './prisma.service';
import { TiendaEvents } from './tienda.events';

@Controller()
@Roles('dueno')
export class ComprasController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: TiendaEvents,
  ) {}

  @Get('proveedores')
  proveedores(@CurrentUser() user: AuthUser) {
    return this.prisma.proveedor.findMany({
      where: { tiendaId: user.tiendaId },
      orderBy: { nombre: 'asc' },
    });
  }

  @Post('proveedores')
  crearProveedor(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const nombre = String(body.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('El proveedor necesita nombre');
    return this.prisma.proveedor.create({
      data: {
        tiendaId: user.tiendaId,
        nombre,
        contacto: body.contacto ? String(body.contacto) : null,
        telefono: body.telefono ? String(body.telefono) : null,
        notas: body.notas ? String(body.notas) : null,
      },
    });
  }

  @Get('compras')
  compras(@CurrentUser() user: AuthUser) {
    return this.prisma.compra.findMany({
      where: { tiendaId: user.tiendaId },
      include: { proveedor: true, items: { include: { producto: true } } },
      orderBy: { fechaPedido: 'desc' },
      take: 40,
    });
  }

  @Post('compras')
  async crear(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const compra = await this.registrar(user, body, false);
    return compra;
  }

  @Post('compras/:id/recibir')
  async recibir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const compra = await this.prisma.compra.findFirst({
      where: { id, tiendaId: user.tiendaId },
      include: { items: true },
    });
    if (!compra) throw new BadRequestException('Compra no encontrada');
    if (compra.estado === 'recibida') return compra;
    await this.aplicarRecepcion(user, compra.id, compra.items);
    this.eventos.emitir(user.tiendaId);
    return this.prisma.compra.findUnique({
      where: { id },
      include: { proveedor: true, items: { include: { producto: true } } },
    });
  }

  @Get('compras/sugerencias')
  async sugerencias(@CurrentUser() user: AuthUser) {
    const desde = new Date(Date.now() - 7 * 86400000);
    const productos = await this.prisma.producto.findMany({
      where: { tiendaId: user.tiendaId, activo: true },
    });
    const items = await this.prisma.ventaItem.findMany({
      where: { tiendaId: user.tiendaId, venta: { estado: 'confirmada', fecha: { gte: desde } } },
    });
    const vendido = new Map<string, number>();
    for (const item of items) vendido.set(item.productoId, (vendido.get(item.productoId) ?? 0) + item.cantidad);
    return productos
      .filter((producto) => producto.stockActual <= producto.stockMinimo)
      .map((producto) => {
        const semana = vendido.get(producto.id) ?? 0;
        const falta = Math.max(0, producto.stockMinimo - producto.stockActual);
        const sugerido = Math.max(falta, semana);
        return {
          productoId: producto.id,
          nombre: producto.nombre,
          stockActual: fromMilli(producto.stockActual),
          stockMinimo: fromMilli(producto.stockMinimo),
          vendido7dias: fromMilli(semana),
          sugerido: fromMilli(sugerido),
        };
      });
  }

  async registrar(user: AuthUser, body: Record<string, unknown>, recibir: boolean) {
    const proveedorId = String(body.proveedorId ?? '');
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id: proveedorId, tiendaId: user.tiendaId },
    });
    if (!proveedor) throw new BadRequestException('Proveedor no encontrado');
    const items = (body.items as { productoId: string; cantidad: number; costoUnitario: number; fechaVencimiento?: string }[]) ?? [];
    if (!items.length) throw new BadRequestException('La compra no tiene productos');
    const normalizados = items.map((item) => ({
      productoId: item.productoId,
      cantidad: toMilli(item.cantidad),
      costoUnitario: Number(item.costoUnitario),
      fechaVencimiento: item.fechaVencimiento ? new Date(item.fechaVencimiento) : null,
    }));
    if (normalizados.some((item) => !Number.isInteger(item.costoUnitario) || item.costoUnitario < 0)) {
      throw new BadRequestException('El costo debe ser un entero en pesos');
    }
    const total = normalizados.reduce(
      (suma, item) => suma + Math.round((item.costoUnitario * item.cantidad) / 1000),
      0,
    );
    const pagada = Boolean(body.pagada);
    const compra = await this.prisma.compra.create({
      data: {
        tiendaId: user.tiendaId,
        proveedorId,
        total,
        pagada,
        saldoProveedor: pagada ? 0 : total,
        items: {
          create: normalizados.map((item) => ({
            tiendaId: user.tiendaId,
            productoId: item.productoId,
            cantidad: item.cantidad,
            costoUnitario: item.costoUnitario,
            fechaVencimiento: item.fechaVencimiento,
          })),
        },
      },
      include: { items: true },
    });
    if (recibir) {
      await this.aplicarRecepcion(user, compra.id, compra.items);
      this.eventos.emitir(user.tiendaId);
    }
    return this.prisma.compra.findUnique({
      where: { id: compra.id },
      include: { proveedor: true, items: { include: { producto: true } } },
    });
  }

  private async aplicarRecepcion(
    user: AuthUser,
    compraId: string,
    items: { id: string; productoId: string; cantidad: number; costoUnitario: number; fechaVencimiento: Date | null }[],
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const producto = await tx.producto.findFirst({
          where: { id: item.productoId, tiendaId: user.tiendaId },
        });
        if (!producto) throw new BadRequestException('Producto de la compra no encontrado');
        await tx.producto.update({ where: { id: producto.id }, data: { costo: item.costoUnitario } });
        await registrarMovimiento(tx, {
          tiendaId: user.tiendaId,
          productoId: producto.id,
          tipo: 'compra',
          delta: item.cantidad,
          costoUnitario: item.costoUnitario,
          referenciaTipo: 'compra',
          referenciaId: compraId,
          usuarioId: user.sub,
        });
        await tx.lote.create({
          data: {
            tiendaId: user.tiendaId,
            productoId: producto.id,
            compraItemId: item.id,
            cantidadRestante: item.cantidad,
            fechaVencimiento: item.fechaVencimiento,
          },
        });
      }
      await tx.compra.update({
        where: { id: compraId },
        data: { estado: 'recibida', fechaLlegada: new Date() },
      });
    });
  }
}
