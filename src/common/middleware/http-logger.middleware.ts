import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ApplicationLoggerService } from '../../infrastructure/observability/application-logger.service';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(private readonly appLogger: ApplicationLoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const start = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const statusCode = res.statusCode;
      const line = `${method} ${originalUrl} ${statusCode} ${durationMs}ms - ${ip}`;

      this.appLogger.logStructured(
        'info',
        line,
        {
          http_method: method,
          http_path: originalUrl,
          http_status: statusCode,
          duration_ms: durationMs,
          client_ip: ip ?? 'unknown',
        },
        'HTTP',
      );
    });

    next();
  }
}
