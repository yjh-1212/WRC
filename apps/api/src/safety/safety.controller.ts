import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AccidentActionDto, AlertActionDto, CreateAccidentDto, CreateAlertDto, CreateEmergencyTaskDto, CreateFenceDto, CreateViolationDto, EmergencyActionDto, FenceStatusDto, OfflineActionDto, SafetyQueryDto, UpdateFenceDto, ViolationActionDto } from './dto';
import { SafetyService } from './safety.service';

@ApiTags('安全监管') @ApiBearerAuth() @Controller('safety')
export class SafetyController {
  constructor(private safety: SafetyService) {}

  @Get('options') @RequirePermissions('safety:alert:read')
  options(@CurrentUser() user: AuthUser) { return this.safety.options(user); }

  @Get('alerts') @RequirePermissions('safety:alert:read')
  alerts(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.alerts(user, query); }
  @Get('alerts/:id') @RequirePermissions('safety:alert:read')
  alert(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.alert(user, id); }
  @Post('alerts') @RequirePermissions('safety:alert:write')
  createAlert(@CurrentUser() user: AuthUser, @Body() dto: CreateAlertDto) { return this.safety.createAlert(user, dto); }
  @Post('alerts/:id/actions') @RequirePermissions('safety:alert:handle')
  actAlert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AlertActionDto) { return this.safety.actAlert(user, id, dto); }

  @Get('fences') @RequirePermissions('safety:fence:read')
  fences(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.fences(user, query); }
  @Post('fences') @RequirePermissions('safety:fence:write')
  createFence(@CurrentUser() user: AuthUser, @Body() dto: CreateFenceDto) { return this.safety.createFence(user, dto); }
  @Patch('fences/:id') @RequirePermissions('safety:fence:write')
  updateFence(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateFenceDto) { return this.safety.updateFence(user, id, dto); }
  @Patch('fences/:id/status') @RequirePermissions('safety:fence:write')
  setFenceStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FenceStatusDto) { return this.safety.setFenceStatus(user, id, dto.active); }
  @Delete('fences/:id') @RequirePermissions('safety:fence:write')
  deleteFence(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.deleteFence(user, id); }

  @Get('accidents') @RequirePermissions('safety:accident:read')
  accidents(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.accidents(user, query); }
  @Get('accidents/:id') @RequirePermissions('safety:accident:read')
  accident(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.accident(user, id); }
  @Post('accidents') @RequirePermissions('safety:accident:report')
  createAccident(@CurrentUser() user: AuthUser, @Body() dto: CreateAccidentDto) { return this.safety.createAccident(user, dto); }
  @Post('accidents/:id/actions') @RequirePermissions('safety:accident:handle')
  actAccident(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AccidentActionDto) { return this.safety.actAccident(user, id, dto); }

  @Get('violations') @RequirePermissions('safety:violation:read')
  violations(@CurrentUser() user: AuthUser, @Query() query: SafetyQueryDto) { return this.safety.violations(user, query); }
  @Get('violations/:id') @RequirePermissions('safety:violation:read')
  violation(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.violation(user, id); }
  @Post('violations') @RequirePermissions('safety:violation:write')
  createViolation(@CurrentUser() user: AuthUser, @Body() dto: CreateViolationDto) { return this.safety.createViolation(user, dto); }
  @Post('violations/:id/actions') @RequirePermissions('safety:violation:review')
  actViolation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ViolationActionDto) { return this.safety.actViolation(user, id, dto); }

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
  actEmergencyTask(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EmergencyActionDto) { return this.safety.actEmergencyTask(user, id, dto); }
}
