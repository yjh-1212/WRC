import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionGuard } from './auth/permission.guard';
import { AuthModule } from './auth/auth.module';
import { SystemModule } from './system/system.module';
import { PortalModule } from './portal/portal.module';
import { ArchivesModule } from './archives/archives.module';
import { AdmissionModule } from './admission/admission.module';
import { OperationsModule } from './operations/operations.module';
import { SafetyModule } from './safety/safety.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthController } from './common/health.controller';
import { DashboardModule } from './dashboard/dashboard.module';

function validateEnvironment(config: Record<string, unknown>) {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = String(config[key] ?? '');
    if (value.length < 32 || value.startsWith('replace-with-')) throw new Error(`${key} 必须配置为至少 32 位的非示例密钥`);
  }
  const port = Number(config.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是有效端口号');
  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'], validate: validateEnvironment }),
    JwtModule.register({ global: true }),
    PrismaModule,
    AuthModule,
    SystemModule,
    PortalModule,
    ArchivesModule,
    AdmissionModule,
    OperationsModule,
    SafetyModule,
    AnalyticsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
