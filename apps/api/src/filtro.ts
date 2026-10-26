import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class FiltroErrores implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const respuesta = host.switchToHttp().getResponse();
    const estado = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const cuerpo = exception instanceof HttpException ? exception.getResponse() : null;
    const mensaje =
      typeof cuerpo === 'string'
        ? cuerpo
        : ((cuerpo as { message?: string | string[] } | null)?.message ?? 'Error interno');
    if (estado >= 500) console.error(exception);
    respuesta.status(estado).json({
      message: Array.isArray(mensaje) ? mensaje.join(', ') : mensaje,
    });
  }
}
