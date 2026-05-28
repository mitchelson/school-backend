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
};

export class BetterStackNestLogger implements LoggerService {
  private readonly consoleLogger: ConsoleLogger;
  private readonly logtail?: Logtail;
  private readonly service: string;

  constructor(options?: BetterStackLoggerOptions) {
    this.service = options?.service ?? 'school-api';
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

  private meta(context?: string): Record<string, string> {
    return {
      service: this.service,
      ...(context ? { nest_context: context } : {}),
    };
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

  logHttp(
    method: string,
    url: string,
    status: number,
    durationMs: number,
  ): void {
    const msg = `${method} ${url} ${status} ${durationMs}ms`;
    this.consoleLogger.log(msg, 'HTTP');
    void this.logtail?.info(msg, {
      ...this.meta('HTTP'),
      http_method: method,
      http_url: url,
      http_status: String(status),
      duration_ms: String(durationMs),
    });
  }
}
