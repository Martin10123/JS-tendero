import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MetodoPago, Prisma } from '@prisma/client';
import { CurrentUser, Roles } from './auth.guard';
import { AuthUser, antiguedad, guardarScore, pesos } from './lib';
import { PrismaService } from './prisma.service';

const METODOS = new Set(['efectivo', 'transferencia', 'fiado', 'mixto']);

@Controller('clientes')
export class ClientesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listar(@CurrentUser() user: AuthUser) {
    const clientes = await this.prisma.cliente.findMany({
      where: { tiendaId: user.tiendaId, activo: true },
      include: { fiados: { where: { estado: 'abierto' } } },
      orderBy: { nombre: 'asc' },
    });
    return clientes.map((cliente) => this.resumen(cliente));
  }

  @Post()
  async crear(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const nombre = String(body.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('El cliente necesita nombre');
    if (body.limiteCredito !== undefined && user.rol !== 'dueno') {
      throw new BadRequestException('Solo el dueño define el límite de crédito');
    }
    const cliente = await this.prisma.cliente.create({
      data: {
        tiendaId: user.tiendaId,
        nombre,
        telefono: body.telefono ? String(body.telefono).replace(/\D/g, '') : null,
        direccion: body.direccion ? String(body.direccion) : null,
        limiteCredito: body.limiteCredito === undefined ? 0 : pesos(body.limiteCredito, 'Límite'),
      },
      include: { fiados: true },
    });
    return this.resumen(cliente);
  }

  @Roles('dueno')
  @Patch(':id')
  async editar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const existe = await this.prisma.cliente.findFirst({ where: { id, tiendaId: user.tiendaId } });
    if (!existe) throw new BadRequestException('Cliente no encontrado');
    const cliente = await this.prisma.cliente.update({
      where: { id },
      data: {
        nombre: body.nombre ? String(body.nombre).trim() : undefined,
        telefono: body.telefono === undefined ? undefined : String(body.telefono).replace(/\D/g, ''),
        direccion: body.direccion === undefined ? undefined : String(body.direccion),
        limiteCredito:
          body.limiteCredito === undefined ? undefined : pesos(body.limiteCredito, 'Límite'),
        activo: body.activo === undefined ? undefined : Boolean(body.activo),
      },
      include: { fiados: { where: { estado: 'abierto' } } },
    });
    return this.resumen(cliente);
  }

  @Get(':id/fiados')
  async fiados(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, tiendaId: user.tiendaId } });
    if (!cliente) throw new BadRequestException('Cliente no encontrado');
    const [fiados, abonos, puntos] = await Promise.all([
      this.prisma.fiado.findMany({
        where: { clienteId: id, tiendaId: user.tiendaId },
        orderBy: { fecha: 'asc' },
        include: { venta: { include: { items: { include: { producto: true } } } } },
      }),
      this.prisma.abono.findMany({
        where: { clienteId: id, tiendaId: user.tiendaId },
        include: { aplicaciones: true },
        orderBy: { fecha: 'desc' },
      }),
      this.prisma.fidelizacionMovimiento.aggregate({
        where: { clienteId: id },
        _sum: { puntos: true },
      }),
    ]);
    return {
      cliente: this.resumen({ ...cliente, fiados: fiados.filter((f) => f.estado === 'abierto') }),
      puntos: puntos._sum.puntos ?? 0,
      fiados: fiados.map((fiado) => ({
        id: fiado.id,
        montoOriginal: fiado.montoOriginal,
        saldo: fiado.saldo,
        fecha: fiado.fecha,
        estado: fiado.estado,
        antiguedad: fiado.estado === 'abierto' ? antiguedad(fiado.fecha) : null,
        ventaId: fiado.ventaId,
      })),
      abonos,
    };
  }

  @Post(':id/abonos')
  async abonarRuta(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.abonar(user, { ...body, clienteId: id });
  }

  async abonar(user: AuthUser, body: Record<string, unknown>) {
    const clienteId = String(body.clienteId ?? '');
    const monto = pesos(body.monto, 'Monto');
    if (monto <= 0) throw new BadRequestException('El abono debe ser mayor que cero');
    const metodo = String(body.metodoPago ?? 'efectivo');
    if (!METODOS.has(metodo) || metodo === 'fiado') {
      throw new BadRequestException('El abono se paga en efectivo o transferencia');
    }
    if (body.id) {
      const previo = await this.prisma.abono.findFirst({
        where: { id: String(body.id), tiendaId: user.tiendaId },
        include: { aplicaciones: true },
      });
      if (previo) return previo;
    }
    try {
      const abono = await this.prisma.$transaction(async (tx) => {
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteId, tiendaId: user.tiendaId },
        });
        if (!cliente) throw new BadRequestException('Cliente no encontrado');
        const fiados = await tx.fiado.findMany({
          where: { clienteId, tiendaId: user.tiendaId, estado: 'abierto', saldo: { gt: 0 } },
          orderBy: { fecha: 'asc' },
        });
        const deuda = fiados.reduce((suma, fiado) => suma + fiado.saldo, 0);
        if (monto > deuda) throw new BadRequestException('El abono supera la deuda');
        const creado = await tx.abono.create({
          data: {
            id: body.id ? String(body.id) : undefined,
            tiendaId: user.tiendaId,
            clienteId,
            monto,
            metodoPago: metodo as MetodoPago,
            nota: body.nota ? String(body.nota) : null,
          },
        });
        let restante = monto;
        for (const fiado of fiados) {
          if (restante <= 0) break;
          const aplicado = Math.min(restante, fiado.saldo);
          const saldo = fiado.saldo - aplicado;
          await tx.abonoAplicacion.create({
            data: {
              tiendaId: user.tiendaId,
              abonoId: creado.id,
              fiadoId: fiado.id,
              montoAplicado: aplicado,
            },
          });
          await tx.fiado.update({
            where: { id: fiado.id },
            data: { saldo, estado: saldo === 0 ? 'saldado' : 'abierto' },
          });
          restante -= aplicado;
        }
        return creado.id;
      });
      await guardarScore(this.prisma, clienteId);
      return this.prisma.abono.findUnique({ where: { id: abono }, include: { aplicaciones: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && body.id) {
        return this.prisma.abono.findFirst({
          where: { id: String(body.id), tiendaId: user.tiendaId },
          include: { aplicaciones: true },
        });
      }
      throw error;
    }
  }

  private resumen(cliente: any) {
    const abiertos = (cliente.fiados ?? []) as { saldo: number; fecha: Date; estado: string }[];
    const saldo = abiertos.reduce((suma, fiado) => suma + fiado.saldo, 0);
    const peor = abiertos
      .filter((fiado) => fiado.saldo > 0)
      .map((fiado) => antiguedad(fiado.fecha))
      .sort()
      .at(-1);
    return {
      id: cliente.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      limiteCredito: cliente.limiteCredito,
      score: cliente.score,
      saldo,
      antiguedad: peor ?? null,
    };
  }
}
