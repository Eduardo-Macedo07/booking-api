import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AuthController } from './auth/auth.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { type Env, validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ResourcesModule } from './resources/resources.module.js';

/** Rotas de credenciais sujeitas ao limite extra (não inclui /auth/me nem /auth/logout). */
const AUTH_RATE_LIMITED_HANDLERS = new Set(['register', 'login', 'refresh']);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isProd = config.get('NODE_ENV', { infer: true }) === 'production';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            // Cada requisição ganha um id (ou reaproveita o X-Request-Id do proxy) que aparece em todos os logs dela.
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
            autoLogging: {
              ignore: (req) => req.url === '/metrics' || req.url?.startsWith('/health') === true,
            },
            transport: isProd ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
          },
        };
      },
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const ttl = config.get('THROTTLE_TTL_MS', { infer: true });
        return {
          errorMessage: 'Too many requests, please try again later',
          throttlers: [
            { name: 'default', ttl, limit: config.get('THROTTLE_LIMIT', { infer: true }) },
            {
              // Limite extra, só para login/cadastro/refresh: dificulta força bruta de senhas.
              name: 'auth',
              ttl,
              limit: config.get('AUTH_THROTTLE_LIMIT', { infer: true }),
              skipIf: (context) =>
                context.getClass() !== AuthController ||
                !AUTH_RATE_LIMITED_HANDLERS.has(context.getHandler().name),
            },
          ],
        };
      },
    }),

    PrismaModule,
    MetricsModule,
    HealthModule,
    AuthModule,
    ResourcesModule,
    BookingsModule,
  ],
  providers: [
    // A ordem importa: limita primeiro (barato), depois autentica, depois autoriza.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
