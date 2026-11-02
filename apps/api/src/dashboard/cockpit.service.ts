import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CockpitQueryDto } from './cockpit.dto';
import { currentVehicleTrack } from './current-vehicle-track';

const STALE_MS = 10 * 60_000;
const LOW_BATTERY = 25;

@Injectable()
export class CockpitService {
  constructor(private readonly prisma: PrismaService) {}

  private isSuper(user: AuthUser) { return user.accountLevel === 'PROVINCE' || (!!user.workspaceId && user.accountLevel !== 'OPERATIONS') || (!user.accountLevel && user.roles.some((role) => role.code === 'SUPER_ADMIN')); }
  private organizationRelation(user: AuthUser) {
    return { is: { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } };
  }
  private vehicleWhere(user: AuthUser): Prisma.VehicleWhereInput {
    return this.isSuper(user) ? { deletedAt: null } : { organization: this.organizationRelation(user), deletedAt: null };
  }
  private startOfDay(offset = 0) {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + offset); return date;
  }
  private dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
  private round(value: number, digits = 1) { const power = 10 ** digits; return Math.round(value * power) / power; }
  private assertRegulator(user: AuthUser) {
    if (user.portal !== 'REGULATORY') throw new ForbiddenException('企业账号不能进入监管驾驶舱');
  }

  async overview(user: AuthUser, query: CockpitQueryDto, provinceScope?: { organizationIds: string[]; cityOrganizationId: string }) {
    this.assertRegulator(user);
    const scoped: Prisma.VehicleWhereInput = provinceScope ? { AND: [this.vehicleWhere(user), { organizationId: { in: provinceScope.organizationIds } }] } : this.vehicleWhere(user);
    const canCity = user.accountLevel === 'PROVINCE' || (!!user.workspace && user.organizationId === user.workspace.organizationId) || (!user.accountLevel && this.isSuper(user));
    let requestedLevel = query.level ?? (canCity ? 'city' : 'district');
    let organizationId = query.organizationId || undefined;
    if (!canCity) {
      if (requestedLevel === 'city') requestedLevel = 'district';
      organizationId = organizationId || user.organizationId || undefined;
    }
    const enterpriseId = query.enterpriseId;
    const vehicleId = query.vehicleId;
    const mapMode = query.mapMode ?? 'situation';

    const where: Prisma.VehicleWhereInput = { ...scoped };
    if (query.vehicleType && query.vehicleType !== 'ALL') where.vehicleType = query.vehicleType;
    if (organizationId) {
      if (provinceScope && !provinceScope.organizationIds.includes(organizationId)) throw new ForbiddenException('区县不在当前地市范围');
      where.organizationId = organizationId === user.organizationId && user.scopeOrganizationIds?.length ? { in: user.scopeOrganizationIds } : organizationId;
    }
    if (enterpriseId) where.enterpriseId = enterpriseId;
    if (vehicleId) where.id = vehicleId;

    const [vehicles, org, enterprise, vehicleRow, daily, regionRows, cityOrg] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        select: {
          id: true, name: true, businessNo: true, vehicleType: true, onlineStatus: true, enterpriseId: true, organizationId: true,
          enterprise: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          realtimeStatus: { select: { longitude: true, latitude: true, speed: true, battery: true, drivingState: true, heading: true, heartbeatAt: true, mileageToday: true, locationTime: true } },
          _count: { select: { safetyAlerts: { where: { status: { not: 'CLOSED' } } } } },
        },
      }),
      organizationId ? this.prisma.organization.findFirst({ where: { id: organizationId, ...(this.isSuper(user) ? {} : { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] }) }, select: { id: true, name: true } }) : null,
      enterpriseId ? this.prisma.enterprise.findFirst({ where: { id: enterpriseId, ...(provinceScope ? { organizationId: { in: provinceScope.organizationIds } } : {}), ...(this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }) }, select: { id: true, name: true, organizationId: true } }) : null,
      vehicleId ? this.prisma.vehicle.findFirst({ where: { id: vehicleId, ...scoped, ...(provinceScope && organizationId ? { organizationId } : {}), ...(provinceScope && enterpriseId ? { enterpriseId } : {}) }, select: { id: true, name: true, businessNo: true, enterpriseId: true, organizationId: true } }) : null,
      this.prisma.vehicleOnlineDaily.findMany({
        where: { vehicle: where, metricDate: { gte: this.startOfDay(-6) } },
        select: { metricDate: true, onlineRate: true },
      }),
      this.prisma.operationRegion.findMany({
        where: {
          status: 'ACTIVE',
          ...(provinceScope ? { AND: [{ organizationId: { in: provinceScope.organizationIds } }] } : {}),
          ...(this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }),
          ...(organizationId ? { organizationId } : {}),
          ...(enterpriseId ? { OR: [{ enterpriseId }, { enterpriseId: null, vehicles: { some: { vehicle: { enterpriseId } } } }] } : {}),
          ...(vehicleId ? { vehicles: { some: { vehicleId } } } : {}),
        },
        select: { id: true, name: true, polygonJson: true, enterpriseId: true, organizationId: true },
      }),
      this.prisma.organization.findFirst({
        where: provinceScope ? { id: provinceScope.cityOrganizationId } : user.workspace ? { id: user.workspace.organizationId } : { code: '370000' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    if (organizationId && !org) throw new ForbiddenException('区县不在当前数据范围');
    if (enterpriseId && !enterprise) throw new ForbiddenException('企业不在当前数据范围');
    if (provinceScope && enterprise && organizationId && enterprise.organizationId !== organizationId) throw new ForbiddenException('企业不在当前区县范围');
    if (vehicleId && (!vehicleRow || !vehicles.some(row => row.id === vehicleId))) throw new NotFoundException('车辆不在当前数据范围');

    const level = vehicleRow ? 'vehicle' : enterprise ? 'enterprise' : org && requestedLevel !== 'city' ? 'district' : 'city';
    const located = vehicles.filter((item) => Number.isFinite(item.realtimeStatus?.longitude) && Number.isFinite(item.realtimeStatus?.latitude));
    const online = vehicles.filter((item) => item.onlineStatus === 'ONLINE');
    const running = vehicles.filter((item) => item.onlineStatus === 'ONLINE' && item.realtimeStatus?.drivingState === 'RUNNING');
    const standby = vehicles.filter((item) => item.onlineStatus === 'ONLINE' && item.realtimeStatus?.drivingState !== 'RUNNING');
    const offline = vehicles.filter((item) => item.onlineStatus !== 'ONLINE');
    const stale = vehicles.filter((item) => !item.realtimeStatus || Date.now() - item.realtimeStatus.heartbeatAt.getTime() > STALE_MS);
    const mileageToday = this.round(vehicles.reduce((sum, item) => sum + (item.realtimeStatus?.mileageToday ?? 0), 0));
    const enterprises = new Set(vehicles.map((item) => item.enterpriseId)).size;
    const dates = Array.from({ length: 7 }, (_, index) => this.dateKey(this.startOfDay(index - 6)));
    const trend = dates.map((date) => {
      const points = daily.filter((item) => this.dateKey(item.metricDate) === date);
      return { date, onlineRate: points.length ? this.round(points.reduce((sum, item) => sum + item.onlineRate, 0) / points.length) : null, samples: points.length };
    });
    const hasTrend = trend.some((item) => item.samples > 0);

    const distribution = this.distribution(level, vehicles, located);
    const enterpriseRank = this.enterpriseRank(vehicles);
    const [focusTargets, riskSnapshot] = await Promise.all([
      provinceScope ? { enterprises: [], vehicles: [] } : this.focusTargets(user, vehicles.map((v) => v.organizationId)),
      this.riskSnapshot(user, vehicles.map((v) => v.organizationId), vehicles.map(v => v.id)),
    ]);
    const map = this.mapPayload(level, mapMode, located, regionRows, vehicleRow?.id);
    let track: Array<{ longitude: number; latitude: number; recordedAt: Date; speed: number; heading?: number }> = [];
    let historyTrack: { startName: string; endName: string; startedAt: Date; endedAt: Date | null } | null = null;
    let latestOperation: Record<string, unknown> | null = null;
    let trip: Record<string, unknown> | null = null;
    let currentTrack: Awaited<ReturnType<typeof currentVehicleTrack>> = { track: [], trip: null };
    if (level === 'vehicle' && vehicleRow) {
      const reporting = vehicles.find(row => row.id === vehicleRow.id);
      const [record, activeTrack, latest] = await Promise.all([
        this.prisma.operationRecord.findFirst({
          where: { vehicleId: vehicleRow.id, trackPoints: { some: {} } },
          orderBy: { startedAt: 'desc' },
          select: {
            startAddress: true, endAddress: true, startedAt: true, endedAt: true, mileage: true, durationMinutes: true, status: true,
            trackPoints: { orderBy: { sequence: 'asc' }, select: { longitude: true, latitude: true, recordedAt: true, speed: true, heading: true } },
          },
        }),
        reporting?.onlineStatus === 'ONLINE' && reporting.realtimeStatus?.drivingState === 'RUNNING' ? currentVehicleTrack(this.prisma, vehicleRow.id) : { track: [], trip: null },
        this.prisma.operationRecord.findFirst({ where: { vehicleId: vehicleRow.id }, orderBy: { startedAt: 'desc' }, select: { startedAt: true, endedAt: true, mileage: true, durationMinutes: true, status: true } }),
      ]);
      currentTrack = activeTrack;
      const rawTrack = record?.trackPoints ?? [];
      if (record && rawTrack.length) historyTrack = { startName: record.startAddress ?? '历史轨迹起点', endName: record.endAddress ?? '历史轨迹终点', startedAt: record.startedAt, endedAt: record.endedAt };
      if (rawTrack.length <= 320) track = rawTrack;
      else {
        const step = (rawTrack.length - 1) / 319;
        track = Array.from({ length: 320 }, (_, index) => rawTrack[Math.round(index * step)]);
      }
      if (latest) latestOperation = latest;
      if (track.length) {
        const first = track[0];
        const last = track[track.length - 1];
        trip = {
          startName: record?.startAddress ?? '起点', endName: record?.endAddress ?? '终点',
          startLng: first.longitude, startLat: first.latitude, endLng: last.longitude, endLat: last.latitude,
        };
      }
    }

    const focusItems = [...vehicles].map((item) => {
      const reasons: string[] = [];
      if (item.onlineStatus !== 'ONLINE') reasons.push('离线');
      if (!item.realtimeStatus || Date.now() - item.realtimeStatus.heartbeatAt.getTime() > STALE_MS) reasons.push('超过 10 分钟未上报');
      if ((item.realtimeStatus?.battery ?? 100) < LOW_BATTERY) reasons.push(`低电量 ${item.realtimeStatus?.battery ?? '--'}%`);
      if (item._count.safetyAlerts > 0) reasons.push('存在未关闭告警');
      return reasons.length ? {
        id: item.id, businessNo: item.businessNo, name: item.name, enterprise: item.enterprise.name,
        reason: reasons.join(' · '), battery: item.realtimeStatus?.battery ?? null,
        heartbeatAt: item.realtimeStatus?.heartbeatAt ?? null,
      } : null;
    }).filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 8);

    const vehicle = level === 'vehicle' ? vehicles[0] : null;
    return {
      updatedAt: new Date(),
      level, connected: true, cityCode: user.workspace?.cityCode ?? null,
      cityName: user.workspace?.cityName ?? this.shortOrgName(cityOrg?.name ?? '当前监管范围'),
      vehicles: located.map(row => ({ id: row.id, name: row.name, businessNo: row.businessNo, vehicleType: row.vehicleType, organizationId: row.organizationId, enterpriseId: row.enterpriseId,
        enterprise: row.enterprise.name, organization: row.organization.name, onlineStatus: row.onlineStatus, openAlerts: row._count.safetyAlerts, ...row.realtimeStatus })),
      vehicleTypes: vehicles.reduce((types, vehicle) => { types[vehicle.vehicleType] = (types[vehicle.vehicleType] ?? 0) + 1; return types; }, {} as Record<string, number>),
      hasTrend,
      mapModes: [
        { id: 'situation', label: '综合态势' },
        ...(['enterprise', 'vehicle'].includes(level)
          ? [{ id: 'vehicles' as const, label: '车辆运行' }]
          : [{ id: 'enterprises' as const, label: '企业分布' }]),
        ...(regionRows.some((item) => this.parsePolygon(item.polygonJson).length >= 3) ? [{ id: 'regions' as const, label: '运行区域' }] : []),
      ],
      scope: {
        level,
        canCity,
        city: { id: cityOrg?.id ?? null, name: cityOrg?.name ?? '当前监管范围' },
        district: org ? { id: org.id, name: org.id === cityOrg?.id ? `${org.name}（市本级）` : org.name } : null,
        enterprise: enterprise ? { id: enterprise.id, name: enterprise.name } : null,
        vehicle: vehicle ? { id: vehicle.id, name: vehicle.name, businessNo: vehicle.businessNo } : null,
      },
      summary: {
        registered: vehicles.length,
        online: online.length,
        running: running.length,
        offline: offline.length,
        onlineRate: vehicles.length ? this.round(online.length / vehicles.length * 100) : 0,
        enterprises,
        mileageToday,
        regions: regionRows.length,
        dataQualityRate: vehicles.length ? this.round(located.length / vehicles.length * 100) : 0,
        districts: level === 'city' ? new Set(vehicles.map((item) => item.organizationId)).size : undefined,
      },
      trend: hasTrend ? trend : [],
      enterpriseRank,
      statusDistribution: [
        { key: 'running', label: '运行中', count: running.length },
        { key: 'standby', label: '在线待机', count: standby.length },
        { key: 'offline', label: '离线', count: offline.length },
      ],
      distribution,
      focusItems,
      focusTargets,
      riskSnapshot,
      map: { ...map, track, currentTrack: currentTrack.track, operationRegions: regionRows.map(row => ({ id: row.id, name: row.name, polygon: this.parsePolygon(row.polygonJson) })) },
      context: vehicle ? {
        businessNo: vehicle.businessNo, name: vehicle.name, enterprise: vehicle.enterprise.name,
        organization: vehicle.organization.name, onlineStatus: vehicle.onlineStatus,
        drivingState: vehicle.realtimeStatus?.drivingState ?? null,
        speed: vehicle.realtimeStatus?.speed ?? null, battery: vehicle.realtimeStatus?.battery ?? null,
        heading: vehicle.realtimeStatus?.heading ?? null,
        longitude: vehicle.realtimeStatus?.longitude ?? null, latitude: vehicle.realtimeStatus?.latitude ?? null,
        heartbeatAt: vehicle.realtimeStatus?.heartbeatAt ?? null, locationTime: vehicle.realtimeStatus?.locationTime ?? null,
        mileageToday: vehicle.realtimeStatus?.mileageToday ?? 0,
        latestOperation, trip, historyTrack, currentTrip: currentTrack.trip,
      } : {
        districts: level === 'city' ? new Set(vehicles.map((item) => item.organizationId)).size : undefined,
        enterprises, registered: vehicles.length, online: online.length, running: running.length, offline: offline.length, regions: regionRows.length,
      },
    };
  }

  private parsePolygon(value: string) {
    try { return JSON.parse(value) as Array<{ longitude: number; latitude: number }>; } catch { return []; }
  }

  /** Remove the department suffix while keeping the actual jurisdiction name. */
  private shortOrgName(name: string) {
    const m = name.match(/^(.+?[市区县镇乡])/);
    return m ? m[1] : name;
  }

  private centroid(items: Array<{ realtimeStatus: { longitude: number; latitude: number } | null }>) {
    const pts = items.filter((item) => item.realtimeStatus);
    if (!pts.length) return null;
    return {
      longitude: this.round(pts.reduce((sum, item) => sum + item.realtimeStatus!.longitude, 0) / pts.length, 6),
      latitude: this.round(pts.reduce((sum, item) => sum + item.realtimeStatus!.latitude, 0) / pts.length, 6),
    };
  }

  private distribution(level: string, vehicles: Array<{ id: string; name: string; businessNo: string; onlineStatus: string; realtimeStatus: { drivingState: string; heartbeatAt: Date } | null; enterprise: { id: string; name: string }; organization: { id: string; name: string } }>, located: typeof vehicles) {
    if (level === 'city') {
      const groups = new Map<string, { id: string; name: string; count: number; online: number }>();
      for (const item of vehicles) {
        const current = groups.get(item.organization.id) ?? { id: item.organization.id, name: this.shortOrgName(item.organization.name), count: 0, online: 0 };
        current.count += 1; if (item.onlineStatus === 'ONLINE') current.online += 1; groups.set(item.organization.id, current);
      }
      return { kind: 'districts', title: '辖区车辆分布', items: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 5) };
    }
    if (level === 'district') {
      const groups = new Map<string, { id: string; name: string; count: number; online: number }>();
      for (const item of vehicles) {
        const current = groups.get(item.enterprise.id) ?? { id: item.enterprise.id, name: item.enterprise.name, count: 0, online: 0 };
        current.count += 1; if (item.onlineStatus === 'ONLINE') current.online += 1; groups.set(item.enterprise.id, current);
      }
      return { kind: 'enterprises', title: '企业车辆分布', items: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 5) };
    }
    return {
      kind: 'vehicles', title: '最近上报车辆',
      items: [...located].sort((a, b) => (b.realtimeStatus?.heartbeatAt.getTime() ?? 0) - (a.realtimeStatus?.heartbeatAt.getTime() ?? 0)).slice(0, 5)
        .map((item) => ({ id: item.id, name: item.businessNo, count: 1, online: item.onlineStatus === 'ONLINE' ? 1 : 0 })),
    };
  }

  private enterpriseRank(vehicles: Array<{ enterpriseId: string; enterprise: { id: string; name: string }; onlineStatus: string }>) {
    const groups = new Map<string, { id: string; name: string; total: number; online: number }>();
    for (const v of vehicles) {
      const cur = groups.get(v.enterpriseId) ?? { id: v.enterpriseId, name: v.enterprise.name, total: 0, online: 0 };
      cur.total += 1;
      if (v.onlineStatus === 'ONLINE') cur.online += 1;
      groups.set(v.enterpriseId, cur);
    }
    return [...groups.values()]
      .sort((a, b) => b.online - a.online)
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        name: item.name,
        online: item.online,
        total: item.total,
        onlineRate: item.total ? this.round(item.online / item.total * 100) : 0,
      }));
  }

  private mapPayload(
    level: string,
    mapMode: string,
    located: Array<{ id: string; name: string; businessNo: string; onlineStatus: string; enterpriseId: string; organizationId: string; enterprise: { id: string; name: string }; organization: { id: string; name: string }; realtimeStatus: { longitude: number; latitude: number; drivingState: string; battery: number; speed: number; heading: number; heartbeatAt: Date } | null }>,
    regions: Array<{ id: string; name: string; polygonJson: string }>,
    selectedVehicleId?: string,
  ) {
    if (mapMode === 'regions') {
      const items = regions.map((item) => ({ id: item.id, name: item.name, polygon: this.parsePolygon(item.polygonJson) })).filter((item) => item.polygon.length >= 3);
      return { kind: 'regions' as const, items };
    }
    if (mapMode === 'vehicles') {
      return {
        kind: 'vehicles' as const,
        items: located.filter((item) => level !== 'vehicle' || item.id === selectedVehicleId).map((item) => ({
          id: item.id, name: item.name, businessNo: item.businessNo, onlineStatus: item.onlineStatus,
          drivingState: item.realtimeStatus?.drivingState ?? 'OFFLINE', battery: item.realtimeStatus?.battery ?? null,
          speed: item.realtimeStatus?.speed ?? 0, longitude: item.realtimeStatus!.longitude, latitude: item.realtimeStatus!.latitude,
          enterprise: item.enterprise.name,
          heading: item.realtimeStatus?.heading ?? null, heartbeatAt: item.realtimeStatus?.heartbeatAt ?? null,
        })),
      };
    }
    if (level === 'enterprise' || level === 'vehicle' || mapMode === 'vehicles') {
      if (level === 'city' || (level === 'district' && mapMode !== 'enterprises')) {
        /* city/district 车辆运行仍按聚合，避免一次打出全部车辆 */
      } else {
        return {
          kind: 'vehicles' as const,
          items: located.map((item) => ({
            id: item.id, name: item.name, businessNo: item.businessNo, onlineStatus: item.onlineStatus,
            drivingState: item.realtimeStatus?.drivingState ?? 'OFFLINE', battery: item.realtimeStatus?.battery ?? null,
            speed: item.realtimeStatus?.speed ?? 0, longitude: item.realtimeStatus!.longitude, latitude: item.realtimeStatus!.latitude,
            enterprise: item.enterprise.name,
            heading: item.realtimeStatus?.heading ?? null, heartbeatAt: item.realtimeStatus?.heartbeatAt ?? null,
          })),
        };
      }
    }
    if (level === 'city' && mapMode !== 'enterprises') {
      const groups = new Map<string, typeof located>();
      for (const item of located) {
        const list = groups.get(item.organizationId) ?? []; list.push(item); groups.set(item.organizationId, list);
      }
      return {
        kind: 'districts' as const,
        items: [...groups.entries()].map(([id, list]) => {
          const shortName = this.shortOrgName(list[0].organization.name);
          const center = this.centroid(list);
          if (!center) return null;
          return { id, name: shortName, count: list.length, online: list.filter((item) => item.onlineStatus === 'ONLINE').length, running: list.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING').length, heartbeatAt: list.map(v => v.realtimeStatus?.heartbeatAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null, ...center };
        }).filter((item): item is NonNullable<typeof item> => Boolean(item)),
      };
    }
    const groups = new Map<string, typeof located>();
    for (const item of located) {
      const list = groups.get(item.enterpriseId) ?? []; list.push(item); groups.set(item.enterpriseId, list);
    }
    return {
      kind: 'enterprises' as const,
      items: [...groups.entries()].map(([id, list]) => {
        const center = this.centroid(list); if (!center) return null;
        return { id, name: list[0].enterprise.name, count: list.length, online: list.filter((item) => item.onlineStatus === 'ONLINE').length, running: list.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING').length, heartbeatAt: list.map(v => v.realtimeStatus?.heartbeatAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null, ...center };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    };
  }

  /** 重点监管对象：按企业/车辆两维度聚合告警与违规，仅返回有问题的对象 */
  private async focusTargets(user: AuthUser, orgIds: string[]) {
    const orgWhere = this.isSuper(user) ? {} : { organizationId: { in: [...new Set(orgIds)] } };

    // 企业维度：告警数 + 违规数（未关闭）
    const alertsByEnt = await this.prisma.safetyAlert.groupBy({
      by: ['enterpriseId'],
      where: { ...orgWhere, status: { in: ['PENDING_CONFIRMATION', 'PROCESSING'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });
    const violsByEnt = await this.prisma.violation.groupBy({
      by: ['enterpriseId'],
      where: { ...orgWhere, status: { in: ['UNHANDLED', 'PROCESSING'] } },
      _count: { id: true },
    });
    const violMapEnt = Object.fromEntries(violsByEnt.map((r) => [r.enterpriseId, r._count.id]));

    const entIds = alertsByEnt.map((r) => r.enterpriseId).filter(Boolean) as string[];
    const entRows = entIds.length
      ? await this.prisma.enterprise.findMany({ where: { id: { in: entIds } }, select: { id: true, name: true } })
      : [];
    const entNameMap = Object.fromEntries(entRows.map((e) => [e.id, e.name]));

    const enterprises = alertsByEnt.map((r) => {
      const alerts = r._count.id;
      const violations = violMapEnt[r.enterpriseId ?? ''] ?? 0;
      const risk = alerts >= 5 || violations >= 3 ? 'HIGH' : alerts >= 3 || violations >= 1 ? 'MEDIUM' : 'LOW';
      return { id: r.enterpriseId ?? '', name: entNameMap[r.enterpriseId ?? ''] ?? '未知企业', alerts, violations, risk };
    });

    // 车辆维度：最近未处理告警的车辆 TOP5
    const alertsByVeh = await this.prisma.safetyAlert.groupBy({
      by: ['vehicleId'],
      where: { ...orgWhere, vehicleId: { not: null }, status: { in: ['PENDING_CONFIRMATION', 'PROCESSING'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });
    const vehIds = alertsByVeh.map((r) => r.vehicleId).filter(Boolean) as string[];
    const vehRows = vehIds.length
      ? await this.prisma.vehicle.findMany({
          where: { id: { in: vehIds } },
          select: { id: true, businessNo: true, name: true, enterprise: { select: { name: true } }, realtimeStatus: { select: { battery: true, drivingState: true } } },
        })
      : [];
    const vehMap = Object.fromEntries(vehRows.map((v) => [v.id, v]));

    const vehicles = alertsByVeh.map((r) => {
      const veh = vehMap[r.vehicleId ?? ''];
      if (!veh) return null;
      const alerts = r._count.id;
      const risk = alerts >= 3 ? 'HIGH' : alerts >= 2 ? 'MEDIUM' : 'LOW';
      return { id: veh.id, businessNo: veh.businessNo, name: veh.name, enterprise: veh.enterprise.name, alerts, battery: veh.realtimeStatus?.battery ?? null, risk };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item));

    return { enterprises, vehicles };
  }

  /** 当前风险态势快照：6个真实指标 */
  private async riskSnapshot(user: AuthUser, orgIds: string[], vehicleIds: string[]) {
    const orgWhere = { ...(this.isSuper(user) ? {} : { organizationId: { in: [...new Set(orgIds)] } }), vehicleId: { in: vehicleIds } };
    const today = this.startOfDay();
    const [alertToday, alertHigh, alertUnhandled, accidents, violations, offlineAbnormal, majorAlerts, majorAccidents] = await Promise.all([
      this.prisma.safetyAlert.count({ where: { ...orgWhere, occurredAt: { gte: today } } }),
      this.prisma.safetyAlert.count({ where: { ...orgWhere, level: { in: ['HIGH', 'CRITICAL'] }, status: { in: ['PENDING_CONFIRMATION', 'PROCESSING'] } } }),
      this.prisma.safetyAlert.count({ where: { ...orgWhere, status: { in: ['PENDING_CONFIRMATION', 'PROCESSING'] } } }),
      this.prisma.accident.count({ where: { ...orgWhere, occurredAt: { gte: today } } }),
      this.prisma.violation.count({ where: { ...orgWhere, status: { in: ['UNHANDLED', 'PROCESSING'] } } }),
      this.prisma.offlineEvent.count({ where: { ...orgWhere, endedAt: null } }),
      this.prisma.safetyAlert.count({ where: { ...orgWhere, occurredAt: { gte: today }, level: { in: ['HIGH', 'CRITICAL'] } } }),
      this.prisma.accident.count({ where: { ...orgWhere, occurredAt: { gte: today }, level: { in: ['MAJOR', 'SERIOUS'] } } }),
    ]);
    return { alertToday, alertHigh, alertUnhandled, accidents, violations, offlineAbnormal, majorToday: majorAlerts + majorAccidents };
  }
}
