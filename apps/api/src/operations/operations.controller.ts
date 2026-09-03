import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CreateOperationRegionDto, OperationsQueryDto, TelemetryDto, TrackQueryDto, UpdateOperationRegionDto, UpdateOperationRegionStatusDto } from './dto';
import { OperationsService } from './operations.service';

@ApiTags('运行监管') @ApiBearerAuth() @Controller('operations')
export class OperationsController {
  constructor(private operations: OperationsService) {}

  @Get('options') @RequirePermissions('operation:realtime:read')
  options(@CurrentUser() user: AuthUser) { return this.operations.options(user); }
  @Get('realtime') @RequirePermissions('operation:realtime:read')
  realtime(@CurrentUser() user: AuthUser, @Query() query: OperationsQueryDto) { return this.operations.realtime(user, query); }
  @Get('distribution') @RequirePermissions('operation:distribution:read')
  distribution(@CurrentUser() user: AuthUser, @Query() query: OperationsQueryDto) { return this.operations.distribution(user, query); }
  @Get('online-monitor') @RequirePermissions('operation:monitor:read')
  onlineMonitor(@CurrentUser() user: AuthUser, @Query() query: OperationsQueryDto) { return this.operations.onlineMonitor(user, query); }
  @Get('records') @RequirePermissions('operation:record:read')
  records(@CurrentUser() user: AuthUser, @Query() query: OperationsQueryDto) { return this.operations.records(user, query); }
  @Get('records/:id') @RequirePermissions('operation:record:read')
  record(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.operations.record(user, id); }
  @Get('vehicles/:vehicleId/tracks') @RequirePermissions('operation:trajectory:read')
  tracks(@CurrentUser() user: AuthUser, @Param('vehicleId') vehicleId: string, @Query() query: TrackQueryDto) { return this.operations.tracks(user, vehicleId, query); }
  @Post('telemetry') @RequirePermissions('operation:telemetry:write')
  ingest(@CurrentUser() user: AuthUser, @Body() dto: TelemetryDto) { return this.operations.ingest(user, dto); }
  @Get('regions') @RequirePermissions('operation:region:read')
  regions(@CurrentUser() user: AuthUser, @Query() query: OperationsQueryDto) { return this.operations.regions(user, query); }
  @Post('regions') @RequirePermissions('operation:region:write')
  createRegion(@CurrentUser() user: AuthUser, @Body() dto: CreateOperationRegionDto) { return this.operations.createRegion(user, dto); }
  @Patch('regions/:id') @RequirePermissions('operation:region:write')
  updateRegion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOperationRegionDto) { return this.operations.updateRegion(user, id, dto); }
  @Patch('regions/:id/status') @RequirePermissions('operation:region:write')
  setRegionStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOperationRegionStatusDto) { return this.operations.setRegionStatus(user, id, dto.status); }
}
