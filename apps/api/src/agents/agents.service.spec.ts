import { AgentsService } from './agents.service';
import { AgentFactsService } from './facts.service';
import { AuthUser } from '../auth/auth.types';

const user: AuthUser = { id: 'owner', username: 'test', displayName: 'test', portal: 'REGULATORY', enterpriseId: null, organizationId: 'org', accountLevel: 'CITY', workspaceId: 'city', scopeOrganizationIds: ['org'], roles: [], permissions: ['dashboard:view'], authVersion: 1, workspace: { id: 'city', cityCode: '370100', cityName: '济南市', organizationId: 'org', modules: [], status: 'ACTIVE', validUntil: null } };
function fixture() {
  const conversation = { id: 'conv', userId: user.id, workspaceId: user.workspaceId, enterpriseId: null, agentCode: 'GUIDE', title: 'test' };
  const turns: any[] = [];
  const prisma: any = {
    agentConversation: { findFirst: jest.fn(async ({ where }) => where.userId === conversation.userId ? conversation : null), update: jest.fn(async () => conversation), delete: jest.fn() },
    agentTurn: {
      findUnique: jest.fn(async ({ where }) => turns.find(t => t.requestKey === where.conversationId_requestKey.requestKey) ?? null),
      findMany: jest.fn(async ({ where }) => turns.filter(t => !where.status || t.status === where.status)),
      count: jest.fn(async () => turns.length),
      create: jest.fn(async ({ data }) => { const row = { ...data, id: `turn-${turns.length}`, status: 'PENDING', answer: '', error: null }; turns.push(row); return row; }),
      update: jest.fn(async ({ where, data }) => Object.assign(turns.find(t => t.id === where.id), data)),
    },
  };
  const facts: any = { available: () => [{ code: 'GUIDE' }], assert: () => ({ code: 'GUIDE' }), scope: () => 'test', canReadSources: jest.fn(async () => true), read: jest.fn(async () => ({ measuredAt: '2026-10-28T12:00:00Z', scope: 'test', summary: 'test', data: {}, sources: [] })) };
  const model = { answer: jest.fn(async (_q, _f, _h, _s, onText) => { onText('测试回答'); return '测试回答'; }), configured: () => true };
  return { service: new AgentsService(prisma, facts, model as any), prisma, turns, model, facts };
}
const message = { question: '测试问题', requestKey: 'request-key-1' };
const emit = () => undefined;
const signal = () => new AbortController().signal;

describe('Agent conversation lifecycle and privacy', () => {
  it('always binds lookup to the current user, city and enterprise', async () => {
    const f = fixture(); await expect(f.service.detail({ ...user, id: 'other' }, 'conv')).rejects.toThrow('不存在');
    expect(f.prisma.agentConversation.findFirst).toHaveBeenCalledWith({ where: { id: 'conv', userId: 'other', workspaceId: 'city', enterpriseId: null } });
  });
  it('replays completed request keys without another model call or duplicated turn', async () => {
    const f = fixture(); const first = await f.service.send(user, 'conv', message, emit, signal()); const second = await f.service.send(user, 'conv', message, emit, signal());
    expect(first.answer).toBe('测试回答'); expect(second).toEqual(first); expect(f.model.answer).toHaveBeenCalledTimes(1); expect(f.turns).toHaveLength(1);
    await expect(f.service.send(user, 'conv', { ...message, question: '另一个问题' }, emit, signal())).rejects.toThrow('不一致');
  });
  it('redacts stored answers when authorization or record visibility changes', async () => {
    const f = fixture(); await f.service.send(user, 'conv', message, emit, signal());
    const detail = await f.service.detail({ ...user, authVersion: 2 }, 'conv'); expect(detail.turns[0].status).toBe('REDACTED'); expect(detail.turns[0].answer).not.toContain('测试回答'); expect(detail.turns[0].sources).toEqual([]);
    f.facts.canReadSources.mockResolvedValue(false); expect((await f.service.detail(user, 'conv')).turns[0].status).toBe('REDACTED');
  });
  it('stores cancellations and retries in the same turn', async () => {
    const f = fixture(); let started!: () => void; const ready = new Promise<void>(r => started = r);
    f.model.answer.mockImplementationOnce(async (_q, _f, _h, s: AbortSignal) => { started(); return new Promise((_resolve, reject) => s.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); });
    const task = f.service.send(user, 'conv', message, emit, signal()); await ready;
    await expect(f.service.send(user, 'conv', { ...message, requestKey: 'parallel-key' }, emit, signal())).rejects.toThrow('已有回答');
    await expect(f.service.remove(user, 'conv')).rejects.toThrow('请先停止');
    expect(await f.service.cancel(user, 'conv')).toEqual({ cancelled: true }); await expect(task).rejects.toThrow('已停止'); expect(f.turns[0].status).toBe('CANCELLED');
    expect((await f.service.send(user, 'conv', message, emit, signal())).status).toBe('COMPLETED'); expect(f.turns).toHaveLength(1);
  });
  it('allows a failed model request to retry without exposing connection details', async () => {
    const f = fixture(); f.model.answer.mockRejectedValueOnce(new Error('fetch failed ECONNREFUSED'));
    await expect(f.service.send(user, 'conv', message, emit, signal())).rejects.toThrow('暂不可用'); expect(f.turns[0].status).toBe('FAILED');
    await f.service.send(user, 'conv', message, emit, signal()); expect(f.turns).toHaveLength(1);
  });
  it('makes an abandoned pending turn retryable after server restart', async () => {
    const f = fixture(); await f.service.send(user, 'conv', message, emit, signal()); f.turns[0].status = 'PENDING';
    const detail = await f.service.detail(user, 'conv'); expect(detail.turns[0].status).toBe('CANCELLED'); expect(detail.turns[0].error).toContain('中断');
  });
  it('caps conversation size and rejects whitespace-only questions', async () => {
    const f = fixture(); f.prisma.agentTurn.count.mockResolvedValue(100); await expect(f.service.send(user, 'conv', message, emit, signal())).rejects.toThrow('100条');
    await expect(f.service.send(user, 'conv', { ...message, question: '   ' }, emit, signal())).rejects.toThrow('有效字符'); expect(f.model.answer).not.toHaveBeenCalled();
  });
});

describe('Agent capability and fact contracts', () => {
  it('excludes unlicensed modules and operations identities', () => {
    const facts = new AgentFactsService({} as any); expect(facts.available({ ...user, permissions: [...user.permissions, 'archive:vehicle:read'] }).map(a => a.code)).toEqual(['OVERVIEW', 'GUIDE']);
    expect(facts.available({ ...user, accountLevel: 'OPERATIONS' })).toEqual([]); expect(() => facts.assert(user, 'VEHICLE')).toThrow('没有使用');
  });
  it('does not read unlicensed overview metrics even with a permission code', async () => {
    const facts = new AgentFactsService({} as any); const result = await facts.read({ ...user, permissions: ['dashboard:view', 'archive:vehicle:read', 'safety:alert:read'] }, 'OVERVIEW', '汇总'); expect(result.data).toEqual({});
  });
  it('uses current offline city opening flow without private records', async () => {
    const facts = new AgentFactsService({} as any); const result = await facts.read(user, 'GUIDE', '如何开通城市？'); expect(result.data.cityOpening).toContain('地市线下申请'); expect(result.data.cityOpening).toContain('不经过线上申请');
  });
  it('bounds vehicle samples and selects only relevant record fields', async () => {
    const prisma = { vehicle: { count: jest.fn(async () => 20), findMany: jest.fn(async () => []) } }; const facts = new AgentFactsService(prisma as any);
    const allowed = { ...user, permissions: ['archive:vehicle:read'], workspace: { ...user.workspace!, modules: ['ARCHIVES'] } };
    const result = await facts.read(allowed, 'VEHICLE', '查询离线车辆“VEH-001”'); const query = prisma.vehicle.findMany.mock.calls[0] as any;
    expect(result.data.total).toBe(20); expect(query[0].take).toBe(12); expect(query[0].where.onlineStatus).toBe('OFFLINE'); expect(query[0].select).not.toHaveProperty('contactPhone');
  });
  it('allows general conversation only for existing authorized assistant users', async () => {
    const facts = new AgentFactsService({} as any);
    expect(facts.assert(user, 'GENERAL').name).toBe('AI助手');
    expect(() => facts.assert({ ...user, accountLevel: 'OPERATIONS' }, 'GENERAL')).toThrow('没有使用');
    expect(() => facts.assert({ ...user, permissions: [] }, 'GENERAL')).toThrow('没有使用');
    const result = await facts.read(user, 'GENERAL', '如何查询车辆档案和告警？');
    expect(result.data).toHaveProperty('GUIDE'); expect(result.data).not.toHaveProperty('VEHICLE'); expect(result.data).not.toHaveProperty('SAFETY');
    expect(result.data.unavailable).toEqual(['车辆档案查询', '风险事件研判']);
  });
  it('uses only licensed and permitted domains for multi-topic general questions', async () => {
    const prisma = { vehicle: { count: jest.fn(async () => 5), findMany: jest.fn(async () => [{ id: 'v1', name: '测试车', businessNo: 'VEH-001' }]) }, safetyAlert: { count: jest.fn(async () => 1), findMany: jest.fn(async () => []) } };
    const facts = new AgentFactsService(prisma as any);
    const actor = { ...user, permissions: ['dashboard:view', 'archive:vehicle:read', 'safety:alert:read'], workspace: { ...user.workspace!, modules: ['ARCHIVES'] } };
    const result = await facts.read(actor, 'GENERAL', '查询离线车辆和风险告警');
    expect(result.data).toHaveProperty('VEHICLE'); expect(result.data).not.toHaveProperty('SAFETY'); expect(prisma.safetyAlert.count).not.toHaveBeenCalled();
    expect(prisma.vehicle.count.mock.calls[0]).toEqual([{ where: { deletedAt: null, onlineStatus: 'OFFLINE' } }]);
    expect(result.sources).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'v1', kind: 'VEHICLE' })]));
  });
});
