import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { parseAccidentVideos } from './accident-video';
import { ProvinceMonitoringQueryDto as Query } from './province-monitoring.dto';

const vehicleInclude = {
  enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true, workspaceId: true } },
  model: { include: { manufacturer: { select: { id: true, name: true } } } }, archive: true, realtimeStatus: true,
} satisfies Prisma.VehicleInclude;
const eventInclude = { vehicle: { select: { id: true, businessNo: true, name: true } }, enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true, workspaceId: true } } } satisfies Prisma.AccidentInclude;
const open = { not: 'CLOSED' };

@Injectable()
export class ProvinceMonitoringService {
  constructor(private readonly prisma: PrismaService) {}
  private permitted(user: AuthUser, permission: string) { return user.permissions.includes(permission); }
  private require(user: AuthUser, permission: string) {
    if (user.accountLevel !== 'PROVINCE' || user.portal !== 'REGULATORY') throw new ForbiddenException('仅省级监管人员可访问全省监测');
    if (!this.permitted(user, permission)) throw new ForbiddenException('当前账号没有查看此类资料的权限');
  }
  private async scope(user: AuthUser, workspaceId?: string) {
    if (user.accountLevel !== 'PROVINCE' || user.portal !== 'REGULATORY') throw new ForbiddenException('仅省级监管人员可访问全省监测');
    const workspaces = await this.prisma.cityWorkspace.findMany({ where: { cityCode: { startsWith: '37' } }, select: { id: true, cityCode: true, cityName: true, organizationId: true, status: true }, orderBy: { cityCode: 'asc' } });
    if (workspaceId && !workspaces.some(row => row.id === workspaceId)) throw new ForbiddenException('所选地市不在山东监管范围');
    const selected = workspaces.filter(row => !workspaceId || row.id === workspaceId);
    const organizations = await this.prisma.organization.findMany({ where: { workspaceId: { in: selected.map(row => row.id) } }, select: { id: true, workspaceId: true } });
    const organizationIds = [...new Set([...organizations.map(row => row.id), ...selected.map(row => row.organizationId)])];
    const cityFor = (organizationId: string) => selected.find(city => city.organizationId === organizationId || organizations.some(org => org.id === organizationId && org.workspaceId === city.id));
    return { organizationIds, workspaces, cityFor };
  }
  private page(query: Query) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
  private range(query: Query) {
    const from = query.from ? new Date(query.from.length === 10 ? `${query.from}T00:00:00+08:00` : query.from) : undefined, to = query.to ? new Date(query.to.length === 10 ? `${query.to}T23:59:59.999+08:00` : query.to) : undefined;
    if (from && to && from > to) throw new BadRequestException('开始时间不能晚于结束时间');
    return from || to ? { gte: from, lte: to } : undefined;
  }
  private decorate<T extends { organizationId: string }>(rows: T[], scope: Awaited<ReturnType<ProvinceMonitoringService['scope']>>) { return rows.map(row => ({ ...row, cityName: scope.cityFor(row.organizationId)?.cityName ?? '未知地市', cityCode: scope.cityFor(row.organizationId)?.cityCode, workspaceId: scope.cityFor(row.organizationId)?.id })); }
  private alertsWhere(query: Query): Prisma.SafetyAlertWhereInput { return { status: query.alertStatus === 'ALL' ? undefined : query.alertStatus === 'HANDLING' ? { notIn: ['PENDING_CONFIRMATION', 'CLOSED'] } : query.alertStatus ?? open, level: query.riskLevel }; }
  private vehicleWhere(query: Query, organizationIds: string[]): Prisma.VehicleWhereInput {
    const where: Prisma.VehicleWhereInput = { deletedAt: null, organizationId: { in: organizationIds }, enterpriseId: query.enterpriseId, vehicleType: query.vehicleType, onlineStatus: query.onlineStatus, ...(query.drivingState ? { realtimeStatus: { is: { drivingState: query.drivingState } } } : {}), OR: query.q ? [{ businessNo: { contains: query.q } }, { unifiedCode: { contains: query.q } }, { vin: { contains: query.q } }, { deviceNo: { contains: query.q } }, { name: { contains: query.q } }, { enterprise: { name: { contains: query.q } } }] : undefined };
    const and: Prisma.VehicleWhereInput[] = [];
    if (query.riskLevel || query.alertStatus) and.push({ safetyAlerts: { some: this.alertsWhere(query) } });
    if (query.licenseState === 'VALID') and.push({ licenses: { some: { status: 'VALID', expiresAt: { gt: new Date() } } } });
    if (query.licenseState === 'NONE') and.push({ licenses: { none: {} } });
    if (query.licenseState === 'EXPIRED') and.push({ licenses: { some: {} } }, { licenses: { none: { status: 'VALID', expiresAt: { gt: new Date() } } } });
    where.AND = and; return where;
  }
  private bucket(where: Prisma.VehicleWhereInput, bucket: string, query: Query): Prisma.VehicleWhereInput {
    const extra: Prisma.VehicleWhereInput = bucket === 'RUNNING' ? { onlineStatus: 'ONLINE', realtimeStatus: { is: { drivingState: 'RUNNING' } } } : bucket === 'OFFLINE' ? { OR: [{ onlineStatus: 'OFFLINE' }, { realtimeStatus: null }, { realtimeStatus: { heartbeatAt: { lt: new Date(Date.now() - 600000) } } }] } : bucket === 'ALERT' ? { safetyAlerts: { some: { AND: [this.alertsWhere(query), { status: open }] } } } : {};
    return { AND: [where, extra] };
  }
  async options(user: AuthUser) {
    const scope = await this.scope(user);
    if (!['archive:vehicle:read', 'operation:realtime:read', 'safety:accident:read', 'safety:alert:read'].some(permission => this.permitted(user, permission))) throw new ForbiddenException('当前账号没有全省监测查询权限');
    const enterprises = await this.prisma.enterprise.findMany({ where: { organizationId: { in: scope.organizationIds } }, select: { id: true, name: true, organizationId: true }, orderBy: { name: 'asc' } });
    return { workspaces: scope.workspaces, enterprises: this.decorate(enterprises, scope) };
  }
  async vehicles(user: AuthUser, query: Query, monitoring = false) {
    this.require(user, monitoring ? 'operation:realtime:read' : 'archive:vehicle:read');
    const canAlert = this.permitted(user, 'safety:alert:read'), canLicense = this.permitted(user, 'admission:license:read');
    if (!canAlert && (query.riskLevel || query.alertStatus || query.bucket === 'ALERT')) throw new ForbiddenException('当前账号没有风险查询权限');
    if (!canLicense && query.licenseState) throw new ForbiddenException('当前账号没有许可查询权限');
    const scope = await this.scope(user, query.workspaceId), base = this.vehicleWhere(query, scope.organizationIds), where = this.bucket(base, query.bucket, query);
    const [total, rows, counts, mapRows] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({ where, ...this.page(query), orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], include: { ...vehicleInclude, ...(canLicense ? { licenses: { orderBy: { issuedAt: 'desc' as const } } } : {}), ...(canAlert ? { safetyAlerts: { where: { status: open }, orderBy: [{ level: 'asc' as const }, { occurredAt: 'desc' as const }], take: 3 }, _count: { select: { safetyAlerts: { where: { status: open } } } } } : {}) } }),
      monitoring ? Promise.all(['ALL', 'RUNNING', 'OFFLINE', ...(canAlert ? ['ALERT'] : [])].map(async key => [key, await this.prisma.vehicle.count({ where: this.bucket(base, key, query) })] as const)).then(Object.fromEntries) : {},
      monitoring ? this.prisma.vehicle.findMany({ where, orderBy: { id: 'asc' }, take: 5001, select: { id: true, name: true, businessNo: true, onlineStatus: true, enterpriseId: true, organizationId: true, enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, realtimeStatus: true, ...(canAlert ? { _count: { select: { safetyAlerts: { where: { status: open } } } } } : {}) } }) : [],
    ]);
    const items = this.decorate(rows, scope).map(row => ({ ...row, riskCount: canAlert ? (row as any)._count?.safetyAlerts ?? 0 : null }));
    return { page: query.page, pageSize: query.pageSize, total, items, counts, mapPoints: this.decorate(mapRows.slice(0, 5000), scope).map(row => ({ ...row, riskCount: canAlert ? (row as any)._count?.safetyAlerts ?? 0 : null })), mapTruncated: mapRows.length > 5000, updatedAt: new Date(), access: { alerts: canAlert, licenses: canLicense } };
  }
  private async vehicle(user: AuthUser, id: string, workspaceId?: string) {
    const scope = await this.scope(user, workspaceId);
    const row = await this.prisma.vehicle.findFirst({ where: { id, deletedAt: null, organizationId: { in: scope.organizationIds } }, include: vehicleInclude });
    if (!row) throw new NotFoundException('车辆不存在或不在所选地市范围');
    return { row: this.decorate([row], scope)[0], scope };
  }
  async dossier(user: AuthUser, id: string, query: Query) {
    this.require(user, 'archive:vehicle:read'); const { row, scope } = await this.vehicle(user, id, query.workspaceId);
    const allowed = (p: string) => this.permitted(user, p);
    const [licenses, records, accidents, alerts, violations] = await Promise.all([
      allowed('admission:license:read') ? this.prisma.vehicleLicense.findMany({ where: { vehicleId: id }, orderBy: { issuedAt: 'desc' } }) : null,
      allowed('operation:record:read') ? this.prisma.operationRecord.findMany({ where: { vehicleId: id, organizationId: { in: scope.organizationIds } }, orderBy: { startedAt: 'desc' }, take: 1 }) : null,
      allowed('safety:accident:read') ? this.prisma.accident.findMany({ where: { vehicleId: id, organizationId: { in: scope.organizationIds } }, orderBy: { occurredAt: 'desc' }, take: 3, include: eventInclude }) : null,
      allowed('safety:alert:read') ? this.prisma.safetyAlert.count({ where: { vehicleId: id, status: open, organizationId: { in: scope.organizationIds } } }) : null,
      allowed('safety:violation:read') ? this.prisma.violation.count({ where: { vehicleId: id, status: { not: 'CLOSED' }, organizationId: { in: scope.organizationIds } } }) : null,
    ]);
    return { vehicle: row, licenses, latestRecord: records?.[0] ?? null, accidents: accidents ? this.decorate(accidents, scope).map(a => this.videoSummary(a)) : null, openAlerts: alerts, openViolations: violations, access: { licenses: allowed('admission:license:read'), records: allowed('operation:record:read'), tracks: allowed('operation:trajectory:read'), accidents: allowed('safety:accident:read'), alerts: allowed('safety:alert:read'), violations: allowed('safety:violation:read') } };
  }
  async records(user: AuthUser, id: string, query: Query) {
    this.require(user, 'operation:record:read'); const { scope } = await this.vehicle(user, id, query.workspaceId);
    const where = { vehicleId: id, organizationId: { in: scope.organizationIds }, startedAt: this.range(query) };
    const [total, items] = await Promise.all([this.prisma.operationRecord.count({ where }), this.prisma.operationRecord.findMany({ where, ...this.page(query), orderBy: { startedAt: 'desc' }, include: { _count: { select: { trackPoints: true } } } })]);
    return { total, items, page: query.page, pageSize: query.pageSize };
  }
  async tracks(user: AuthUser, id: string, query: Query) {
    this.require(user, 'operation:trajectory:read'); const { scope } = await this.vehicle(user, id, query.workspaceId);
    if (query.recordId && !await this.prisma.operationRecord.findFirst({ where: { id: query.recordId, vehicleId: id, organizationId: { in: scope.organizationIds } }, select: { id: true } })) throw new NotFoundException('运行记录不属于当前车辆');
    if (!query.recordId && (!query.from || !query.to)) throw new BadRequestException('请选择行程或完整的轨迹时间范围');
    const range = this.range(query); if (query.from && query.to && new Date(query.to).getTime() - new Date(query.from).getTime() > 7 * 86400000) throw new BadRequestException('单次轨迹查询最多7天，请缩小范围');
    const where: Prisma.VehicleTrackPointWhereInput = { vehicleId: id, operationRecordId: query.recordId, recordedAt: range, operationRecord: { vehicleId: id, organizationId: { in: scope.organizationIds } } };
    const [total, points] = await Promise.all([this.prisma.vehicleTrackPoint.count({ where }), this.prisma.vehicleTrackPoint.findMany({ where, orderBy: [{ recordedAt: 'asc' }, { sequence: 'asc' }], take: 5001 })]);
    return { total, points: points.slice(0, 5000), truncated: total > 5000 };
  }
  async alerts(user: AuthUser, query: Query) {
    this.require(user, 'safety:alert:read'); const scope = await this.scope(user, query.workspaceId);
    if (query.vehicleId) await this.vehicle(user, query.vehicleId, query.workspaceId);
    const where: Prisma.SafetyAlertWhereInput = { organizationId: { in: scope.organizationIds }, vehicleId: query.vehicleId, enterpriseId: query.enterpriseId, level: query.riskLevel, status: query.alertStatus === 'ALL' ? undefined : query.alertStatus === 'HANDLING' ? { notIn: ['PENDING_CONFIRMATION', 'CLOSED'] } : query.alertStatus, occurredAt: this.range(query), OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { vehicle: { businessNo: { contains: query.q } } }] : undefined };
    const [total, items] = await Promise.all([this.prisma.safetyAlert.count({ where }), this.prisma.safetyAlert.findMany({ where, ...this.page(query), include: eventInclude, orderBy: { occurredAt: 'desc' } })]);
    return { total, items: this.decorate(items, scope), page: query.page, pageSize: query.pageSize };
  }
  async violations(user: AuthUser, id: string, query: Query) {
    this.require(user, 'safety:violation:read'); const { scope } = await this.vehicle(user, id, query.workspaceId);
    const where = { vehicleId: id, organizationId: { in: scope.organizationIds }, occurredAt: this.range(query) };
    const [total, items] = await Promise.all([this.prisma.violation.count({ where }), this.prisma.violation.findMany({ where, ...this.page(query), orderBy: { occurredAt: 'desc' } })]); return { total, items, page: query.page, pageSize: query.pageSize };
  }
  async alert(user: AuthUser, id: string, query: Query) {
    this.require(user, 'safety:alert:read'); const scope = await this.scope(user, query.workspaceId);
    const row = await this.prisma.safetyAlert.findFirst({ where: { id, organizationId: { in: scope.organizationIds } }, include: eventInclude });
    if (!row) throw new NotFoundException('告警不存在或不在所选地市范围'); return this.decorate([row], scope)[0];
  }
  private videoSummary<T extends { attachmentJson: string | null }>(row: T) {
    const { videos, state } = parseAccidentVideos(row.attachmentJson);
    const { attachmentJson: _attachmentJson, ...data } = row;
    return { ...data, videoCount: videos.filter(video => video.url && video.state !== 'UNAVAILABLE').length, videoState: state };
  }
  async accidents(user: AuthUser, query: Query) {
    this.require(user, 'safety:accident:read'); const scope = await this.scope(user, query.workspaceId);
    if (query.vehicleId) await this.vehicle(user, query.vehicleId, query.workspaceId);
    const where: Prisma.AccidentWhereInput = { organizationId: { in: scope.organizationIds }, vehicleId: query.vehicleId, enterpriseId: query.enterpriseId, status: query.status, level: query.riskLevel, occurredAt: this.range(query), OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { vehicle: { businessNo: { contains: query.q } } }, { vehicle: { unifiedCode: { contains: query.q } } }] : undefined };
    // Legacy JSON attachments have no SQL video predicate. Apply it before pagination,
    // so a video filter can never miss records on an unfetched page.
    if (query.videoState) {
      const all = await this.prisma.accident.findMany({ where, orderBy: { occurredAt: 'desc' }, include: eventInclude });
      const filtered = this.decorate(all, scope).map(row => this.videoSummary(row)).filter(row => query.videoState === 'AVAILABLE' ? row.videoCount > 0 : !row.videoCount);
      return { total: filtered.length, items: filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), page: query.page, pageSize: query.pageSize };
    }
    const [total, rows] = await Promise.all([this.prisma.accident.count({ where }), this.prisma.accident.findMany({ where, ...this.page(query), orderBy: { occurredAt: 'desc' }, include: eventInclude })]);
    return { total, items: this.decorate(rows, scope).map(row => this.videoSummary(row)), page: query.page, pageSize: query.pageSize };
  }
  async accident(user: AuthUser, id: string, query: Query) {
    this.require(user, 'safety:accident:read'); const scope = await this.scope(user, query.workspaceId);
    const row = await this.prisma.accident.findFirst({ where: { id, organizationId: { in: scope.organizationIds } }, include: { ...eventInclude, operationRecord: true, reconstruction: true } });
    if (!row) throw new NotFoundException('事故不存在或不在所选地市范围');
    if (query.vehicleId && query.vehicleId !== row.vehicleId) throw new NotFoundException('事故不属于当前车辆');
    const from = new Date(row.occurredAt.getTime() - query.windowMinutes * 60000), to = new Date(row.occurredAt.getTime() + query.windowMinutes * 60000), range = { gte: from, lte: to };
    const canTrack = this.permitted(user, 'operation:trajectory:read'), canAlert = this.permitted(user, 'safety:alert:read'), canViolation = this.permitted(user, 'safety:violation:read');
    const [track, alerts, violations] = await Promise.all([
      canTrack ? this.prisma.vehicleTrackPoint.findMany({ where: { vehicleId: row.vehicleId, recordedAt: range, operationRecord: { vehicleId: row.vehicleId, organizationId: { in: scope.organizationIds } } }, orderBy: { recordedAt: 'asc' }, take: 5001 }) : [],
      canAlert ? this.prisma.safetyAlert.findMany({ where: { vehicleId: row.vehicleId, organizationId: { in: scope.organizationIds }, occurredAt: range }, orderBy: { occurredAt: 'asc' } }) : [],
      canViolation ? this.prisma.violation.findMany({ where: { vehicleId: row.vehicleId, organizationId: { in: scope.organizationIds }, occurredAt: range }, orderBy: { occurredAt: 'asc' } }) : [],
    ]);
    const video = parseAccidentVideos(row.attachmentJson);
    return { ...this.decorate([row], scope)[0], attachmentJson: undefined, videos: video.videos, videoState: video.state, window: { from, to, minutes: query.windowMinutes }, track: track.slice(0, 5000), trackTruncated: track.length > 5000, alerts, violations, access: { tracks: canTrack, alerts: canAlert, violations: canViolation } };
  }
}
