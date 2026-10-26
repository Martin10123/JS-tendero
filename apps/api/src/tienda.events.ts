import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

@Injectable()
export class TiendaEvents {
  private readonly eventos = new EventEmitter();

  emitir(tiendaId: string) {
    this.eventos.emit('stock', tiendaId);
  }

  escuchar(oyente: (tiendaId: string) => void) {
    this.eventos.on('stock', oyente);
    return () => this.eventos.off('stock', oyente);
  }
}
