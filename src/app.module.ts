import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getEnvFilePaths } from './config/env-files';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFilePaths(),
    }),
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
})
export class AppModule {}
