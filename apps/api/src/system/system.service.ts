import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { isCityAdmin, isProvince, isScopedAdministrator } from '../auth/workspace-access';
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
    if (isProvince(user)) return { accountLevel: { in: ['PROVINCE','OPERATIONS'] } };
    return isProvince(user) || user.workspaceId ? {} : { organizationId: user.organizationId ?? '__none__' };
  }
  private enterpriseScope(user: AuthUser): Prisma.EnterpriseWhereInput {
    if (user.portal === 'ENTERPRISE') return { id: user.enterpriseId ?? '__none__' };
    return isProvince(user) || user.workspaceId ? {} : { organizationId: user.organizationId ?? '__none__' };
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

  private async assertCanManageUser(actor: AuthUser, userId: string) {
    const assignments = await this.prisma.userRole.findMany({ where: { userId }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    if (assignments.some((item) => item.role.code === 'SUPER_ADMIN') && !actor.roles.some((role) => role.code === 'SUPER_ADMIN')) throw new ForbiddenException('当前账号不能维护省级平台管理员');
    if (assignments.some((item) => item.role.permissions.some((entry) => !actor.permissions.includes(entry.permission.code)))) throw new ForbiddenException('不能维护权限高于当前账号的人员');
  }

  async users(user: AuthUser, query: PageQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...this.userScope(user),
      AND: query.enterpriseId ? [{ enterpriseId: query.enterpriseId }] : undefined,
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
      where: { status: 'ACTIVE', portal: user.portal === 'ENTERPRISE' ? 'ENTERPRISE' : undefined, ...(isProvince(user) ? { workspaceId:null } : {}) },
      select: { id: true, code: true, name: true, portal: true, description: true },
      orderBy: { createdAt: 'asc' },
    });
    return { roles };
  }

  async createUser(actor: AuthUser, dto: CreateUserDto) {
    if (isProvince(actor) && dto.portal === 'ENTERPRISE') throw new ForbiddenException('省级不设置企业端，请由所属城市或企业管理成员');
    const portal = actor.portal === 'ENTERPRISE' ? 'ENTERPRISE' : dto.portal;
    if (actor.portal === 'ENTERPRISE' && dto.portal !== 'ENTERPRISE') throw new ForbiddenException('企业管理员只能创建本企业账号');
    const enterpriseId = actor.portal === 'ENTERPRISE' ? actor.enterpriseId : dto.enterpriseId;
    const organizationId = actor.portal === 'ENTERPRISE' ? actor.organizationId : (dto.organizationId ?? actor.organizationId);
    const allowedRoles = await this.prisma.role.findMany({ where: { id: { in: dto.roleIds }, portal } });
    if (allowedRoles.length !== dto.roleIds.length) throw new BadRequestException('角色与门户不匹配');
    if (isProvince(actor) && (enterpriseId || allowedRoles.some((role) => role.workspaceId))) throw new ForbiddenException('省级机关人员只能关联省级角色，企业成员由所属城市管理');
    {
      if (!isProvince(actor) && allowedRoles.some((role) => role.code === 'SUPER_ADMIN' || (role.workspaceId && role.workspaceId !== actor.workspaceId))) throw new ForbiddenException('不能授予省级或其他城市角色');
      if (allowedRoles.some((role) => role.code === 'SUPER_ADMIN') && !actor.roles.some((role) => role.code === 'SUPER_ADMIN')) throw new ForbiddenException('当前账号不能授予省级平台管理员角色');
      const assigned = await this.prisma.rolePermission.findMany({ where: { roleId: { in: dto.roleIds } }, include: { permission: true } });
      if (assigned.some((item) => !actor.permissions.includes(item.permission.code))) throw new ForbiddenException('授予的权限不能超过当前账号可委派范围');
    }
    const org = organizationId ? await this.prisma.organization.findUnique({ where: { id: organizationId } }) : null;
    if (!org) throw new ForbiddenException('请选择有效的所属机构');
    if (isProvince(actor) && org.workspaceId) throw new ForbiddenException('属地成员请通过城市管理或由市级管理员维护');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const created = await this.prisma.user.create({
        data: { username: dto.username, passwordHash, displayName: dto.displayName, email: dto.email, phone: dto.phone, portal, organizationId, enterpriseId,
          workspaceId: org.workspaceId, accountLevel: portal === 'ENTERPRISE' ? 'ENTERPRISE' : isProvince(actor) ? 'PROVINCE' : 'CITY', roles: { create: dto.roleIds.map((roleId) => ({ roleId })) } },
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
    await this.assertCanManageUser(actor, id);
    if (isProvince(actor) && dto.organizationId) {
      const organization = await this.prisma.organization.findUnique({ where: { id:dto.organizationId } });
      if (!organization || organization.workspaceId) throw new ForbiddenException('省级机关人员不能移至市级工作空间');
    }
    const administrator = await this.prisma.userRole.findFirst({ where: { userId: id, role: { code: { startsWith: 'CITY_ADMIN' } } } });
    if (administrator && (dto.roleIds || dto.organizationId || dto.enterpriseId)) throw new BadRequestException('市级管理员职责变更请在本市平台管理中办理交接');
    if (actor.portal === 'ENTERPRISE' && dto.enterpriseId && dto.enterpriseId !== actor.enterpriseId) throw new ForbiddenException('不能把账号移动到其他企业');
    if (actor.portal === 'ENTERPRISE') await this.assertKeepEnterpriseAdmin(target.enterpriseId, id, dto.roleIds);
    const { roleIds, ...rest } = dto;
    const data = actor.portal === 'ENTERPRISE' ? { displayName: rest.displayName, email: rest.email, phone: rest.phone } : rest;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      if (roleIds) {
        const roles = await tx.role.findMany({ where: { id: { in: roleIds }, portal: target.portal } });
        if (roles.length !== roleIds.length) throw new BadRequestException('角色与用户门户不匹配');
        if (isProvince(actor) && roles.some((role) => role.workspaceId)) throw new ForbiddenException('省级机关人员不能授予市级业务角色');
        {
          if (!isProvince(actor) && roles.some((role) => role.code === 'SUPER_ADMIN' || (role.workspaceId && role.workspaceId !== actor.workspaceId))) throw new ForbiddenException('不能授予上级或其他城市角色');
          if (roles.some((role) => role.code === 'SUPER_ADMIN') && !actor.roles.some((role) => role.code === 'SUPER_ADMIN')) throw new ForbiddenException('当前账号不能授予省级平台管理员角色');
          const assignments = await tx.rolePermission.findMany({ where: { roleId: { in: roleIds } }, include: { permission: true } });
          if (assignments.some((item) => !actor.permissions.includes(item.permission.code))) throw new ForbiddenException('不能授予超出当前账号范围的权限');
        }
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      await tx.user.update({ where: { id }, data: { authVersion: { increment: 1 } } });
    });
    await this.auth.audit(actor, 'system', 'user', id, 'UPDATE', data);
    return { id, updated: true };
  }

  async setUserStatus(actor: AuthUser, id: string, status: string) {
    if (actor.id === id && status === 'INACTIVE') throw new BadRequestException('不能停用当前登录账号');
    const target = await this.prisma.user.findFirst({ where: { id, ...this.userScope(actor) } });
    if (!target) throw new NotFoundException('用户不存在或不在当前数据范围内');
    await this.assertCanManageUser(actor, id);
    if (status !== 'ACTIVE' && await this.prisma.userRole.findFirst({ where: { userId: id, role: { code: { startsWith: 'CITY_ADMIN' } } } })) throw new BadRequestException('请在本市平台管理中办理管理员停用或交接');
    if (status === 'INACTIVE') await this.assertKeepEnterpriseAdmin(target.enterpriseId, id, undefined, status);
    await this.prisma.user.update({ where: { id }, data: { status, authVersion: { increment: 1 } } });
    if (status === 'INACTIVE') await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.auth.audit(actor, 'system', 'user', id, status === 'ACTIVE' ? 'ENABLE' : 'DISABLE');
    return { id, status };
  }

  async resetPassword(actor: AuthUser, id: string, password: string) {
    const target = await this.prisma.user.findFirst({ where: { id, ...this.userScope(actor) } });
    if (!target) throw new NotFoundException('用户不存在或不在当前数据范围内');
    await this.assertCanManageUser(actor, id);
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash, authVersion: { increment: 1 } } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.auth.audit(actor, 'system', 'user', id, 'RESET_PASSWORD');
    return { id, reset: true };
  }

  private isSuperAdmin(user: AuthUser) {
    return isScopedAdministrator(user);
  }

  async roles(user: AuthUser) {
    return this.prisma.role.findMany({ where: { portal: user.portal === 'ENTERPRISE' ? 'ENTERPRISE' : undefined, ...(isProvince(user) ? { workspaceId:null } : {}) }, orderBy: { createdAt: 'asc' }, include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } } });
  }
  permissions() { return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }); }
  async createRole(actor: AuthUser, dto: CreateRoleDto) {
    if (!this.isSuperAdmin(actor)) throw new ForbiddenException('只有超级管理员可以新增角色');
    if (dto.code.toUpperCase() === 'SUPER_ADMIN') throw new BadRequestException('不能新增超级管理员角色');
    const payload = { ...dto, code: `${dto.code.toUpperCase()}${isProvince(actor) ? '' : `_${actor.workspaceId}`}`, workspaceId: isProvince(actor) ? null : actor.workspaceId };
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
    if (isProvince(actor) && role.workspaceId) throw new ForbiddenException('市级业务角色由本市管理员在已授权范围内维护');
    if (/^CITY_ADMIN(?:_|$)/.test(role.code)) throw new ForbiddenException('市级管理员基础角色由开通模板统一维护');
    if (!isProvince(actor) && role.workspaceId !== actor.workspaceId) throw new ForbiddenException('共享角色和其他城市角色不能在此修改');
    if (actor.portal === 'ENTERPRISE' || role.code === 'SUPER_ADMIN') throw new ForbiddenException('当前角色不允许在此处授权');
    if (role.portal === 'ENTERPRISE' && !this.isSuperAdmin(actor)) throw new ForbiddenException('企业角色仅超级管理员可调整权限');
    const requestedPermissions = await this.prisma.permission.findMany({ where: { id: { in: permissionIds } } });
    if (requestedPermissions.length !== new Set(permissionIds).size) throw new BadRequestException('权限点不存在或超出可授权范围');
    if (requestedPermissions.some((permission) => !actor.permissions.includes(permission.code))) throw new ForbiddenException('授予的权限不能超过当前账号可委派的范围');
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
      if (isProvince(actor) && parent.workspaceId) throw new ForbiddenException('市级内部机构由本市管理员维护');
    }
    try {
      const org = await this.prisma.organization.create({ data: { ...dto, parentId: dto.parentId ?? actor.organizationId, workspaceId: actor.workspaceId } });
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
    if (isProvince(actor)) throw new ForbiddenException('企业属地登记由市级办理，省级通过综合查询和协同督办开展监管');
    if (actor.portal !== 'REGULATORY' || actor.accountLevel !== 'CITY' || !actor.workspaceId) throw new ForbiddenException('仅市级监管人员可以登记属地企业');
    const organization = await this.prisma.organization.findFirst({ where: {
      id: dto.organizationId, workspaceId: actor.workspaceId,
      ...(isCityAdmin(actor) ? {} : { AND: [{ id: { in: actor.scopeOrganizationIds ?? [actor.organizationId ?? '__none__'] } }] }),
    } });
    if (!organization) throw new ForbiddenException('监管机构不在当前属地管理范围内');
    try {
      const enterprise = await this.prisma.enterprise.create({ data: dto });
      await this.auth.audit(actor, 'system', 'enterprise', enterprise.id, 'CREATE', dto);
      return enterprise;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('企业编号或统一社会信用代码已存在');
      throw error;
    }
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
