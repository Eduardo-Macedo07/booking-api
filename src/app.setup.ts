import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import type { Env } from './config/env.js';

/**
 * Configuração compartilhada entre a aplicação real (main.ts) e os testes e2e,
 * para que os testes exercitem exatamente o mesmo pipeline.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos desconhecidos
      forbidNonWhitelisted: true, // e recusa a requisição que os envia
      transform: true, // converte tipos (query string -> number/Date)
    }),
  );
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Booking API')
        .setDescription('API REST de reservas e agendamento de recursos.')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
}
