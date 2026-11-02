import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { RegulatoryWorkbenchService, shanghaiDay, summarizeOperations, workbenchRange } from './regulatory-workbench.service';
import { workspaceContext } from '../prisma/workspace-context';

const now = new Date('2026-10-31T15:30:00Z');
const user = (permissions: string[] = []): AuthUser => ({ id: 'user', username: 'test', displayName: '监管人员', portal: 'REGULATORY', accountLevel: 'CITY', organizationId: 'city', enterpriseId: null, scopeOrganizationIds: ['city', 'district'], roles: [], permissions, workspace: { id: 'ws', cityName: '济南市', cityCode: '370100', organizationId: 'city', status: 'ACTIVE', modules: [], validUntil: null } });
function database(): any {
  const model = () => ({ findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) });
  return { vehicle: model(), enterprise: model(), operationRecord: model(), organization: model(), safetyAlert: model(), accident: model(), violation: model(), offlineEvent: model(), admissionApplication: model(), safetyRectificationTask: model(), vehicleLicense: model(), $queryRaw: jest.fn().mockResolvedValue([]) };
}
describe('市级监管工作台统计', () => {
  it('按北京时间确定默认日期及月初，拒绝无效、倒置、过长、未来日期', () => {
    expect(shanghaiDay(new Date('2026-10-30T16:01:00Z'))).toBe('2026-10-31');
    const range = workbenchRange({}, now); expect(range.from).toBe('2026-10-01'); expect(range.to).toBe('2026-10-31'); expect(range.days).toBe(31);
    expect(range.start.toISOString()).toBe('2026-09-30T16:00:00.000Z'); expect(range.endExclusive.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    for (const query of [{ from: '2026-02-30' }, { from: '2026-10-31', to: '2026-10-30' }, { from: '2024-01-01' }, { to: '2026-11-01' }]) expect(() => workbenchRange(query, now)).toThrow();
  });
  it('保留全部日期与零记录日，不把坏里程变成可置信的零，跨企业按原始值汇总再舍入', () => {
    const range = workbenchRange({ from: '2026-10-29', to: '2026-10-31' }, now);
    const result = summarizeOperations([
      { date: '2026-10-29', enterpriseId: 'a', trips: 1n, mileage: 10.24, invalid: 0n },
      { date: '2026-10-29', enterpriseId: 'b', trips: 2n, mileage: 20.24, invalid: 0n },
      { date: '2026-10-31', enterpriseId: 'a', trips: 1n, mileage: 0, invalid: 1n },
    ], range);
    expect(result.trend).toEqual([{ date: '2026-10-29', trips: 3, mileage: 30.5 }, { date: '2026-10-30', trips: 0, mileage: 0 }, { date: '2026-10-31', trips: 1, mileage: null }]);
    expect(result.mileage).toBeNull(); expect(result.qualityIssue).toBe(true); expect(result.trips).toBe(4);
  });
  it('拒绝企业和运维账号；无模块权限时返回不可用，且不查询私有数据', async () => {
    const db = database(), service = new RegulatoryWorkbenchService(db as any);
    await expect(service.overview({ ...user(), portal: 'ENTERPRISE' }, {})).rejects.toThrow(ForbiddenException);
    await expect(service.overview({ ...user(), accountLevel: 'OPERATIONS' }, {})).rejects.toThrow(ForbiddenException);
    const result = await service.overview(user(), {});
    expect(result.fleet).toBeNull(); expect(result.safety).toBeNull(); expect(result.operations).toBeNull(); expect(result.enterprises).toBeNull(); expect(result.reminders.events).toBeNull();
    expect(db.vehicle.findMany).not.toHaveBeenCalled(); expect(db.$queryRaw).not.toHaveBeenCalled(); expect(db.safetyAlert.groupBy).not.toHaveBeenCalled();
  });
  it('车辆分类、厂商及企业统计共用授权范围，离线车辆即使有旧运行状态也不计入运行中', async () => {
    const db = database(), service = new RegulatoryWorkbenchService(db as any);
    db.enterprise.findMany.mockResolvedValue([{ id: 'e', name: '运营企业' }]);
    db.vehicle.findMany.mockResolvedValue([
      { id: 'v1', enterpriseId: 'e', organizationId: 'district', vehicleType: 'DELIVERY', onlineStatus: 'ONLINE', realtimeStatus: { drivingState: 'RUNNING' }, organization: { name: '历城区' }, model: { manufacturer: { id: 'm', name: '厂商', shortName: '厂商' } } },
      { id: 'v2', enterpriseId: 'e', organizationId: 'district', vehicleType: 'NEW_KIND', onlineStatus: 'OFFLINE', realtimeStatus: { drivingState: 'RUNNING' }, organization: { name: '历城区' }, model: null },
    ]);
    const result = await service.overview(user(['archive:vehicle:read', 'archive:enterprise-archive:read']), {});
    expect(db.vehicle.findMany.mock.calls[0][0].where.organizationId.in).toEqual(['city', 'district']);
    expect(result.fleet).toMatchObject({ total: 2, online: 1, running: 1, offline: 1 });
    expect(result.vehicleTypes?.find(row => row.key === 'UNKNOWN')?.value).toBe(1);
    expect(result.manufacturers?.find(row => row.key === 'UNKNOWN')?.name).toBe('未登记厂商');
    expect(result.enterprises?.[0]).toMatchObject({ vehicles: 2, online: 1, running: 1, mileage: null });
  });
  it('安全事件按可读类型去重来源告警，计数包含复核中且临期许可按车辆去重', async () => {
    const db = database(), service = new RegulatoryWorkbenchService(db as any);
    db.safetyAlert.groupBy.mockResolvedValue([{ status: 'PENDING_REVIEW', alertType: 'OVERSPEED', _count: { _all: 2 } }, { status: 'CLOSED', alertType: 'GEOFENCE_EXIT', _count: { _all: 1 } }]);
    db.accident.groupBy.mockResolvedValue([{ status: 'REPORTED', accidentType: 'COLLISION', _count: { _all: 1 } }]);
    db.vehicleLicense.findMany.mockResolvedValue([{ vehicleId: 'v' }, { vehicleId: 'v' }]);
    const result = await service.overview(user(['safety:alert:read', 'safety:accident:read', 'admission:license:read']), {});
    expect(db.safetyAlert.groupBy.mock.calls[0][0].where.accidents.none.organizationId.in).toEqual(['city', 'district']);
    expect(db.safetyAlert.groupBy.mock.calls[0][0].where.violations).toBeUndefined();
    expect(result.safety).toMatchObject({ total: 4, closed: 1, pending: 1, processing: 2, review: 2, closureRate: 25 });
    expect(result.safety?.types.reduce((sum, row) => sum + row.value, 0)).toBe(4); expect(result.reminders.expiringVehicles).toBe(1);
  });
  it('省级指定城市视域同时约束ORM和原生聚合SQL', async () => {
    const db = database(), service = new RegulatoryWorkbenchService(db as any), actor = { ...user(['archive:vehicle:read', 'analytics:operation:read']), accountLevel: 'PROVINCE' };
    await workspaceContext.run({ userId: 'user', accountLevel: 'PROVINCE', workspaceId: null, organizationId: null, organizationIds: ['filtered-city'], enterpriseId: null, permissions: actor.permissions, filteredWorkspaceId: 'selected' }, () => service.overview(actor, {}));
    expect(db.vehicle.findMany.mock.calls[0][0].where.organizationId.in).toEqual(['filtered-city']);
    expect(db.$queryRaw.mock.calls[0][0].values).toContain('filtered-city');
  });
});
