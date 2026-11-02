import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ThreeLevelCockpitQueryDto } from './three-level-cockpit.dto';

type Snapshot = {
  registeredVehicles: number; onlineVehicles: number; runningVehicles: number; operatingEnterprises: number;
  mileageToday: number; riskEvents: number; majorEvents: number; unresolvedMajor: number; dataQualityRate: number;
  deliveryVehicles: number; sanitationVehicles: number; patrolVehicles: number; retailVehicles: number; shuttleVehicles: number;
  capturedAt: Date; reportedAt: Date; sourceName: string; vehicleMetricsJson?: string | null;
};

type MetricSnapshot = Pick<Snapshot,
  'registeredVehicles' | 'onlineVehicles' | 'runningVehicles' | 'operatingEnterprises' |
  'mileageToday' | 'riskEvents' | 'majorEvents' | 'unresolvedMajor' | 'dataQualityRate'>;

type SummaryMetrics = MetricSnapshot & { onlineRate: number };
type ConnectedScene = {
  summary: SummaryMetrics;
  vehicleTypes: Record<string, number>;
  source: { name: string; reportedAt: Date | null; capturedAt: Date | null; scope: string };
};

@Injectable()
export class ThreeLevelCockpitService {
  constructor(private readonly prisma: PrismaService) {}

  private assertRegulator(user: AuthUser) {
    if (user.portal !== 'REGULATORY') throw new ForbiddenException('企业账号不能进入监管驾驶舱');
  }
  private startOfDay(offset = 0) {
    const value = new Date(); value.setHours(0, 0, 0, 0); value.setDate(value.getDate() + offset); return value;
  }
  private round(value: number, digits = 1) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
  private dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
  private riskLevel(riskEvents: number, majorEvents: number) {
    if (majorEvents > 0 || riskEvents >= 18) return 'HIGH';
    if (riskEvents >= 8) return 'MEDIUM';
    return 'LOW';
  }
  private vehicleTypeValue(row: Snapshot, vehicleType: string) {
    const map: Record<string, number> = {
      DELIVERY: row.deliveryVehicles, SANITATION: row.sanitationVehicles, PATROL: row.patrolVehicles,
      RETAIL: row.retailVehicles, SHUTTLE: row.shuttleVehicles,
    };
    return vehicleType === 'ALL' ? row.registeredVehicles : map[vehicleType] ?? row.registeredVehicles;
  }
  private filterSnapshot(row: Snapshot, vehicleType: string) {
    if (vehicleType === 'ALL') return row;
    if (!row.vehicleMetricsJson) return null;
    try {
      const stored = JSON.parse(row.vehicleMetricsJson)[vehicleType];
      return stored ? { ...row, ...stored } as Snapshot : null;
    } catch { return null; }
  }
  private summarize(rows: MetricSnapshot[]): SummaryMetrics {
    const total = rows.reduce((sum, row) => ({
      registeredVehicles: sum.registeredVehicles + row.registeredVehicles,
      onlineVehicles: sum.onlineVehicles + row.onlineVehicles,
      runningVehicles: sum.runningVehicles + row.runningVehicles,
      operatingEnterprises: sum.operatingEnterprises + row.operatingEnterprises,
      mileageToday: sum.mileageToday + row.mileageToday,
      riskEvents: sum.riskEvents + row.riskEvents,
      majorEvents: sum.majorEvents + row.majorEvents,
      unresolvedMajor: sum.unresolvedMajor + row.unresolvedMajor,
      dataQualityRate: sum.dataQualityRate + row.dataQualityRate,
    }), { registeredVehicles: 0, onlineVehicles: 0, runningVehicles: 0, operatingEnterprises: 0, mileageToday: 0, riskEvents: 0, majorEvents: 0, unresolvedMajor: 0, dataQualityRate: 0 });
    return {
      ...total,
      mileageToday: this.round(total.mileageToday),
      onlineRate: total.registeredVehicles ? this.round(total.onlineVehicles / total.registeredVehicles * 100) : 0,
      dataQualityRate: rows.length ? this.round(total.dataQualityRate / rows.length) : 0,
    };
  }
  private latestByRegion<T extends { regionId: string; capturedAt: Date }>(rows: T[]) {
    const latest = new Map<string, T>();
    rows.forEach((row) => { if (!latest.has(row.regionId)) latest.set(row.regionId, row); });
    return latest;
  }

  async scene(user: AuthUser, query: ThreeLevelCockpitQueryDto) {
    this.assertRegulator(user);
    const isProvince = user.accountLevel === 'PROVINCE' || (!user.accountLevel && user.roles.some(role => role.code === 'SUPER_ADMIN'));
    const homeCode = user.workspace?.cityCode ?? '370100';
    const level = query.level ?? (isProvince ? 'province' : 'city');
    const vehicleType = query.vehicleType ?? 'ALL';
    if (!isProvince && (level !== 'city' || (query.regionCode && query.regionCode !== homeCode))) throw new ForbiddenException('仅可查看当前城市监管范围');
    if (level === 'city') return this.cityScene(query.regionCode ?? homeCode, vehicleType);
    return this.aggregateScene(level, query.regionCode ?? (level === 'province' ? '370000' : '100000'), vehicleType);
  }

  private async aggregateScene(level: 'national' | 'province', regionCode: string, vehicleType: string): Promise<ConnectedScene & Record<string, unknown>> {
    const current = await this.prisma.cockpitRegion.findUnique({ where: { code: regionCode } });
    if (!current) throw new NotFoundException('监管区划不存在');
    const expectedLevel = level === 'national' ? 'COUNTRY' : 'PROVINCE';
    if (current.level !== expectedLevel) throw new NotFoundException('监管层级与区划不匹配');
    const children = await this.prisma.cockpitRegion.findMany({
      where: { parentCode: regionCode, status: 'ACTIVE' }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 7 } },
    });
    const currentSnapshots = children.flatMap((region) => region.snapshots.map((snapshot) => ({ ...snapshot, regionId: region.id })));
    const latest = this.latestByRegion(currentSnapshots);
    const connectedCode = level === 'national' ? '370000' : '370100';
    const connectedScene: ConnectedScene | null = level === 'national' && regionCode === '100000'
      ? await this.aggregateScene('province', '370000', vehicleType)
      : level === 'province' && regionCode === '370000'
        ? await this.cityScene('370100', vehicleType, true)
        : null;
    const opened = await this.prisma.cityWorkspace.findMany({ select: { cityCode: true } });
    const openedCodes = new Set(opened.map(row => row.cityCode));
    const cityScenes = new Map<string, ConnectedScene>();
    if (level === 'province' && regionCode === '370000') {
      for (const child of children) cityScenes.set(child.code, await this.cityScene(child.code, vehicleType, true));
    }
    const mapItems = children.map((region) => {
      const raw = latest.get(region.id);
      const snapshot = raw ? this.filterSnapshot(raw, vehicleType) : null;
      const liveScene = cityScenes.get(region.code) ?? (connectedScene && region.code === connectedCode ? connectedScene : null);
      const liveSummary = liveScene?.summary ?? null;
      const summary = liveSummary ?? (snapshot ? this.summarize([snapshot]) : null);
      return {
        id: region.id, code: region.code, name: region.name, longitude: region.longitude, latitude: region.latitude,
        connected: level === 'national' ? region.code === '370000' : openedCodes.has(region.code),
        reportedAt: liveScene ? liveScene.source.reportedAt : raw?.reportedAt ?? null,
        sourceName: liveScene ? liveScene.source.name : raw?.sourceName ?? null,
        summary: summary ? { ...summary, riskLevel: this.riskLevel(summary.riskEvents, summary.majorEvents) } : null,
      };
    });
    const summary = this.summarize(mapItems.flatMap((item) => item.summary ? [item.summary] : []));
    const dates = Array.from({ length: 7 }, (_, index) => this.dateKey(this.startOfDay(index - 6)));
    const trend = dates.map((date) => {
      const points = currentSnapshots.filter((row) => this.dateKey(row.capturedAt) === date).map((row) => this.filterSnapshot(row, vehicleType)).filter((row): row is Snapshot & { regionId: string } => row !== null);
      const item = this.summarize(points);
      return { date, onlineRate: points.length ? item.onlineRate : null, runningVehicles: points.length ? item.runningVehicles : null, mileage: points.length ? item.mileageToday : null, riskEvents: points.length ? item.riskEvents : null };
    });
    const typeTotals = [...latest.values()].reduce((sum, row) => ({
      DELIVERY: sum.DELIVERY + row.deliveryVehicles, SANITATION: sum.SANITATION + row.sanitationVehicles,
      PATROL: sum.PATROL + row.patrolVehicles, RETAIL: sum.RETAIL + row.retailVehicles, SHUTTLE: sum.SHUTTLE + row.shuttleVehicles,
    }), { DELIVERY: 0, SANITATION: 0, PATROL: 0, RETAIL: 0, SHUTTLE: 0 });
    if (cityScenes.size) {
      for (const key of Object.keys(typeTotals) as Array<keyof typeof typeTotals>) {
        typeTotals[key] = [...cityScenes.values()].reduce((total, scene) => total + (scene.vehicleTypes[key] ?? 0), 0);
      }
    } else if (connectedScene) {
      const connectedRegion = children.find((item) => item.code === connectedCode);
      const previous = connectedRegion ? latest.get(connectedRegion.id) : null;
      const fields = ['DELIVERY', 'SANITATION', 'PATROL', 'RETAIL', 'SHUTTLE'] as const;
      const previousFields = previous ? {
        DELIVERY: previous.deliveryVehicles, SANITATION: previous.sanitationVehicles, PATROL: previous.patrolVehicles,
        RETAIL: previous.retailVehicles, SHUTTLE: previous.shuttleVehicles,
      } : { DELIVERY: 0, SANITATION: 0, PATROL: 0, RETAIL: 0, SHUTTLE: 0 };
      fields.forEach((field) => { typeTotals[field] += (connectedScene.vehicleTypes[field] ?? 0) - previousFields[field]; });
    }
    const newest = [...latest.values()].sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime())[0];
    if (vehicleType !== 'ALL') for (const key of Object.keys(typeTotals) as Array<keyof typeof typeTotals>) if (key !== vehicleType) typeTotals[key] = 0;
    return {
      scene: { level, regionCode, regionName: current.name, parentCode: current.parentCode, camera: { longitude: current.longitude, latitude: current.latitude, height: current.cameraHeight }, vehicleType },
      summary, vehicleTypes: typeTotals, trend,
      regions: mapItems,
      ranking: [...mapItems].filter((item) => item.summary).sort((a, b) => (b.summary?.registeredVehicles ?? 0) - (a.summary?.registeredVehicles ?? 0)).slice(0, 8),
      risks: [...mapItems].filter((item) => item.summary?.riskEvents).sort((a, b) => (b.summary?.riskEvents ?? 0) - (a.summary?.riskEvents ?? 0)).slice(0, 6),
      source: { name: [...new Set([...latest.values()].map(row => row.sourceName))].join(' / ') + (connectedScene ? ' · 融合城市业务库' : ''), reportedAt: newest?.reportedAt ?? null, capturedAt: newest?.capturedAt ?? null, scope: `${children.length} 个${level === 'national' ? '省级' : '市级'}行政区` },
      layers: { adminRegions: true, columns: true, pulses: true, vehicles: false, enterprises: false, roadRights: false },
    };
  }

  private async cityScene(regionCode: string, vehicleType: string, summaryOnly = false) {
    const current = await this.prisma.cockpitRegion.findUnique({ where: { code: regionCode } });
    if (!current || current.level !== 'CITY') throw new NotFoundException('城市监管区划不存在');
    const workspace = await this.prisma.cityWorkspace.findUnique({ where: { cityCode: regionCode } });
    const organizations = workspace ? await this.prisma.organization.findMany({ where: { workspaceId: workspace.id }, select: { id: true } }) : [];
    const organizationIds = organizations.map(row => row.id);
    const vehicleWhere = { deletedAt: null, organizationId: { in: organizationIds }, ...(vehicleType === 'ALL' ? {} : { vehicleType }) };
    const today = this.startOfDay();
    const [vehicles, alerts, accidents, operationRegions, roadRights, daily, pendingMajor] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: vehicleWhere,
        select: {
          id: true, businessNo: true, name: true, vehicleType: true, status: true, onlineStatus: true,
          enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } },
          realtimeStatus: { select: { longitude: true, latitude: true, speed: true, heading: true, battery: true, drivingState: true, mileageToday: true, heartbeatAt: true } },
          _count: { select: { safetyAlerts: { where: { status: { not: 'CLOSED' } } } } },
        },
      }),
      this.prisma.safetyAlert.findMany({ where: { occurredAt: { gte: today }, vehicle: vehicleWhere }, orderBy: { occurredAt: 'desc' }, include: { vehicle: { select: { id: true, businessNo: true } } } }),
      this.prisma.accident.findMany({ where: { occurredAt: { gte: today }, vehicle: vehicleWhere }, orderBy: { occurredAt: 'desc' } }),
      summaryOnly ? [] : this.prisma.operationRegion.findMany({ where: { status: 'ACTIVE', organizationId: { in: organizationIds } }, select: { id: true, name: true, polygonJson: true, organization: { select: { name: true } }, enterprise: { select: { name: true } } } }),
      summaryOnly ? [] : this.prisma.cockpitRoadRight.findMany({ where: { regionId: current.id, status: 'ACTIVE' }, orderBy: { businessNo: 'asc' } }),
      summaryOnly ? [] : this.prisma.vehicleOnlineDaily.findMany({ where: { metricDate: { gte: this.startOfDay(-6) }, vehicle: vehicleWhere }, orderBy: { metricDate: 'asc' } }),
      this.prisma.safetyAlert.count({ where: { vehicle: vehicleWhere, level: { in: ['HIGH', 'CRITICAL'] }, status: { in: ['PENDING_CONFIRMATION', 'PROCESSING'] } } }),
    ]);
    const located = vehicles.filter((item) => item.realtimeStatus && Number.isFinite(item.realtimeStatus.longitude) && Number.isFinite(item.realtimeStatus.latitude));
    const online = vehicles.filter((item) => item.onlineStatus === 'ONLINE');
    const running = vehicles.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING');
    const mileageToday = this.round(vehicles.reduce((sum, item) => sum + (item.realtimeStatus?.mileageToday ?? 0), 0));
    const enterpriseIds = new Set(vehicles.map((item) => item.enterprise.id));
    const summary = {
      registeredVehicles: vehicles.length, onlineVehicles: online.length, runningVehicles: running.length,
      operatingEnterprises: enterpriseIds.size, mileageToday, riskEvents: alerts.length + accidents.length,
      majorEvents: alerts.filter((item) => ['CRITICAL', 'HIGH'].includes(item.level)).length + accidents.filter((item) => ['MAJOR', 'SERIOUS'].includes(item.level)).length,
      unresolvedMajor: pendingMajor,
      onlineRate: vehicles.length ? this.round(online.length / vehicles.length * 100) : 0,
      dataQualityRate: vehicles.length ? this.round(located.length / vehicles.length * 100) : 0,
    };
    const typeTotals = vehicles.reduce((sum, row) => { sum[row.vehicleType] = (sum[row.vehicleType] ?? 0) + 1; return sum; }, { DELIVERY: 0, SANITATION: 0, PATROL: 0, RETAIL: 0, SHUTTLE: 0 } as Record<string, number>);
    const districtMap = new Map<string, { id: string; name: string; registeredVehicles: number; onlineVehicles: number }>();
    vehicles.forEach((vehicle) => {
      const item = districtMap.get(vehicle.organization.id) ?? { id: vehicle.organization.id, name: vehicle.organization.name.replace(/交通运输局$/, ''), registeredVehicles: 0, onlineVehicles: 0 };
      item.registeredVehicles += 1; if (vehicle.onlineStatus === 'ONLINE') item.onlineVehicles += 1; districtMap.set(vehicle.organization.id, item);
    });
    const enterpriseMap = new Map<string, { id: string; name: string; registeredVehicles: number; onlineVehicles: number; riskEvents: number }>();
    vehicles.forEach((vehicle) => {
      const item = enterpriseMap.get(vehicle.enterprise.id) ?? { id: vehicle.enterprise.id, name: vehicle.enterprise.name, registeredVehicles: 0, onlineVehicles: 0, riskEvents: 0 };
      item.registeredVehicles += 1; if (vehicle.onlineStatus === 'ONLINE') item.onlineVehicles += 1; item.riskEvents += vehicle._count.safetyAlerts; enterpriseMap.set(vehicle.enterprise.id, item);
    });
    const dates = Array.from({ length: 7 }, (_, index) => this.dateKey(this.startOfDay(index - 6)));
    const trend = dates.map((date) => {
      const points = daily.filter((item) => this.dateKey(item.metricDate) === date);
      return { date, onlineRate: points.length ? this.round(points.reduce((sum, item) => sum + item.onlineRate, 0) / points.length) : null, runningVehicles: null, mileage: null, riskEvents: null };
    });
    return {
      scene: { level: 'city', regionCode, regionName: current.name, parentCode: current.parentCode, camera: { longitude: current.longitude, latitude: current.latitude, height: current.cameraHeight }, vehicleType },
      summary, vehicleTypes: typeTotals, trend,
      regions: [...districtMap.values()].sort((a, b) => b.registeredVehicles - a.registeredVehicles),
      ranking: [...enterpriseMap.values()].sort((a, b) => b.registeredVehicles - a.registeredVehicles).slice(0, 8),
      risks: alerts.slice(0, 6).map((item) => ({ id: item.id, name: item.title, level: item.level, status: item.status, vehicleId: item.vehicleId, businessNo: item.vehicle?.businessNo, occurredAt: item.occurredAt })),
      map: {
        vehicles: (summaryOnly ? [] : located).map((item) => ({ id: item.id, businessNo: item.businessNo, name: item.name, vehicleType: item.vehicleType, onlineStatus: item.onlineStatus, enterprise: item.enterprise.name, organization: item.organization.name, openAlerts: item._count.safetyAlerts, ...item.realtimeStatus })),
        operationRegions: operationRegions.map((item) => ({ ...item, polygon: this.parseGeometry(item.polygonJson), polygonJson: undefined })),
        roadRights: roadRights.map((item) => ({ id: item.id, businessNo: item.businessNo, name: item.name, roadName: item.roadName, rightType: item.rightType, geometry: this.parseGeometry(item.geometryJson), speedLimit: item.speedLimit, validTo: item.validTo, sourceDocument: item.sourceDocument })),
      },
      source: { name: '监管平台业务数据库', reportedAt: vehicles.map(v => v.realtimeStatus?.heartbeatAt).filter((v): v is Date => !!v).sort((a, b) => b.getTime() - a.getTime())[0] ?? null, capturedAt: new Date(), scope: `${vehicles.length} 辆在册车辆` },
      layers: { adminRegions: true, columns: false, pulses: true, vehicles: true, enterprises: true, roadRights: true },
    };
  }

  private parseGeometry(value: string) {
    try { return JSON.parse(value) as unknown; } catch { return []; }
  }
}
