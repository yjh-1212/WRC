import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PermitService } from './permit.service';
import { AdmissionMaterialsService } from './materials.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AdmissionService } from './admission.service';
import {
  AdmissionPageQueryDto, CreateAdmissionApplicationDto, CreateProcessDefinitionDto,
  HandleApprovalDto, IssueLicenseDto, LicensePageQueryDto, TaskPageQueryDto,
  UpdateAdmissionApplicationDto, UpdateProcessDefinitionDto,PermitActionDto,
} from './dto';

@ApiTags('准入与审批') @ApiBearerAuth() @Controller('admission')
export class AdmissionController {
  constructor(private admission: AdmissionService,private permits:PermitService,private materials:AdmissionMaterialsService) {}

  @Get('options') @RequirePermissions('admission:application:read')
  options(@CurrentUser() user: AuthUser) { return this.admission.options(user); }

  @Get('applications') @RequirePermissions('admission:application:read')
  applications(@CurrentUser() user: AuthUser, @Query() query: AdmissionPageQueryDto) { return this.admission.applications(user, query); }
  @Get('applications/:id') @RequirePermissions('admission:application:read')
  application(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.admission.application(user, id); }
  @Post('applications') @RequirePermissions('admission:application:write')
  createApplication(@CurrentUser() user: AuthUser, @Body() dto: CreateAdmissionApplicationDto) { return this.admission.createApplication(user, dto); }
  @Patch('applications/:id') @RequirePermissions('admission:application:write')
  updateApplication(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAdmissionApplicationDto) { return this.admission.updateApplication(user, id, dto); }
  @Post('applications/:id/submit') @RequirePermissions('admission:application:write')
  submitApplication(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.admission.submitApplication(user, id); }
  @Get('applications/:id/precheck') @RequirePermissions('admission:application:read')
  precheck(@CurrentUser() user:AuthUser,@Param('id') id:string){return this.admission.precheck(user,id);}
  @Post('applications/:id/withdraw') @RequirePermissions('admission:application:write')
  withdraw(@CurrentUser() user:AuthUser,@Param('id') id:string){return this.admission.withdraw(user,id);}
  @Post('applications/:id/reopen') @RequirePermissions('admission:approval:handle')
  reopen(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body() dto:HandleApprovalDto){return this.admission.reopen(user,id,dto.comment??'');}
  @Post('applications/:id/materials') @RequirePermissions('admission:application:write')
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:2*1024*1024,files:1,fields:1,fieldSize:256}}))
  uploadMaterial(@CurrentUser() user:AuthUser,@Param('id') id:string,@UploadedFile() file:any,@Body('category') category:string){return this.materials.upload(user,id,file,category);}
  @Delete('applications/:id/materials/:materialId') @RequirePermissions('admission:application:write')
  removeMaterial(@CurrentUser() user:AuthUser,@Param('id') id:string,@Param('materialId') materialId:string){return this.materials.remove(user,id,materialId);}
  @Get('applications/:id/materials/:materialId/download') @RequirePermissions('admission:application:read')
  async downloadMaterial(@CurrentUser() user:AuthUser,@Param('id') id:string,@Param('materialId') materialId:string,@Res() res:Response){const file=await this.materials.download(user,id,materialId);res.setHeader('Content-Type',file.mimeType);res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.send(file.buffer);}
  @Post('applications/:id/issue-license') @RequirePermissions('admission:license:issue')
  issueLicense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: IssueLicenseDto) { return this.admission.issueLicense(user, id, dto); }

  @Get('tasks') @RequirePermissions('admission:approval:read')
  tasks(@CurrentUser() user: AuthUser, @Query() query: TaskPageQueryDto) { return this.admission.tasks(user, query); }
  @Post('tasks/:id/handle') @RequirePermissions('admission:approval:handle')
  handle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: HandleApprovalDto) { return this.admission.handleTask(user, id, dto); }

  @Get('workflows') @RequirePermissions('admission:workflow:read')
  workflows() { return this.admission.workflows(); }
  @Post('workflows') @RequirePermissions('admission:workflow:write')
  createWorkflow(@CurrentUser() user: AuthUser, @Body() dto: CreateProcessDefinitionDto) { return this.admission.createWorkflow(user, dto); }
  @Patch('workflows/:id') @RequirePermissions('admission:workflow:write')
  updateWorkflow(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProcessDefinitionDto) { return this.admission.updateWorkflow(user, id, dto); }

  @Get('licenses') @RequirePermissions('admission:license:read')
  licenses(@CurrentUser() user: AuthUser, @Query() query: LicensePageQueryDto) { return this.admission.licenses(user, query); }
  @Get('licenses/options') @RequirePermissions('admission:license:read')
  licenseOptions(@CurrentUser() user:AuthUser){return this.permits.options(user);}
  @Get('licenses/:id') @RequirePermissions('admission:license:read')
  license(@CurrentUser() user:AuthUser,@Param('id') id:string){return this.permits.detail(user,id);}
  @Post('licenses/:id/action') @RequirePermissions('admission:license:issue')
  action(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body() dto:PermitActionDto){return this.permits.action(user,id,dto);}
}
