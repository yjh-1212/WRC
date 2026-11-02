import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export class ProvinceCockpitQueryDto {
  @IsOptional() @Matches(/^37\d{4}$/) cityCode?: string;
}

const TYPES = [
  ['DELIVERY', '物流配送', '#6597ff'], ['SANITATION', '环卫清扫', '#49c9d1'],
  ['PATROL', '安防巡逻', '#a694ed'], ['RETAIL', '无人零售', '#efb85a'], ['SHUTTLE', '短途接驳', '#4dd3c2'],
] as const;
const LEVELS = [['CRITICAL', '重大', '#f28b83'], ['HIGH', '高', '#efb85a'], ['MEDIUM', '中', '#6597ff'], ['LOW', '低', '#49c9d1']] as const;
const rate = (part: number, total: number) => total ? Math.round(part / total * 1000) / 10 : 0;

@Injectable()
export class ProvinceCockpitService {
  constructor(private readonly prisma: PrismaService) {}
  async overview(user: AuthUser, query: ProvinceCockpitQueryDto) {
    if (user.accountLevel !== 'PROVINCE' || user.portal !== 'REGULATORY' || !user.permissions.includes('dashboard:view')) throw new ForbiddenException('仅省级监管人员可以访问省级驾驶舱');
    const now = new Date();
    const today = new Date(`${new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)}T00:00:00+08:00`);
    const [regions, workspaces] = await Promise.all([
      this.prisma.cockpitRegion.findMany({ where: { parentCode: '370000', level: 'CITY', status: 'ACTIVE' }, orderBy: { code: 'asc' }, select: { code: true, name: true, longitude: true, latitude: true } }),
      this.prisma.cityWorkspace.findMany({ select: { id: true, cityCode: true, cityName: true, status: true, organizationId: true } }),
    ]);
    if (query.cityCode && !regions.some(region => region.code === query.cityCode)) throw new BadRequestException('请选择有效的山东省地市');
    const organizations = await this.prisma.organization.findMany({ where: { workspaceId: { in: workspaces.map(row => row.id) } }, select: { id: true, workspaceId: true } });
    const cityByOrganization = new Map<string, string>();
    for (const workspace of workspaces) {
      cityByOrganization.set(workspace.organizationId, workspace.cityCode);
      for (const org of organizations.filter(org => org.workspaceId === workspace.id)) cityByOrganization.set(org.id, workspace.cityCode);
    }
    const allOrganizationIds = [...cityByOrganization.keys()];
    const organizationIds = allOrganizationIds.filter(id => !query.cityCode || cityByOrganization.get(id) === query.cityCode);
    const organizationId = { in: organizationIds };
    const vehicleWhere = { organizationId, deletedAt: null };
    const matterWhere = { status: { not: 'DRAFT' }, assignments: { some: query.cityCode ? { workspaceId: { in: workspaces.filter(row => row.cityCode === query.cityCode).map(row => row.id) } } : {} } };
    const [vehicleGroups, enterpriseGroups, alertGroups, todayAlerts, running, telemetry, risks, matterGroups, overdue, tasks] = await Promise.all([
      this.prisma.vehicle.groupBy({ by: ['organizationId', 'vehicleType', 'onlineStatus'], where: { organizationId: { in: allOrganizationIds }, deletedAt: null }, _count: { id: true } }),
      this.prisma.enterprise.groupBy({ by: ['organizationId'], where: { organizationId: { in: allOrganizationIds } }, _count: { id: true } }),
      this.prisma.safetyAlert.groupBy({ by: ['organizationId', 'level'], where: { organizationId: { in: allOrganizationIds }, status: { not: 'CLOSED' } }, _count: { id: true } }),
      this.prisma.safetyAlert.count({ where: { organizationId, occurredAt: { gte: today, lte: now } } }),
      this.prisma.vehicleRealtimeStatus.count({ where: { vehicle: { ...vehicleWhere, onlineStatus: 'ONLINE' }, drivingState: 'RUNNING' } }),
      this.prisma.vehicleRealtimeStatus.aggregate({ where: { vehicle: vehicleWhere, heartbeatAt: { gte: today, lte: now } }, _sum: { mileageToday: true }, _max: { heartbeatAt: true } }),
      this.prisma.safetyAlert.findMany({ where: { organizationId, status: { not: 'CLOSED' }, level: { in: ['HIGH', 'CRITICAL'] } }, take: 6, orderBy: { occurredAt: 'desc' }, select: { id: true, businessNo: true, title: true, level: true, status: true, occurredAt: true, organizationId: true } }),
      this.prisma.provinceMatter.groupBy({ by: ['status'], where: matterWhere, _count: { id: true } }),
      this.prisma.provinceMatter.count({ where: { ...matterWhere, status: { notIn: ['DRAFT', 'CLOSED'] }, dueAt: { lt: now } } }),
      this.prisma.provinceMatter.findMany({ where: { ...matterWhere, status: { notIn: ['DRAFT', 'CLOSED'] } }, take: 4, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, kind: true, status: true, dueAt: true } }),
    ]);
    const cities = regions.map(region => {
      const workspace = workspaces.find(row => row.cityCode === region.code);
      const vehicles = vehicleGroups.filter(row => cityByOrganization.get(row.organizationId) === region.code);
      const registered = vehicles.reduce((sum, row) => sum + row._count.id, 0);
      const online = vehicles.filter(row => row.onlineStatus === 'ONLINE').reduce((sum, row) => sum + row._count.id, 0);
      const alerts = alertGroups.filter(row => cityByOrganization.get(row.organizationId) === region.code);
      return { ...region, workspaceId: workspace?.id ?? null, connected: !!workspace, status: workspace?.status ?? 'NOT_OPENED', registered, online, onlineRate: rate(online, registered), enterprises: enterpriseGroups.filter(row => cityByOrganization.get(row.organizationId) === region.code).reduce((sum, row) => sum + row._count.id, 0), openRisks: alerts.reduce((sum, row) => sum + row._count.id, 0), highRisks: alerts.filter(row => ['HIGH', 'CRITICAL'].includes(row.level)).reduce((sum, row) => sum + row._count.id, 0) };
    });
    const selectedCities = cities.filter(city => !query.cityCode || city.code === query.cityCode);
    const sum = (key: 'registered' | 'online' | 'enterprises' | 'openRisks' | 'highRisks') => selectedCities.reduce((total, city) => total + city[key], 0);
    const selectedGroups = vehicleGroups.filter(row => organizationIds.includes(row.organizationId));
    const knownTypes = new Set<string>(TYPES.map(type => type[0]));
    const usage = [...TYPES.map(([code, name, color]) => ({ code, name, color, count: selectedGroups.filter(row => row.vehicleType === code).reduce((total, row) => total + row._count.id, 0) })), { code: 'OTHER', name: '其他用途', color: '#8298b5', count: selectedGroups.filter(row => !knownTypes.has(row.vehicleType)).reduce((total, row) => total + row._count.id, 0) }].map(row => ({ ...row, percentage: rate(row.count, sum('registered')) }));
    const totalMatters = matterGroups.reduce((total, row) => total + row._count.id, 0), closed = matterGroups.find(row => row.status === 'CLOSED')?._count.id ?? 0;
    return {
      updatedAt: now.toISOString(), scope: { cityCode: query.cityCode ?? null, name: query.cityCode ? selectedCities[0].name : '山东省', connected: !query.cityCode || selectedCities[0].connected, workspaceId: query.cityCode ? selectedCities[0].workspaceId : null },
      coverage: { connected: cities.filter(city => city.connected).length, total: cities.length }, cities,
      summary: { registered: sum('registered'), online: sum('online'), offline: sum('registered') - sum('online'), onlineRate: rate(sum('online'), sum('registered')), enterprises: sum('enterprises'), running, mileageToday: telemetry._sum.mileageToday == null ? null : Math.round(telemetry._sum.mileageToday * 10) / 10, telemetryAt: telemetry._max.heartbeatAt }, usage,
      risks: { total: sum('openRisks'), high: sum('highRisks'), today: todayAlerts, levels: LEVELS.map(([code, name, color]) => ({ code, name, color, count: alertGroups.filter(row => organizationIds.includes(row.organizationId) && row.level === code).reduce((total, row) => total + row._count.id, 0) })), items: risks.map(row => ({ ...row, cityCode: cityByOrganization.get(row.organizationId), cityName: cities.find(city => city.code === cityByOrganization.get(row.organizationId))?.name ?? '未归属地市' })) },
      collaboration: { total: totalMatters, closed, open: totalMatters - closed, overdue, completionRate: rate(closed, totalMatters), states: matterGroups.map(row => ({ status: row.status, count: row._count.id })), items: tasks },
    };
  }
}
