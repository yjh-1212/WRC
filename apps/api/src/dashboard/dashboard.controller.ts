import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CockpitQueryDto } from './cockpit.dto';
import { CockpitService } from './cockpit.service';
import { DashboardService } from './dashboard.service';
import { RegulatoryWorkbenchService } from './regulatory-workbench.service';
import { RegulatoryWorkbenchQueryDto } from './regulatory-workbench.dto';
import { ThreeLevelCockpitQueryDto } from './three-level-cockpit.dto';
import { ThreeLevelCockpitService } from './three-level-cockpit.service';
import { ProvinceCockpitQueryDto, ProvinceCockpitService } from './province-cockpit.service';
import { ProvinceMapQueryDto, ProvinceMapService } from './province-map.service';
import { AppearanceRevisionDto, ProvinceAppearanceService, SaveAppearanceDto, SaveAppearancePresetDto } from './province-appearance.service';

@ApiTags('业务首页')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly cockpit: CockpitService,
    private readonly threeLevelCockpit: ThreeLevelCockpitService,
    private readonly provinceCockpit: ProvinceCockpitService,
    private readonly appearance: ProvinceAppearanceService,
    private readonly provinceMap: ProvinceMapService,
    private readonly workbench: RegulatoryWorkbenchService,
  ) {}

  @Get('regulator/workbench')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorWorkbench(@CurrentUser() user: AuthUser, @Query() query: RegulatoryWorkbenchQueryDto) {
    return this.workbench.overview(user, query);
  }

  @Get('regulator/summary')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorSummary(@CurrentUser() user: AuthUser) {
    return this.dashboard.regulatorSummary(user);
  }

  @Get('regulator/tasks')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorTasks(@CurrentUser() user: AuthUser) {
    return this.dashboard.regulatorTasks(user);
  }

  @Get('regulator/risks')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorRisks(@CurrentUser() user: AuthUser) {
    return this.dashboard.regulatorRisks(user);
  }

  @Get('regulator/trends')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorTrends(@CurrentUser() user: AuthUser) {
    return this.dashboard.regulatorTrends(user);
  }

  @Get('regulator/alarms')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorAlarms(@CurrentUser() user: AuthUser) {
    return this.dashboard.regulatorAlarms(user);
  }

  @Get('regulator/approvals')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorApprovals(@CurrentUser() user: AuthUser) {
    return this.dashboard.regulatorApprovals(user);
  }

  @Get('regulator/cockpit')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorCockpit(@CurrentUser() user: AuthUser, @Query() query: CockpitQueryDto) {
    return this.cockpit.overview(user, query);
  }

  @Get('regulator/province-cockpit')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  provinceCockpitOverview(@CurrentUser() user: AuthUser, @Query() query: ProvinceCockpitQueryDto) {
    return this.provinceCockpit.overview(user, query);
  }

  @Get('regulator/province-cockpit/map')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  provinceMapOverview(@CurrentUser() user: AuthUser, @Query() query: ProvinceMapQueryDto) { return this.provinceMap.overview(user, query); }

  @Get('regulator/province-cockpit/map/vehicles/:id')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  provinceVehicleTelemetry(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ProvinceMapQueryDto) { return this.provinceMap.telemetry(user, query.cityCode, id); }

  @Get('regulator/province-cockpit/appearance')
  @RequirePermissions('dashboard:view')
  appearanceRead(@CurrentUser() user: AuthUser) { return this.appearance.read(user); }
  @Put('regulator/province-cockpit/appearance')
  @RequirePermissions('dashboard:view', 'system:organization:update')
  appearanceSave(@CurrentUser() user: AuthUser, @Body() dto: SaveAppearanceDto) { return this.appearance.save(user, dto); }
  @Post('regulator/province-cockpit/appearance/presets')
  @RequirePermissions('dashboard:view', 'system:organization:update')
  appearancePreset(@CurrentUser() user: AuthUser, @Body() dto: SaveAppearancePresetDto) { return this.appearance.preset(user, dto); }
  @Delete('regulator/province-cockpit/appearance/presets/:id')
  @RequirePermissions('dashboard:view', 'system:organization:update')
  appearancePresetDelete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AppearanceRevisionDto) { return this.appearance.removePreset(user, id, dto); }

  @Get('regulator/cockpit/scene')
  @RequirePermissions('dashboard:view', 'regulatory:access')
  regulatorCockpitScene(@CurrentUser() user: AuthUser, @Query() query: ThreeLevelCockpitQueryDto) {
    return this.threeLevelCockpit.scene(user, query);
  }

  @Get('enterprise/summary')
  @RequirePermissions('dashboard:view', 'enterprise:access')
  enterpriseSummary(@CurrentUser() user: AuthUser) {
    return this.dashboard.enterpriseSummary(user);
  }

  @Get('enterprise/tasks')
  @RequirePermissions('dashboard:view', 'enterprise:access')
  enterpriseTasks(@CurrentUser() user: AuthUser) {
    return this.dashboard.enterpriseTasks(user);
  }

  @Get('enterprise/vehicles')
  @RequirePermissions('dashboard:view', 'enterprise:access')
  enterpriseVehicles(@CurrentUser() user: AuthUser) {
    return this.dashboard.enterpriseVehicles(user);
  }

  @Get('enterprise/risks')
  @RequirePermissions('dashboard:view', 'enterprise:access')
  enterpriseRisks(@CurrentUser() user: AuthUser) {
    return this.dashboard.enterpriseRisks(user);
  }

  @Get('enterprise/applications')
  @RequirePermissions('dashboard:view', 'enterprise:access')
  enterpriseApplications(@CurrentUser() user: AuthUser) {
    return this.dashboard.enterpriseApplications(user);
  }
}
