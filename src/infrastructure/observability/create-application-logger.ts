import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BetterStackNestLogger } from './better-stack-nest.logger';

export function createApplicationLogger(config: ConfigService): LoggerService {
  const token = config.get<string>('BETTER_STACK_SOURCE_TOKEN')?.trim();
  const logsEndpoint = config.get<string>('BETTER_STACK_LOGS_ENDPOINT')?.trim();
  const service =
    config.get<string>('BETTER_STACK_SERVICE_NAME')?.trim() ?? 'school-api';

  if (!token) {
    return new ConsoleLogger({ timestamp: true });
  }

  return new BetterStackNestLogger({
    sourceToken: token,
    service,
    environment: config.get<string>('NODE_ENV') ?? 'development',
    ...(logsEndpoint ? { logsEndpoint } : {}),
  });
}
