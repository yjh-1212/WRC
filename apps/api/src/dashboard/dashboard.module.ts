import { Module } from '@nestjs/common';
import { CockpitService } from './cockpit.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ThreeLevelCockpitService } from './three-level-cockpit.service';
import { ProvinceCockpitService } from './province-cockpit.service';
import { ProvinceAppearanceService } from './province-appearance.service';
import { ProvinceMapService } from './province-map.service';
import { AuthModule } from '../auth/auth.module';
import { RegulatoryWorkbenchService } from './regulatory-workbench.service';

@Module({ imports: [AuthModule], controllers: [DashboardController], providers: [DashboardService, CockpitService, ThreeLevelCockpitService, ProvinceCockpitService, ProvinceAppearanceService, ProvinceMapService, RegulatoryWorkbenchService] })
export class DashboardModule {}
