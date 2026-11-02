import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import {
  CreateBusinessRuleDto, CreateInspectionDto, CreateInterfaceConfigDto,
  CreditEntryDto, CreditRepairDto, GovernanceQueryDto, InspectionActionDto,
  UpdateInterfaceConfigDto,
  CreateSafetyOperatorDto, UpdateSafetyOperatorDto, ReviewSafetyOperatorDto, SafetyOperatorQueryDto,
} from './dto';
import { GovernanceService } from './governance.service';
import { InspectionWorkspaceService } from '../safety/inspection-workspace.service';
import { InspectionResultDto, WorkspaceInspectionDto } from '../safety/workspace.dto';

@ApiTags('治理能力') @ApiBearerAuth() @Controller('governance')
export class GovernanceController {
  constructor(private governance: GovernanceService,private inspectionsWorkspace:InspectionWorkspaceService) {}

  @Get('options') @RequirePermissions('archive:vehicle:read')
  options(@CurrentUser() user: AuthUser) { return this.governance.options(user); }

  @Get('operators/options') @RequirePermissions('archive:qualification:read')
  operatorOptions(@CurrentUser() user: AuthUser) { return this.governance.operatorOptions(user); }
  @Get('operators') @RequirePermissions('archive:qualification:read')
  operators(@CurrentUser() user: AuthUser, @Query() query: SafetyOperatorQueryDto) { return this.governance.operators(user, query); }
  @Get('operators/:id') @RequirePermissions('archive:qualification:read')
  operator(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.governance.operator(user, id); }
  @Post('operators') @RequirePermissions('archive:qualification:write')
  createOperator(@CurrentUser() user: AuthUser, @Body() dto: CreateSafetyOperatorDto) { return this.governance.createOperator(user, dto); }
  @Patch('operators/:id') @RequirePermissions('archive:qualification:write')
  updateOperator(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSafetyOperatorDto) { return this.governance.updateOperator(user, id, dto); }
  @Post('operators/:id/review') @RequirePermissions('archive:qualification:write')
  reviewOperator(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewSafetyOperatorDto) { return this.governance.reviewOperator(user, id, dto); }

  @Get('interfaces') @RequirePermissions('operation:telemetry:write')
  interfaces(@CurrentUser() user: AuthUser, @Query() query: GovernanceQueryDto) { return this.governance.interfaces(user, query); }
  @Post('interfaces') @RequirePermissions('operation:telemetry:write')
  createInterface(@CurrentUser() user: AuthUser, @Body() dto: CreateInterfaceConfigDto) { return this.governance.createInterface(user, dto); }
  @Patch('interfaces/:id') @RequirePermissions('operation:telemetry:write')
  updateInterface(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateInterfaceConfigDto) { return this.governance.updateInterface(user, id, dto); }
  @Post('interfaces/:id/test') @RequirePermissions('operation:telemetry:write')
  testInterface(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.governance.testInterface(user, id); }

  @Get('inspections') @RequirePermissions('safety:violation:read')
  inspections(@CurrentUser() user: AuthUser, @Query() query: GovernanceQueryDto) { return this.inspectionsWorkspace.list(user, query); }
  @Get('inspections/:id') @RequirePermissions('safety:violation:read')
  inspection(@CurrentUser() user:AuthUser,@Param('id') id:string){return this.inspectionsWorkspace.detail(user,id);}
  @Post('inspections') @RequirePermissions('safety:violation:write')
  createInspection(@CurrentUser() user: AuthUser, @Body() dto: WorkspaceInspectionDto) { return this.inspectionsWorkspace.create(user, dto); }
  @Post('inspections/:id/result') @RequirePermissions('safety:violation:write')
  inspectionResult(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body() dto:InspectionResultDto){return this.inspectionsWorkspace.result(user,id,dto);}
  @Post('inspections/:id/actions') @RequirePermissions('safety:violation:read')
  actInspection(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: InspectionActionDto) { return this.inspectionsWorkspace.legacyAction(user, id, dto); }

  @Get('rules') @RequirePermissions('admission:workflow:read')
  rules(@CurrentUser() user: AuthUser, @Query() query: GovernanceQueryDto) { return this.governance.rules(user, query); }
  @Post('rules') @RequirePermissions('admission:workflow:write')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateBusinessRuleDto) { return this.governance.createRule(user, dto); }
  @Post('rules/:id/publish') @RequirePermissions('admission:workflow:write')
  publishRule(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.governance.publishRule(user, id); }

  @Get('credit-accounts') @RequirePermissions('analytics:evaluation:read')
  creditAccounts(@CurrentUser() user: AuthUser, @Query() query: GovernanceQueryDto) { return this.governance.creditAccounts(user, query); }
  @Post('credit-accounts/:id/entries') @RequirePermissions('analytics:evaluation:publish')
  addCreditEntry(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreditEntryDto) { return this.governance.addCreditEntry(user, id, dto); }
  @Post('credit-entries/:id/repair') @RequirePermissions('analytics:evaluation:publish')
  repairCredit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreditRepairDto) { return this.governance.repairCredit(user, id, dto); }
}
