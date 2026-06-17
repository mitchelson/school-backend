import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetterStackNestLogger } from './better-stack-nest.logger';
import { createApplicationLogger } from './create-application-logger';

type StructuredLevel = 'info' | 'warn' | 'error' | 'debug';

@Injectable()
export class ApplicationLoggerService {
  private readonly logger: LoggerService;

  constructor(config: ConfigService) {
    this.logger = createApplicationLogger(config);
  }

  get nestLogger(): LoggerService {
    return this.logger;
  }

  logStructured(
    level: StructuredLevel,
    message: string,
    fields: Record<string, string | number | boolean>,
    context?: string,
  ): void {
    if (this.logger instanceof BetterStackNestLogger) {
      this.logger.logStructured(level, message, fields, context);
      return;
    }

    const line = JSON.stringify({ message, ...fields });
    if (level === 'error') this.logger.error(line, context);
    else if (level === 'warn') this.logger.warn(line, context);
    else if (level === 'debug') this.logger.debug?.(line, context);
    else this.logger.log(line, context);
  }

  flush(): Promise<void> {
    if (this.logger instanceof BetterStackNestLogger) {
      return this.logger.flush();
    }
    return Promise.resolve();
  }
}
