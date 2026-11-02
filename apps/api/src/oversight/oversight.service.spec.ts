import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { OversightQueryDto, ResourceQueryDto } from './dto';
import { OversightService } from './oversight.service';

const actor = (overrides: Record<string, unknown> = {}) => ({ id: 'province-user', username: 'province_user', displayName: '省级监管人员', portal: 'REGULATORY', organizationId: 'province-org', enterpriseId: null, accountLevel: 'PROVINCE', permissions: ['dashboard:view', 'system:organization:read', 'system:organization:update'], roles: [], ...overrides } as AuthUser);
const city = (overrides: Record<string, unknown> = {}) => actor({ id: 'city-user', accountLevel: 'CITY', workspaceId: 'jinan', roles: [{ code: 'CITY_ADMIN_370100' }], ...overrides });
const matter = (overrides: Record<string, unknown> = {}) => ({ id: 'matter-1', businessNo: 'SD-1', kind: 'CROSS_CITY', title: '跨市档案核验', description: '核对各地市档案及许可条件', level: 'MEDIUM', status: 'DISPATCHED', dueAt: new Date(Date.now() + 86400000), resourceIdsJson: '["qingdao-private-resource"]', logsJson: '[]', assignments: [{ id: 'assignment-1', workspaceId: 'jinan', status: 'WAITING' }, { id: 'assignment-2', workspaceId: 'qingdao', status: 'WAITING' }], ...overrides });

describe('省市协同权限与状态', () => {
  let prisma: any; let service: OversightService; let auth: any;
  beforeEach(() => {
    prisma = { $transaction: jest.fn(async (callback: any) => typeof callback === 'function' ? callback(prisma) : Promise.all(callback)) };
    auth = { audit: jest.fn(async () => undefined) }; service = new OversightService(prisma, auth);
  });
  it('企业与运维身份不能通过city-tasks读取或办理省级事项', async () => {
    for (const user of [city({ portal: 'ENTERPRISE', accountLevel: 'ENTERPRISE' }), city({ accountLevel: 'OPERATIONS' })]) {
      await expect(service.cityTasks(user, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.actCityTask(user, 'assignment-1', { action: 'RESPOND' })).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('省级只读人员不能创建、派发或发布评价', async () => {
    const readonly = actor({ permissions: ['dashboard:view', 'system:organization:read'] });
    await expect(service.createMatter(readonly, {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.actMatter(readonly, 'matter-1', { action: 'DISPATCH', comment: '派发办理' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.publishEvaluation(readonly, 'evaluation-1', { conclusion: '评价结果予以发布' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('省级不能代替属地响应，市级只读人员不能提交反馈', async () => {
    await expect(service.actCityTask(actor(), 'assignment-1', { action: 'RESPOND' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.actCityTask(city({ roles: [], permissions: ['safety:alert:read'] }), 'assignment-1', { action: 'SUBMIT', feedback: '核查反馈已完成' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('市级详情不会返回其他城市的反馈、联系人和资源', async () => {
    const logsJson = JSON.stringify([{ action: 'DISPATCH', comment: '分派属地办理', actorId: 'private-province-id' }, { action: 'SUBMIT', workspaceId: 'qingdao', comment: '青岛私人联系人及反馈' }, { action: 'SUBMIT', workspaceId: 'jinan', comment: '济南已核查' }]);
    prisma.provinceAssignment = { findFirst: jest.fn(async () => ({ id: 'assignment-1', workspaceId: 'jinan', status: 'PROCESSING', matter: matter({ logsJson }) })) };
    const result = await service.cityTask(city(), 'assignment-1');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('青岛私人'); expect(serialized).not.toContain('qingdao-private-resource'); expect(serialized).not.toContain('assignment-2'); expect(serialized).not.toContain('private-province-id');
    expect(result.matter.logs).toHaveLength(2);
  });
  it('替换其他城市assignmentId时返回不存在', async () => {
    prisma.provinceAssignment = { findFirst: jest.fn(async () => null) };
    await expect(service.cityTask(city(), 'qingdao-assignment')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.provinceAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'jinan' }) }));
  });
  it('不能直接办结没有反馈的地市', async () => {
    prisma.provinceMatter = { findUnique: jest.fn(async () => matter()), update: jest.fn() };
    await expect(service.actMatter(actor(), 'matter-1', { action: 'CLOSE', comment: '复核后办结' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.provinceMatter.update).not.toHaveBeenCalled();
  });
  it('单城市不能创建跨市协同事项', async () => {
    await expect(service.createMatter(actor(), { kind: 'CROSS_CITY', title: '跨市事项', description: '核对跨市运营档案', level: 'MEDIUM', workspaceIds: ['jinan'] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('本市提交后仍有其他城市等待时不能提前进入省级待复核', async () => {
    const item = { id: 'assignment-1', workspaceId: 'jinan', matterId: 'matter-1', status: 'PROCESSING', matter: matter() };
    prisma.provinceAssignment = { findFirst: jest.fn().mockResolvedValueOnce({ matterId: 'matter-1' }).mockResolvedValueOnce(item).mockResolvedValueOnce({ ...item, status: 'SUBMITTED' }), update: jest.fn(async () => ({})) };
    prisma.$queryRaw = jest.fn(async () => [{ status: 'WAITING' }, { status: 'SUBMITTED' }]);
    prisma.provinceMatter = { update: jest.fn(async () => ({})) };
    prisma.workspaceNotice = { create: jest.fn(async () => ({})) };
    await service.actCityTask(city(), 'assignment-1', { action: 'SUBMIT', feedback: '本市已完成核查，资料有效' });
    expect(prisma.provinceMatter.update.mock.calls[0][0].data.status).toBe('RESPONDING');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('已发布评价不会被重新生成覆盖', async () => {
    prisma.cityWorkspace = { findMany: jest.fn(async () => [{ id: 'jinan', cityCode: '370100', cityName: '济南市', status: 'ACTIVE' }]) };
    prisma.provinceDutyEvaluation = { findUnique: jest.fn(async () => ({ id: 'published', status: 'PUBLISHED' })), update: jest.fn(), upsert: jest.fn() };
    const result = await service.generateEvaluations(actor(), { period: '2026-01' });
    expect(result.generated).toBe(0); expect(result.skipped).toBe(1); expect(prisma.provinceDutyEvaluation.update).not.toHaveBeenCalled(); expect(prisma.provinceDutyEvaluation.upsert).not.toHaveBeenCalled();
  });
  it('试点不能从准备阶段直接跳至运营阶段', async () => {
    prisma.cityWorkspace = { findUnique: jest.fn(async () => ({ id: 'jinan' })) };
    prisma.provincePilot = { findUnique: jest.fn(async () => ({ id: 'pilot-1', stage: 'PREPARING' })), upsert: jest.fn() };
    await expect(service.upsertPilot(actor(), { workspaceId: 'jinan', stage: 'OPERATING', responsibleName: '责任人员', summary: '直接跳转运营阶段' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.provincePilot.upsert).not.toHaveBeenCalled();
  });
  it('任务占用资源不能被直接改为可用或迁至其他城市', async () => {
    prisma.provinceResource = { findUnique: jest.fn(async () => ({ id: 'resource-1', workspaceId: 'jinan', status: 'BUSY' })), update: jest.fn() };
    prisma.provinceMatter = { count: jest.fn(async () => 1) };
    await expect(service.updateResource(actor(), 'resource-1', { status: 'AVAILABLE' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.provinceResource.update).not.toHaveBeenCalled();
  });
  it('资源kind与事项kind分别验证，不让资源类型下拉误报400', async () => {
    expect(await validate(Object.assign(new ResourceQueryDto(), { kind: 'VEHICLE' }))).toHaveLength(0);
    expect((await validate(Object.assign(new OversightQueryDto(), { kind: 'VEHICLE' })))).not.toHaveLength(0);
  });
});
