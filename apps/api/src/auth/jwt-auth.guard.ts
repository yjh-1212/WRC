import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './auth.decorators';

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
      request.user = {
        id: user.id, username: user.username, displayName: user.displayName, portal: user.portal,
        organizationId: user.organizationId, enterpriseId: user.enterpriseId,
        roles: user.roles.filter((x) => x.role.status === 'ACTIVE').map((x) => ({ id: x.role.id, code: x.role.code, name: x.role.name })),
        permissions: [...new Set(user.roles.flatMap((x) => x.role.permissions.map((rp) => rp.permission.code)))],
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
  }
}
