import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProvinceAnalysisService } from '../analytics/province-analysis.service';

const DAY = 86400000;
const day = (date: Date) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const stateRows = [
  ['DRAFT', '待派发', '#3695ff'], ['DISPATCHED', '待响应', '#ff6878'], ['RESPONDING', '办理中', '#25cf9c'],
  ['PENDING_REVIEW', '待复核', '#a46bff'], ['CLOSED', '已办结', '#79cf31'],
] as const;
type Event = { id: string; matterId: string; title: string; type: 'dispatch' | 'feedback' | 'review' | 'due'; at: string; cityName: string };

@Injectable()
export class WorkbenchService {
  constructor(private readonly prisma: PrismaService, private readonly analysis: ProvinceAnalysisService) {}
  async get(user: AuthUser, month?: string) {
    if (user.accountLevel !== 'PROVINCE' || user.portal !== 'REGULATORY' || !user.permissions.includes('dashboard:view')) throw new ForbiddenException('仅授权省级监管人员可访问全省工作台');
    const now = new Date(), selectedMonth = month ?? day(now).slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth) || selectedMonth < '2000-01' || selectedMonth > '2100-12') throw new BadRequestException('请选择有效月份');
    const start = new Date(`${selectedMonth}-01T00:00:00+08:00`);
    const next = new Date(Date.UTC(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 1) - 8 * 3600000);
    const from = `${selectedMonth}-01`, to = day(new Date(next.getTime() - DAY));
    const canFleet = user.permissions.some(code => ['archive:vehicle:read', 'operation:realtime:read'].includes(code));
    const canEnterprise = user.permissions.includes('archive:enterprise-archive:read');
    const canSafety = user.permissions.includes('safety:alert:read');
    const canAnalysis = user.permissions.includes('analytics:operation:read');
    const cities = await this.prisma.cityWorkspace.findMany({ where: { cityCode: { startsWith: '37' }, status: { in: ['ACTIVE', 'SUSPENDED', 'EXPIRED'] } }, select: { id: true, cityCode: true, cityName: true, organizationId: true }, orderBy: { cityCode: 'asc' } });
    const organizations = await this.prisma.organization.findMany({ where: { OR: [{ workspaceId: { in: cities.map(city => city.id) } }, { id: { in: cities.map(city => city.organizationId) } }] }, select: { id: true, workspaceId: true } });
    const cityByOrg = new Map(cities.map(city => [city.organizationId, city.id]));
    for (const org of organizations) if (org.workspaceId && cities.some(city => city.id === org.workspaceId)) cityByOrg.set(org.id, org.workspaceId);
    const orgIds = [...cityByOrg.keys()], inMonth = (date: Date | null | undefined) => !!date && date >= start && date < next;
    const [matters, vehicles, enterpriseCount, alerts, operations] = await Promise.all([
      this.prisma.provinceMatter.findMany({ where: { assignments: { some: { workspaceId: { in: cities.map(city => city.id) } } }, OR: [
        { createdAt: { gte: start, lt: next } }, { updatedAt: { gte: start } }, { dueAt: { gte: start, lt: next } }, { status: { notIn: ['DRAFT', 'CLOSED'] } },
      ] }, select: { id: true, title: true, status: true, dueAt: true, createdAt: true, updatedAt: true, logsJson: true,
        assignments: { select: { id: true, workspaceId: true, status: true, submittedAt: true, closedAt: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }),
      canFleet ? this.prisma.vehicle.findMany({ where: { organizationId: { in: orgIds }, deletedAt: null }, select: { id: true, organizationId: true, onlineStatus: true, realtimeStatus: { select: { drivingState: true, heartbeatAt: true } } } }) : null,
      canEnterprise ? this.prisma.enterprise.count({ where: { organizationId: { in: orgIds }, type: 'OPERATOR', status: 'ACTIVE' } }) : null,
      canSafety ? this.prisma.safetyAlert.findMany({ where: { organizationId: { in: orgIds }, occurredAt: { gte: start, lt: next } }, select: { id: true, status: true, alertType: true } }) : null,
      canAnalysis && start <= now ? this.analysis.analysis(user, { from, to: next > now ? day(now) : to }) : null,
    ]);
    const cohort = matters.filter(item => inMonth(item.createdAt));
    const states: { status: string; label: string; color: string; value: number }[] = stateRows.map(([status, label, color]) => ({ status, label, color, value: cohort.filter(item => item.status === status).length }));
    const overdue = cohort.filter(item => !['DRAFT', 'CLOSED'].includes(item.status) && item.dueAt && item.dueAt < now);
    const unknownMatters = cohort.filter(item => !stateRows.some(([status]) => status === item.status));
    if (unknownMatters.length) states.push({ status: 'OTHER', label: '其他状态', color: '#98a4b5', value: unknownMatters.length });
    const events: Event[] = [], eventKeys = new Set<string>();
    const addEvent = (item: typeof matters[number], type: Event['type'], at: Date | string | null, workspaceId = '', source = '') => {
      if (!at) return; const date = new Date(at); if (!Number.isFinite(date.getTime()) || !inMonth(date) || (type !== 'due' && date > now)) return;
      const key = `${item.id}:${type}:${workspaceId}:${date.toISOString()}`; if (eventKeys.has(key)) return; eventKeys.add(key);
      events.push({ id: source || key, matterId: item.id, title: item.title, type, at: date.toISOString(), cityName: cities.find(city => city.id === workspaceId)?.cityName ?? '' });
    };
    for (const item of matters) {
      let logs: any[] = []; try { const value = JSON.parse(item.logsJson); if (Array.isArray(value)) logs = value; } catch { /* Preserve other valid, explicitly dated records. */ }
      for (const log of logs) {
        if (!log || typeof log !== 'object') continue;
        const type = log.action === 'DISPATCH' ? 'dispatch' : log.action === 'SUBMIT' ? 'feedback' : ['CLOSE', 'RETURN'].includes(log.action) ? 'review' : null;
        if (type) addEvent(item, type, log.at, log.workspaceId ?? '');
      }
      for (const assignment of item.assignments) {
        if (!logs.some(log => log?.action === 'SUBMIT' && log.workspaceId === assignment.workspaceId && assignment.submittedAt && Math.abs(new Date(log.at).getTime() - assignment.submittedAt.getTime()) < 1000)) addEvent(item, 'feedback', assignment.submittedAt, assignment.workspaceId);
        // Explicit workflow logs take precedence over closure timestamps to avoid double-counting one review.
        if (!logs.some(log => log?.action === 'CLOSE' && (!log.workspaceId || log.workspaceId === assignment.workspaceId) && assignment.closedAt && Math.abs(new Date(log.at).getTime() - assignment.closedAt.getTime()) < 1000)) addEvent(item, 'review', assignment.closedAt, assignment.workspaceId);
      }
      if (item.status !== 'DRAFT') addEvent(item, 'due', item.dueAt);
    }
    events.sort((a, b) => a.at.localeCompare(b.at));
    const days = Array.from({ length: Math.round((next.getTime() - start.getTime()) / DAY) }, (_, index) => {
      const date = day(new Date(start.getTime() + index * DAY));
      return { date, dispatch: 0, feedback: 0, review: 0, due: 0 };
    });
    for (const event of events) { const entry = days.find(entry => entry.date === day(new Date(event.at))); if (entry) entry[event.type]++; }
    const latestFeedback = [...matters].filter(item => item.status !== 'CLOSED' && item.assignments.some(assignment => assignment.status === 'SUBMITTED')).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 2);
    const reminders = latestFeedback.map(item => ({ id: `feedback-${item.id}`, title: '地市反馈待复核', text: item.title, at: item.updatedAt.toISOString(), kind: 'feedback', matterId: item.id }));
    const currentOverdue = matters.filter(item => !['DRAFT', 'CLOSED'].includes(item.status) && item.dueAt && item.dueAt < now);
    if (currentOverdue.length) reminders.push({ id: 'overdue', title: '事项逾期提醒', text: `当前有${currentOverdue.length}项事项逾期未办结`, at: now.toISOString(), kind: 'overdue', matterId: '' });
    const fleetStates = [
      { key: 'RUNNING', label: '运行中', value: 0, color: '#4883ff' }, { key: 'PARKED', label: '停靠 / 待命', value: 0, color: '#38d4a0' },
      { key: 'OFFLINE', label: '离线', value: 0, color: '#a6afca' }, { key: 'OTHER', label: '其他上报状态', value: 0, color: '#aa83ed' },
    ];
    for (const row of vehicles ?? []) {
      const key = row.onlineStatus === 'OFFLINE' ? 'OFFLINE' : row.onlineStatus === 'ONLINE' && row.realtimeStatus?.drivingState === 'RUNNING' ? 'RUNNING' : row.onlineStatus === 'ONLINE' && ['PARKED', 'IDLE', 'STOPPED', 'CHARGING'].includes(row.realtimeStatus?.drivingState ?? '') ? 'PARKED' : 'OTHER';
      fleetStates.find(state => state.key === key)!.value++;
    }
    const online = vehicles?.filter(row => row.onlineStatus === 'ONLINE').length ?? 0;
    const reportTimes = vehicles?.flatMap(row => row.realtimeStatus ? [row.realtimeStatus.heartbeatAt.getTime()] : []) ?? [];
    const alertGroups = [
      { key: 'boundary', name: '越界告警', value: 0, color: '#4c7bff' }, { key: 'offline', name: '离线告警', value: 0, color: '#b277fb' },
      { key: 'battery', name: '低电量', value: 0, color: '#ffa62d' }, { key: 'other', name: '其他', value: 0, color: '#39cf9d' },
    ];
    for (const alert of alerts ?? []) {
      const key = ['GEOFENCE_EXIT', 'OUT_OF_BOUNDS', 'OUT_OF_REGION', 'REGION_EXIT', 'NO_ENTRY'].includes(alert.alertType) ? 'boundary' : ['OFFLINE', 'COMMUNICATION_LOSS', 'OFFLINE_TIMEOUT'].includes(alert.alertType) ? 'offline' : ['LOW_BATTERY', 'BATTERY_LOW'].includes(alert.alertType) ? 'battery' : 'other';
      alertGroups.find(group => group.key === key)!.value++;
    }
    const closed = alerts?.filter(alert => alert.status === 'CLOSED').length ?? 0;
    const pending = alerts?.filter(alert => alert.status === 'PENDING_CONFIRMATION').length ?? 0;
    return { month: selectedMonth, from, to, computedAt: now.toISOString(),
      matters: { total: cohort.length, overdue: overdue.length, states },
      cities: cities.map(city => ({ id: city.id, name: city.cityName, code: city.cityCode,
        vehicles: vehicles ? vehicles.filter(row => cityByOrg.get(row.organizationId) === city.id).length : null,
        online: vehicles ? vehicles.filter(row => cityByOrg.get(row.organizationId) === city.id && row.onlineStatus === 'ONLINE').length : null })),
      enterpriseCount,
      fleet: vehicles ? { total: vehicles.length, online, onlineRate: vehicles.length ? Math.round(online / vehicles.length * 1000) / 10 : null,
        latestReportAt: reportTimes.length ? new Date(Math.max(...reportTimes)).toISOString() : null, states: fleetStates.filter(state => state.value || state.key !== 'OTHER') } : null,
      operations: operations ? { kpis: operations.kpis, trend: operations.trend.map(row => ({ date: row.date, trips: row.current.hasRecords ? row.current.trips : null, mileage: row.current.mileage, autonomousRate: row.current.autonomousRate })), cities: operations.cities } : null,
      safety: alerts ? { total: alerts.length, closed, pending, processing: alerts.length - closed - pending,
        closureRate: alerts.length ? Math.round(closed / alerts.length * 1000) / 10 : null, types: alertGroups } : null,
      calendar: { days, events }, reminders: reminders.slice(0, 3),
      permissions: { fleet: canFleet, enterprises: canEnterprise, safety: canSafety, operations: canAnalysis },
    };
  }
}
