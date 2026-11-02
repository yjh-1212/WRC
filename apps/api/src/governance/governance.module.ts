import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { SafetyModule } from '../safety/safety.module';

@Module({ imports: [AuthModule,SafetyModule], controllers: [GovernanceController], providers: [GovernanceService] })
export class GovernanceModule {}
