import { BadRequestException, ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SaasService } from './saas.service';
import { AuthUser } from '../auth/auth.types';

const actor = (overrides = {}) => ({ id: 'city-admin', username: 'jinan_admin', displayName: '济南管理员', portal: 'REGULATORY', organizationId: 'org-jinan', enterpriseId: null, roles: [{ id: 'admin-role', code: 'CITY_ADMIN_370100', name: '济南市管理员' }], permissions: ['system:organization:read', 'system:organization:update', 'dashboard:view'], workspaceId: 'ws-jinan', accountLevel: 'CITY', ...overrides } as AuthUser);

describe('省市开通与城市管理边界', () => {
  let prisma: any;
  let service: SaasService;
  let auth: any;
  beforeEach(() => {
    prisma = {};
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    auth = { audit: jest.fn(async () => undefined) };
    service = new SaasService(prisma, auth);
  });
  it('市级及运维账号不能访问省级申请列表', async () => {
    await expect(service.applications(actor(), { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.workspaces(actor({ accountLevel: 'OPERATIONS' }), { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('普通工作人员不能管理本市成员', async () => {
    await expect(service.members(actor({ roles: [{ code: 'CITY_USER_370100' }] }))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('省级只读人员不能审批开通、修改授权或恢复管理员', async () => {
    const reader = actor({ accountLevel: 'PROVINCE', permissions: ['dashboard:view', 'system:organization:read'] });
    await expect(service.review(reader, 'app-1', { action: 'APPROVE', comment: '同意开通' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateWorkspace(reader, 'ws-jinan', { modules: ['SAFETY'], reason: '修改授权' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.recoverAdmin(reader, 'ws-jinan', { username: 'new_admin', displayName: '新管理员', roleCode: 'CITY_ADMIN', reason: '单位授权函核验通过' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('无效申请查询凭证不返回申请信息或查询开通任务', async () => {
    prisma.cityApplication = { findUnique: jest.fn(async () => ({ id: 'apply-1', trackingHash: createHash('sha256').update('correct-secret').digest('hex') })) };
    prisma.provisionJob = { findUnique: jest.fn() };
    await expect(service.track({ businessNo: 'CITY-1', trackingSecret: 'wrong-secret' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.provisionJob.findUnique).not.toHaveBeenCalled();
  });
  it('停用线上申请，不产生新的待审核记录', async () => {
    prisma.cityWorkspace = { findUnique: jest.fn(async () => ({ id: 'existing-workspace' })) };
    prisma.cityApplication = { create: jest.fn() };
    await expect(service.apply({ cityCode: '370100', unitName: '济南市交通运输局', contactName: '联系人', contactPhone: '053112345678', adminName: '管理员', adminUsername: 'jinan_officer', modules: ['SAFETY'], expectedVehicles: 100, materialNote: '单位授权材料编号：济交运20261028' })).rejects.toBeInstanceOf(GoneException);
    expect(prisma.cityApplication.create).not.toHaveBeenCalled();
  });
  it('驳回后的申请不能执行开通任务', async () => {
    prisma.cityApplication = { findUnique: jest.fn(async () => ({ id: 'app-1', status: 'REJECTED' })) };
    await expect(service.provision(actor({ accountLevel: 'PROVINCE' }), 'app-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('最后一位有效管理员不能被停用或降级', async () => {
    prisma.user = { findFirst: jest.fn(async () => ({ id: 'last-admin', roles: [{ role: { code: 'CITY_ADMIN_370100' } }] })), count: jest.fn(async () => 0), update: jest.fn() };
    await expect(service.updateMember(actor(), 'last-admin', { status: 'DISABLED' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateMember(actor(), 'last-admin', { roleCode: 'CITY_USER' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('管理员交接拒绝本人和其他城市成员', async () => {
    await expect(service.transferAdmin(actor(), 'city-admin')).rejects.toBeInstanceOf(BadRequestException);
    prisma.user = { findFirst: jest.fn(async () => null) };
    await expect(service.transferAdmin(actor(), 'qingdao-user')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('邀请不能占用其他城市已经存在的账号', async () => {
    prisma.cityWorkspace = { findUnique: jest.fn(async () => ({ id: 'ws-jinan', cityCode: '370100' })) };
    prisma.user = { findUnique: jest.fn(async () => ({ workspaceId: 'ws-qingdao' })) };
    prisma.workspaceInvitation = { create: jest.fn() };
    await expect(service.invite(actor({ accountLevel: 'PROVINCE' }), 'ws-jinan', { username: 'qingdao_user', displayName: '青岛工作人员', roleCode: 'CITY_ADMIN' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.workspaceInvitation.create).not.toHaveBeenCalled();
  });
  it('清除截止时间必须实际写入null且撤回现有会话权限', async () => {
    const workspace = { id: 'ws-jinan', cityCode: '370100', modulesJson: '["SAFETY"]', quotasJson: '{}', configJson: '{}', validUntil: new Date('2030-01-01') };
    prisma.cityWorkspace = { findUnique: jest.fn(async () => workspace), update: jest.fn(async ({ data }) => ({ ...workspace, ...data })) };
    prisma.user = { updateMany: jest.fn(async () => ({ count: 2 })) };
    prisma.workspaceNotice = { create: jest.fn(async () => ({})) };
    const result = await service.updateWorkspace(actor({ accountLevel: 'PROVINCE' }), 'ws-jinan', { validUntil: null, reason: '调整为长期授权' });
    expect(result.validUntil).toBeNull();
    expect(prisma.cityWorkspace.update.mock.calls[0][0].data.validUntil).toBeNull();
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { authVersion: { increment: 1 } } }));
    expect(auth.audit).toHaveBeenCalled();
  });
  it('材料内容、扩展名和MIME不一致时拒绝保存', () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF');
    expect(() => (service as any).identifyMaterial({ originalname: 'permit.pdf', mimetype: 'application/pdf', size: 13, buffer: Buffer.from('<html></html>') })).toThrow(BadRequestException);
    expect(() => (service as any).identifyMaterial({ originalname: 'permit.html', mimetype: 'application/pdf', size: pdf.length, buffer: pdf })).toThrow(BadRequestException);
    expect(() => (service as any).identifyMaterial({ originalname: 'permit.pdf', mimetype: 'text/html', size: pdf.length, buffer: pdf })).toThrow(BadRequestException);
  });
  it('材料文件超过2MB时拒绝保存', () => {
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    expect(() => (service as any).identifyMaterial({ originalname: 'permit.pdf', mimetype: 'application/pdf', size: buffer.length, buffer })).toThrow(BadRequestException);
  });
  it('合法PDF保留摘要且清除文件名中的路径字符', () => {
    const buffer = Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF');
    const material = (service as any).identifyMaterial({ originalname: '../permit.pdf', mimetype: 'application/pdf', size: buffer.length, buffer });
    expect(material.mimeType).toBe('application/pdf');
    expect(material.originalName).not.toContain('/');
    expect(material.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('市级不能使用省级材料下载接口', async () => {
    await expect(service.downloadMaterial(actor(), 'another-app', 'another-material')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('普通邀请不能重置已激活的成员密码', async () => {
    prisma.cityWorkspace = { findUnique: jest.fn(async () => ({ id: 'ws-jinan', cityCode: '370100' })) };
    prisma.user = { findUnique: jest.fn(async () => ({ workspaceId: 'ws-jinan', portal: 'REGULATORY', accountLevel: 'CITY', status: 'ACTIVE' })) };
    prisma.workspaceInvitation = { create: jest.fn() };
    await expect(service.invite(actor({ accountLevel: 'PROVINCE' }), 'ws-jinan', { username: 'existing_user', displayName: '已激活成员', roleCode: 'CITY_ADMIN' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workspaceInvitation.create).not.toHaveBeenCalled();
  });
});
