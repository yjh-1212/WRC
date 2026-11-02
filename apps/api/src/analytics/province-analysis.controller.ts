import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { ProvinceAnalysisQueryDto } from './province-analysis.dto';
import { ProvinceAnalysisService } from './province-analysis.service';

@ApiTags('省域运行分析') @ApiBearerAuth() @Controller('province/analysis')
export class ProvinceAnalysisController {
  constructor(private readonly analysis: ProvinceAnalysisService) {}
  @Get('options') @RequirePermissions('analytics:operation:read') options(@CurrentUser() user: AuthUser) { return this.analysis.options(user); }
  @Get('export') @RequirePermissions('analytics:operation:read', 'analytics:report:export') export(@CurrentUser() user: AuthUser, @Query() query: ProvinceAnalysisQueryDto) { return this.analysis.export(user, query); }
  @Get() @RequirePermissions('analytics:operation:read') get(@CurrentUser() user: AuthUser, @Query() query: ProvinceAnalysisQueryDto) { return this.analysis.analysis(user, query); }
}
