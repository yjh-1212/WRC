import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ProvinceMonitoringQueryDto } from './province-monitoring.dto';
import { ProvinceMonitoringService } from './province-monitoring.service';

@ApiTags('全省运行监测与监管档案') @ApiBearerAuth() @Controller('province')
export class ProvinceMonitoringController {
  constructor(private readonly service: ProvinceMonitoringService) {}
  @Get('monitoring/options') options(@CurrentUser() user: AuthUser) { return this.service.options(user); }
  @Get('monitoring') @RequirePermissions('operation:realtime:read') monitoring(@CurrentUser() user: AuthUser, @Query() query: ProvinceMonitoringQueryDto) { return this.service.vehicles(user, query, true); }
  @Get('alerts') @RequirePermissions('safety:alert:read') alerts(@CurrentUser() user: AuthUser, @Query() query: ProvinceMonitoringQueryDto) { return this.service.alerts(user, query); }
  @Get('alerts/:id') @RequirePermissions('safety:alert:read') alert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ProvinceMonitoringQueryDto) { return this.service.alert(user, id, query); }
  @Get('vehicles') @RequirePermissions('archive:vehicle:read') vehicles(@CurrentUser() user: AuthUser, @Query() query: ProvinceMonitoringQueryDto) { return this.service.vehicles(user, query); }
  @Get('vehicles/:id') @RequirePermissions('archive:vehicle:read') vehicle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ProvinceMonitoringQueryDto) { return this.service.dossier(user, id, query); }
  @Get('vehicles/:id/records') @RequirePermissions('operation:record:read') records(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ProvinceMonitoringQueryDto) { return this.service.records(user, id, query); }
  @Get('vehicles/:id/tracks') @RequirePermissions('operation:trajectory:read') tracks(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ProvinceMonitoringQueryDto) { return this.service.tracks(user, id, query); }
  @Get('vehicles/:id/violations') @RequirePermissions('safety:violation:read') violations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ProvinceMonitoringQueryDto) { return this.service.violations(user, id, query); }
  @Get('accidents') @RequirePermissions('safety:accident:read') accidents(@CurrentUser() user: AuthUser, @Query() query: ProvinceMonitoringQueryDto) { return this.service.accidents(user, query); }
  @Get('accidents/:id') @RequirePermissions('safety:accident:read') accident(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ProvinceMonitoringQueryDto) { return this.service.accident(user, id, query); }
}
