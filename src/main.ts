import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1');

  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
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
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
      );
    });
    next();
  });

  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT')) || 3002;
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  await app.listen(port);
  console.log(
    `🚀 School API [${nodeEnv}] http://localhost:${port}/${process.env.API_PREFIX || 'api/v1'}`,
  );
  if (nodeEnv === 'development' && config.get<string>('MP_DEV_SIMULATE') === 'true') {
    console.log('   MP_DEV_SIMULATE=true — pagamentos Pix simulados');
  }
}
bootstrap();
