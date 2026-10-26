import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController, AuthService } from './auth.service';
import { JwtAuthGuard, JwtStrategy, RolesGuard } from './auth.guard';
import { CajaController } from './caja.controller';
import { ClientesController } from './clientes.controller';
import { ComprasController } from './compras.controller';
import { CrecimientoController } from './crecimiento.controller';
import { DashboardController } from './dashboard.controller';
import { JobsController, JobsService } from './jobs.service';
import { PrismaService } from './prisma.service';
import { ProductosController } from './productos.controller';
import { PublicoController } from './publico.controller';
import { SyncController } from './sync.controller';
import { TiendaEvents } from './tienda.events';
import { VentasController } from './ventas.controller';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-mostrador-cambia-esto',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [
    AuthController,
    ProductosController,
    VentasController,
    ClientesController,
    SyncController,
    DashboardController,
    CajaController,
    ComprasController,
    PublicoController,
    WhatsappController,
    CrecimientoController,
    JobsController,
  ],
  providers: [
    PrismaService,
    TiendaEvents,
    JwtStrategy,
    AuthService,
    VentasController,
    ClientesController,
    ComprasController,
    WhatsappController,
    JobsService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
