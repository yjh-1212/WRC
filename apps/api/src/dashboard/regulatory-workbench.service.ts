import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { workspaceContext } from '../prisma/workspace-context';
import { RegulatoryWorkbenchQueryDto } from './regulatory-workbench.dto';

const DAY = 86_400_000;
export const shanghaiDay = (date: Date) => new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
const round = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
const types: Record<string, string> = { DELIVERY: '无人配送车', SANITATION: '无人环卫车', PATROL: '无人巡逻车', RETAIL: '无人零售车', SHUTTLE: '无人接驳车' };
const pending = ['REPORTED', 'PENDING_CONFIRMATION', 'PENDING_HANDLING', 'PENDING_DETERMINATION', 'OFFLINE'];
const closed = ['CLOSED', 'ARCHIVED', 'RECOVERED'];
const eventKinds = [
  { model: 'safetyAlert', permission: 'safety:alert:read', field: 'alertType', kind: 'ALERT' },
  { model: 'accident', permission: 'safety:accident:read', field: 'accidentType', kind: 'ACCIDENT' },
  { model: 'violation', permission: 'safety:violation:read', field: 'violationType', kind: 'VIOLATION' },
  { model: 'offlineEvent', permission: 'safety:offline:read', field: null, kind: 'OFFLINE' },
] as const;

export function workbenchRange(query: RegulatoryWorkbenchQueryDto, now = new Date()) {
  const today = shanghaiDay(now), from = query.from ?? today.slice(0, 7) + '-01', to = query.to ?? today;
  const start = new Date(from + 'T00:00:00+08:00'), end = new Date(to + 'T00:00:00+08:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || shanghaiDay(start) !== from || shanghaiDay(end) !== to) throw new BadRequestException('请选择有效的统计日期');
  const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  if (days < 1 || days > 366) throw new BadRequestException('统计日期须为1至366天，开始日期不能晚于结束日期');
  if (to > today) throw new BadRequestException('统计结束日期不能晚于今天');
  return { from, to, start, endExclusive: new Date(end.getTime() + DAY), days };
}

type OperationGroup = { enterpriseId: string; date: string; trips: number | bigint; mileage: number; invalid: number | bigint };
export function summarizeOperations(rows: OperationGroup[], range: ReturnType<typeof workbenchRange>) {
  const daily = new Map<string, { trips: number; mileage: number; invalid: number }>();
  const enterprises = new Map<string, { trips: number; mileage: number; invalid: number }>();
  let trips = 0, mileage = 0, invalid = 0;
  for (const row of rows) {
    const count = Number(row.trips), bad = Number(row.invalid), distance = Number(row.mileage);
    trips += count; mileage += distance; invalid += bad;
    for (const [map, key] of [[daily, row.date], [enterprises, row.enterpriseId]] as const) {
      const bucket = map.get(key) ?? { trips: 0, mileage: 0, invalid: 0 };
      bucket.trips += count; bucket.mileage += distance; bucket.invalid += bad; map.set(key, bucket);
    }
  }
  return { trips, mileage: invalid ? null : round(mileage), qualityIssue: invalid > 0,
    trend: Array.from({ length: range.days }, (_, index) => {
      const date = shanghaiDay(new Date(range.start.getTime() + index * DAY)), row = daily.get(date);
      return { date, trips: row?.trips ?? 0, mileage: row?.invalid ? null : round(row?.mileage ?? 0) };
    }), enterprises };
}

@Injectable()
export class RegulatoryWorkbenchService {
  constructor(private readonly prisma: PrismaService) {}
  private organizationIds(user: AuthUser) {
    if (user.accountLevel === 'PROVINCE') {
      const context = workspaceContext.getStore();
      return context?.filteredWorkspaceId ? context.organizationIds : null;
    }
    return user.scopeOrganizationIds?.length ? user.scopeOrganizationIds : [user.organizationId ?? '__none__'];
  }
  private eventWhere(user: AuthUser, kind: typeof eventKinds[number], own: object) {
    if (kind.kind !== 'ALERT') return own;
    // Match the unified event queue: a readable typed child replaces its source
    // alert, even when the child was reported on a different day.
    return { ...own,
      ...(user.permissions.includes('safety:accident:read') ? { accidents: { none: own } } : {}),
      ...(user.permissions.includes('safety:violation:read') ? { violations: { none: own } } : {}),
      ...(user.permissions.includes('safety:offline:read') ? { offlineEvent: { is: null } } : {}),
    };
  }
  private async safety(user: AuthUser, own: object, range: ReturnType<typeof workbenchRange>) {
    const kinds = eventKinds.filter(kind => user.permissions.includes(kind.permission));
    if (!kinds.length) return { summary: null, pending: null };
    const groups = await Promise.all(kinds.map(async kind => {
      const model = (this.prisma as any)[kind.model], scope = this.eventWhere(user, kind, own);
      const [rows, outstanding] = await Promise.all([
        model.groupBy({ by: ['status', ...(kind.field ? [kind.field] : [])], where: { ...scope, [kind.kind === 'OFFLINE' ? 'startedAt' : 'occurredAt']: { gte: range.start, lt: range.endExclusive } }, _count: { _all: true } }),
        model.count({ where: { ...scope, status: { in: pending } } }),
      ]);
      return { kind, rows, outstanding };
    }));
    let total = 0, completed = 0, awaiting = 0, processing = 0, review = 0;
    const categories = new Map<string, number>();
    for (const { kind, rows } of groups) for (const row of rows) {
      const count = row._count._all; total += count;
      if (closed.includes(row.status)) completed += count;
      else if (pending.includes(row.status)) awaiting += count;
      else { processing += count; if (row.status === 'PENDING_REVIEW') review += count; }
      const raw = kind.field ? row[kind.field] : 'OFFLINE';
      const key = kind.kind === 'ACCIDENT' ? 'ACCIDENT' : ['OUT_OF_BOUNDS', 'GEOFENCE_EXIT', 'BOUNDARY'].includes(raw) ? 'BOUNDARY' : ['SPEEDING', 'OVERSPEED'].includes(raw) ? 'SPEEDING' : ['OFFLINE', 'COMMUNICATION_LOSS'].includes(raw) ? 'OFFLINE' : 'OTHER';
      categories.set(key, (categories.get(key) ?? 0) + count);
    }
    const labels: Record<string, string> = { BOUNDARY: '越界', SPEEDING: '超速', OFFLINE: '车辆离线', ACCIDENT: '事故', OTHER: '其他' };
    return { summary: { total, closed: completed, pending: awaiting, processing, review, closureRate: total ? round(completed / total * 100) : null,
      types: [...categories].map(([key, value]) => ({ key, name: labels[key], value })).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key)) },
      pending: groups.reduce((sum, group) => sum + group.outstanding, 0) };
  }
  async overview(user: AuthUser, query: RegulatoryWorkbenchQueryDto) {
    if (user.portal !== 'REGULATORY' || user.accountLevel === 'OPERATIONS') throw new ForbiddenException('仅监管账号可以访问监管工作台');
    const range = workbenchRange(query), ids = this.organizationIds(user), own = ids ? { organizationId: { in: ids } } : {};
    const has = (permission: string) => user.permissions.includes(permission);
    const permissions = { fleet: has('archive:vehicle:read') || has('operation:realtime:read'), operations: has('analytics:operation:read') || has('operation:record:read'),
      enterprises: has('archive:enterprise:read') || has('archive:enterprise-archive:read'), safety: eventKinds.some(kind => has(kind.permission)) };
    const vehicleRead = permissions.fleet || permissions.enterprises;
    const sqlScope = ids ? Prisma.sql`r.organizationId IN (${Prisma.join(ids)})` : Prisma.sql`1=1`;
    const now = new Date();
    const [vehicles, enterprises, operationGroups, security, applications, rectifications, expiring] = await Promise.all([
      vehicleRead ? this.prisma.vehicle.findMany({ where: { ...own, deletedAt: null }, select: { id: true, enterpriseId: true, organizationId: true, vehicleType: true, onlineStatus: true,
        organization: { select: { id: true, name: true } }, model: { select: { manufacturer: { select: { id: true, name: true, shortName: true } } } }, realtimeStatus: { select: { drivingState: true } } } }) : [],
      permissions.enterprises ? this.prisma.enterprise.findMany({ where: own, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [],
      permissions.operations ? this.prisma.$queryRaw<OperationGroup[]>(Prisma.sql`SELECT r.enterpriseId, strftime('%Y-%m-%d', r.startedAt / 1000, 'unixepoch', '+8 hours') date, COUNT(*) trips,
        SUM(CASE WHEN r.mileage >= 0 AND r.mileage < 1000000000 THEN r.mileage ELSE 0 END) mileage,
        SUM(CASE WHEN r.mileage >= 0 AND r.mileage < 1000000000 THEN 0 ELSE 1 END) invalid
        FROM OperationRecord r WHERE ${sqlScope} AND r.startedAt >= ${range.start} AND r.startedAt < ${range.endExclusive}
        GROUP BY r.enterpriseId, date`) : [],
      this.safety(user, own, range),
      has('admission:approval:read') ? this.prisma.admissionApplication.count({ where: { ...own, status: 'SUBMITTED' } }) : null,
      has('safety:emergency:review') ? this.prisma.safetyRectificationTask.count({ where: { ...own, status: 'PENDING_REVIEW' } }) : null,
      has('admission:license:read') ? this.prisma.vehicleLicense.findMany({ where: { ...own, status: { in: ['VALID', 'EXPIRING', 'EXPIRED'] }, expiresAt: { gte: now, lte: new Date(now.getTime() + 30 * DAY) }, vehicle: { deletedAt: null } }, select: { vehicleId: true } }) : null,
    ]);
    const operations = summarizeOperations(operationGroups, range);
    const state = (row: typeof vehicles[number]) => row.onlineStatus !== 'ONLINE' ? 'OFFLINE' : row.realtimeStatus?.drivingState === 'RUNNING' ? 'RUNNING' : 'IDLE';
    const running = vehicles.filter(row => state(row) === 'RUNNING').length, idle = vehicles.filter(row => state(row) === 'IDLE').length, online = running + idle;
    const distribution = (key: (row: typeof vehicles[number]) => string, name: (row: typeof vehicles[number]) => string) => {
      const groups = new Map<string, { key: string; name: string; value: number; share: number }>();
      for (const row of vehicles) { const id = key(row), group = groups.get(id) ?? { key: id, name: name(row), value: 0, share: 0 }; group.value++; groups.set(id, group); }
      return [...groups.values()].map(group => ({ ...group, share: vehicles.length ? round(group.value / vehicles.length * 100) : 0 })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'));
    };
    const enterpriseRows = enterprises.map(enterprise => {
      const fleet = vehicles.filter(row => row.enterpriseId === enterprise.id), metrics = operations.enterprises.get(enterprise.id);
      return { ...enterprise, vehicles: permissions.fleet ? fleet.length : null, online: permissions.fleet ? fleet.filter(row => row.onlineStatus === 'ONLINE').length : null,
        running: permissions.fleet ? fleet.filter(row => state(row) === 'RUNNING').length : null,
        mileage: permissions.operations ? metrics?.invalid ? null : round(metrics?.mileage ?? 0) : null, trips: permissions.operations ? metrics?.trips ?? 0 : null };
    });
    const typeDistribution = distribution(row => types[row.vehicleType] ? row.vehicleType : 'UNKNOWN', row => types[row.vehicleType] ?? '未分类');
    const vehicleTypes = Object.entries(types).map(([key, name]) => typeDistribution.find(row => row.key === key) ?? { key, name, value: 0, share: 0 });
    vehicleTypes.push(...typeDistribution.filter(row => row.key === 'UNKNOWN'));
    const organization = !user.workspace?.cityName && user.organizationId ? await this.prisma.organization.findFirst({ where: { id: user.organizationId }, select: { name: true } }) : null;
    return {
      period: { from: range.from, to: range.to, days: range.days }, scopeName: user.workspace?.cityName ?? organization?.name ?? '当前监管范围', computedAt: now.toISOString(), permissions,
      fleet: permissions.fleet ? { total: vehicles.length, running, idle, offline: vehicles.length - online, online, onlineRate: vehicles.length ? round(online / vehicles.length * 100) : null } : null,
      operations: permissions.operations ? { trips: operations.trips, mileage: operations.mileage, qualityIssue: operations.qualityIssue, trend: operations.trend } : null,
      vehicleTypes: permissions.fleet ? vehicleTypes : null,
      manufacturers: permissions.fleet ? distribution(row => row.model?.manufacturer?.id ?? 'UNKNOWN', row => row.model?.manufacturer?.shortName || row.model?.manufacturer?.name || '未登记厂商') : null,
      districts: permissions.fleet ? distribution(row => row.organizationId, row => (row.organization?.name ?? '未分配辖区').replace(/交通运输局$/, '')) : null,
      safety: security.summary, enterprises: permissions.enterprises ? enterpriseRows : null,
      reminders: { applications, events: security.pending, rectifications, expiringVehicles: expiring ? new Set(expiring.map(row => row.vehicleId)).size : null },
    };
  }
}
