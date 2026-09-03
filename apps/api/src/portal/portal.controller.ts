import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('门户权限验证')
@ApiBearerAuth()
@Controller()
export class PortalController {
  constructor(private prisma: PrismaService) {}
  @Get('regulatory/overview') @RequirePermissions('regulatory:access')
  async regulatoryOverview() {
    const [users, enterprises, loginFailures, auditActions] = await Promise.all([
      this.prisma.user.count(), this.prisma.enterprise.count(),
      this.prisma.loginLog.count({ where: { success: false } }), this.prisma.auditLog.count(),
    ]);
    return { users, enterprises, loginFailures, auditActions, phase: 1 };
  }
  @Get('enterprise/current') @RequirePermissions('enterprise:access')
  async currentEnterprise(@CurrentUser() user: AuthUser) {
    if (!user.enterpriseId) return { enterprise: null };
    return { enterprise: await this.prisma.enterprise.findUnique({ where: { id: user.enterpriseId } }) };
  }
}
