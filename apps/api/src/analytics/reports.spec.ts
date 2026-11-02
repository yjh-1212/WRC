import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AuthUser } from '../auth/auth.types';
import { ReportQueryDto } from './dto';

describe('Regulatory report snapshots', () => {
  const province = { id: 'admin', displayName: '省级管理员', accountLevel: 'PROVINCE', portal: 'REGULATORY', organizationId: 'province', roles: [], permissions: [] } as unknown as AuthUser;
  const city = { ...province, accountLevel: 'CITY', organizationId: 'city', scopeOrganizationIds: ['city', 'district'] } as AuthUser;
  const snapshot = { operations: { kpis: { vehicles: 2, trips: 3, mileage: 100, durationHours: 8, autonomousRate: 96, energyUsed: 15 }, trend: [{ date: '2026-09-01', mileage: 100 }] } };
  const record = { id: 'r1', organizationId: 'province', organization: { id: 'province', name: '省级单位' }, businessNo: 'RPT-1', title: '运行报告', reportType: 'MONTHLY', category: 'OPERATIONS', status: 'GENERATED', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30'), generatedAt: new Date('2026-10-01'), generatedByName: '省级管理员', summaryJson: JSON.stringify(snapshot) };
  const prisma = {
    $transaction: jest.fn((calls: Promise<unknown>[]) => Promise.all(calls)),
    regulatoryReport: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    organization: { findMany: jest.fn() }, enterprise: { findMany: jest.fn() },
  };
  const auth = { audit: jest.fn() };
  let service: AnalyticsService;
  beforeEach(() => {
    jest.clearAllMocks(); service = new AnalyticsService(prisma as any, auth as any);
    prisma.regulatoryReport.count.mockResolvedValue(25); prisma.regulatoryReport.findMany.mockResolvedValue([]);
    prisma.regulatoryReport.findFirst.mockResolvedValue(record); prisma.regulatoryReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.regulatoryReport.create.mockImplementation(async ({ data }) => ({ id: 'new-report', ...data }));
  });
  it('combines city scope with filters, paginates and applies Shanghai day boundaries', async () => {
    await service.reports(city, Object.assign(new ReportQueryDto(), { page: 2, pageSize: 10, organizationId: 'district', reportType: 'WEEKLY', type: 'SAFETY', status: 'GENERATED', generatedFrom: '2026-10-01', generatedTo: '2026-10-29', q: '报告' }));
    const args = prisma.regulatoryReport.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10); expect(args.take).toBe(10);
    expect(args.where.AND[0]).toHaveProperty('organization');
    expect(args.where.AND[1]).toMatchObject({ organizationId: 'district', reportType: 'WEEKLY', category: 'SAFETY' });
    expect(args.where.AND[1].generatedAt.gte.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(args.where.AND[1].generatedAt.lte.toISOString()).toBe('2026-10-29T15:59:59.999Z');
    expect(args.select.summaryJson).toBeUndefined();
  });
  it('rejects an inverted generation-date filter', async () => {
    await expect(service.reports(province, Object.assign(new ReportQueryDto(), { generatedFrom: '2026-10-29', generatedTo: '2026-10-01' }))).rejects.toThrow(BadRequestException);
  });
  it('reads stored snapshots without recalculating live analytics', async () => {
    const operation = jest.spyOn(service, 'operationAnalysis'); const safety = jest.spyOn(service, 'safetyAnalysis');
    const result = await service.report(province, 'r1');
    expect(result.summary).toEqual(snapshot); expect(result.summaryJson).toBeUndefined();
    expect(operation).not.toHaveBeenCalled(); expect(safety).not.toHaveBeenCalled();
  });
  it('creates only the selected category and rejects province enterprise reports', async () => {
    jest.spyOn(service, 'operationAnalysis').mockResolvedValue(snapshot.operations as any);
    const safety = jest.spyOn(service, 'safetyAnalysis');
    const dto = { title: '  运行报告  ', reportType: 'MONTHLY', category: 'OPERATIONS', periodStart: '2026-09-01', periodEnd: '2026-09-30' };
    const result = await service.createReport(province, dto);
    expect(JSON.parse(result.summaryJson)).toEqual(snapshot); expect(result.title).toBe('运行报告'); expect(safety).not.toHaveBeenCalled();
    await expect(service.createReport(province, { ...dto, category: 'ENTERPRISE' })).rejects.toThrow(ForbiddenException);
    await expect(service.createReport(province, { ...dto, periodStart: '2026-10-01' })).rejects.toThrow(BadRequestException);
  });
  it('exports snapshot units and neutralizes spreadsheet formulas', async () => {
    prisma.regulatoryReport.findFirst.mockResolvedValueOnce({ ...record, title: '=HYPERLINK("unsafe")' });
    const file = await service.exportReport(province, 'r1');
    expect(file.filename).toBe('RPT-1.csv'); expect(file.content).toContain('自主运行里程占比(%)');
    expect(file.content).toContain('累计能耗(kWh)'); expect(file.content).toContain("'=HYPERLINK");
    expect(file.content).toContain('"100"');
  });
  it('marks invalid source percentages without rewriting the stored snapshot', async () => {
    const invalid = { operations: { kpis: { ...snapshot.operations.kpis, autonomousRate: 219.9 } } };
    prisma.regulatoryReport.findFirst.mockResolvedValueOnce({ ...record, summaryJson: JSON.stringify(invalid) });
    const file = await service.exportReport(province, 'r1');
    expect(file.content).toContain('自主运行里程占比(%)","—');
    expect(file.content).toContain('口径待核对'); expect(file.content).not.toContain('219.9');
    expect(prisma.regulatoryReport.updateMany).not.toHaveBeenCalled();
  });
});
