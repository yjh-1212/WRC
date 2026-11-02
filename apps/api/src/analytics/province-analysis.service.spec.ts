import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProvinceAnalysisService } from './province-analysis.service';
import { AuthUser } from '../auth/auth.types';

describe('Province operation analysis', () => {
  const user = { accountLevel: 'PROVINCE', portal: 'REGULATORY', permissions: ['analytics:operation:read', 'analytics:report:export'] } as AuthUser;
  const cities = [{ id: 'c1', cityCode: '370100', cityName: '济南市', organizationId: 'o1' }, { id: 'c2', cityCode: '370200', cityName: '青岛市', organizationId: 'o2' }, { id: 'c3', cityCode: '371300', cityName: '临沂市', organizationId: 'o3' }];
  const make = (id: string, organizationId: string, enterpriseId: string, vehicleId: string, mileage: number, autonomousMiles: number, energyUsed: number, durationMinutes: number, date: string) => ({ id, organizationId, enterpriseId, vehicleId, mileage, autonomousMiles, energyUsed, durationMinutes, startedAt: new Date(date), enterprise: { name: enterpriseId }, vehicle: { name: vehicleId, businessNo: 'VEH-' + vehicleId } });
  const records = [
    make('r0', 'o1', 'e1', 'v1', 20, 20, 4, 60, '2026-10-27T04:00:00Z'),
    make('r1', 'o1', 'e1', 'v1', 10, 9, 2, 60, '2026-10-27T16:30:00Z'),
    make('r2', 'district1', 'e1', 'v1', 30, 27, 3, 120, '2026-10-28T07:00:00Z'),
    make('r3', 'o2', 'e2', 'v2', 60, 30, 6, 180, '2026-10-28T08:00:00Z'),
  ];
  const prisma = { cityWorkspace: { findMany: jest.fn() }, organization: { findMany: jest.fn() }, enterprise: { findFirst: jest.fn(), findMany: jest.fn() }, operationRecord: { findMany: jest.fn() } };
  let service: ProvinceAnalysisService;
  beforeEach(() => {
    jest.clearAllMocks(); service = new ProvinceAnalysisService(prisma as any);
    prisma.cityWorkspace.findMany.mockResolvedValue(cities);
    prisma.organization.findMany.mockResolvedValue([{ id: 'district1', workspaceId: 'c1' }]);
    prisma.operationRecord.findMany.mockResolvedValue(records); prisma.enterprise.findFirst.mockResolvedValue({ id: 'e1' });
    prisma.enterprise.findMany.mockResolvedValue([{ id: 'e1', name: '企业一', organizationId: 'district1' }]);
  });
  it('groups city and district records, deduplicates vehicles and weights ratios using raw sums', async () => {
    const data = await service.analysis(user, { from: '2026-10-28', to: '2026-10-28' });
    expect(data.kpis).toMatchObject({ vehicles: 2, enterprises: 2, trips: 3, mileage: 100, durationHours: 6, energyUsed: 11, energyPer100: 11, autonomousRate: 66 });
    expect(data.cities[0]).toMatchObject({ id: 'c1', vehicles: 1, trips: 2, mileage: 40, autonomousRate: 90 });
    expect(data.cities[1]).toMatchObject({ mileage: 60, autonomousRate: 50 });
    expect(data.cities[2]).toMatchObject({ hasRecords: false, mileage: null, autonomousRate: null, share: null });
    expect(data.scope.citiesWithRecords).toBe(2);
  });
  it('uses Shanghai day boundaries and pairs each day with an equally long previous period', async () => {
    const data = await service.analysis(user, { from: '2026-10-28', to: '2026-10-28' });
    expect(data.period).toMatchObject({ days: 1, previousFrom: '2026-10-27', previousTo: '2026-10-27' });
    expect(data.previousKpis.mileage).toBe(20);
    expect(data.trend[0]).toMatchObject({ date: '2026-10-28', previousDate: '2026-10-27', current: { trips: 3 }, previous: { trips: 1 } });
    const args = prisma.operationRecord.findMany.mock.calls[0][0];
    expect(args.where.startedAt.gte.toISOString()).toBe('2026-10-26T16:00:00.000Z');
    expect(args.where.startedAt.lt.toISOString()).toBe('2026-10-28T16:00:00.000Z');
    expect(args.where.organizationId.in).toEqual(expect.arrayContaining(['o1', 'o2', 'o3', 'district1']));
  });
  it('keeps sparse dates empty rather than declaring missing reports to be zero', async () => {
    const data = await service.analysis(user, { from: '2026-10-01', to: '2026-10-28' });
    expect(data.trend).toHaveLength(28); expect(data.trend[0].current).toMatchObject({ hasRecords: false, mileage: null, durationHours: null });
  });
  it('rejects cross-city enterprise filters and unavailable cities', async () => {
    prisma.enterprise.findFirst.mockResolvedValueOnce(null);
    await expect(service.analysis(user, { workspaceId: 'c1', enterpriseId: 'foreign', from: '2026-10-28', to: '2026-10-28' })).rejects.toThrow(ForbiddenException);
    expect(prisma.enterprise.findFirst.mock.calls[0][0].where.organizationId.in).not.toContain('o2');
    await expect(service.analysis(user, { workspaceId: 'foreign' })).rejects.toThrow(ForbiddenException);
  });
  it('denies city, enterprise and unpermitted identities before reading data', async () => {
    for (const actor of [{ ...user, accountLevel: 'CITY' }, { ...user, portal: 'ENTERPRISE' }, { ...user, permissions: [] }]) await expect(service.options(actor)).rejects.toThrow(ForbiddenException);
    expect(prisma.cityWorkspace.findMany).not.toHaveBeenCalled();
  });
  it('validates inverted and oversized periods', async () => {
    await expect(service.analysis(user, { from: '2026-10-28', to: '2026-10-01' })).rejects.toThrow(BadRequestException);
    await expect(service.analysis(user, { from: '2024-01-01', to: '2026-10-28' })).rejects.toThrow(BadRequestException);
    expect(prisma.operationRecord.findMany).not.toHaveBeenCalled();
  });
  it('suppresses invalid source ratios without changing valid metrics', async () => {
    prisma.operationRecord.findMany.mockResolvedValueOnce([{ ...records[1], autonomousMiles: 30 }]);
    const data = await service.analysis(user, { from: '2026-10-28', to: '2026-10-28' });
    expect(data.kpis).toMatchObject({ mileage: 10, energyUsed: 2, autonomousRate: null, qualityIssue: true });
  });
  it('returns city-linked enterprise options and stable city ordering', async () => {
    const result = await service.options(user);
    expect(result.enterprises[0]).toMatchObject({ id: 'e1', workspaceId: 'c1' });
    expect(prisma.cityWorkspace.findMany.mock.calls[0][0]).toMatchObject({ where: { cityCode: { startsWith: '37' }, status: { in: ['ACTIVE', 'SUSPENDED', 'EXPIRED'] } }, orderBy: { cityCode: 'asc' } });
  });
  it('exports complete filtered results, distinguishes no records and requires export permission', async () => {
    const file = await service.export(user, { from: '2026-10-28', to: '2026-10-28', q: '济南' });
    expect(file.content).toContain('"济南市"'); expect(file.content).not.toContain('"青岛市"');
    expect(file.content).toContain('不受明细检索影响'); expect(file.content).toContain('北京时间');
    await expect(service.export({ ...user, permissions: ['analytics:operation:read'] }, {})).rejects.toThrow(ForbiddenException);
  });
  it('deduplicates the same vehicle across cities in the province total', async () => {
    prisma.operationRecord.findMany.mockResolvedValueOnce(records.map(row => ({ ...row, vehicleId: 'shared-vehicle' })));
    const data = await service.analysis(user, { from: '2026-10-28', to: '2026-10-28' });
    expect(data.kpis.vehicles).toBe(1); expect(data.cities.reduce((sum, city) => sum + city.vehicles, 0)).toBe(2);
  });
});
