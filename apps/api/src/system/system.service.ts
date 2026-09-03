import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEnterpriseDto, CreateOrganizationDto, CreateRoleDto, CreateUserDto, PageQueryDto, UpdateUserDto } from './dto';

@Injectable()
export class SystemService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  private userScope(user: AuthUser): Prisma.UserWhereInput {
    if (user.portal === 'ENTERPRISE') {
      if (!user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
      return { enterpriseId: user.enterpriseId };
    }
    return user.roles.some((r) => r.code === 'SUPER_ADMIN') ? {} : { organizationId: user.organizationId ?? '__none__' };
  }
  private enterpriseScope(user: AuthUser): Prisma.EnterpriseWhereInput {
    if (user.portal === 'ENTERPRISE') return { id: user.enterpriseId ?? '__none__' };
    return user.roles.some((r) => r.code === 'SUPER_ADMIN') ? {} : { organizationId: user.organizationId ?? '__none__' };
  }

  private userSelect() {
    return {
      id: true, username: true, displayName: true, email: true, phone: true, portal: true, status: true,
      organizationId: true, enterpriseId: true, lastLoginAt: true, createdAt: true,
      organization: { select: { name: true } }, enterprise: { select: { name: true } },
      roles: { select: { role: { select: { id: true, code: true, name: true } } } },
    } as const;
  }

  private async assertKeepEnterpriseAdmin(enterpriseId: string | null, userId: string, nextRoleIds?: string[], nextStatus?: string) {
    if (!enterpriseId) return;
    const currentRoles = await this.prisma.userRole.findMany({ where: { userId }, include: { role: { select: { code: true } } } });
    const currentlyAdmin = currentRoles.some((item) => item.role.code === 'ENTERPRISE_ADMIN');
    if (!currentlyAdmin) return;
    const remainsActive = nextStatus ? nextStatus === 'ACTIVE' : true;
    const remainsAdmin = nextRoleIds
      ? (await this.prisma.role.findMany({ where: { id: { in: nextRoleIds } } })).some((role) => role.code === 'ENTERPRISE_ADMIN')
      : true;
    if (remainsActive && remainsAdmin) return;
    const others = await this.prisma.user.count({
      where: { enterpriseId, status: 'ACTIVE', id: { not: userId }, roles: { some: { role: { code: 'ENTERPRISE_ADMIN' } } } },
    });
    if (others === 0) throw new BadRequestException('不能停用或取消本企业最后一位管理员');
  }

  async users(user: AuthUser, query: PageQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...this.userScope(user),
      status: query.status,
      OR: query.q ? [{ username: { contains: query.q } }, { displayName: { contains: query.q } }, { email: { contains: query.q } }, { phone: { contains: query.q } }] : undefined,
    };
    const sortField = query.sort === 'lastLoginAt' || query.sort === 'displayName' ? query.sort : 'createdAt';
    const sortOrder = query.order === 'asc' ? 'asc' : 'desc';
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { [sortField]: sortOrder }, select: this.userSelect() }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }

  async userOptions(user: AuthUser) {
    const roles = await this.prisma.role.findMany({
      where: { status: 'ACTIVE', portal: user.portal === 'ENTERPRISE' ? 'ENTERPRISE' : undefined },
      select: { id: true, code: true, name: true, portal: true, description: true },
      orderBy: { createdAt: 'asc' },
    });
    return { roles };
  }

  async createUser(actor: AuthUser, dto: CreateUserDto) {
    const portal = actor.portal === 'ENTERPRISE' ? 'ENTERPRISE' : dto.portal;
    if (actor.portal === 'ENTERPRISE' && dto.portal !== 'ENTERPRISE') throw new ForbiddenException('企业管理员只能创建本企业账号');
    const enterpriseId = actor.portal === 'ENTERPRISE' ? actor.enterpriseId : dto.enterpriseId;
    const organizationId = actor.portal === 'ENTERPRISE' ? actor.organizationId : (dto.organizationId ?? actor.organizationId);
    const allowedRoles = await this.prisma.role.findMany({ where: { id: { in: dto.roleIds }, portal } });
    if (allowedRoles.length !== dto.roleIds.length) throw new BadRequestException('角色与门户不匹配');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const created = await this.prisma.user.create({
        data: { username: dto.username, passwordHash, displayName: dto.displayName, email: dto.email, phone: dto.phone, portal, organizationId, enterpriseId, roles: { create: dto.roleIds.map((roleId) => ({ roleId })) } },
        select: { id: true, username: true, displayName: true },
      });
      await this.auth.audit(actor, 'system', 'user', created.id, 'CREATE', { username: created.username });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('登录账号已存在');
      throw error;
    }
  }

  async updateUser(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id, ...this.userScope(actor) } });
    if (!target) throw new NotFoundException('用户不存在或不在当前数据范围内');
    if (actor.portal === 'ENTERPRISE' && dto.enterpriseId && dto.enterpriseId !== actor.enterpriseId) throw new ForbiddenException('不能把账号移动到其他企业');
    if (actor.portal === 'ENTERPRISE') await this.assertKeepEnterpriseAdmin(target.enterpriseId, id, dto.roleIds);
    const { roleIds, ...rest } = dto;
    const data = actor.portal === 'ENTERPRISE' ? { displayName: rest.displayName, email: rest.email, phone: rest.phone } : rest;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      if (roleIds) {
        const roles = await tx.role.findMany({ where: { id: { in: roleIds }, portal: target.portal } });
        if (roles.length !== roleIds.length) throw new BadRequestException('角色与用户门户不匹配');
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
    });
    await this.auth.audit(actor, 'system', 'user', id, 'UPDATE', data);
    return { id, updated: true };
  }

  async setUserStatus(actor: AuthUser, id: string, status: string) {
    if (actor.id === id && status === 'INACTIVE') throw new BadRequestException('不能停用当前登录账号');
    const target = await this.prisma.user.findFirst({ where: { id, ...this.userScope(actor) } });
    if (!target) throw new NotFoundException('用户不存在或不在当前数据范围内');
    if (status === 'INACTIVE') await this.assertKeepEnterpriseAdmin(target.enterpriseId, id, undefined, status);
    await this.prisma.user.update({ where: { id }, data: { status } });
    if (status === 'INACTIVE') await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.auth.audit(actor, 'system', 'user', id, status === 'ACTIVE' ? 'ENABLE' : 'DISABLE');
    return { id, status };
  }

  async resetPassword(actor: AuthUser, id: string, password: string) {
    const target = await this.prisma.user.findFirst({ where: { id, ...this.userScope(actor) } });
    if (!target) throw new NotFoundException('用户不存在或不在当前数据范围内');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.auth.audit(actor, 'system', 'user', id, 'RESET_PASSWORD');
    return { id, reset: true };
  }

  private isSuperAdmin(user: AuthUser) {
    return user.roles.some((role) => role.code === 'SUPER_ADMIN');
  }

  async roles(user: AuthUser) {
    return this.prisma.role.findMany({ where: { portal: user.portal === 'ENTERPRISE' ? 'ENTERPRISE' : undefined }, orderBy: { createdAt: 'asc' }, include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } } });
  }
  permissions() { return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }); }
  async createRole(actor: AuthUser, dto: CreateRoleDto) {
    if (!this.isSuperAdmin(actor)) throw new ForbiddenException('只有超级管理员可以新增角色');
    if (dto.code.toUpperCase() === 'SUPER_ADMIN') throw new BadRequestException('不能新增超级管理员角色');
    const payload = { ...dto, code: dto.code.toUpperCase() };
    try {
      const role = await this.prisma.role.create({ data: payload });
      await this.auth.audit(actor, 'system', 'role', role.id, 'CREATE', payload);
      return role;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('角色编码已存在');
      throw error;
    }
  }
  async grantRole(actor: AuthUser, id: string, permissionIds: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    if (actor.portal === 'ENTERPRISE' || role.code === 'SUPER_ADMIN') throw new ForbiddenException('当前角色不允许在此处授权');
    if (role.portal === 'ENTERPRISE' && !this.isSuperAdmin(actor)) throw new ForbiddenException('企业角色仅超级管理员可调整权限');
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })) }),
    ]);
    await this.auth.audit(actor, 'system', 'role', id, 'GRANT_PERMISSIONS', { permissionIds });
    return { id, permissionCount: permissionIds.length };
  }

  organizations(user: AuthUser) {
    return this.prisma.organization.findMany({ where: this.isSuperAdmin(user) ? {} : { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] }, orderBy: { name: 'asc' } });
  }
  async createOrganization(actor: AuthUser, dto: CreateOrganizationDto) {
    if (!this.isSuperAdmin(actor)) throw new ForbiddenException('只有超级管理员可以新增组织机构');
    if (dto.parentId) {
      const parent = await this.prisma.organization.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('上级机构不存在');
    }
    try {
      const org = await this.prisma.organization.create({ data: dto });
      await this.auth.audit(actor, 'system', 'organization', org.id, 'CREATE', dto);
      return org;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('机构编码已存在');
      throw error;
    }
  }
  async enterprises(user: AuthUser, query: PageQueryDto) {
    const where: Prisma.EnterpriseWhereInput = { ...this.enterpriseScope(user), status: query.status, OR: query.q ? [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }, { creditCode: { contains: query.q } }] : undefined };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.enterprise.count({ where }),
      this.prisma.enterprise.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { createdAt: 'desc' }, include: { organization: { select: { name: true } }, _count: { select: { users: true } } } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async createEnterprise(actor: AuthUser, dto: CreateEnterpriseDto) {
    const enterprise = await this.prisma.enterprise.create({ data: dto });
    await this.auth.audit(actor, 'system', 'enterprise', enterprise.id, 'CREATE', dto);
    return enterprise;
  }

  async loginLogs(query: PageQueryDto) {
    const where = { username: query.q ? { contains: query.q } : undefined };
    const [total, items] = await this.prisma.$transaction([this.prisma.loginLog.count({ where }), this.prisma.loginLog.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { createdAt: 'desc' } })]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async auditLogs(query: PageQueryDto) {
    const where = { OR: query.q ? [{ module: { contains: query.q } }, { action: { contains: query.q } }, { objectType: { contains: query.q } }] : undefined };
    const [total, items] = await this.prisma.$transaction([this.prisma.auditLog.count({ where }), this.prisma.auditLog.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { createdAt: 'desc' } })]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
}
