import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { getEnvFilePaths } from './config/env-files';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { FirebaseModule } from './infrastructure/firebase/firebase.module';
import { AuthModule } from './modules/auth/auth.module';
import { StudentsModule } from './modules/students/students.module';
import { PlansModule } from './modules/plans/plans.module';
import { CreditsModule } from './modules/credits/credits.module';
import { ClassesModule } from './modules/classes/classes.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { GatewaysModule } from './infrastructure/gateways/gateways.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { PlatformModule } from './modules/platform/platform.module';
import { OwnerModule } from './modules/owner/owner.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { EmailModule } from './infrastructure/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFilePaths(),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isTest = config.get<string>('NODE_ENV') === 'test';
        const defaultLimit = Number(config.get<string>('THROTTLE_LIMIT')) || (isTest ? 10_000 : 120);
        const authLimit = Number(config.get<string>('THROTTLE_AUTH_LIMIT')) || (isTest ? 10_000 : 20);
        return [
          { name: 'default', ttl: 60_000, limit: defaultLimit },
          { name: 'auth', ttl: 60_000, limit: authLimit },
        ];
      },
    }),
    EmailModule,
    PrismaModule,
    FirebaseModule,
    GatewaysModule,
    MarketplaceModule,
    PlatformModule,
    OwnerModule,
    NotificationsModule,
    AuthModule,
    StudentsModule,
    PlansModule,
    CreditsModule,
    ClassesModule,
    EnrollmentsModule,
    AttendanceModule,
    PaymentsModule,
    DashboardModule,
    HealthModule,
    SubscriptionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
