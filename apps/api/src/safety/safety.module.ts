import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { FenceService } from './fence.service';
import { SafetyWorkspaceController } from './workspace.controller';
import { SafetyMaterialsService } from './workspace-materials.service';
import { EventWorkspaceService } from './event-workspace.service';
import { TaskWorkspaceService } from './task-workspace.service';
import { InspectionWorkspaceService } from './inspection-workspace.service';

@Module({ imports: [AuthModule], controllers: [SafetyController,SafetyWorkspaceController], providers: [SafetyService,FenceService,SafetyMaterialsService,EventWorkspaceService,TaskWorkspaceService,InspectionWorkspaceService], exports: [SafetyService,InspectionWorkspaceService,SafetyMaterialsService] })
export class SafetyModule {}
