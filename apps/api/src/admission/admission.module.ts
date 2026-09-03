import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdmissionController } from './admission.controller';
import { AdmissionService } from './admission.service';

@Module({ imports: [AuthModule], controllers: [AdmissionController], providers: [AdmissionService] })
export class AdmissionModule {}
