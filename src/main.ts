import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { BetterStackNestLogger } from './infrastructure/observability/better-stack-nest.logger';
import { createApplicationLogger } from './infrastructure/observability/create-application-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const logger = createApplicationLogger(config);
  app.useLogger(logger);

  const flushBetterStack = () => {
    if (logger instanceof BetterStackNestLogger) {
      void logger.flush().catch(() => undefined);
    }
  };
  process.once('SIGTERM', flushBetterStack);
  process.once('SIGINT', flushBetterStack);

  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1');

  const allowedOrigins = expandCorsOrigins(
    process.env.CORS_ORIGIN || 'http://localhost:3000',
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      logger.warn(`CORS bloqueou origem: ${origin}`, 'CORS');
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      if (logger instanceof BetterStackNestLogger) {
        logger.logHttp(req.method, req.originalUrl, res.statusCode, durationMs);
        return;
      }
      logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`,
        'HTTP',
      );
    });
    next();
  });

  const port = Number(config.get<string>('PORT')) || 3002;
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const apiPrefix = process.env.API_PREFIX || 'api/v1';
  await app.listen(port);
  logger.log(`School API [${nodeEnv}] http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
  logger.log(`CORS: ${[...allowedOrigins].join(', ')}`, 'Bootstrap');
  if (nodeEnv === 'development' && config.get<string>('MP_DEV_SIMULATE') === 'true') {
    logger.log('MP_DEV_SIMULATE=true — pagamentos Pix simulados', 'Bootstrap');
  }
}

/** Inclui par www / sem www para cada origem HTTPS configurada. */
function expandCorsOrigins(raw: string): Set<string> {
  const set = new Set<string>();
  for (const entry of raw.split(',')) {
    const origin = entry.trim();
    if (!origin) continue;
    set.add(origin);
    try {
      const url = new URL(origin);
      if (url.hostname.startsWith('www.')) {
        set.add(`${url.protocol}//${url.hostname.slice(4)}`);
      } else {
        set.add(`${url.protocol}//www.${url.hostname}`);
      }
    } catch {
      // origem inválida — mantém só o valor literal
    }
  }
  return set;
}

bootstrap();
