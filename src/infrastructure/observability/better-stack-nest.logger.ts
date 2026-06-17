import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import { Logtail } from '@logtail/node';

function formatMessage(message: unknown): string {
  if (message instanceof Error) return message.message;
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function normalizeLogsEndpoint(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export type BetterStackLoggerOptions = {
  sourceToken: string;
  logsEndpoint?: string;
  service?: string;
  environment?: string;
};

export class BetterStackNestLogger implements LoggerService {
  private readonly consoleLogger: ConsoleLogger;
  private readonly logtail?: Logtail;
  private readonly service: string;
  private readonly environment: string;

  constructor(options?: BetterStackLoggerOptions) {
    this.service = options?.service ?? 'school-api';
    this.environment = options?.environment ?? process.env.NODE_ENV ?? 'development';
    this.consoleLogger = new ConsoleLogger({ timestamp: true });

    if (!options?.sourceToken) return;

    const endpoint = normalizeLogsEndpoint(options.logsEndpoint);
    this.logtail = new Logtail(options.sourceToken, {
      ...(endpoint ? { endpoint } : {}),
      sendLogsToConsoleOutput: false,
    });
  }

  flush(): Promise<void> {
    return this.logtail?.flush() ?? Promise.resolve();
  }

  private meta(
    context?: string,
    extra?: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> {
    return {
      service: this.service,
      environment: this.environment,
      ...(context ? { nest_context: context } : {}),
      ...extra,
    };
  }

  logStructured(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    fields: Record<string, string | number | boolean>,
    context?: string,
  ): void {
    const payload = { message, ...fields };
    const line = JSON.stringify(payload);

    if (level === 'error') this.consoleLogger.error(line, context);
    else if (level === 'warn') this.consoleLogger.warn(line, context);
    else if (level === 'debug') this.consoleLogger.debug?.(line, context);
    else this.consoleLogger.log(line, context);

    if (!this.logtail) return;

    const meta = this.meta(context, fields);
    if (level === 'error') void this.logtail.error(message, meta);
    else if (level === 'warn') void this.logtail.warn(message, meta);
    else if (level === 'debug') void this.logtail.debug(message, meta);
    else void this.logtail.info(message, meta);
  }

  log(message: unknown, context?: string): void {
    this.consoleLogger.log(message, context);
    void this.logtail?.info(formatMessage(message), this.meta(context));
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.consoleLogger.error(message, stack, context);
    const payload = message instanceof Error ? message : formatMessage(message);
    void this.logtail?.error(payload, {
      ...this.meta(context),
      ...(stack ? { stack } : {}),
    });
  }

  warn(message: unknown, context?: string): void {
    this.consoleLogger.warn(message, context);
    void this.logtail?.warn(formatMessage(message), this.meta(context));
  }

  debug(message: unknown, context?: string): void {
    this.consoleLogger.debug?.(message, context);
    void this.logtail?.debug(formatMessage(message), this.meta(context));
  }

  verbose(message: unknown, context?: string): void {
    this.consoleLogger.verbose?.(message, context);
    void this.logtail?.debug(formatMessage(message), this.meta(context));
  }

  fatal(message: unknown, context?: string): void {
    this.consoleLogger.fatal?.(message, context);
    void this.logtail?.error(formatMessage(message), {
      ...this.meta(context),
      severity: 'fatal',
    });
  }
}
