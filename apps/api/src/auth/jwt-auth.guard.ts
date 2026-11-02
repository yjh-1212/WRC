import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { permissionModule } from './workspace-access';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException('登录状态已失效，请重新登录');
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET });
      if (payload.typ !== 'access') throw new UnauthorizedException('登录状态已失效，请重新登录');
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      });
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('账号已停用或不存在');
      if ((payload.ver ?? 0) !== user.authVersion) throw new UnauthorizedException('账号权限已变更，请重新登录');
      const workspace = user.workspaceId ? await this.prisma.cityWorkspace.findUnique({ where: { id: user.workspaceId } }) : null;
      const accountLevel = user.accountLevel;
      if (accountLevel === 'PROVINCE' && user.portal === 'ENTERPRISE') throw new ForbiddenException('省级未设置企业门户，请使用所属城市的企业账号');
      if (!['PROVINCE', 'OPERATIONS'].includes(accountLevel) && !workspace) throw new ForbiddenException('账号尚未关联已开通城市，请联系管理员');
      const organizations = workspace ? await this.prisma.organization.findMany({ where: { workspaceId: workspace.id }, select: { id: true, parentId: true } }) : [];
      if (workspace && (!user.organizationId || !organizations.some((org) => org.id === user.organizationId))) throw new ForbiddenException('账号机构与城市归属不一致，请联系管理员核验');
      if (workspace && user.enterpriseId && !await this.prisma.enterprise.findFirst({ where: { id: user.enterpriseId, organization: { workspaceId: workspace.id } } })) throw new ForbiddenException('企业与城市归属不一致，请联系管理员核验');
      const ids = new Set<string>(user.organizationId ? [user.organizationId] : []);
      let changed = true;
      while (changed) {
        changed = false;
        for (const org of organizations) if (org.parentId && ids.has(org.parentId) && !ids.has(org.id)) { ids.add(org.id); changed = true; }
      }
      const modules: string[] = workspace ? JSON.parse(workspace.modulesJson) : [];
      const activeRoles = user.roles.filter((item) => item.role.status === 'ACTIVE'
        && (!item.role.workspaceId || item.role.workspaceId === user.workspaceId)
        && (accountLevel === 'PROVINCE' || item.role.code !== 'SUPER_ADMIN'));
      const permissions = [...new Set(activeRoles.flatMap((item) => item.role.permissions.map((rp) => rp.permission.code)))];
      if (workspace && accountLevel === 'CITY' && activeRoles.some((item) => /^CITY_ADMIN(?:_|$)/.test(item.role.code))) {
        organizations.forEach((organization) => ids.add(organization.id));
      }
      request.user = {
        id: user.id, username: user.username, displayName: user.displayName, portal: user.portal,
        organizationId: user.organizationId, enterpriseId: user.enterpriseId,
        roles: activeRoles.map((x) => ({ id: x.role.id, code: x.role.code, name: x.role.name })),
        permissions: accountLevel === 'PROVINCE' ? permissions : permissions.filter((code) => !permissionModule(code) || modules.includes(permissionModule(code)!)),
        workspaceId: user.workspaceId, accountLevel, authVersion: user.authVersion,
        scopeOrganizationIds: [...ids],
        workspace: workspace ? { id: workspace.id, cityCode: workspace.cityCode, cityName: workspace.cityName, organizationId: workspace.organizationId,
          status: workspace.status, modules, validUntil: workspace.validUntil } : null,
      };
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
  }
}
