import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdmissionController } from './admission.controller';
import { AdmissionService } from './admission.service';
import { PermitService } from './permit.service';
import { AdmissionMaterialsService } from './materials.service';

@Module({ imports: [AuthModule], controllers: [AdmissionController], providers: [AdmissionService,PermitService,AdmissionMaterialsService] })
export class AdmissionModule {}
