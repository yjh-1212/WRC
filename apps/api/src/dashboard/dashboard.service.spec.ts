import { ForbiddenException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma = {};
  const service = new DashboardService(prisma as any);

  it('sorts overdue and high-risk work ahead of ordinary items', () => {
    const now = new Date();
    const items = service.workSort([
      { id: 'a', kind: 'APPROVAL', category: '审批', label: '审批', title: '路测', description: '', status: 'PENDING', level: 'INFO', occurredAt: now, dueAt: new Date(now.getTime() + 86_400_000), route: '/a' },
      { id: 'b', kind: 'ALERT', category: '告警', label: '严重', title: '越界', description: '', status: 'PENDING_HANDLING', level: 'CRITICAL', occurredAt: now, route: '/b' },
      { id: 'c', kind: 'EMERGENCY', category: '复核', label: '复核', title: '事故反馈', description: '', status: 'PENDING_REVIEW', level: 'HIGH', occurredAt: now, dueAt: new Date(now.getTime() - 3_600_000), route: '/c' },
    ]);
    expect(items.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('rejects enterprise users from regulator dashboard', async () => {
    await expect(service.regulatorSummary({ portal: 'ENTERPRISE', enterpriseId: 'e1', roles: [], permissions: ['dashboard:view'] } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects regulator users from enterprise dashboard', async () => {
    await expect(service.enterpriseSummary({ portal: 'REGULATORY', enterpriseId: null, roles: [], permissions: ['dashboard:view'] } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
