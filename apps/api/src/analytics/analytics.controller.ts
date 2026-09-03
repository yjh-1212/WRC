import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AnalyticsQueryDto, CreateAppealDto, CreateEvaluationTaskDto, CreateReportDto, ReviewAppealDto, SaveReconstructionDto, UpdateIndicatorDto, UpdateReportDto, UpdateRuleDto } from './dto';
import { AnalyticsService } from './analytics.service';

@ApiTags('分析研判') @ApiBearerAuth() @Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('options') @RequirePermissions('analytics:operation:read') options(@CurrentUser() user: AuthUser) { return this.analytics.options(user); }
  @Get('operations') @RequirePermissions('analytics:operation:read') operations(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) { return this.analytics.operationAnalysis(user, query); }
  @Get('safety') @RequirePermissions('analytics:safety:read') safety(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) { return this.analytics.safetyAnalysis(user, query); }

  @Get('accidents') @RequirePermissions('analytics:accident:read') accidents(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) { return this.analytics.accidentAnalyses(user, query); }
  @Get('accidents/:id') @RequirePermissions('analytics:accident:read') accident(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('windowMinutes') windowMinutes?: string) { const minutes = Math.min(180, Math.max(5, Number(windowMinutes) || 30)); return this.analytics.accidentAnalysis(user, id, minutes); }
  @Post('accidents/:id/reconstruction') @RequirePermissions('analytics:accident:write') reconstruct(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SaveReconstructionDto) { return this.analytics.saveReconstruction(user, id, dto); }

  @Get('evaluation/config') @RequirePermissions('analytics:evaluation:read') evaluationConfig(@CurrentUser() user: AuthUser) { return this.analytics.evaluationConfig(user); }
  @Patch('evaluation/indicators/:id') @RequirePermissions('analytics:evaluation:config') updateIndicator(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateIndicatorDto) { return this.analytics.updateIndicator(user, id, dto); }
  @Patch('evaluation/rules/:id') @RequirePermissions('analytics:evaluation:config') updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRuleDto) { return this.analytics.updateRule(user, id, dto); }
  @Get('evaluation/tasks') @RequirePermissions('analytics:evaluation:read') evaluationTasks(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) { return this.analytics.evaluationTasks(user, query); }
  @Post('evaluation/tasks') @RequirePermissions('analytics:evaluation:generate') createEvaluationTask(@CurrentUser() user: AuthUser, @Body() dto: CreateEvaluationTaskDto) { return this.analytics.createEvaluationTask(user, dto); }
  @Post('evaluation/tasks/:id/publish') @RequirePermissions('analytics:evaluation:publish') publishEvaluationTask(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.analytics.publishEvaluationTask(user, id); }
  @Get('evaluations') @RequirePermissions('analytics:evaluation:read') evaluations(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) { return this.analytics.evaluations(user, query); }
  @Get('evaluations/:id') @RequirePermissions('analytics:evaluation:read') evaluation(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.analytics.evaluation(user, id); }
  @Post('evaluations/:id/appeals') @RequirePermissions('analytics:evaluation:appeal') appeal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateAppealDto) { return this.analytics.createAppeal(user, id, dto); }
  @Get('appeals') @RequirePermissions('analytics:evaluation:read') appeals(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) { return this.analytics.appeals(user, query); }
  @Post('appeals/:id/review') @RequirePermissions('analytics:evaluation:review') reviewAppeal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewAppealDto) { return this.analytics.reviewAppeal(user, id, dto); }

  @Get('profiles') @RequirePermissions('analytics:profile:read') profiles(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) { return this.analytics.profiles(user, query); }
  @Get('profiles/:enterpriseId') @RequirePermissions('analytics:profile:read') profile(@CurrentUser() user: AuthUser, @Param('enterpriseId') enterpriseId: string) { return this.analytics.profile(user, enterpriseId); }

  @Get('reports') @RequirePermissions('analytics:report:read') reports(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) { return this.analytics.reports(user, query); }
  @Get('reports/:id') @RequirePermissions('analytics:report:read') report(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.analytics.report(user, id); }
  @Post('reports') @RequirePermissions('analytics:report:generate') createReport(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) { return this.analytics.createReport(user, dto); }
  @Patch('reports/:id') @RequirePermissions('analytics:report:generate') updateReport(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateReportDto) { return this.analytics.updateReport(user, id, dto); }
  @Get('reports/:id/export') @RequirePermissions('analytics:report:export') exportReport(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.analytics.exportReport(user, id); }
}
