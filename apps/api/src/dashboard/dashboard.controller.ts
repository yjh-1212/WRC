import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CockpitQueryDto } from './cockpit.dto';
import { CockpitService } from './cockpit.service';
import { DashboardService } from './dashboard.service';

@ApiTags('业务首页')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService, private readonly cockpit: CockpitService) {}

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
