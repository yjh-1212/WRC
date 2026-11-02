import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { WorkbenchService } from './workbench.service';

export class WorkbenchQueryDto { @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string; }
@ApiTags('全省工作台') @ApiBearerAuth() @Controller('province/workbench')
export class WorkbenchController {
  constructor(private readonly workbench: WorkbenchService) {}
  @Get() @RequirePermissions('dashboard:view') get(@CurrentUser() user: AuthUser, @Query() query: WorkbenchQueryDto) { return this.workbench.get(user, query.month); }
}
