import { BadRequestException, ConflictException, ForbiddenException, GoneException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthUser } from '../auth/auth.types';
import { SaasService } from './saas.service';
import { CreateCityWorkspaceDto } from './dto';

const province = { id: 'province-user', displayName: '省级管理员', portal: 'REGULATORY', accountLevel: 'PROVINCE', organizationId: 'province-org', roles: [{ code: 'SUPER_ADMIN', name: '省级管理员' }], permissions: ['system:organization:read', 'system:organization:update'] } as AuthUser;
const opening: CreateCityWorkspaceDto = { cityCode: '370400', unitName: '枣庄市交通运输局', contactName: '开通联系人', contactPhone: '0531-88001234', adminName: '地市管理员', adminUsername: 'zaozhuang_officer', password: 'City@2026!', modules: ['ARCHIVES', 'SAFETY'], vehicleQuota: 600, offlineReference: '线下授权函 SD-2026-042' };

describe('省级根据线下申请直接开通城市', () => {
  let prisma: any;
  let service: SaasService;
  beforeEach(() => {
    prisma = {
      cityWorkspace: { findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }) => ({ id: 'new-workspace', ...data })) },
      user: { findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }) => ({ id: 'new-admin', username: data.username, displayName: data.displayName, status: data.status })) },
      workspaceInvitation: { findFirst: jest.fn(async () => null) },
      organization: { upsert: jest.fn(async () => ({ id: 'new-org', workspaceId: null })), update: jest.fn(async () => ({})) },
      role: { findUnique: jest.fn(async ({ where }) => ({ id: where.code, code: where.code })) },
      processDefinition: { count: jest.fn(async () => 1) },
      auditLog: { create: jest.fn(async () => ({})) },
      workspaceNotice: { create: jest.fn(async () => ({})) },
    };
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    service = new SaasService(prisma, {} as any);
  });
  it('市级、企业、运维及省级只读人员均不能直接开通', async () => {
    for (const accountLevel of ['CITY', 'ENTERPRISE', 'OPERATIONS']) await expect(service.createWorkspace({ ...province, accountLevel }, opening)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createWorkspace({ ...province, permissions: ['system:organization:read'] }, opening)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('直接创建有效城市和管理员，密码加密且不进入响应或审计日志', async () => {
    const result = await service.createWorkspace(province, opening);
    expect(result.workspace.status).toBe('ACTIVE');
    expect(result.administrator.status).toBe('ACTIVE');
    expect(result.workspace.modules).toEqual(opening.modules);
    expect(result.workspace.quotas).toEqual({ users: 100, vehicles: 600, enterprises: 100 });
    expect(result.workspace.config).toMatchObject({ openingSource: 'OFFLINE', offlineReference: opening.offlineReference });
    const created = prisma.user.create.mock.calls[0][0].data;
    expect(await bcrypt.compare(opening.password, created.passwordHash)).toBe(true);
    expect(created).toMatchObject({ workspaceId: 'new-workspace', organizationId: 'new-org', accountLevel: 'CITY', portal: 'REGULATORY', roles: { create: { roleId: 'CITY_ADMIN_370400' } } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'DIRECT_OPEN' }) }));
    expect(JSON.stringify(result)).not.toContain(opening.password);
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(opening.password);
    expect(prisma.cityApplication).toBeUndefined();
    expect(prisma.workspaceInvitation.create).toBeUndefined();
  });
  it('拒绝重复城市、重复账号和已被有效邀请占用的账号', async () => {
    prisma.cityWorkspace.findUnique.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.createWorkspace(province, opening)).rejects.toBeInstanceOf(ConflictException);
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-user' });
    await expect(service.createWorkspace(province, opening)).rejects.toBeInstanceOf(ConflictException);
    prisma.workspaceInvitation.findFirst.mockResolvedValueOnce({ id: 'pending-invitation' });
    await expect(service.createWorkspace(province, opening)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.cityWorkspace.create).not.toHaveBeenCalled();
  });
  it('拒绝省外城市和已经到期的授权', async () => {
    await expect(service.createWorkspace(province, { ...opening, cityCode: '330100' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createWorkspace(province, { ...opening, validUntil: '2000-01-01T00:00:00Z' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('为新城市复制审批流程，审批角色绑定到本市管理员', async () => {
    prisma.processDefinition.count.mockResolvedValue(0);
    prisma.processDefinition.findMany = jest.fn(async () => [{ businessNo: 'FLOW-001', code: 'FLOW_001', name: '企业准入审批', applicationType: 'ENTERPRISE_ONBOARDING', version: 1, description: '', nodes: [{ nodeCode: 'REVIEW', name: '准入审查', orderNo: 1, timeLimitHours: 24, countersignMode: 'ANY', canReturn: true }] }]);
    prisma.processDefinition.create = jest.fn(async () => ({}));
    await service.createWorkspace(province, opening);
    expect(prisma.processDefinition.create).toHaveBeenCalledWith({ data: expect.objectContaining({ workspaceId: 'new-workspace', nodes: { create: [expect.objectContaining({ approvalRoleCode: 'CITY_ADMIN_370400' })] } }) });
  });
  it('授权变更不再生成线上申请', async () => {
    const city = { ...province, accountLevel: 'CITY', workspaceId: 'existing-workspace', roles: [{ id: 'r', code: 'CITY_ADMIN_370100', name: '管理员' }] } as AuthUser;
    await expect(service.changeRequest(city, { kind: 'RENEW', materialNote: '授权续期线下办理' })).rejects.toBeInstanceOf(GoneException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
