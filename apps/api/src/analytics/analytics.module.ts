import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ProvinceAnalysisController } from './province-analysis.controller';
import { ProvinceAnalysisService } from './province-analysis.service';
import { SafetyModule } from '../safety/safety.module';
import { CityAnalyticsController } from './city-analytics.controller';
import { CityAnalysisService } from './city-analysis.service';
import { CityEvaluationService } from './city-evaluation.service';
import { CityCreditService } from './city-credit.service';

@Module({ imports: [AuthModule,SafetyModule], controllers: [AnalyticsController, ProvinceAnalysisController,CityAnalyticsController], providers: [AnalyticsService, ProvinceAnalysisService,CityAnalysisService,CityEvaluationService,CityCreditService], exports: [ProvinceAnalysisService] })
export class AnalyticsModule {}
