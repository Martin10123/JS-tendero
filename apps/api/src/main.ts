import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { FiltroErrores } from './filtro';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true });
  app.useGlobalFilters(new FiltroErrores());
  await app.listen(process.env.PORT || 3000);
}

void bootstrap();
