import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AdmissionService } from './admission.service';
import {
  AdmissionPageQueryDto, CreateAdmissionApplicationDto, CreateProcessDefinitionDto,
  HandleApprovalDto, IssueLicenseDto, LicensePageQueryDto, TaskPageQueryDto,
  UpdateAdmissionApplicationDto, UpdateProcessDefinitionDto,
} from './dto';

@ApiTags('准入与审批') @ApiBearerAuth() @Controller('admission')
export class AdmissionController {
  constructor(private admission: AdmissionService) {}

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
}
