import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CreateEnterpriseDto, CreateOrganizationDto, CreateRoleDto, CreateUserDto, PageQueryDto, ResetPasswordDto, StatusDto, UpdateRolePermissionsDto, UpdateUserDto } from './dto';
import { SystemService } from './system.service';

@ApiTags('系统管理') @ApiBearerAuth() @Controller('system')
export class SystemController {
  constructor(private system: SystemService) {}

  @Get('users') @RequirePermissions('system:user:read') users(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto) { return this.system.users(user, query); }
  @Get('users/options') @RequirePermissions('system:user:read') userOptions(@CurrentUser() user: AuthUser) { return this.system.userOptions(user); }
  @Post('users') @RequirePermissions('system:user:create') createUser(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) { return this.system.createUser(user, dto); }
  @Patch('users/:id') @RequirePermissions('system:user:update') updateUser(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) { return this.system.updateUser(user, id, dto); }
  @Patch('users/:id/status') @RequirePermissions('system:user:update') setUserStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) { return this.system.setUserStatus(user, id, dto.status); }
  @Patch('users/:id/password') @RequirePermissions('system:user:update') resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResetPasswordDto) { return this.system.resetPassword(user, id, dto.password); }

  @Get('roles') @RequirePermissions('system:role:read') roles(@CurrentUser() user: AuthUser) { return this.system.roles(user); }
  @Post('roles') @RequirePermissions('system:role:update') createRole(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) { return this.system.createRole(user, dto); }
  @Patch('roles/:id/permissions') @RequirePermissions('system:role:update') grantRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRolePermissionsDto) { return this.system.grantRole(user, id, dto.permissionIds); }
  @Get('permissions') @RequirePermissions('system:role:read') permissions() { return this.system.permissions(); }

  @Get('organizations') @RequirePermissions('system:organization:read') organizations(@CurrentUser() user: AuthUser) { return this.system.organizations(user); }
  @Post('organizations') @RequirePermissions('system:organization:update') createOrganization(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto) { return this.system.createOrganization(user, dto); }

  @Get('enterprises') @RequirePermissions('system:enterprise:read') enterprises(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto) { return this.system.enterprises(user, query); }
  @Post('enterprises') @RequirePermissions('system:enterprise:update') createEnterprise(@CurrentUser() user: AuthUser, @Body() dto: CreateEnterpriseDto) { return this.system.createEnterprise(user, dto); }

  @Get('logs/login') @RequirePermissions('system:audit:read') loginLogs(@Query() query: PageQueryDto) { return this.system.loginLogs(query); }
  @Get('logs/audit') @RequirePermissions('system:audit:read') auditLogs(@Query() query: PageQueryDto) { return this.system.auditLogs(query); }
}
