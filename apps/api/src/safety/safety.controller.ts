import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AccidentActionDto, AlertActionDto, CreateAccidentDto, CreateAlertDto, CreateEmergencyTaskDto, CreateFenceDto, CreateViolationDto, EmergencyActionDto, FenceStatusDto, OfflineActionDto, SafetyQueryDto, SubmitAccidentVideosDto, UpdateFenceDto, ViolationActionDto } from './dto';
import { SafetyService } from './safety.service';
import { FenceService } from './fence.service';
import { TaskWorkspaceService } from './task-workspace.service';
import { EventWorkspaceService } from './event-workspace.service';

@ApiTags('安全监管') @ApiBearerAuth() @Controller('safety')
export class SafetyController {
  constructor(private safety: SafetyService,private fenceService:FenceService,private taskWorkspace:TaskWorkspaceService,private eventWorkspace:EventWorkspaceService) {}

  @Get('options') @RequirePermissions('safety:alert:read')
  options(@CurrentUser() user: AuthUser) { return this.safety.options(user); }

  @Get('alerts') @RequirePermissions('safety:alert:read')
  alerts(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.alerts(user, query); }
  @Get('alerts/:id') @RequirePermissions('safety:alert:read')
  alert(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.alert(user, id); }
  @Post('alerts') @RequirePermissions('safety:alert:write')
  createAlert(@CurrentUser() user: AuthUser, @Body() dto: CreateAlertDto) { return this.safety.createAlert(user, dto); }
  @Post('alerts/:id/actions') @RequirePermissions('safety:alert:handle')
  async actAlert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AlertActionDto) { if(dto.action==='CLOSE')await this.eventWorkspace.readyToClose(user,'ALERT',id);return this.safety.actAlert(user, id, dto); }

  @Get('fences') @RequirePermissions('safety:fence:read')
  fences(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.fenceService.list(user, query); }
  @Get('fences/options') @RequirePermissions('safety:fence:read')
  fenceOptions(@CurrentUser() user:AuthUser){return this.fenceService.options(user)}
  @Get('fences/:id') @RequirePermissions('safety:fence:read')
  fence(@CurrentUser() user:AuthUser,@Param('id') id:string){return this.fenceService.detail(user,id)}
  @Get('fences/:id/triggers') @RequirePermissions('safety:fence:read')
  triggers(@CurrentUser() user:AuthUser,@Param('id') id:string,@Query() query:SafetyQueryDto){return this.fenceService.triggers(user,id,query)}
  @Post('fences') @RequirePermissions('safety:fence:write')
  createFence(@CurrentUser() user: AuthUser, @Body() dto: CreateFenceDto) { return this.fenceService.save(user, dto); }
  @Patch('fences/:id') @RequirePermissions('safety:fence:write')
  updateFence(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateFenceDto) { return this.fenceService.save(user, dto,id); }
  @Patch('fences/:id/status') @RequirePermissions('safety:fence:write')
  setFenceStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FenceStatusDto) { return this.fenceService.status(user, id, dto.active); }
  @Delete('fences/:id') @RequirePermissions('safety:fence:write')
  deleteFence(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.fenceService.remove(user, id); }

  @Get('accidents') @RequirePermissions('safety:accident:read')
  accidents(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.accidents(user, query); }
  @Get('accidents/:id') @RequirePermissions('safety:accident:read')
  accident(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.accident(user, id); }
  @Post('accidents') @RequirePermissions('safety:accident:report')
  createAccident(@CurrentUser() user: AuthUser, @Body() dto: CreateAccidentDto) { return this.safety.createAccident(user, dto); }
  @Post('accidents/:id/actions') @RequirePermissions('safety:accident:handle')
  async actAccident(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AccidentActionDto) { if(dto.action==='DETERMINE')throw new BadRequestException('请通过登记认定结果提交认定机关、文书编号和认定材料');if(['CLOSE','ARCHIVE'].includes(dto.action))await this.eventWorkspace.readyToClose(user,'ACCIDENT',id);return this.safety.actAccident(user, id, dto); }
  @Post('accidents/:id/videos') @RequirePermissions('safety:accident:report')
  submitVideos(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitAccidentVideosDto) { return this.safety.submitAccidentVideos(user, id, dto); }

  @Get('violations') @RequirePermissions('safety:violation:read')
  violations(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.violations(user, query); }
  @Get('violations/:id') @RequirePermissions('safety:violation:read')
  violation(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.violation(user, id); }
  @Post('violations') @RequirePermissions('safety:violation:write')
  createViolation(@CurrentUser() user: AuthUser, @Body() dto: CreateViolationDto) { return this.safety.createViolation(user, dto); }
  @Post('violations/:id/actions') @RequirePermissions('safety:violation:review')
  async actViolation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ViolationActionDto) { if(dto.action!=='CONFIRM')await this.eventWorkspace.legacyViolationAction(user,id);return this.safety.actViolation(user, id, dto); }

  @Get('offline-events') @RequirePermissions('safety:offline:read')
  offlineEvents(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.offlineEvents(user, query); }
  @Post('offline-events/scan') @RequirePermissions('safety:offline:handle')
  scanOffline(@CurrentUser() user: AuthUser) { return this.safety.scanOffline(user); }
  @Post('offline-events/:id/actions') @RequirePermissions('safety:offline:handle')
  actOffline(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OfflineActionDto) { return this.safety.actOffline(user, id, dto); }

  @Get('emergency-tasks') @RequirePermissions('safety:emergency:read')
  emergencyTasks(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.emergencyTasks(user, query); }
  @Get('emergency-tasks/:id') @RequirePermissions('safety:emergency:read')
  emergencyTask(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.emergencyTask(user, id); }
  @Post('emergency-tasks') @RequirePermissions('safety:emergency:dispatch')
  createEmergencyTask(@CurrentUser() user: AuthUser, @Body() dto: CreateEmergencyTaskDto) { return this.safety.createEmergencyTask(user, dto); }
  @Post('emergency-tasks/:id/actions') @RequirePermissions('safety:emergency:read')
  actEmergencyTask(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EmergencyActionDto) { return this.taskWorkspace.act(user,'EMERGENCY',id,{...dto,comment:dto.comment??''}); }
}
