import { Controller, Injectable, OnModuleDestroy, OnModuleInit, Post } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Roles } from './auth.guard';
import { WhatsappController } from './whatsapp.controller';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private ultimoCobro = '';
  private ultimoResumen = '';

  constructor(private readonly whatsapp: WhatsappController) {}

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (url && (await this.redisVivo(url))) {
      const connection = { url, maxRetriesPerRequest: null as null };
      this.queue = new Queue('mostrador', { connection });
      this.worker = new Worker(
        'mostrador',
        async (job) => {
          if (job.name === 'cobros') return this.whatsapp.enviarCobros();
          if (job.name === 'resumen') return this.whatsapp.resumenDiario();
        },
        { connection },
      );
      this.worker.on('error', (error) => console.warn('Worker', error.message));
      this.queue.on('error', (error) => console.warn('Cola', error.message));
      await this.queue.add('cobros', {}, { repeat: { pattern: '0 9 * * 1-6', tz: 'America/Bogota' }, jobId: 'cobros' });
      await this.queue.add('resumen', {}, { repeat: { pattern: '0 21 * * *', tz: 'America/Bogota' }, jobId: 'resumen' });
      return;
    }
    this.timer = setInterval(() => this.relojLocal(), 60 * 60 * 1000);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }

  private async redisVivo(url: string) {
    const redis = new IORedis(url, { maxRetriesPerRequest: 1, connectTimeout: 1500, lazyConnect: true });
    try {
      await redis.connect();
      const pong = await redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    } finally {
      redis.disconnect();
    }
  }

  private relojLocal() {
    const ahora = new Date();
    const hora = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(ahora);
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);
    const dia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short' }).format(ahora);
    if (hora === '9' && dia !== 'Sun' && this.ultimoCobro !== fecha) {
      this.ultimoCobro = fecha;
      void this.whatsapp.enviarCobros();
    }
    if (hora === '21' && this.ultimoResumen !== fecha) {
      this.ultimoResumen = fecha;
      void this.whatsapp.resumenDiario();
    }
  }
}

@Controller('jobs')
@Roles('dueno')
export class JobsController {
  constructor(private readonly whatsapp: WhatsappController) {}

  @Post('cobros')
  cobros() {
    return this.whatsapp.enviarCobros();
  }

  @Post('resumen')
  resumen() {
    return this.whatsapp.resumenDiario();
  }
}
