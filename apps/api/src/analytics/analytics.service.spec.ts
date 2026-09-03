import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService calculations', () => {
  const prisma = {
    $transaction: jest.fn((calls: Promise<unknown>[]) => Promise.all(calls)),
    operationRecord: { findMany: jest.fn() },
    safetyAlert: { count: jest.fn() },
    accident: { count: jest.fn() },
    violation: { count: jest.fn() },
    vehicleOnlineDaily: { aggregate: jest.fn() },
    emergencyTask: { aggregate: jest.fn() },
  };
  const service = new AnalyticsService(prisma as any, {} as any) as any;

  it('rejects an inverted analysis period', () => {
    expect(() => service.dates({ from: '2026-09-03', to: '2026-09-01' })).toThrow(BadRequestException);
  });

  it('caps a chart time axis at 31 points', () => {
    expect(service.rangeDays(new Date('2026-01-01'), new Date('2026-12-31'))).toHaveLength(31);
  });

  it('produces a transparent weighted evaluation score', async () => {
    prisma.operationRecord.findMany.mockResolvedValue([{ mileage: 100, durationMinutes: 600, autonomousMiles: 92 }]);
    prisma.safetyAlert.count.mockResolvedValue(0); prisma.accident.count.mockResolvedValue(0); prisma.violation.count.mockResolvedValue(0);
    prisma.vehicleOnlineDaily.aggregate.mockResolvedValue({ _avg: { onlineRate: 96 } }); prisma.emergencyTask.aggregate.mockResolvedValue({ _avg: { evaluationScore: 5 } });
    const indicators = [
      { id: 'safe', code: 'SAFE', name: '事故', dimension: 'SAFETY', metricKey: 'accidentCount', weight: 50, rules: [{ minValue: 0, maxValue: 1, score: 100, label: '无事故' }] },
      { id: 'ops', code: 'OPS', name: '自主率', dimension: 'OPERATION', metricKey: 'autonomousRate', weight: 50, rules: [{ minValue: 90, score: 90, label: '90%以上' }] },
    ];
    const result = await service.scoreEnterprise('enterprise-1', new Date('2026-08-01'), new Date('2026-08-31'), indicators);
    expect(result.totalScore).toBe(95); expect(result.grade).toBe('A'); expect(result.breakdown[1].value).toBe(92);
  });
});

