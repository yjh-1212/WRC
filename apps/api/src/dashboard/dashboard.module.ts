import { Module } from '@nestjs/common';
import { CockpitService } from './cockpit.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ controllers: [DashboardController], providers: [DashboardService, CockpitService] })
export class DashboardModule {}
