import { ProvinceCockpitService } from './province-cockpit.service';
import { AuthUser } from '../auth/auth.types';

const user = { accountLevel: 'PROVINCE', portal: 'REGULATORY', permissions: ['dashboard:view'] } as AuthUser;
function fixture() {
  const prisma = {
    cockpitRegion: { findMany: jest.fn(async () => [{ code: '370100', name: '济南市', longitude: 117, latitude: 36.7 }, { code: '370200', name: '青岛市', longitude: 120.3, latitude: 36.1 }]) },
    cityWorkspace: { findMany: jest.fn(async () => [{ id: 'w1', cityCode: '370100', cityName: '济南市', status: 'ACTIVE', organizationId: 'o1' }]) },
    organization: { findMany: jest.fn(async () => [{ id: 'o1', workspaceId: 'w1' }, { id: 'o2', workspaceId: 'w1' }]) },
    vehicle: { groupBy: jest.fn(async () => [
      { organizationId: 'o1', vehicleType: 'DELIVERY', onlineStatus: 'ONLINE', _count: { id: 3 } },
      { organizationId: 'o2', vehicleType: 'DELIVERY', onlineStatus: 'OFFLINE', _count: { id: 2 } },
      { organizationId: 'o2', vehicleType: 'NEW_TYPE', onlineStatus: 'ONLINE', _count: { id: 1 } },
    ]) },
    enterprise: { groupBy: jest.fn(async () => [{ organizationId: 'o1', _count: { id: 2 } }]) },
    safetyAlert: { groupBy: jest.fn(async () => [{ organizationId: 'o1', level: 'HIGH', _count: { id: 3 } }, { organizationId: 'o2', level: 'LOW', _count: { id: 1 } }]), count: jest.fn(async () => 1), findMany: jest.fn(async () => []) },
    vehicleRealtimeStatus: { count: jest.fn(async () => 2), aggregate: jest.fn(async () => ({ _sum: { mileageToday: null as number | null }, _max: { heartbeatAt: null } })) },
    provinceMatter: { groupBy: jest.fn(async () => [{ status: 'CLOSED', _count: { id: 2 } }, { status: 'RESPONDING', _count: { id: 3 } }]), count: jest.fn(async () => 1), findMany: jest.fn(async () => []) },
  };
  return { prisma, service: new ProvinceCockpitService(prisma as any) };
}
describe('Province cockpit business totals and access', () => {
  it('rejects every non-province or non-regulatory identity before querying data', async () => {
    const f = fixture();
    for (const actor of [{ ...user, accountLevel: 'CITY' }, { ...user, accountLevel: 'ENTERPRISE' }, { ...user, portal: 'ENTERPRISE' }, { ...user, permissions: [] }]) await expect(f.service.overview(actor, {})).rejects.toThrow('仅省级');
    expect(f.prisma.cockpitRegion.findMany).not.toHaveBeenCalled();
  });
  it('counts unknown vehicle types as other and derives rates from the same cohort', async () => {
    const f = fixture(); const result = await f.service.overview(user, {});
    expect(result.summary).toMatchObject({ registered: 6, online: 4, offline: 2, onlineRate: 66.7, enterprises: 2, mileageToday: null });
    expect(result.usage.find(row => row.code === 'OTHER')?.count).toBe(1); expect(result.usage.reduce((sum, row) => sum + row.count, 0)).toBe(6);
    expect(result.risks).toMatchObject({ total: 4, high: 3 }); expect(result.collaboration).toMatchObject({ total: 5, closed: 2, open: 3, completionRate: 40 });
    expect(result.coverage).toEqual({ connected: 1, total: 2 }); expect(result.cities[1].connected).toBe(false);
    expect(f.prisma.vehicle.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: { in: ['o1', 'o2'] }, deletedAt: null } }));
  });
  it('uses Beijing day boundaries instead of the server local timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T16:10:00Z'));
    try { const f = fixture(); await f.service.overview(user, {}); expect(f.prisma.safetyAlert.count).toHaveBeenCalledWith({ where: { organizationId: { in: ['o1', 'o2'] }, occurredAt: { gte: new Date('2026-10-28T16:00:00Z'), lte: new Date('2026-10-28T16:10:00Z') } } }); }
    finally { jest.useRealTimers(); }
  });
  it('rejects region codes outside the provincial region inventory', async () => {
    const f = fixture(); await expect(f.service.overview(user, { cityCode: '379999' })).rejects.toThrow('有效的山东省地市'); expect(f.prisma.vehicle.groupBy).not.toHaveBeenCalled();
  });
  it('handles an opened city with no registered vehicles without invalid rates', async () => {
    const f = fixture(); f.prisma.vehicle.groupBy.mockResolvedValue([]); const result = await f.service.overview(user, {}); expect(result.summary.onlineRate).toBe(0); expect(result.usage.every(row => row.percentage === 0)).toBe(true);
  });
});
