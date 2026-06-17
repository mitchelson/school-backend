import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApplicationLoggerService } from '../../infrastructure/observability/application-logger.service';

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly appLogger: ApplicationLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      const line = `${request.method} ${request.originalUrl} → ${status}`;
      const fields: Record<string, string | number | boolean> = {
        http_method: request.method,
        http_path: request.originalUrl,
        http_status: status,
        error_message:
          exception instanceof Error ? exception.message : String(exception),
      };
      if (exception instanceof Error && exception.stack) {
        fields.error_stack = exception.stack;
      }
      this.appLogger.logStructured('error', line, fields, HttpExceptionFilter.name);
    }

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Erro interno do servidor' };

    response.status(status).json({
      statusCode: status,
      ...(typeof message === 'string' ? { message } : message),
      timestamp: new Date().toISOString(),
    });
  }
}
