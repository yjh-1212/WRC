import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OversightController } from './oversight.controller';
import { OversightService } from './oversight.service';
import { ProvinceMonitoringController } from './province-monitoring.controller';
import { ProvinceMonitoringService } from './province-monitoring.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { WorkbenchService } from './workbench.service';
import { WorkbenchController } from './workbench.controller';

@Module({ imports: [AuthModule, AnalyticsModule], controllers: [OversightController, ProvinceMonitoringController, WorkbenchController], providers: [OversightService, ProvinceMonitoringService, WorkbenchService] })
export class OversightModule {}
