import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto } from './dto';
import { AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private async issue(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId, OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] } });
    const accessToken = await this.jwt.signAsync({ sub: userId, typ: 'access' }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as any });
    const refreshToken = await this.jwt.signAsync({ sub: userId, typ: 'refresh', nonce: randomUUID() }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as any });
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({ data: { tokenHash: this.hashToken(refreshToken), userId, expiresAt: new Date(decoded.exp * 1000) } });
    const accessPayload = this.jwt.decode(accessToken) as { exp: number; iat: number };
    return { accessToken, refreshToken, expiresIn: Math.max(0, accessPayload.exp - accessPayload.iat) };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const blockedSince = new Date(Date.now() - 10 * 60_000);
    const failedAttempts = await this.prisma.loginLog.count({ where: { username: dto.username, ip, success: false, createdAt: { gte: blockedSince } } });
    if (failedAttempts >= 5) {
      await this.prisma.loginLog.create({ data: { username: dto.username, ip, userAgent, success: false, message: '登录尝试过于频繁' } });
      throw new HttpException('登录尝试过于频繁，请 10 分钟后重试', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    const success = !!user && user.status === 'ACTIVE' && await bcrypt.compare(dto.password, user.passwordHash);
    await this.prisma.loginLog.create({ data: { userId: success ? user!.id : null, username: dto.username, ip, userAgent, success, message: success ? '登录成功' : '账号、密码或状态无效' } });
    if (!success) throw new UnauthorizedException('账号或密码错误');
    await this.prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
    return this.issue(user!.id);
  }

  async refresh(token: string) {
    let payload: { sub: string; typ: string };
    try { payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_REFRESH_SECRET }); }
    catch { throw new UnauthorizedException('刷新凭证无效或已过期'); }
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(token) }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.user.status !== 'ACTIVE' || payload.typ !== 'refresh' || stored.userId !== payload.sub) throw new UnauthorizedException('刷新凭证无效或已过期');
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issue(payload.sub);
  }

  async logout(user: AuthUser, token: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId: user.id, tokenHash: this.hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit(user, 'auth', 'session', user.id, 'LOGOUT');
    return { loggedOut: true };
  }

  profile(user: AuthUser) { return user; }

  async menus(user: AuthUser) {
    const menus = await this.prisma.menu.findMany({ where: { portal: user.portal, status: 'ACTIVE' }, orderBy: { orderNo: 'asc' } });
    const visible = menus.filter((m) => !m.permissionCode || user.permissions.includes(m.permissionCode));
    return visible.filter((m) => !m.parentId).map((m) => ({ ...m, children: visible.filter((c) => c.parentId === m.id) }));
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!await bcrypt.compare(dto.oldPassword, current.passwordHash)) throw new BadRequestException('原密码不正确');
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit(user, 'auth', 'user', user.id, 'CHANGE_PASSWORD');
    return { changed: true };
  }

  async audit(user: AuthUser, module: string, objectType: string, objectId: string | null, action: string, detail?: unknown) {
    await this.prisma.auditLog.create({ data: { userId: user.id, roleNames: user.roles.map((r) => r.name).join(','), organizationId: user.organizationId, enterpriseId: user.enterpriseId, module, objectType, objectId, action, result: 'SUCCESS', detail: detail ? JSON.stringify(detail) : null } });
  }
}
