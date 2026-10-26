import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from './auth.guard';
import { AuthUser } from './lib';
import { ClientesController } from './clientes.controller';
import { VentasController } from './ventas.controller';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly ventas: VentasController,
    private readonly clientes: ClientesController,
  ) {}

  @Post()
  async sincronizar(
    @CurrentUser() user: AuthUser,
    @Body() body: { operaciones?: { tipo: string; id: string; payload: Record<string, unknown> }[] },
  ) {
    const operaciones = body.operaciones ?? [];
    if (operaciones.length > 500) throw new BadRequestException('El lote supera 500 operaciones');
    const resultados: { id: string; ok: boolean; error?: string }[] = [];
    for (const operacion of operaciones) {
      try {
        if (operacion.tipo === 'venta') {
          await this.ventas.registrar(user, { ...operacion.payload, id: operacion.id });
        } else if (operacion.tipo === 'abono') {
          await this.clientes.abonar(user, { ...operacion.payload, id: operacion.id });
        } else {
          throw new BadRequestException('Operación no reconocida');
        }
        resultados.push({ id: operacion.id, ok: true });
      } catch (error) {
        resultados.push({
          id: operacion.id,
          ok: false,
          error: error instanceof Error ? error.message : 'No se pudo sincronizar',
        });
      }
    }
    return { resultados };
  }
}
