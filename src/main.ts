import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Atrás de proxy reverso (Render, Nginx...), é preciso confiar nele para enxergar o IP real do cliente
  // (o rate limit conta por IP).
  if (config.get('TRUST_PROXY', { infer: true })) app.set('trust proxy', 1);

  configureApp(app);
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

await bootstrap();
