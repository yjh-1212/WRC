import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CockpitQueryDto } from './cockpit.dto';

const STALE_MS = 10 * 60_000;
const LOW_BATTERY = 25;

@Injectable()
export class CockpitService {
  constructor(private readonly prisma: PrismaService) {}

  private isSuper(user: AuthUser) { return user.roles.some((role) => role.code === 'SUPER_ADMIN'); }
  private organizationRelation(user: AuthUser) {
    return { is: { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } };
  }
  private vehicleWhere(user: AuthUser): Prisma.VehicleWhereInput {
    return this.isSuper(user) ? { deletedAt: null } : { organization: this.organizationRelation(user), deletedAt: null };
  }
  private startOfDay(offset = 0) {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + offset); return date;
  }
  private dateKey(value: Date) { return value.toISOString().slice(0, 10); }
  private round(value: number, digits = 1) { const power = 10 ** digits; return Math.round(value * power) / power; }
  private assertRegulator(user: AuthUser) {
    if (user.portal !== 'REGULATORY') throw new ForbiddenException('企业账号不能进入监管驾驶舱');
  }

  async overview(user: AuthUser, query: CockpitQueryDto) {
    this.assertRegulator(user);
    const scoped = this.vehicleWhere(user);
    const canCity = this.isSuper(user);
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
    if (organizationId) where.organizationId = organizationId;
    if (enterpriseId) where.enterpriseId = enterpriseId;
    if (vehicleId) where.id = vehicleId;

    const [vehicles, org, enterprise, vehicleRow, daily, regionRows, cityOrg] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        select: {
          id: true, name: true, businessNo: true, onlineStatus: true, enterpriseId: true, organizationId: true,
          enterprise: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          realtimeStatus: { select: { longitude: true, latitude: true, speed: true, battery: true, drivingState: true, heading: true, heartbeatAt: true, mileageToday: true, locationTime: true } },
          _count: { select: { safetyAlerts: { where: { status: { not: 'CLOSED' } } } } },
        },
      }),
      organizationId ? this.prisma.organization.findFirst({ where: { id: organizationId, ...(this.isSuper(user) ? {} : { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] }) }, select: { id: true, name: true } }) : null,
      enterpriseId ? this.prisma.enterprise.findFirst({ where: { id: enterpriseId, ...(this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }) }, select: { id: true, name: true, organizationId: true } }) : null,
      vehicleId ? this.prisma.vehicle.findFirst({ where: { id: vehicleId, ...scoped }, select: { id: true, name: true, businessNo: true, enterpriseId: true, organizationId: true } }) : null,
      this.prisma.vehicleOnlineDaily.findMany({
        where: { vehicle: where, metricDate: { gte: this.startOfDay(-6) } },
        select: { metricDate: true, onlineRate: true },
      }),
      this.prisma.operationRegion.findMany({
        where: {
          status: 'ACTIVE',
          ...(this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }),
          ...(organizationId ? { organizationId } : {}),
          ...(enterpriseId ? { enterpriseId } : {}),
        },
        select: { id: true, name: true, polygonJson: true, enterpriseId: true, organizationId: true },
      }),
      this.prisma.organization.findFirst({
        where: { parentId: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    if (organizationId && !org) throw new ForbiddenException('区县不在当前数据范围');
    if (enterpriseId && !enterprise) throw new ForbiddenException('企业不在当前数据范围');
    if (vehicleId && !vehicleRow) throw new NotFoundException('车辆不在当前数据范围');

    const level = vehicleRow ? 'vehicle' : enterprise ? 'enterprise' : org && requestedLevel !== 'city' ? 'district' : 'city';
    const located = vehicles.filter((item) => Number.isFinite(item.realtimeStatus?.longitude) && Number.isFinite(item.realtimeStatus?.latitude));
    const orderRows = await this.prisma.deliveryOrder.findMany({
      where: { status: { in: ['DISPATCHED', 'IN_TRANSIT'] } },
      distinct: ['vehicleId'],
      select: { vehicleId: true },
    }).catch(() => [] as Array<{ vehicleId: string }>);
    const orderVehicleIds = new Set(orderRows.map((row) => row.vehicleId));
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
    const focusTargets = await this.focusTargets(user, vehicles.map((v) => v.organizationId));
    const riskSnapshot = await this.riskSnapshot(user, vehicles.map((v) => v.organizationId));
    const map = this.mapPayload(level, mapMode, located, regionRows, vehicleRow?.id, orderVehicleIds);
    let track: Array<{ longitude: number; latitude: number; recordedAt: Date; speed: number; heading?: number }> = [];
    let currentOrder: Record<string, unknown> | null = null;
    let trip: Record<string, unknown> | null = null;
    if (level === 'vehicle' && vehicleRow) {
      const [record, orders] = await Promise.all([
        this.prisma.operationRecord.findFirst({
          where: { vehicleId: vehicleRow.id, trackPoints: { some: {} } },
          orderBy: { startedAt: 'desc' },
          select: {
            startAddress: true, endAddress: true, mileage: true, durationMinutes: true, status: true,
            trackPoints: { orderBy: { sequence: 'asc' }, select: { longitude: true, latitude: true, recordedAt: true, speed: true, heading: true } },
          },
        }),
        this.prisma.deliveryOrder.findMany({
          where: { vehicleId: vehicleRow.id, status: { in: ['DISPATCHED', 'IN_TRANSIT'] } },
          orderBy: { dispatchedAt: 'desc' },
          take: 1,
          select: {
            businessNo: true, status: true, cargoType: true, cargoWeight: true,
            startName: true, startAddress: true, endName: true, endAddress: true,
            startLng: true, startLat: true, endLng: true, endLat: true,
            progressPct: true, etaMinutes: true, dispatchedAt: true, startedAt: true,
          },
        }).catch(() => []),
      ]);
      const rawTrack = record?.trackPoints ?? [];
      if (rawTrack.length <= 320) track = rawTrack;
      else {
        const step = (rawTrack.length - 1) / 319;
        track = Array.from({ length: 320 }, (_, index) => rawTrack[Math.round(index * step)]);
      }
      const order = orders[0];
      if (order) {
        currentOrder = {
          businessNo: order.businessNo, status: order.status, cargoType: order.cargoType, cargoWeight: order.cargoWeight,
          startName: order.startName, startAddress: order.startAddress, endName: order.endName, endAddress: order.endAddress,
          progressPct: order.progressPct, etaMinutes: order.etaMinutes, dispatchedAt: order.dispatchedAt, startedAt: order.startedAt,
        };
        trip = {
          startName: order.startName, endName: order.endName,
          startLng: order.startLng, startLat: order.startLat, endLng: order.endLng, endLat: order.endLat,
        };
      } else if (track.length) {
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
      map: { ...map, track },
      context: vehicle ? {
        businessNo: vehicle.businessNo, name: vehicle.name, enterprise: vehicle.enterprise.name,
        organization: vehicle.organization.name, onlineStatus: vehicle.onlineStatus,
        drivingState: vehicle.realtimeStatus?.drivingState ?? null,
        speed: vehicle.realtimeStatus?.speed ?? null, battery: vehicle.realtimeStatus?.battery ?? null,
        heading: vehicle.realtimeStatus?.heading ?? null,
        longitude: vehicle.realtimeStatus?.longitude ?? null, latitude: vehicle.realtimeStatus?.latitude ?? null,
        heartbeatAt: vehicle.realtimeStatus?.heartbeatAt ?? null, locationTime: vehicle.realtimeStatus?.locationTime ?? null,
        mileageToday: vehicle.realtimeStatus?.mileageToday ?? 0,
        currentOrder, trip,
      } : {
        districts: level === 'city' ? new Set(vehicles.map((item) => item.organizationId)).size : undefined,
        enterprises, registered: vehicles.length, online: online.length, running: running.length, offline: offline.length, regions: regionRows.length,
      },
    };
  }

  private parsePolygon(value: string) {
    try { return JSON.parse(value) as Array<{ longitude: number; latitude: number }>; } catch { return []; }
  }

  /** "余杭区交通运输局" → "余杭区"，"杭州市交通运输局" → "杭州市" */
  private shortOrgName(name: string) {
    const m = name.match(/^(.+?[市区县镇乡])/);
    return m ? m[1] : name;
  }

  /** 杭州各区已知中心坐标（GCJ-02），city 级别 marker 定位专用。
   *  不在此表中的组织（如市本级）不在地图上单独显示，避免与区级 marker 重叠。 */
  private static DISTRICT_CENTERS: Record<string, { longitude: number; latitude: number }> = {
    '余杭区': { longitude: 120.165, latitude: 30.430 },
    '西湖区': { longitude: 119.960, latitude: 30.248 },
    '上城区': { longitude: 120.155, latitude: 30.232 },
    '拱墅区': { longitude: 120.083, latitude: 30.358 },
    '滨江区': { longitude: 120.215, latitude: 30.183 },
    '萧山区': { longitude: 120.350, latitude: 30.150 },
    '钱塘区': { longitude: 120.430, latitude: 30.311 },
    '临平区': { longitude: 120.385, latitude: 30.419 },
    '富阳区': { longitude: 119.960, latitude: 30.049 },
    '临安区': { longitude: 119.724, latitude: 30.232 },
  };

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
    located: Array<{ id: string; name: string; businessNo: string; onlineStatus: string; enterpriseId: string; organizationId: string; enterprise: { id: string; name: string }; organization: { id: string; name: string }; realtimeStatus: { longitude: number; latitude: number; drivingState: string; battery: number; speed: number } | null }>,
    regions: Array<{ id: string; name: string; polygonJson: string }>,
    selectedVehicleId?: string,
    orderVehicleIds: Set<string> = new Set(),
  ) {
    if (mapMode === 'regions') {
      const items = regions.map((item) => ({ id: item.id, name: item.name, polygon: this.parsePolygon(item.polygonJson) })).filter((item) => item.polygon.length >= 3);
      return { kind: 'regions' as const, items };
    }
    if (mapMode === 'vehicles' && (level === 'enterprise' || level === 'vehicle')) {
      return {
        kind: 'vehicles' as const,
        items: located.filter((item) => level !== 'vehicle' || item.id === selectedVehicleId).map((item) => ({
          id: item.id, name: item.name, businessNo: item.businessNo, onlineStatus: item.onlineStatus,
          drivingState: item.realtimeStatus?.drivingState ?? 'OFFLINE', battery: item.realtimeStatus?.battery ?? null,
          speed: item.realtimeStatus?.speed ?? 0, longitude: item.realtimeStatus!.longitude, latitude: item.realtimeStatus!.latitude,
          enterprise: item.enterprise.name, hasOrder: orderVehicleIds.has(item.id),
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
            enterprise: item.enterprise.name, hasOrder: orderVehicleIds.has(item.id),
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
          // 仅输出有已知区中心坐标的组织，市本级（杭州市）不在此表中，跳过避免重叠
          const center = CockpitService.DISTRICT_CENTERS[shortName];
          if (!center) return null;
          return { id, name: shortName, count: list.length, online: list.filter((item) => item.onlineStatus === 'ONLINE').length, running: list.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING').length, ...center };
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
        return { id, name: list[0].enterprise.name, count: list.length, online: list.filter((item) => item.onlineStatus === 'ONLINE').length, running: list.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING').length, ...center };
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
  private async riskSnapshot(user: AuthUser, orgIds: string[]) {
    const orgWhere = this.isSuper(user) ? {} : { organizationId: { in: [...new Set(orgIds)] } };
    const today = this.startOfDay();
    const [alertToday, alertHigh, alertUnhandled, accidents, violations, offlineAbnormal] = await Promise.all([
      this.prisma.safetyAlert.count({ where: { ...orgWhere, occurredAt: { gte: today } } }),
      this.prisma.safetyAlert.count({ where: { ...orgWhere, level: 'HIGH', status: { in: ['PENDING_CONFIRMATION', 'PROCESSING'] } } }),
      this.prisma.safetyAlert.count({ where: { ...orgWhere, status: { in: ['PENDING_CONFIRMATION', 'PROCESSING'] } } }),
      this.prisma.accident.count({ where: { ...orgWhere, occurredAt: { gte: today } } }),
      this.prisma.violation.count({ where: { ...orgWhere, status: { in: ['UNHANDLED', 'PROCESSING'] } } }),
      this.prisma.offlineEvent.count({ where: { ...orgWhere, endedAt: null } }),
    ]);
    return { alertToday, alertHigh, alertUnhandled, accidents, violations, offlineAbnormal };
  }
}
