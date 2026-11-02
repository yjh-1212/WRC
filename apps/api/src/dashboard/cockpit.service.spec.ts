import { ForbiddenException } from '@nestjs/common';
import { CockpitService } from './cockpit.service';

describe('CockpitService', () => {
  const service = new CockpitService({} as any);

  it('rejects enterprise users from the regulator cockpit', async () => {
    await expect(service.overview({ portal: 'ENTERPRISE', enterpriseId: 'e1', roles: [], permissions: ['dashboard:view'] } as any, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('loads vehicle telemetry and recorded journeys when no order source exists', async () => {
    const time = new Date('2026-10-31T01:00:00Z');
    const point = { longitude: 117.08, latitude: 36.68, speed: 0, heading: 0, recordedAt: time };
    const vehicle = { id: 'v', name: '无人车', businessNo: 'VEH-1', vehicleType: 'DELIVERY', onlineStatus: 'ONLINE', enterpriseId: 'e', organizationId: 'o', enterprise: { id: 'e', name: '运营企业' }, organization: { id: 'o', name: '济南市交通运输局' }, _count: { safetyAlerts: 0 }, realtimeStatus: { ...point, drivingState: 'IDLE', battery: 80, heartbeatAt: time, locationTime: time, mileageToday: 12 } };
    const record = { startAddress: '实际记录起点', endAddress: '实际记录终点', startedAt: time, endedAt: time, mileage: 2, durationMinutes: 8, status: 'COMPLETED', trackPoints: [point] };
    const db: any = {
      vehicle: { findMany: jest.fn().mockResolvedValue([vehicle]), findFirst: jest.fn().mockResolvedValue(vehicle) },
      vehicleOnlineDaily: { findMany: jest.fn().mockResolvedValue([]) }, operationRegion: { findMany: jest.fn().mockResolvedValue([]) },
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'o', name: '济南市交通运输局' }) },
      operationRecord: { findFirst: jest.fn().mockResolvedValue(record) },
      safetyAlert: { count: jest.fn().mockResolvedValue(0) }, accident: { count: jest.fn().mockResolvedValue(0) }, violation: { count: jest.fn().mockResolvedValue(0) }, offlineEvent: { count: jest.fn().mockResolvedValue(0) },
      get deliveryOrder() { throw new Error('Order data is unavailable'); },
    };
    const result = await new CockpitService(db).overview({ portal: 'REGULATORY', accountLevel: 'PROVINCE', roles: [], permissions: [] } as any, { level: 'vehicle', vehicleId: 'v' }, { organizationIds: ['o'], cityOrganizationId: 'o' });
    expect(result.vehicles[0]).toMatchObject({ id: 'v', longitude: 117.08, drivingState: 'IDLE' });
    expect(result.context).not.toHaveProperty('currentOrder'); expect(result.map.items[0]).not.toHaveProperty('hasOrder');
    expect(result.context.latestOperation).toMatchObject({ mileage: 2, durationMinutes: 8 });
    expect(result.context.trip).toMatchObject({ startName: '实际记录起点', endName: '实际记录终点' });
    expect(result.map.operationRegions).toEqual([]);
  });
});
