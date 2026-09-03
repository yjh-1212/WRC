import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

type Shortcut = { label: string; path: string; icon: string; permission: string };
export type WorkItem = {
  id: string; kind: string; category: string; label: string; title: string; description: string; status: string;
  level: string; occurredAt: Date; dueAt?: Date | null; route: string; vehicleId?: string | null;
};

const VEHICLE_SELECT = {
  enterprise: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
  model: { select: { name: true, maxSpeed: true, autonomyLevel: true } },
  realtimeStatus: true,
  safetyAlerts: { where: { status: { not: 'CLOSED' } }, orderBy: { occurredAt: 'desc' as const }, take: 1 },
  _count: { select: { safetyAlerts: { where: { status: { not: 'CLOSED' } } } } },
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private isSuper(user: AuthUser) { return user.roles.some((role) => role.code === 'SUPER_ADMIN'); }
  private has(user: AuthUser, permission: string) { return user.permissions.includes(permission); }
  private organizationRelation(user: AuthUser) {
    return { is: { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } };
  }
  private organizationWhere(user: AuthUser): Prisma.OrganizationWhereInput {
    return this.isSuper(user) ? {} : { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] };
  }
  private enterpriseWhere(user: AuthUser): Prisma.EnterpriseWhereInput {
    return this.isSuper(user) ? {} : { organization: this.organizationRelation(user) };
  }
  private vehicleWhere(user: AuthUser, enterpriseId?: string | null): Prisma.VehicleWhereInput {
    if (user.portal === 'ENTERPRISE' || enterpriseId) return { enterpriseId: enterpriseId ?? user.enterpriseId ?? '__none__', deletedAt: null };
    return this.isSuper(user) ? { deletedAt: null } : { organization: this.organizationRelation(user), deletedAt: null };
  }
  private scoped<T extends object>(user: AuthUser, enterpriseId?: string | null): T {
    if (user.portal === 'ENTERPRISE' || enterpriseId) return { enterpriseId: enterpriseId ?? user.enterpriseId ?? '__none__' } as T;
    return (this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }) as T;
  }
  private startOfDay(offset = 0) {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + offset); return date;
  }
  private dateKey(value: Date) { return value.toISOString().slice(0, 10); }
  private round(value: number, digits = 1) { const power = 10 ** digits; return Math.round(value * power) / power; }
  private parsePolygon(value: string) {
    try { return JSON.parse(value) as Array<{ longitude: number; latitude: number }>; } catch { return []; }
  }
  private shortcuts(user: AuthUser, candidates: Shortcut[]) {
    return candidates.filter((item) => this.has(user, item.permission)).map(({ permission: _permission, ...item }) => item);
  }
  private levelWeight(level: string) { return ({ CRITICAL: 12, HIGH: 8, MEDIUM: 4, LOW: 2 } as Record<string, number>)[level] ?? 1; }
  workSort(items: WorkItem[], limit = 8) {
    const order = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 } as Record<string, number>;
    const now = Date.now();
    return [...items].sort((a, b) => {
      const aScore = (order[a.level] ?? 0) * 100 + (a.dueAt && a.dueAt.getTime() < now ? 50 : 0);
      const bScore = (order[b.level] ?? 0) * 100 + (b.dueAt && b.dueAt.getTime() < now ? 50 : 0);
      return bScore - aScore || (a.dueAt?.getTime() ?? a.occurredAt.getTime()) - (b.dueAt?.getTime() ?? b.occurredAt.getTime());
    }).slice(0, limit);
  }
  private assertRegulator(user: AuthUser) {
    if (user.portal !== 'REGULATORY') throw new ForbiddenException('仅监管账号可以访问监管总览');
  }
  private assertEnterprise(user: AuthUser) {
    if (user.portal !== 'ENTERPRISE' || !user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
    return user.enterpriseId;
  }
  private mapVehicle(vehicle: {
    id: string; name: string; businessNo: string; status: string; onlineStatus: string; enterpriseId: string; organizationId: string;
    createdAt?: Date; enterprise: { id: string; name: string }; organization: { id: string; name: string };
    model: { name: string; maxSpeed: number; autonomyLevel: string }; realtimeStatus: any; safetyAlerts: any[]; _count: { safetyAlerts: number };
  }) {
    const currentAlert = vehicle.safetyAlerts[0] ?? null;
    const stale = !vehicle.realtimeStatus || Date.now() - vehicle.realtimeStatus.heartbeatAt.getTime() > 10 * 60_000;
    const lowBattery = (vehicle.realtimeStatus?.battery ?? 100) < 25;
    const attentionLevel = currentAlert?.level === 'CRITICAL' ? 'CRITICAL'
      : vehicle.onlineStatus !== 'ONLINE' || stale ? 'HIGH'
        : lowBattery || currentAlert ? 'MEDIUM' : 'NORMAL';
    return {
      id: vehicle.id, name: vehicle.name, businessNo: vehicle.businessNo, status: vehicle.status,
      onlineStatus: vehicle.onlineStatus, enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId,
      enterprise: vehicle.enterprise, organization: vehicle.organization, model: vehicle.model, realtimeStatus: vehicle.realtimeStatus,
      openAlertCount: vehicle._count.safetyAlerts,
      currentAlert: currentAlert ? { id: currentAlert.id, title: currentAlert.title, level: currentAlert.level, status: currentAlert.status, alertType: currentAlert.alertType } : null,
      attentionLevel, createdAt: vehicle.createdAt,
    };
  }
  private async loadMapVehicles(user: AuthUser, enterpriseId?: string | null) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: this.vehicleWhere(user, enterpriseId), orderBy: { name: 'asc' }, include: VEHICLE_SELECT,
    });
    return vehicles.map((item) => this.mapVehicle(item));
  }
  private pendingApprovalWhere(user: AuthUser, enterpriseId?: string | null): Prisma.ApprovalTaskWhereInput {
    const roleCodes = user.roles.map((role) => role.code);
    return {
      status: 'PENDING',
      application: this.scoped<Prisma.AdmissionApplicationWhereInput>(user, enterpriseId),
      ...(this.isSuper(user) ? {} : { assigneeRoleCode: { in: roleCodes.length ? roleCodes : ['__none__'] } }),
    };
  }

  async regulatorSummary(user: AuthUser) {
    this.assertRegulator(user);
    const today = this.startOfDay();
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const eventScope = this.scoped<Prisma.SafetyAlertWhereInput>(user);
    const [vehicles, organization, organizations, enterprises, regions, accidents, todayAlerts, severeAlerts, openAlerts, openEmergency, overdueActions, pendingApprovals, overdueApprovals, oldestPending] = await Promise.all([
      this.loadMapVehicles(user),
      user.organizationId ? this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { id: true, name: true } }) : null,
      this.prisma.organization.findMany({ where: this.organizationWhere(user), orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
      this.prisma.enterprise.findMany({ where: this.enterpriseWhere(user), orderBy: { name: 'asc' }, select: { id: true, name: true, organizationId: true } }),
      this.has(user, 'operation:region:read') ? this.prisma.operationRegion.findMany({
        where: { ...this.scoped<Prisma.OperationRegionWhereInput>(user), status: 'ACTIVE' },
        include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, approvalResult: { select: { id: true, documentNo: true } }, vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } }, _count: { select: { records: true } } },
      }) : Promise.resolve([]),
      this.has(user, 'safety:accident:read') ? this.prisma.accident.findMany({
        where: { ...this.scoped<Prisma.AccidentWhereInput>(user), status: { not: 'CLOSED' } },
        select: { id: true, businessNo: true, title: true, level: true, longitude: true, latitude: true, vehicleId: true },
      }) : Promise.resolve([]),
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.count({ where: { ...eventScope, occurredAt: { gte: today } } }) : 0,
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.count({ where: { ...eventScope, occurredAt: { gte: today }, level: { in: ['CRITICAL', 'HIGH'] } } }) : 0,
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.count({ where: { ...eventScope, status: { not: 'CLOSED' } } }) : 0,
      this.has(user, 'safety:emergency:read') ? this.prisma.emergencyTask.count({ where: { ...this.scoped<Prisma.EmergencyTaskWhereInput>(user), status: { not: 'CLOSED' } } }) : 0,
      this.has(user, 'safety:emergency:read') ? this.prisma.emergencyTask.count({ where: { ...this.scoped<Prisma.EmergencyTaskWhereInput>(user), status: { not: 'CLOSED' }, dueAt: { lt: new Date() } } }) : 0,
      this.has(user, 'admission:approval:read') ? this.prisma.approvalTask.count({ where: this.pendingApprovalWhere(user) }) : 0,
      this.has(user, 'admission:approval:read') ? this.prisma.approvalTask.count({ where: { ...this.pendingApprovalWhere(user), dueAt: { lt: new Date() } } }) : 0,
      this.has(user, 'admission:approval:read') ? this.prisma.approvalTask.findFirst({ where: this.pendingApprovalWhere(user), orderBy: { createdAt: 'asc' }, select: { createdAt: true } }) : null,
    ]);
    const currentOnline = vehicles.filter((item) => item.onlineStatus === 'ONLINE').length;
    const currentRunning = vehicles.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING').length;
    const highRisk = vehicles.filter((item) => item.attentionLevel === 'CRITICAL').length + severeAlerts;
    const monthDelta = vehicles.filter((item) => item.createdAt && item.createdAt >= thisMonthStart).length;
    const longestWaitMs = oldestPending ? Date.now() - oldestPending.createdAt.getTime() : 0;
    const longestWaitDays = oldestPending ? this.round(longestWaitMs / 86_400_000) : 0;
    const longestWaitHours = oldestPending ? this.round(longestWaitMs / 3_600_000, 1) : 0;
    return {
      meta: {
        scopeName: this.isSuper(user) ? '杭州市' : organization?.name ?? '当前组织',
        updatedAt: new Date(), highRisk, openWork: openAlerts + openEmergency + pendingApprovals, pendingApprovals,
      },
      metrics: {
        registeredVehicles: vehicles.length, activeVehicles: vehicles.filter((item) => item.status === 'ACTIVE').length, monthDelta,
        currentOnline, onlineRate: vehicles.length ? this.round(currentOnline / vehicles.length * 100) : 0,
        currentRunning, runningRate: currentOnline ? this.round(currentRunning / currentOnline * 100) : 0,
        todayAlerts, severeAlerts, pendingActions: openAlerts + openEmergency, overdueActions,
        pendingApprovals, overdueApprovals, longestWaitDays, longestWaitHours,
      },
      filters: { enterprises, organizations },
      map: {
        vehicles, regions: regions.map((item) => ({ ...item, polygon: this.parsePolygon(item.polygonJson), polygonJson: undefined })),
        accidents: accidents.filter((item) => item.longitude != null && item.latitude != null),
        alerts: vehicles.filter((item) => item.currentAlert && item.realtimeStatus).map((item) => ({
          id: item.currentAlert!.id, title: item.currentAlert!.title, level: item.currentAlert!.level,
          longitude: item.realtimeStatus!.longitude, latitude: item.realtimeStatus!.latitude, vehicleId: item.id,
        })),
      },
      shortcuts: this.shortcuts(user, [
        { label: '实时监控', path: '/operations/realtime', icon: 'MapPinned', permission: 'operation:realtime:read' },
        { label: '告警中心', path: '/safety/alerts', icon: 'Siren', permission: 'safety:alert:read' },
        { label: '待办审批', path: '/admission/approvals', icon: 'ListChecks', permission: 'admission:approval:read' },
        { label: '事故管理', path: '/safety/accidents', icon: 'ShieldX', permission: 'safety:accident:read' },
        { label: '电子围栏', path: '/safety/fences', icon: 'Pentagon', permission: 'safety:fence:read' },
        { label: '车辆档案', path: '/archives/vehicles', icon: 'Files', permission: 'archive:vehicle-archive:read' },
        { label: '企业档案', path: '/archives/enterprises', icon: 'Building2', permission: 'archive:enterprise-archive:read' },
        { label: '运行分析', path: '/analytics/operations', icon: 'ChartSpline', permission: 'analytics:operation:read' },
      ]),
    };
  }

  async regulatorTasks(user: AuthUser) {
    this.assertRegulator(user);
    const work: WorkItem[] = [];
    if (this.has(user, 'safety:alert:handle') || this.has(user, 'safety:alert:read')) {
      const alerts = await this.prisma.safetyAlert.findMany({
        where: { ...this.scoped<Prisma.SafetyAlertWhereInput>(user), status: { not: 'CLOSED' } },
        orderBy: [{ level: 'asc' }, { occurredAt: 'desc' }], take: 20,
        include: { enterprise: { select: { name: true } }, vehicle: { select: { id: true, name: true, businessNo: true } } },
      });
      alerts.forEach((item) => work.push({
        id: item.id, kind: 'ALERT', category: '告警待处置', label: item.level === 'CRITICAL' ? '严重' : '告警',
        title: item.vehicle ? `${item.vehicle.businessNo} ${item.title}` : item.title,
        description: `${item.enterprise.name} · ${item.vehicle?.name ?? '平台事件'}`,
        status: item.status, level: item.level, occurredAt: item.occurredAt,
        route: `/safety/alerts?q=${encodeURIComponent(item.businessNo)}`, vehicleId: item.vehicleId,
      }));
    }
    if (this.has(user, 'safety:emergency:review') || this.has(user, 'safety:emergency:read')) {
      const tasks = await this.prisma.emergencyTask.findMany({
        where: { ...this.scoped<Prisma.EmergencyTaskWhereInput>(user), status: { not: 'CLOSED' } },
        orderBy: { dueAt: 'asc' }, take: 20,
        include: { enterprise: { select: { name: true } }, alert: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } } },
      });
      tasks.forEach((item) => work.push({
        id: item.id, kind: 'EMERGENCY', category: '事件待复核', label: item.status === 'PENDING_REVIEW' ? '复核' : '应急',
        title: item.title, description: `${item.enterprise.name} · ${item.alert.vehicle?.businessNo ?? item.businessNo}`,
        status: item.status, level: item.level, occurredAt: item.createdAt, dueAt: item.dueAt,
        route: `/safety/emergency?q=${encodeURIComponent(item.businessNo)}`, vehicleId: item.alert.vehicleId,
      }));
    }
    if (this.has(user, 'admission:approval:handle') || this.has(user, 'admission:approval:read')) {
      const tasks = await this.prisma.approvalTask.findMany({
        where: this.pendingApprovalWhere(user), orderBy: { dueAt: 'asc' }, take: 20,
        include: { application: { include: { enterprise: { select: { name: true } } } }, nodeDefinition: { select: { name: true } } },
      });
      tasks.forEach((item) => work.push({
        id: item.id, kind: 'APPROVAL', category: '审批待办', label: '审批',
        title: item.application.title,
        description: `${item.application.enterprise?.name ?? item.application.enterpriseNameSnapshot ?? '企业入驻'} · ${item.nodeDefinition.name}`,
        status: item.status, level: item.dueAt < new Date() ? 'HIGH' : 'INFO', occurredAt: item.createdAt, dueAt: item.dueAt,
        route: `/admission/approvals?q=${encodeURIComponent(item.application.businessNo)}`,
      }));
    }
    if (this.has(user, 'admission:license:read')) {
      const licenses = await this.prisma.vehicleLicense.findMany({
        where: { vehicle: this.vehicleWhere(user), expiresAt: { lte: this.startOfDay(30) } },
        orderBy: { expiresAt: 'asc' }, take: 10,
        include: { vehicle: { select: { id: true, name: true, businessNo: true } }, enterprise: { select: { name: true } } },
      });
      licenses.forEach((item) => work.push({
        id: item.id, kind: 'EXPIRY', category: '即将到期', label: '到期',
        title: `${item.vehicle.businessNo} 运营牌照`, description: `${item.licenseNo} · ${item.enterprise.name}`,
        status: item.expiresAt < new Date() ? 'EXPIRED' : 'EXPIRING',
        level: item.expiresAt < this.startOfDay(7) ? 'HIGH' : 'MEDIUM', occurredAt: item.createdAt, dueAt: item.expiresAt,
        route: `/admission/licenses?q=${encodeURIComponent(item.licenseNo)}`, vehicleId: item.vehicleId,
      }));
    }
    const now = new Date();
    const soon = new Date(now.getTime() + 2 * 3_600_000);
    const items = this.workSort(work, 5);
    return {
      total: work.length,
      items,
      buckets: {
        critical: work.filter((item) => item.kind === 'EMERGENCY' || item.level === 'CRITICAL').length,
        alerts: work.filter((item) => item.kind === 'ALERT').length,
        approvals: work.filter((item) => item.kind === 'APPROVAL').length,
        review: work.filter((item) => item.status === 'PENDING_REVIEW' || item.label === '复核').length,
        overdue: work.filter((item) => item.dueAt && item.dueAt <= soon).length,
      },
    };
  }

  async regulatorRisks(user: AuthUser) {
    this.assertRegulator(user);
    if (!this.has(user, 'safety:alert:read') && !this.has(user, 'analytics:safety:read')) {
      return { enterprises: [], vehicles: [], organizations: [] };
    }
    const [enterprises, organizations, vehicles, alerts, accidents, violations, offlineEvents, emergencyTasks, evaluations] = await Promise.all([
      this.prisma.enterprise.findMany({ where: this.enterpriseWhere(user), select: { id: true, name: true } }),
      this.prisma.organization.findMany({ where: this.organizationWhere(user), select: { id: true, name: true } }),
      this.loadMapVehicles(user),
      this.prisma.safetyAlert.findMany({ where: this.scoped<Prisma.SafetyAlertWhereInput>(user), select: { enterpriseId: true, organizationId: true, vehicleId: true, level: true, status: true } }),
      this.prisma.accident.findMany({ where: this.scoped<Prisma.AccidentWhereInput>(user), select: { enterpriseId: true, organizationId: true, vehicleId: true, level: true } }),
      this.prisma.violation.findMany({ where: this.scoped<Prisma.ViolationWhereInput>(user), select: { enterpriseId: true, organizationId: true, vehicleId: true, level: true } }),
      this.prisma.offlineEvent.findMany({ where: this.scoped<Prisma.OfflineEventWhereInput>(user), select: { enterpriseId: true, organizationId: true, vehicleId: true, durationMinutes: true } }),
      this.prisma.emergencyTask.findMany({ where: { ...this.scoped<Prisma.EmergencyTaskWhereInput>(user), status: { not: 'CLOSED' } }, select: { enterpriseId: true, organizationId: true } }),
      this.has(user, 'analytics:evaluation:read') ? this.prisma.enterpriseEvaluation.findMany({
        where: { ...this.scoped<Prisma.EnterpriseEvaluationWhereInput>(user), status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' }, select: { enterpriseId: true, riskLevel: true, grade: true },
      }) : Promise.resolve([]),
    ]);
    const enterpriseRisks = new Map<string, { id: string; name: string; score: number; tags: Set<string> }>();
    enterprises.forEach((item) => enterpriseRisks.set(item.id, { id: item.id, name: item.name, score: 0, tags: new Set() }));
    const add = (id: string, score: number, tag: string) => { const item = enterpriseRisks.get(id); if (item) { item.score += score; item.tags.add(tag); } };
    alerts.forEach((item) => add(item.enterpriseId, this.levelWeight(item.level), item.status !== 'CLOSED' ? '告警高发' : '告警'));
    accidents.forEach((item) => add(item.enterpriseId, this.levelWeight(item.level) + 8, '事故'));
    violations.forEach((item) => add(item.enterpriseId, this.levelWeight(item.level) + 4, '违规'));
    offlineEvents.forEach((item) => add(item.enterpriseId, Math.max(2, Math.round(item.durationMinutes / 10)), '离线'));
    emergencyTasks.forEach((item) => add(item.enterpriseId, 8, '处置超时'));
    const seenEval = new Set<string>();
    evaluations.forEach((item) => {
      if (seenEval.has(item.enterpriseId)) return; seenEval.add(item.enterpriseId);
      add(item.enterpriseId, item.riskLevel === 'HIGH' ? 16 : item.riskLevel === 'MEDIUM' ? 8 : 2, `评价${item.grade}`);
    });
    const vehicleRisks = vehicles.map((vehicle) => ({
      id: vehicle.id, name: vehicle.name, businessNo: vehicle.businessNo, enterpriseName: vehicle.enterprise.name,
      score: vehicle.openAlertCount * 10 + (vehicle.onlineStatus === 'OFFLINE' ? 7 : 0) + ((vehicle.realtimeStatus?.battery ?? 100) < 25 ? 5 : 0),
      level: vehicle.attentionLevel,
      tags: [vehicle.openAlertCount ? `${vehicle.openAlertCount}条未闭环告警` : '', vehicle.onlineStatus === 'OFFLINE' ? '当前离线' : '', (vehicle.realtimeStatus?.battery ?? 100) < 25 ? '低电量' : '', vehicle.currentAlert?.title ?? ''].filter(Boolean),
    })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    const organizationRisks = organizations.map((item) => {
      const openCount = alerts.filter((event) => event.organizationId === item.id && event.status !== 'CLOSED').length;
      const score = alerts.filter((event) => event.organizationId === item.id).reduce((sum, event) => sum + this.levelWeight(event.level), 0)
        + accidents.filter((event) => event.organizationId === item.id).length * 10
        + violations.filter((event) => event.organizationId === item.id).length * 6;
      return {
        id: item.id, name: item.name, score, openCount,
        level: score >= 24 ? 'HIGH' : score >= 10 ? 'MEDIUM' : 'LOW',
        tags: [
          openCount ? `未闭环 ${openCount}` : '',
          accidents.some((event) => event.organizationId === item.id) ? '事故高发' : '',
          alerts.some((event) => event.organizationId === item.id) ? '围栏/告警事件' : '',
        ].filter(Boolean),
      };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    return {
      enterprises: [...enterpriseRisks.values()].map((item) => {
        const alertCount = alerts.filter((event) => event.enterpriseId === item.id).length;
        const openCount = alerts.filter((event) => event.enterpriseId === item.id && event.status !== 'CLOSED').length;
        return {
          ...item, tags: [...item.tags], alertCount, openCount,
          level: item.score >= 24 ? 'HIGH' : item.score >= 10 ? 'MEDIUM' : 'LOW',
          route: `/analytics/profiles?enterpriseId=${item.id}`,
        };
      }).sort((a, b) => b.score - a.score).slice(0, 5),
      vehicles: vehicleRisks, organizations: organizationRisks,
    };
  }

  async regulatorTrends(user: AuthUser) {
    this.assertRegulator(user);
    const vehicleWhere = this.vehicleWhere(user);
    const sevenDaysAgo = this.startOfDay(-6);
    const [vehicles, daily, records] = await Promise.all([
      this.loadMapVehicles(user),
      this.prisma.vehicleOnlineDaily.findMany({ where: { vehicle: vehicleWhere, metricDate: { gte: sevenDaysAgo } }, orderBy: { metricDate: 'asc' } }),
      this.prisma.operationRecord.findMany({ where: { vehicle: vehicleWhere, startedAt: { gte: sevenDaysAgo } }, select: { vehicleId: true, startedAt: true, mileage: true, status: true } }),
    ]);
    const dates = Array.from({ length: 7 }, (_, index) => this.dateKey(this.startOfDay(index - 6)));
    const online = dates.map((date) => {
      const points = daily.filter((item) => this.dateKey(item.metricDate) === date);
      const dayRecords = records.filter((item) => this.dateKey(item.startedAt) === date);
      return {
        date, onlineRate: points.length ? this.round(points.reduce((sum, item) => sum + item.onlineRate, 0) / points.length) : 0,
        runningVehicles: new Set(dayRecords.map((item) => item.vehicleId)).size,
        mileage: this.round(dayRecords.reduce((sum, item) => sum + item.mileage, 0)),
      };
    });
    const currentOnline = vehicles.filter((item) => item.onlineStatus === 'ONLINE').length;
    const currentRunning = vehicles.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING').length;
    const yesterday = online[online.length - 2];
    const weekAvg = online.length ? this.round(online.reduce((sum, item) => sum + item.onlineRate, 0) / online.length) : 0;
    return {
      availability: { onlineGranularity: 'daily', hourlyOnline: false, note: '在线率为 VehicleOnlineDaily 日粒度正式指标；当前在线取自 VehicleRealtimeStatus。小时级在线快照尚未建设。' },
      online, compare: {
        todayOnlineRate: vehicles.length ? this.round(currentOnline / vehicles.length * 100) : 0,
        yesterdayOnlineRate: yesterday?.onlineRate ?? 0, weekAvgOnlineRate: weekAvg,
        todayRunning: currentRunning, yesterdayRunning: yesterday?.runningVehicles ?? 0,
      },
      status: {
        running: currentRunning,
        standby: vehicles.filter((item) => item.onlineStatus === 'ONLINE' && item.realtimeStatus?.drivingState !== 'RUNNING').length,
        offline: vehicles.filter((item) => item.onlineStatus !== 'ONLINE').length,
        abnormal: vehicles.filter((item) => item.attentionLevel !== 'NORMAL').length,
      },
    };
  }

  async regulatorAlarms(user: AuthUser) {
    this.assertRegulator(user);
    if (!this.has(user, 'safety:alert:read')) {
      return { items: [], stats: { today: 0, severe: 0, open: 0, accidents: 0, closedToday: 0, types: [] } };
    }
    const today = this.startOfDay();
    const eventScope = this.scoped<Prisma.SafetyAlertWhereInput>(user);
    const [items, todayCount, severe, open, closedToday, accidents, todayTypes] = await Promise.all([
      this.prisma.safetyAlert.findMany({
        where: eventScope, orderBy: { occurredAt: 'desc' }, take: 5,
        include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, businessNo: true } } },
      }),
      this.prisma.safetyAlert.count({ where: { ...eventScope, occurredAt: { gte: today } } }),
      this.prisma.safetyAlert.count({ where: { ...eventScope, occurredAt: { gte: today }, level: { in: ['CRITICAL', 'HIGH'] } } }),
      this.prisma.safetyAlert.count({ where: { ...eventScope, status: { not: 'CLOSED' } } }),
      this.prisma.safetyAlert.count({ where: { ...eventScope, closedAt: { gte: today } } }),
      this.has(user, 'safety:accident:read') ? this.prisma.accident.count({ where: { ...this.scoped<Prisma.AccidentWhereInput>(user), occurredAt: { gte: today } } }) : 0,
      this.prisma.safetyAlert.groupBy({ by: ['alertType'], where: { ...eventScope, occurredAt: { gte: today } }, _count: { _all: true } }),
    ]);
    let types = todayTypes.map((item) => ({ type: item.alertType, count: item._count._all })).sort((a, b) => b.count - a.count);
    if (!types.length) {
      const recentTypes = await this.prisma.safetyAlert.groupBy({
        by: ['alertType'], where: { ...eventScope, occurredAt: { gte: this.startOfDay(-6) } }, _count: { _all: true },
      });
      types = recentTypes.map((item) => ({ type: item.alertType, count: item._count._all })).sort((a, b) => b.count - a.count);
    }
    return { items, stats: { today: todayCount, severe, open, accidents, closedToday, types } };
  }

  async regulatorApprovals(user: AuthUser) {
    this.assertRegulator(user);
    if (!this.has(user, 'admission:application:read') && !this.has(user, 'admission:approval:read')) {
      return { pendingByType: [], submittedToday: 0, overdue: 0, averageApprovalHours: 0, expiringLicenses: 0, available: false, recent: [] };
    }
    const today = this.startOfDay();
    const scope = this.scoped<Prisma.AdmissionApplicationWhereInput>(user);
    const [applications, pendingApprovals, licenses, recent] = await Promise.all([
      this.prisma.admissionApplication.findMany({ where: scope, select: { applicationType: true, status: true, submittedAt: true, completedAt: true } }),
      this.has(user, 'admission:approval:read') ? this.prisma.approvalTask.findMany({ where: this.pendingApprovalWhere(user), select: { dueAt: true } }) : Promise.resolve([]),
      this.has(user, 'admission:license:read') ? this.prisma.vehicleLicense.count({ where: { vehicle: this.vehicleWhere(user), expiresAt: { lte: this.startOfDay(30) } } }) : 0,
      this.prisma.admissionApplication.findMany({
        where: { ...scope, status: { in: ['IN_REVIEW', 'RETURNED'] } },
        orderBy: { updatedAt: 'desc' }, take: 3,
        select: {
          id: true, businessNo: true, applicationType: true, title: true, status: true, currentNodeName: true, updatedAt: true,
          approvalTasks: { where: { status: 'PENDING' }, select: { dueAt: true } },
        },
      }),
    ]);
    const completed = applications.filter((item) => item.submittedAt && item.completedAt);
    const now = new Date();
    return {
      available: true,
      pendingByType: ['ENTERPRISE_ONBOARDING', 'ROAD_TEST', 'LICENSE_RENEWAL'].map((type) => ({
        type, count: applications.filter((item) => item.applicationType === type && item.status === 'IN_REVIEW').length,
        route: type === 'ENTERPRISE_ONBOARDING' ? '/admission/onboarding' : type === 'ROAD_TEST' ? '/admission/road-tests' : '/admission/renewals',
      })),
      submittedToday: applications.filter((item) => item.submittedAt && item.submittedAt >= today).length,
      overdue: pendingApprovals.filter((item) => item.dueAt < new Date()).length,
      averageApprovalHours: completed.length ? this.round(completed.reduce((sum, item) => sum + (item.completedAt!.getTime() - item.submittedAt!.getTime()) / 3_600_000, 0) / completed.length) : 0,
      expiringLicenses: licenses,
      recent: recent.map((item) => ({
        id: item.id, businessNo: item.businessNo, applicationType: item.applicationType, title: item.title,
        status: item.status, currentNodeName: item.currentNodeName, updatedAt: item.updatedAt,
        overdue: item.approvalTasks.some((task) => task.dueAt < now),
        route: `/admission/approvals?q=${encodeURIComponent(item.businessNo)}`,
      })),
    };
  }

  async enterpriseSummary(user: AuthUser) {
    const enterpriseId = this.assertEnterprise(user);
    const today = this.startOfDay();
    const [enterprise, vehicles, regions, fences, todayAlerts, severeAlerts, openAlerts, openEmergency, overdueActions, activeApplications, corrections] = await Promise.all([
      this.prisma.enterprise.findUnique({ where: { id: enterpriseId }, include: { organization: { select: { id: true, name: true } } } }),
      this.loadMapVehicles(user, enterpriseId),
      this.prisma.operationRegion.findMany({
        where: { enterpriseId, status: 'ACTIVE' },
        include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, approvalResult: { select: { id: true, documentNo: true } }, vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } }, _count: { select: { records: true } } },
      }),
      this.has(user, 'safety:fence:read') || this.has(user, 'operation:region:read') ? this.prisma.electronicFence.findMany({
        where: { enterpriseId, active: true },
        include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } }, triggers: { include: { vehicle: { select: { name: true } } } }, _count: { select: { triggers: true } } },
      }) : Promise.resolve([]),
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.count({ where: { enterpriseId, occurredAt: { gte: today } } }) : 0,
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.count({ where: { enterpriseId, occurredAt: { gte: today }, level: { in: ['CRITICAL', 'HIGH'] } } }) : 0,
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.count({ where: { enterpriseId, status: { not: 'CLOSED' } } }) : 0,
      this.has(user, 'safety:emergency:read') ? this.prisma.emergencyTask.count({ where: { enterpriseId, status: { not: 'CLOSED' } } }) : 0,
      this.has(user, 'safety:emergency:read') ? this.prisma.emergencyTask.count({ where: { enterpriseId, status: { not: 'CLOSED' }, dueAt: { lt: new Date() } } }) : 0,
      this.has(user, 'admission:application:read') ? this.prisma.admissionApplication.count({ where: { enterpriseId, status: { in: ['DRAFT', 'IN_REVIEW', 'RETURNED'] } } }) : 0,
      this.has(user, 'admission:application:read') ? this.prisma.admissionApplication.count({ where: { enterpriseId, status: 'RETURNED' } }) : 0,
    ]);
    if (!enterprise) throw new ForbiddenException('企业主体不存在');
    if (vehicles.some((item) => item.enterpriseId !== enterpriseId)) throw new ForbiddenException('企业数据范围异常');
    const currentOnline = vehicles.filter((item) => item.onlineStatus === 'ONLINE').length;
    const todayMileage = this.round(vehicles.reduce((sum, item) => sum + (item.realtimeStatus?.mileageToday ?? 0), 0));
    const todayRunning = vehicles.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING' || (item.realtimeStatus?.mileageToday ?? 0) > 0).length;
    const abnormalVehicles = vehicles.filter((item) => item.attentionLevel !== 'NORMAL').length;
    return {
      meta: {
        enterprise: { id: enterprise.id, name: enterprise.name, businessNo: enterprise.businessNo, organization: enterprise.organization },
        updatedAt: new Date(), abnormalVehicles, openSafety: openAlerts + openEmergency, corrections,
      },
      metrics: {
        registeredVehicles: vehicles.length, activeVehicles: vehicles.filter((item) => item.status === 'ACTIVE').length,
        inactiveVehicles: vehicles.filter((item) => item.status !== 'ACTIVE').length,
        currentOnline, onlineRate: vehicles.length ? this.round(currentOnline / vehicles.length * 100) : 0,
        todayRunning, todayMileage, todayAlerts, severeAlerts,
        pendingActions: openAlerts + openEmergency, overdueActions, pendingApplications: activeApplications, corrections,
      },
      map: {
        vehicles,
        regions: regions.map((item) => ({ ...item, polygon: this.parsePolygon(item.polygonJson), polygonJson: undefined })),
        fences: fences.map((item) => ({ ...item, polygon: this.parsePolygon(item.polygonJson), polygonJson: undefined })),
        accidents: [],
        alerts: vehicles.filter((item) => item.currentAlert && item.realtimeStatus).map((item) => ({
          id: item.currentAlert!.id, title: item.currentAlert!.title, level: item.currentAlert!.level,
          longitude: item.realtimeStatus!.longitude, latitude: item.realtimeStatus!.latitude, vehicleId: item.id,
        })),
      },
      shortcuts: this.shortcuts(user, [
        { label: '新增车辆', path: '/enterprise/vehicles/list', icon: 'Truck', permission: 'archive:vehicle:write' },
        { label: '路测申请', path: '/enterprise/applications/road-tests', icon: 'Route', permission: 'admission:application:write' },
        { label: '事故上报', path: '/enterprise/safety/accidents', icon: 'ShieldX', permission: 'safety:accident:report' },
        { label: '告警处置', path: '/enterprise/safety/alerts', icon: 'Siren', permission: 'safety:alert:handle' },
        { label: '轨迹查询', path: '/enterprise/operations/trajectories', icon: 'MapPinned', permission: 'operation:trajectory:read' },
        { label: '续期申请', path: '/enterprise/applications/renewals', icon: 'CalendarClock', permission: 'admission:application:write' },
        { label: '整改反馈', path: '/enterprise/safety/rectifications', icon: 'ClipboardPenLine', permission: 'safety:violation:review' },
        { label: '企业档案', path: '/enterprise/profile/info', icon: 'Building2', permission: 'archive:enterprise-archive:read' },
      ]),
    };
  }

  async enterpriseTasks(user: AuthUser) {
    const enterpriseId = this.assertEnterprise(user);
    const work: WorkItem[] = [];
    if (this.has(user, 'safety:alert:read')) {
      const alerts = await this.prisma.safetyAlert.findMany({
        where: { enterpriseId, status: { not: 'CLOSED' } }, orderBy: { occurredAt: 'desc' }, take: 20,
        include: { vehicle: { select: { id: true, name: true, businessNo: true } } },
      });
      alerts.forEach((item) => work.push({
        id: item.id, kind: 'ALERT', category: '安全处置', label: item.level === 'CRITICAL' ? '严重告警' : '安全处置',
        title: item.title, description: item.vehicle ? `${item.vehicle.businessNo} · ${item.vehicle.name}` : '本企业事件',
        status: item.status, level: item.level, occurredAt: item.occurredAt,
        route: `/enterprise/safety/alerts?q=${encodeURIComponent(item.businessNo)}`, vehicleId: item.vehicleId,
      }));
    }
    if (this.has(user, 'safety:emergency:read')) {
      const tasks = await this.prisma.emergencyTask.findMany({
        where: { enterpriseId, status: { not: 'CLOSED' } }, orderBy: { dueAt: 'asc' }, take: 10,
        include: { alert: { include: { vehicle: { select: { id: true, businessNo: true } } } } },
      });
      tasks.forEach((item) => work.push({
        id: item.id, kind: 'EMERGENCY', category: '安全处置', label: '事故反馈',
        title: item.title, description: item.requirement, status: item.status, level: item.level,
        occurredAt: item.createdAt, dueAt: item.dueAt,
        route: `/enterprise/safety/emergency?q=${encodeURIComponent(item.businessNo)}`, vehicleId: item.alert.vehicleId,
      }));
    }
    if (this.has(user, 'admission:application:read')) {
      const applications = await this.prisma.admissionApplication.findMany({
        where: { enterpriseId, status: { in: ['RETURNED', 'IN_REVIEW', 'DRAFT'] } }, orderBy: { updatedAt: 'desc' }, take: 10,
      });
      applications.forEach((item) => work.push({
        id: item.id, kind: 'APPLICATION', category: '申请办理', label: item.status === 'RETURNED' ? '申请补正' : '申请办理',
        title: item.title, description: `${item.businessNo} · ${item.currentNodeName ?? item.applicationType}`,
        status: item.status, level: item.status === 'RETURNED' ? 'HIGH' : 'INFO', occurredAt: item.updatedAt,
        route: `/enterprise/applications/mine?q=${encodeURIComponent(item.businessNo)}`,
      }));
    }
    if (this.has(user, 'admission:license:read')) {
      const licenses = await this.prisma.vehicleLicense.findMany({
        where: { enterpriseId, expiresAt: { lte: this.startOfDay(30) } }, orderBy: { expiresAt: 'asc' }, take: 10,
        include: { vehicle: { select: { id: true, name: true, businessNo: true } } },
      });
      licenses.forEach((item) => work.push({
        id: item.id, kind: 'EXPIRY', category: '车辆事项', label: '牌照提醒',
        title: `${item.vehicle.businessNo} 运营牌照`, description: `${item.licenseNo} 即将到期`,
        status: item.expiresAt < new Date() ? 'EXPIRED' : 'EXPIRING',
        level: item.expiresAt < this.startOfDay(7) ? 'HIGH' : 'MEDIUM', occurredAt: item.createdAt, dueAt: item.expiresAt,
        route: `/enterprise/applications/licenses?q=${encodeURIComponent(item.licenseNo)}`, vehicleId: item.vehicleId,
      }));
    }
    const qualifications = await this.prisma.enterpriseQualification.findMany({
      where: { enterpriseId, deletedAt: null, expiresAt: { lte: this.startOfDay(30) } }, orderBy: { expiresAt: 'asc' }, take: 10,
    });
    qualifications.forEach((item) => work.push({
      id: item.id, kind: 'QUALIFICATION', category: '资质事项', label: '资质提醒',
      title: item.qualificationType, description: item.certificateNo,
      status: item.expiresAt < new Date() ? 'EXPIRED' : 'EXPIRING',
      level: item.expiresAt < this.startOfDay(7) ? 'HIGH' : 'MEDIUM', occurredAt: item.createdAt, dueAt: item.expiresAt,
      route: `/enterprise/profile/qualifications?q=${encodeURIComponent(item.certificateNo)}`,
    }));
    const items = this.workSort(work);
    return { total: work.length, items };
  }

  async enterpriseVehicles(user: AuthUser) {
    const enterpriseId = this.assertEnterprise(user);
    const vehicles = await this.loadMapVehicles(user, enterpriseId);
    const attention = vehicles.map((vehicle) => {
      const offlineMinutes = vehicle.realtimeStatus ? Math.max(0, Math.round((Date.now() - vehicle.realtimeStatus.heartbeatAt.getTime()) / 60_000)) : null;
      const reason = vehicle.currentAlert?.alertType === 'VEHICLE_FAULT' ? vehicle.currentAlert.title
        : (vehicle.realtimeStatus?.battery ?? 100) < 25 ? `电量 ${vehicle.realtimeStatus?.battery}%`
          : vehicle.onlineStatus === 'OFFLINE' ? `离线 ${offlineMinutes ?? 0} 分钟`
            : vehicle.status !== 'ACTIVE' ? '维护中' : vehicle.currentAlert ? vehicle.currentAlert.title : '状态正常';
      const score = vehicle.openAlertCount * 10 + (vehicle.onlineStatus === 'OFFLINE' ? 7 : 0) + ((vehicle.realtimeStatus?.battery ?? 100) < 25 ? 5 : 0) + (vehicle.status !== 'ACTIVE' ? 4 : 0);
      return {
        id: vehicle.id, name: vehicle.name, businessNo: vehicle.businessNo, onlineStatus: vehicle.onlineStatus, status: vehicle.status,
        battery: vehicle.realtimeStatus?.battery ?? null, heartbeatAt: vehicle.realtimeStatus?.heartbeatAt ?? null,
        drivingState: vehicle.realtimeStatus?.drivingState ?? 'OFFLINE', openAlertCount: vehicle.openAlertCount,
        attentionLevel: vehicle.attentionLevel, reason, score, route: `/enterprise/vehicles/archives?q=${encodeURIComponent(vehicle.businessNo)}`,
      };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    return {
      counts: {
        normal: vehicles.filter((item) => item.attentionLevel === 'NORMAL' && item.status === 'ACTIVE').length,
        running: vehicles.filter((item) => item.realtimeStatus?.drivingState === 'RUNNING').length,
        standby: vehicles.filter((item) => item.onlineStatus === 'ONLINE' && item.realtimeStatus?.drivingState !== 'RUNNING').length,
        lowBattery: vehicles.filter((item) => (item.realtimeStatus?.battery ?? 100) < 25).length,
        fault: vehicles.filter((item) => item.currentAlert?.alertType === 'VEHICLE_FAULT').length,
        offline: vehicles.filter((item) => item.onlineStatus !== 'ONLINE').length,
        maintenance: vehicles.filter((item) => item.status !== 'ACTIVE').length,
      },
      attention: attention.slice(0, 8),
      utilizationRate: vehicles.length ? this.round(vehicles.filter((item) => (item.realtimeStatus?.mileageToday ?? 0) > 0 || item.realtimeStatus?.drivingState === 'RUNNING').length / vehicles.length * 100) : 0,
    };
  }

  async enterpriseRisks(user: AuthUser) {
    const enterpriseId = this.assertEnterprise(user);
    const today = this.startOfDay();
    const [todayAlerts, openAlerts, accidents, violations, vehicles, alerts] = await Promise.all([
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.count({ where: { enterpriseId, occurredAt: { gte: today } } }) : 0,
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.count({ where: { enterpriseId, status: { not: 'CLOSED' } } }) : 0,
      this.has(user, 'safety:accident:read') ? this.prisma.accident.count({ where: { enterpriseId } }) : 0,
      this.has(user, 'safety:violation:read') ? this.prisma.violation.count({ where: { enterpriseId } }) : 0,
      this.loadMapVehicles(user, enterpriseId),
      this.has(user, 'safety:alert:read') ? this.prisma.safetyAlert.findMany({
        where: { enterpriseId }, orderBy: { occurredAt: 'desc' }, take: 8,
        include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, businessNo: true } } },
      }) : Promise.resolve([]),
    ]);
    const attentionVehicles = vehicles.map((vehicle) => ({
      id: vehicle.id, name: vehicle.name, businessNo: vehicle.businessNo, onlineStatus: vehicle.onlineStatus,
      battery: vehicle.realtimeStatus?.battery ?? null, heartbeatAt: vehicle.realtimeStatus?.heartbeatAt ?? null,
      openAlertCount: vehicle.openAlertCount, attentionLevel: vehicle.attentionLevel,
      reason: vehicle.openAlertCount ? `${vehicle.openAlertCount}次告警` : vehicle.onlineStatus === 'OFFLINE' ? '当前离线' : (vehicle.realtimeStatus?.battery ?? 100) < 25 ? `电量 ${vehicle.realtimeStatus?.battery}%` : '状态正常',
      score: vehicle.openAlertCount * 10 + (vehicle.onlineStatus === 'OFFLINE' ? 7 : 0) + ((vehicle.realtimeStatus?.battery ?? 100) < 25 ? 5 : 0),
    })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    const sevenDaysAgo = this.startOfDay(-6);
    const [daily, records] = await Promise.all([
      this.prisma.vehicleOnlineDaily.findMany({ where: { vehicle: { enterpriseId, deletedAt: null }, metricDate: { gte: sevenDaysAgo } }, orderBy: { metricDate: 'asc' } }),
      this.prisma.operationRecord.findMany({ where: { enterpriseId, startedAt: { gte: sevenDaysAgo } }, select: { vehicleId: true, startedAt: true, mileage: true } }),
    ]);
    const dates = Array.from({ length: 7 }, (_, index) => this.dateKey(this.startOfDay(index - 6)));
    const trend = dates.map((date) => {
      const points = daily.filter((item) => this.dateKey(item.metricDate) === date);
      const dayRecords = records.filter((item) => this.dateKey(item.startedAt) === date);
      return {
        date, onlineRate: points.length ? this.round(points.reduce((sum, item) => sum + item.onlineRate, 0) / points.length) : 0,
        runningVehicles: new Set(dayRecords.map((item) => item.vehicleId)).size,
        mileage: this.round(dayRecords.reduce((sum, item) => sum + item.mileage, 0)),
      };
    });
    return {
      todayAlerts, openAlerts, accidents, violations,
      offlineVehicles: vehicles.filter((item) => item.onlineStatus === 'OFFLINE').length,
      attentionVehicles, alerts,
      operations: {
        trend,
        todayMileage: this.round(vehicles.reduce((sum, item) => sum + (item.realtimeStatus?.mileageToday ?? 0), 0)),
        utilizationRate: vehicles.length ? this.round(vehicles.filter((item) => (item.realtimeStatus?.mileageToday ?? 0) > 0 || item.realtimeStatus?.drivingState === 'RUNNING').length / vehicles.length * 100) : 0,
        availability: { onlineGranularity: 'daily', hourlyOnline: false, note: '在线率为日粒度正式指标，今日里程取自车辆实时状态。' },
      },
    };
  }

  async enterpriseApplications(user: AuthUser) {
    const enterpriseId = this.assertEnterprise(user);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [applications, licenses, qualifications] = await Promise.all([
      this.has(user, 'admission:application:read') ? this.prisma.admissionApplication.findMany({
        where: { enterpriseId }, orderBy: { updatedAt: 'desc' }, take: 20,
        select: { id: true, businessNo: true, applicationType: true, title: true, status: true, currentNodeName: true, updatedAt: true, completedAt: true },
      }) : Promise.resolve([]),
      this.has(user, 'admission:license:read') ? this.prisma.vehicleLicense.findMany({
        where: { enterpriseId, expiresAt: { lte: this.startOfDay(30) } }, orderBy: { expiresAt: 'asc' },
        include: { vehicle: { select: { businessNo: true } } },
      }) : Promise.resolve([]),
      this.prisma.enterpriseQualification.findMany({
        where: { enterpriseId, deletedAt: null, expiresAt: { lte: this.startOfDay(30) } }, orderBy: { expiresAt: 'asc' },
      }),
    ]);
    const expiryItems = [
      ...licenses.map((item) => ({ id: item.id, type: '车辆牌照', name: `${item.vehicle.businessNo} · ${item.licenseNo}`, expiresAt: item.expiresAt, route: '/enterprise/applications/renewals' })),
      ...qualifications.map((item) => ({ id: item.id, type: '企业资质', name: `${item.qualificationType} · ${item.certificateNo}`, expiresAt: item.expiresAt, route: '/enterprise/profile/qualifications' })),
    ].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
    const within = (days: number) => expiryItems.filter((item) => item.expiresAt >= new Date() && item.expiresAt <= this.startOfDay(days)).length;
    return {
      active: applications.filter((item) => ['DRAFT', 'IN_REVIEW', 'RETURNED'].includes(item.status)).length,
      corrections: applications.filter((item) => item.status === 'RETURNED').length,
      approvedThisMonth: applications.filter((item) => item.status === 'APPROVED' && item.completedAt && item.completedAt >= monthStart).length,
      expiring: expiryItems.length,
      recent: applications.slice(0, 5),
      expiry: { within7Days: within(7), within30Days: within(30), expired: expiryItems.filter((item) => item.expiresAt < new Date()).length, items: expiryItems.slice(0, 6) },
    };
  }
}
