import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { CurrentUser, Public } from './auth.guard';
import { AuthUser } from './lib';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(telefono: string, clave: string) {
    const limpio = String(telefono ?? '').replace(/\D/g, '');
    if (!limpio || !clave) throw new BadRequestException('Teléfono y clave son obligatorios');
    const usuario = await this.prisma.usuario.findFirst({
      where: { telefono: limpio, activo: true },
      include: { tienda: true },
    });
    const vale = usuario ? await bcrypt.compare(clave, usuario.claveHash) : false;
    if (!usuario || !vale) {
      throw new UnauthorizedException('Teléfono o clave incorrectos');
    }
    const payload: AuthUser = {
      sub: usuario.id,
      tiendaId: usuario.tiendaId,
      rol: usuario.rol,
      nombre: usuario.nombre,
    };
    return {
      token: await this.jwt.signAsync(payload),
      usuario: {
        ...payload,
        id: usuario.id,
        telefono: usuario.telefono,
        tiendaNombre: usuario.tienda.nombre,
        slug: usuario.tienda.slug,
      },
    };
  }

  async yo(user: AuthUser) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      include: { tienda: true },
    });
    if (!usuario || !usuario.activo) throw new UnauthorizedException('Inicia sesión');
    return {
      id: usuario.id,
      sub: usuario.id,
      nombre: usuario.nombre,
      telefono: usuario.telefono,
      rol: usuario.rol,
      tiendaId: usuario.tiendaId,
      tiendaNombre: usuario.tienda.nombre,
      slug: usuario.tienda.slug,
      telefonoWhatsapp: usuario.tienda.telefonoWhatsapp,
    };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: { telefono?: string; clave?: string }) {
    return this.auth.login(body.telefono ?? '', body.clave ?? '');
  }

  @Get('yo')
  yo(@CurrentUser() user: AuthUser) {
    return this.auth.yo(user);
  }
}
