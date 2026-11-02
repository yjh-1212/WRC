import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SafetyModule } from '../safety/safety.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { MonitoringService } from './monitoring.service';

@Module({ imports: [AuthModule, SafetyModule], controllers: [OperationsController], providers: [OperationsService, MonitoringService] })
export class OperationsModule {}
