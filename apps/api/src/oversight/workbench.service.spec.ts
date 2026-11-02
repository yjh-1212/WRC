import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorkbenchService } from './workbench.service';
import { AuthUser } from '../auth/auth.types';

describe('Provincial workbench', () => {
  const user = { accountLevel: 'PROVINCE', portal: 'REGULATORY', permissions: ['dashboard:view', 'archive:vehicle:read', 'archive:enterprise-archive:read', 'analytics:operation:read', 'safety:alert:read'] } as AuthUser;
  const city = { id: 'c1', cityCode: '370100', cityName: '济南市', organizationId: 'o1' };
  const record = (id: string, status: string, createdAt = '2026-10-02T00:00:00Z') => ({ id, title: id, status, createdAt: new Date(createdAt), updatedAt: new Date('2026-10-29T01:00:00Z'), dueAt: new Date('2026-10-28T09:00:00Z'), logsJson: '[]', assignments: [{ id: `a-${id}`, workspaceId: 'c1', status: status === 'PENDING_REVIEW' ? 'SUBMITTED' : 'WAITING', submittedAt: null as Date | null, closedAt: null as Date | null }] });
  const prisma = { cityWorkspace: { findMany: jest.fn() }, organization: { findMany: jest.fn() }, provinceMatter: { findMany: jest.fn() }, vehicle: { findMany: jest.fn() }, enterprise: { count: jest.fn() }, safetyAlert: { findMany: jest.fn() } };
  const analysis = { analysis: jest.fn() };
  let service: WorkbenchService;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T02:00:00Z')); jest.clearAllMocks();
    service = new WorkbenchService(prisma as any, analysis as any);
    prisma.cityWorkspace.findMany.mockResolvedValue([city]); prisma.organization.findMany.mockResolvedValue([{ id: 'district1', workspaceId: 'c1' }]);
    prisma.provinceMatter.findMany.mockResolvedValue([record('draft', 'DRAFT'), record('open', 'DISPATCHED'), record('review', 'PENDING_REVIEW'), record('closed', 'CLOSED'), record('old', 'RESPONDING', '2026-09-01T00:00:00Z')]);
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', organizationId: 'o1', onlineStatus: 'ONLINE', realtimeStatus: { drivingState: 'RUNNING', heartbeatAt: new Date('2026-10-29T01:00:00Z') } },
      { id: 'v2', organizationId: 'district1', onlineStatus: 'ONLINE', realtimeStatus: { drivingState: 'IDLE', heartbeatAt: new Date('2026-10-28T01:00:00Z') } },
      { id: 'v3', organizationId: 'o1', onlineStatus: 'OFFLINE', realtimeStatus: null },
    ]); prisma.enterprise.count.mockResolvedValue(2);
    prisma.safetyAlert.findMany.mockResolvedValue([{ id: 's1', status: 'CLOSED', alertType: 'LOW_BATTERY' }, { id: 's2', status: 'PENDING_CONFIRMATION', alertType: 'OFFLINE' }, { id: 's3', status: 'IN_PROGRESS', alertType: 'GEOFENCE_EXIT' }]);
    analysis.analysis.mockResolvedValue({ kpis: { hasRecords: true, mileage: 100, autonomousRate: null, qualityIssue: true }, trend: [{ date: '2026-10-01', current: { hasRecords: false, trips: 0, mileage: null, autonomousRate: null } }], cities: [{ id: 'c1', name: '济南市', mileage: 100 }] });
  });
  afterEach(() => jest.useRealTimers());
  it('partitions monthly statuses while overdue remains a subset and old work remains in reminders', async () => {
    const data = await service.get(user, '2026-10');
    expect(data.matters.total).toBe(4); expect(data.matters.states.reduce((sum, row) => sum + row.value, 0)).toBe(4);
    expect(data.matters.overdue).toBe(2); expect(data.reminders.find(row => row.kind === 'overdue')?.text).toContain('3项');
    expect(data.matters.states.find(row => row.status === 'RESPONDING')?.value).toBe(0);
  });
  it('builds exact fleet partitions and city counts, including district records', async () => {
    const data = await service.get(user, '2026-10');
    expect(data.fleet).toMatchObject({ total: 3, online: 2, onlineRate: 66.7 });
    expect(data.fleet!.states.map(row => row.value)).toEqual([1, 1, 1]); expect(data.cities[0]).toMatchObject({ vehicles: 3, online: 2 });
    expect(prisma.vehicle.findMany.mock.calls[0][0].where.organizationId.in).toEqual(expect.arrayContaining(['o1', 'district1']));
  });
  it('keeps unknown online driving states separate instead of inventing parked vehicles', async () => {
    prisma.vehicle.findMany.mockResolvedValueOnce([{ id: 'v1', organizationId: 'o1', onlineStatus: 'ONLINE', realtimeStatus: null }]);
    const data = await service.get(user, '2026-10'); expect(data.fleet?.states.find(row => row.key === 'OTHER')?.value).toBe(1);
    expect(data.fleet?.states.find(row => row.key === 'PARKED')?.value).toBe(0);
  });
  it('calculates alert closure and grouping from one consistent occurrence cohort', async () => {
    const data = await service.get(user, '2026-10');
    expect(data.safety).toMatchObject({ total: 3, closed: 1, pending: 1, processing: 1, closureRate: 33.3 });
    expect(data.safety!.types.reduce((sum, row) => sum + row.value, 0)).toBe(3);
    const filter = prisma.safetyAlert.findMany.mock.calls[0][0].where.occurredAt;
    expect(filter.gte.toISOString()).toBe('2026-09-30T16:00:00.000Z'); expect(filter.lt.toISOString()).toBe('2026-10-31T16:00:00.000Z');
  });
  it('deduplicates timestamps between flow logs and assignment evidence and keeps future deadlines only', async () => {
    const item = record('flow', 'PENDING_REVIEW'); item.dueAt = new Date('2026-10-31T09:00:00Z'); item.assignments[0].submittedAt = new Date('2026-10-28T02:00:00Z'); item.assignments[0].closedAt = new Date('2026-10-28T04:00:00Z');
    item.logsJson = JSON.stringify([{ action: 'DISPATCH', at: '2026-10-27T16:30:00Z' }, { action: 'SUBMIT', workspaceId: 'c1', at: '2026-10-28T02:00:00.500Z' }, { action: 'CLOSE', workspaceId: 'c1', at: '2026-10-28T04:00:00.500Z' }, { action: 'SUBMIT', workspaceId: 'c1', at: '2026-10-30T01:00:00Z' }]);
    prisma.provinceMatter.findMany.mockResolvedValueOnce([item]); const data = await service.get(user, '2026-10');
    expect(data.calendar.days).toHaveLength(31); expect(data.calendar.days.find(row => row.date === '2026-10-28')).toMatchObject({ dispatch: 1, feedback: 1, review: 1 });
    expect(data.calendar.days.find(row => row.date === '2026-10-30')?.feedback).toBe(0);
    expect(data.calendar.days.find(row => row.date === '2026-10-31')?.due).toBe(1);
  });
  it('does not query unauthorized fleet, enterprise, safety or analysis sources', async () => {
    const data = await service.get({ ...user, permissions: ['dashboard:view'] }, '2026-10');
    expect(data.fleet).toBeNull(); expect(data.enterpriseCount).toBeNull(); expect(data.operations).toBeNull(); expect(data.safety).toBeNull();
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled(); expect(prisma.safetyAlert.findMany).not.toHaveBeenCalled(); expect(analysis.analysis).not.toHaveBeenCalled();
  });
  it('rejects non-provincial or unpermitted identities and malformed month before reading', async () => {
    for (const actor of [{ ...user, accountLevel: 'CITY' }, { ...user, portal: 'ENTERPRISE' }, { ...user, permissions: [] }]) await expect(service.get(actor, '2026-10')).rejects.toThrow(ForbiddenException);
    await expect(service.get(user, '2026-13')).rejects.toThrow(BadRequestException); expect(prisma.cityWorkspace.findMany).not.toHaveBeenCalled();
  });
  it('preserves missing and invalid operation metrics and avoids meaningless zero-percent rates', async () => {
    prisma.vehicle.findMany.mockResolvedValueOnce([]); prisma.safetyAlert.findMany.mockResolvedValueOnce([]);
    const data = await service.get(user, '2026-10'); expect(data.fleet?.onlineRate).toBeNull(); expect(data.safety?.closureRate).toBeNull();
    expect(data.operations?.kpis.autonomousRate).toBeNull(); expect(data.operations?.trend[0].trips).toBeNull();
  });
});
