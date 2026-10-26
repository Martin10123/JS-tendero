import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Sse } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Public } from './auth.guard';
import { estadoCatalogo, toMilli } from './lib';
import { PrismaService } from './prisma.service';
import { TiendaEvents } from './tienda.events';

@Controller('public')
export class PublicoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: TiendaEvents,
  ) {}

  @Public()
  @Get(':slug/productos')
  async productos(@Param('slug') slug: string) {
    const tienda = await this.tienda(slug);
    const productos = await this.prisma.producto.findMany({
      where: { tiendaId: tienda.id, activo: true, visibleCatalogo: true },
      orderBy: { nombre: 'asc' },
    });
    return {
      tienda: { nombre: tienda.nombre, slug: tienda.slug, telefonoWhatsapp: tienda.telefonoWhatsapp },
      productos: productos.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        unidad: producto.unidad,
        estado: estadoCatalogo(producto.stockActual, producto.stockMinimo),
      })),
    };
  }

  @Public()
  @Sse(':slug/stream')
  stream(@Param('slug') slug: string): Observable<MessageEvent> {
    return new Observable((sub) => {
      let tiendaId = '';
      const enviar = () => sub.next({ data: { ts: Date.now() } });
      void this.prisma.tienda.findUnique({ where: { slug } }).then((tienda) => {
        if (!tienda) {
          sub.error(new NotFoundException('Tienda no encontrada'));
          return;
        }
        tiendaId = tienda.id;
        enviar();
      });
      const dejar = this.eventos.escuchar((id) => {
        if (id && id === tiendaId) enviar();
      });
      const pulso = setInterval(enviar, 20000);
      return () => {
        dejar();
        clearInterval(pulso);
      };
    });
  }

  @Public()
  @Post(':slug/pedido')
  async pedido(
    @Param('slug') slug: string,
    @Body() body: { telefono?: string; items?: { productoId: string; cantidad: number }[]; nota?: string },
  ) {
    const tienda = await this.tienda(slug);
    const telefono = String(body.telefono ?? '').replace(/\D/g, '');
    if (telefono.length < 10) throw new BadRequestException('Deja un WhatsApp de 10 dígitos');
    const items = body.items ?? [];
    if (!items.length) throw new BadRequestException('El pedido está vacío');
    const productos = await this.prisma.producto.findMany({
      where: {
        tiendaId: tienda.id,
        visibleCatalogo: true,
        id: { in: items.map((item) => item.productoId) },
      },
    });
    if (productos.length !== items.length) throw new BadRequestException('Hay productos que ya no están');
    const armados = items.map((item) => {
      const producto = productos.find((p) => p.id === item.productoId)!;
      const cantidad = toMilli(item.cantidad) / 1000;
      return { productoId: producto.id, nombre: producto.nombre, cantidad, precio: producto.precio };
    });
    const mensaje = await this.prisma.mensajeWhatsapp.create({
      data: {
        tiendaId: tienda.id,
        telefono,
        direccion: 'entrante',
        contenido: body.nota?.trim() || 'Pedido desde el catálogo',
        interpretacionJson: {
          accion: 'registrar_venta',
          productos: armados,
          clienteId: null,
          metodoPago: 'efectivo',
          origen: 'catalogo',
          ventaId: crypto.randomUUID(),
          pedidoPublico: true,
        },
      },
    });
    return { id: mensaje.id, estado: 'pendiente' };
  }

  private async tienda(slug: string) {
    const tienda = await this.prisma.tienda.findUnique({ where: { slug } });
    if (!tienda) throw new NotFoundException('Tienda no encontrada');
    return tienda;
  }
}
