<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watchEffect, type Component } from 'vue';
import { useRouter } from 'vue-router';
import type { EChartsCoreOption } from 'echarts/core';
import {
  Activity, Building2, CalendarClock, ChartSpline, ChevronRight, CircleAlert, Files,
  ListChecks, MapPinned, Pentagon, RefreshCw, ShieldAlert, ShieldCheck, ShieldX, Siren, Truck, Wifi,
} from 'lucide-vue-next';
import { api } from '../api';
import AnalyticsChart from '../components/AnalyticsChart.vue';
import OperationsMap from '../components/OperationsMap.vue';
import { useDashboardMotion } from '../useDashboardMotion';
import type {
  DashboardAlert, DashboardTask, RegulatorAlarmStats, RegulatorApprovals, RegulatorRisks,
  RegulatorSummary, RegulatorTrends,
} from '../dashboard-types';
import type { RiskPoint } from '../types';

const router = useRouter();
const root = ref<HTMLElement | null>(null);
const mapRef = ref<{ fitVisible?: () => void } | null>(null);
const summary = ref<RegulatorSummary | null>(null);
const tasks = ref<DashboardTask[]>([]);
const taskTotal = ref(0);
const taskBuckets = ref({ critical: 0, alerts: 0, approvals: 0, review: 0, overdue: 0 });
const risks = ref<RegulatorRisks | null>(null);
const trends = ref<RegulatorTrends | null>(null);
const alarms = ref<DashboardAlert[]>([]);
const alarmStats = ref<RegulatorAlarmStats>({ today: 0, severe: 0, open: 0, accidents: 0, closedToday: 0, types: [] });
const approvals = ref<RegulatorApprovals | null>(null);
const loading = reactive({ summary: true, tasks: true, risks: true, trends: true, alarms: true, approvals: true });
const errors = reactive({ summary: '', tasks: '', risks: '', trends: '', alarms: '', approvals: '' });
const selectedVehicleId = ref('');
const filters = reactive({ enterpriseId: '', organizationId: '', status: '' });
const taskFilter = ref('');
const focusTab = ref<'enterprises' | 'vehicles' | 'organizations'>('enterprises');
const iconMap: Record<string, Component> = { Activity, Building2, CalendarClock, ChartSpline, Files, ListChecks, MapPinned, Pentagon, ShieldAlert, ShieldX, Siren, Truck };
const motionReady = computed(() => Boolean(summary.value));
useDashboardMotion(root, motionReady);

watchEffect(() => { document.title = '监管总览 · 无人快递车监管平台'; });

async function loadPart<T>(key: keyof typeof loading, path: string, apply: (data: T) => void) {
  loading[key] = true; errors[key] = '';
  try { apply(await api<T>(path)); }
  catch (reason) { errors[key] = reason instanceof Error ? reason.message : '加载失败'; }
  finally { loading[key] = false; }
}
async function load() {
  await loadPart('summary', '/dashboard/regulator/summary', (data: RegulatorSummary) => { summary.value = data; });
  await Promise.all([
    loadPart('tasks', '/dashboard/regulator/tasks', (data: { total: number; items: DashboardTask[]; buckets?: typeof taskBuckets.value }) => {
      taskTotal.value = data.total; tasks.value = data.items;
      const soon = Date.now() + 2 * 3_600_000;
      taskBuckets.value = data.buckets ?? {
        critical: data.items.filter((item) => item.kind === 'EMERGENCY' || item.level === 'CRITICAL').length,
        alerts: data.items.filter((item) => item.kind === 'ALERT').length,
        approvals: data.items.filter((item) => item.kind === 'APPROVAL').length,
        review: data.items.filter((item) => item.status === 'PENDING_REVIEW' || item.label === '复核').length,
        overdue: data.items.filter((item) => item.dueAt && new Date(item.dueAt).getTime() <= soon).length,
      };
    }),
    loadPart('risks', '/dashboard/regulator/risks', (data: RegulatorRisks) => { risks.value = data; }),
    loadPart('trends', '/dashboard/regulator/trends', (data: RegulatorTrends) => { trends.value = data; }),
    loadPart('alarms', '/dashboard/regulator/alarms', (data: { items: DashboardAlert[]; stats?: RegulatorAlarmStats }) => {
      alarms.value = data.items;
      if (data.stats) alarmStats.value = data.stats;
    }),
    loadPart('approvals', '/dashboard/regulator/approvals', (data: RegulatorApprovals) => { approvals.value = data; }),
  ]);
}
function go(path: string) { router.push(path); }
function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }
function formatShortTime(value: string) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function formatDay(value: string) { return value.slice(5).replace('-', '/'); }
function typeText(value: string) { return ({ VEHICLE_FAULT: '车辆故障', AUTONOMOUS_ABNORMAL: '自动驾驶异常', OVERSPEED: '超速', OUT_OF_BOUNDS: '越界', NO_ENTRY: '闯入禁行区', OFFLINE: '离线', MANUAL_REPORT: '主动上报' } as Record<string, string>)[value] ?? value; }
function statusText(value: string) { return ({ PENDING_CONFIRMATION: '待确认', PENDING_HANDLING: '待处置', IN_PROGRESS: '处理中', PENDING_REVIEW: '待复核', CLOSED: '已关闭', PENDING: '待办理', IN_REVIEW: '审批中', RETURNED: '待补正', EXPIRING: '即将到期', EXPIRED: '已过期' } as Record<string, string>)[value] ?? value; }
function levelText(value: string) { return ({ CRITICAL: '严重', HIGH: '高风险', MEDIUM: '关注', LOW: '关注', INFO: '普通' } as Record<string, string>)[value] ?? value; }
function relativeDue(value?: string | null) {
  if (!value) return '';
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (minutes < 0) return `已超时 ${Math.abs(minutes) < 60 ? `${Math.abs(minutes)} 分钟` : `${Math.round(Math.abs(minutes) / 60)} 小时`}`;
  if (minutes < 60) return `剩余 ${minutes} 分钟`;
  if (minutes < 1440) return `剩余 ${Math.round(minutes / 60)} 小时`;
  return `${Math.round(minutes / 1440)} 天后到期`;
}
function elapsed(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `已持续 ${minutes} 分钟`;
  return `已等待 ${minutes < 1440 ? `${Math.round((minutes / 60) * 10) / 10} 小时` : `${Math.round(minutes / 1440)} 天`}`;
}
function mapAction(type: 'monitor' | 'trajectory' | 'archive' | 'alerts', id: string) {
  selectedVehicleId.value = id;
  go(({ monitor: '/operations/realtime', trajectory: `/operations/trajectories?vehicleId=${id}`, archive: '/archives/vehicles', alerts: '/safety/alerts' })[type]);
}
async function scrollToMap() {
  await nextTick();
  document.getElementById('regulatory-dashboard-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function focusVehicle(id?: string | null) {
  if (!id) return;
  selectedVehicleId.value = id;
  filters.status = filters.status === 'OFFLINE' ? '' : filters.status;
  await scrollToMap();
}
async function focusEnterprise(id: string) {
  filters.enterpriseId = id;
  filters.organizationId = '';
  selectedVehicleId.value = '';
  await scrollToMap();
  await nextTick();
  mapRef.value?.fitVisible?.();
}
async function focusOrganization(id: string) {
  filters.organizationId = id;
  filters.enterpriseId = '';
  selectedVehicleId.value = '';
  await scrollToMap();
  await nextTick();
  mapRef.value?.fitVisible?.();
}
function handleTask(item: DashboardTask) {
  if (item.vehicleId) { void focusVehicle(item.vehicleId); return; }
  go(item.route);
}
function openTask(item: DashboardTask) {
  if (item.vehicleId) selectedVehicleId.value = item.vehicleId;
  go(item.route);
}
function taskAction(item: DashboardTask) {
  if (item.kind === 'APPROVAL') return '去审批';
  if (item.status === 'PENDING_REVIEW' || item.label === '复核') return '去复核';
  if (item.kind === 'EXPIRY') return '去核查';
  return '进入处置';
}
function taskSubject(item: DashboardTask) {
  return item.description.split('·').map((part) => part.trim()).filter(Boolean).join(' · ');
}
function matchesTaskFilter(item: DashboardTask) {
  if (taskFilter.value === 'critical') return item.kind === 'EMERGENCY' || item.level === 'CRITICAL';
  if (taskFilter.value === 'alerts') return item.kind === 'ALERT';
  if (taskFilter.value === 'approvals') return item.kind === 'APPROVAL';
  if (taskFilter.value === 'review') return item.status === 'PENDING_REVIEW' || item.label === '复核';
  if (taskFilter.value === 'overdue') return Boolean(item.dueAt && new Date(item.dueAt).getTime() <= Date.now() + 2 * 3_600_000);
  return true;
}

const greetingTail = computed(() => {
  if (!summary.value) return '';
  const m = summary.value.metrics;
  const watch = m.severeAlerts > 0 || m.overdueActions > 0 || m.overdueApprovals > 0;
  const head = watch ? '今日整体运行存在重点关注事项' : '今日监管范围运行总体平稳';
  return `${head}，当前 ${m.currentOnline} 辆车辆在线，存在 ${m.todayAlerts} 条告警、${m.pendingActions} 项待处置事项、${m.pendingApprovals} 项审批待办。`;
});
const situationState = computed(() => {
  if (!summary.value) return { label: '评估中', tone: '' };
  const m = summary.value.metrics;
  if (m.severeAlerts > 0 || m.overdueActions > 0 || m.overdueApprovals > 0) return { label: '需关注', tone: 'watch' };
  if (m.todayAlerts > 0 || m.pendingApprovals > 0) return { label: '关注中', tone: 'watch' };
  return { label: '运行平稳', tone: 'ok' };
});
const handlingRate = computed(() => {
  const today = alarmStats.value.today;
  if (!today) return 100;
  return Math.min(100, Math.round((alarmStats.value.closedToday / today) * 1000) / 10);
});
const metrics = computed(() => {
  if (!summary.value) return [];
  const m = summary.value.metrics;
  return [
    { label: '在册车辆', value: m.registeredVehicles, hint: `较上月 +${m.monthDelta}`, icon: Truck, path: '/archives/vehicle-management' },
    { label: '当前在线', value: m.currentOnline, hint: `在线率 ${m.onlineRate}%`, icon: Wifi, path: '/operations/monitor' },
    { label: '当前运行', value: m.currentRunning, hint: `占在线 ${m.runningRate}%`, icon: Activity, path: '/operations/realtime' },
    { label: '今日告警', value: m.todayAlerts, hint: `严重 ${m.severeAlerts}`, hintRisk: m.severeAlerts > 0, icon: Siren, path: '/safety/alerts' },
    { label: '待处置', value: m.pendingActions, hint: `超时 ${m.overdueActions} / 待审 ${m.pendingApprovals}`, hintRisk: m.overdueActions > 0, icon: ShieldAlert, path: '/safety/emergency' },
    { label: '待审批', value: m.pendingApprovals, hint: m.pendingApprovals ? `最长等待 ${m.longestWaitHours ?? m.longestWaitDays * 24} 小时` : '当前无积压', hintRisk: m.overdueApprovals > 0, icon: ListChecks, path: '/admission/approvals' },
  ];
});
const visibleTasks = computed(() => tasks.value.filter(matchesTaskFilter).slice(0, 5));
const latestAlerts = computed(() => alarms.value.slice(0, 5));
const recentApprovals = computed(() => (approvals.value?.recent ?? []).slice(0, 3));
const abnormalCount = computed(() => (summary.value?.map.vehicles ?? []).filter((item) => item.attentionLevel && item.attentionLevel !== 'NORMAL').length);
const filteredVehicles = computed(() => (summary.value?.map.vehicles ?? []).filter((item) => {
  if (filters.enterpriseId && item.enterpriseId !== filters.enterpriseId) return false;
  if (filters.organizationId && item.organizationId !== filters.organizationId) return false;
  if (filters.status === 'OFFLINE' && item.onlineStatus !== 'OFFLINE') return false;
  if (filters.status === 'ATTENTION' && item.attentionLevel === 'NORMAL') return false;
  return true;
}));
const filteredRegions = computed(() => (summary.value?.map.regions ?? []).filter((item) => (!filters.enterpriseId || item.enterpriseId === filters.enterpriseId) && (!filters.organizationId || item.organizationId === filters.organizationId)));
const selectedVehicle = computed(() => summary.value?.map.vehicles.find((item) => item.id === selectedVehicleId.value) ?? null);
const accidentPoints = computed<RiskPoint[]>(() => (summary.value?.map.accidents ?? []).map((item) => ({
  id: item.id, longitude: item.longitude, latitude: item.latitude, weight: item.level === 'CRITICAL' ? 10 : 6, kind: 'ACCIDENT', title: item.title, level: item.level,
})));
const focusItems = computed(() => {
  if (focusTab.value === 'vehicles') return (risks.value?.vehicles ?? []).slice(0, 5).map((item) => ({
    id: item.id, title: item.businessNo, detail: item.tags.join(' · ') || item.enterpriseName || '重点车辆', level: item.level, kind: 'vehicle' as const,
  }));
  if (focusTab.value === 'organizations') return (risks.value?.organizations ?? []).slice(0, 5).map((item) => ({
    id: item.id, title: item.name, detail: (item.tags ?? []).join(' · ') || '区域风险综合', level: item.level ?? 'LOW', kind: 'organization' as const,
  }));
  return (risks.value?.enterprises ?? []).slice(0, 5).map((item) => ({
    id: item.id, title: item.name, detail: `告警 ${item.alertCount ?? 0} · 未闭环 ${item.openCount ?? 0}`, level: item.level, kind: 'enterprise' as const,
  }));
});
const situationRows = computed(() => {
  const m = summary.value?.metrics;
  return [
    { label: '在线率', value: `${m?.onlineRate ?? 0}%`, width: m?.onlineRate ?? 0, hint: trends.value ? `周均 ${trends.value.compare.weekAvgOnlineRate}%` : '' },
    { label: '告警处置率', value: `${handlingRate.value}%`, width: handlingRate.value, hint: alarmStats.value.today ? `今日关闭 ${alarmStats.value.closedToday}` : '今日无新增告警' },
    { label: '重大风险', value: String(m?.severeAlerts ?? 0), width: Math.min(100, (m?.severeAlerts ?? 0) * 20), hint: '今日严重/高等级告警', count: true },
    { label: '审批积压', value: String(m?.pendingApprovals ?? 0), width: Math.min(100, (m?.pendingApprovals ?? 0) * 20), hint: m?.overdueApprovals ? `超时 ${m.overdueApprovals}` : '待办审批', count: true },
  ];
});
const chartTooltip = {
  backgroundColor: '#fff', borderColor: '#EAECF0', borderWidth: 1,
  extraCssText: 'box-shadow:0 4px 12px rgba(16,24,40,.08);border-radius:8px',
  textStyle: { color: '#101828', fontSize: 12 },
};
const trendOption = computed<EChartsCoreOption>(() => {
  const points = trends.value?.online ?? [];
  return {
    grid: { left: 4, right: 8, top: 10, bottom: 0, containLabel: true },
    tooltip: { trigger: 'axis', ...chartTooltip },
    xAxis: {
      type: 'category', data: points.map((item) => formatDay(item.date)),
      axisLine: { lineStyle: { color: '#EAECF0' } }, axisTick: { show: false },
      axisLabel: { color: '#98A2B3', fontSize: 11 },
    },
    yAxis: {
      type: 'value', min: 0, max: 100, splitNumber: 2,
      splitLine: { lineStyle: { color: '#F2F4F7' } },
      axisLabel: { color: '#98A2B3', fontSize: 11, formatter: '{value}%' },
    },
    series: [{
      type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, name: '在线率',
      lineStyle: { width: 2, color: '#2563EB' }, itemStyle: { color: '#2563EB' },
      areaStyle: { color: 'rgba(37,99,235,.10)' },
      data: points.map((item) => item.onlineRate),
    }],
  };
});
function alertStatusTone(status: string) {
  if (status === 'CLOSED') return 'done';
  if (status === 'IN_PROGRESS' || status === 'PENDING_REVIEW') return 'busy';
  if (status === 'PENDING_CONFIRMATION' || status === 'PENDING_HANDLING') return 'wait';
  return '';
}
function applicationTone(item: { status: string; overdue?: boolean }) {
  if (item.overdue) return 'overdue';
  if (item.status === 'RETURNED') return 'returned';
  if (item.status === 'IN_REVIEW') return 'review';
  return '';
}
function focusObject(item: { id: string; kind: 'enterprise' | 'vehicle' | 'organization' }) {
  if (item.kind === 'vehicle') return focusVehicle(item.id);
  if (item.kind === 'organization') return focusOrganization(item.id);
  return focusEnterprise(item.id);
}

onMounted(load);
</script>

<template>
  <div ref="root" class="dashboard-page regulatory-dashboard">
    <h1 class="sr-only">监管总览</h1>
    <div v-if="errors.summary && !summary" class="error-state" role="alert">
      <strong>监管总览暂时无法加载</strong><span>{{ errors.summary }}</span>
      <el-button :icon="RefreshCw" @click="load">重新加载</el-button>
    </div>
    <template v-else>
      <div v-if="!summary" class="dashboard-skeleton-metrics reg-skeleton" aria-label="正在加载监管指标"><el-skeleton-item v-for="n in 6" :key="n" variant="rect" /></div>
      <header v-else class="reg-head">
        <div>
          <p class="reg-summary">{{ greetingTail }}</p>
        </div>
        <div class="reg-head-meta">
          <dl>
            <div><dt>监管区域</dt><dd>{{ summary.meta.scopeName }}</dd></div>
            <div :class="situationState.tone"><dt>监管态势</dt><dd>{{ situationState.label }}</dd></div>
            <div><dt>待办事项</dt><dd>{{ summary.meta.openWork }}</dd></div>
          </dl>
          <div class="reg-head-actions">
            <span>更新于 {{ formatTime(summary.meta.updatedAt) }}</span>
            <el-button :icon="RefreshCw" :loading="loading.summary" aria-label="刷新监管总览" @click="load">刷新</el-button>
          </div>
        </div>
      </header>
      <div v-if="errors.summary" class="dashboard-refresh-error" role="alert">
        <span>部分监管数据刷新失败：{{ errors.summary }}</span>
        <el-button size="small" :icon="RefreshCw" @click="load">重新加载</el-button>
      </div>

      <div v-if="summary" class="reg-body">
        <section class="dashboard-metrics reg-strip" aria-label="核心监管指标">
          <button v-for="item in metrics" :key="item.label" type="button" class="dashboard-metric" @click="go(item.path)">
            <span class="reg-strip-icon"><component :is="item.icon" :size="15" /></span>
            <span>{{ item.label }}</span>
            <strong>{{ item.value.toLocaleString('zh-CN') }}</strong>
            <small :class="{ 'hint-risk': item.hintRisk }">{{ item.hint }}</small>
          </button>
        </section>

        <section class="reg-row reg-row-primary">
          <article class="reg-card reg-task-center">
            <header class="reg-card-header">
              <h2>我的监管待办</h2>
              <span class="panel-count">{{ taskTotal }}</span>
            </header>
            <div class="reg-task-stats" role="tablist" aria-label="待办分类">
              <button type="button" :class="{ active: taskFilter === 'critical' }" @click="taskFilter = taskFilter === 'critical' ? '' : 'critical'"><strong>{{ taskBuckets.critical }}</strong><span>重大事件</span></button>
              <button type="button" :class="{ active: taskFilter === 'alerts' }" @click="taskFilter = taskFilter === 'alerts' ? '' : 'alerts'"><strong>{{ taskBuckets.alerts }}</strong><span>告警处置</span></button>
              <button type="button" :class="{ active: taskFilter === 'approvals' }" @click="taskFilter = taskFilter === 'approvals' ? '' : 'approvals'"><strong>{{ taskBuckets.approvals }}</strong><span>审批待办</span></button>
              <button type="button" :class="{ active: taskFilter === 'review' }" @click="taskFilter = taskFilter === 'review' ? '' : 'review'"><strong>{{ taskBuckets.review }}</strong><span>待复核</span></button>
              <button type="button" :class="{ active: taskFilter === 'overdue' }" @click="taskFilter = taskFilter === 'overdue' ? '' : 'overdue'"><strong>{{ taskBuckets.overdue }}</strong><span>即将超时</span></button>
            </div>
            <div v-if="loading.tasks" class="dashboard-empty compact"><span>正在加载待办…</span></div>
            <div v-else-if="errors.tasks" class="module-error" role="alert"><strong>待办加载失败</strong><span>{{ errors.tasks }}</span><el-button size="small" @click="load">重试</el-button></div>
            <div v-else-if="visibleTasks.length" class="dashboard-task-list reg-task-cards">
              <button v-for="item in visibleTasks" :key="`${item.kind}-${item.id}`" type="button" :class="item.level.toLowerCase()" @click="handleTask(item)">
                <span class="task-level" :class="item.level.toLowerCase()">{{ item.label }}</span>
                <span class="reg-task-main">
                  <strong>{{ item.title }}</strong>
                  <small>{{ taskSubject(item) }}</small>
                </span>
                <em :class="{ overdue: item.dueAt && new Date(item.dueAt) < new Date() }">{{ item.dueAt ? relativeDue(item.dueAt) : elapsed(item.occurredAt) }}</em>
                <span class="reg-task-action" @click.stop="openTask(item)">{{ taskAction(item) }}</span>
              </button>
            </div>
            <div v-else class="dashboard-empty compact"><ShieldCheck :size="20" /><strong>{{ taskFilter ? '该分类暂无待办' : '当前暂无待处理事项' }}</strong><span>新的审批、告警或复核事项会显示在这里。</span></div>
          </article>

          <article class="reg-card reg-situation">
            <header class="reg-card-header">
              <h2>今日监管态势</h2>
              <span :class="['reg-state', situationState.tone]">{{ situationState.label }}</span>
            </header>
            <div v-if="errors.trends && errors.alarms" class="module-error" role="alert"><strong>态势加载失败</strong><el-button size="small" @click="load">重试</el-button></div>
            <template v-else>
              <div class="reg-situation-rows">
                <div v-for="item in situationRows" :key="item.label">
                  <span>{{ item.label }}</span>
                  <b>{{ item.value }}</b>
                  <i><em :style="{ width: `${item.width}%` }"></em></i>
                  <small>{{ item.hint }}</small>
                </div>
              </div>
              <h3>近 7 日在线率</h3>
              <AnalyticsChart :option="trendOption" height="112px" aria-label="近七日在线率趋势" />
            </template>
          </article>
        </section>

        <section class="reg-row reg-row-risk">
          <article class="reg-card reg-safety">
            <header class="reg-card-header">
              <h2>安全风险与最新告警</h2>
              <el-button link type="primary" @click="go('/safety/alerts')">查看全部<ChevronRight :size="14" /></el-button>
            </header>
            <div v-if="errors.alarms" class="module-error" role="alert"><strong>告警加载失败</strong><span>{{ errors.alarms }}</span></div>
            <template v-else>
              <div class="reg-stat-pills">
                <div><b>{{ alarmStats.today }}</b><span>今日告警</span></div>
                <div :class="{ 'is-risk': alarmStats.severe > 0 }"><b>{{ alarmStats.severe }}</b><span>严重告警</span></div>
                <div :class="{ 'is-watch': alarmStats.open > 0 }"><b>{{ alarmStats.open }}</b><span>未处置</span></div>
                <div :class="{ 'is-risk': alarmStats.accidents > 0 }"><b>{{ alarmStats.accidents }}</b><span>事故</span></div>
              </div>
              <div v-if="latestAlerts.length" class="dashboard-alert-table reg-alert-table" role="list" aria-label="最新告警">
                <button v-for="item in latestAlerts" :key="item.id" type="button" @click="item.vehicle?.id ? focusVehicle(item.vehicle.id) : go('/safety/alerts')">
                  <time>{{ formatShortTime(item.occurredAt) }}</time>
                  <span class="reg-alert-main">
                    <strong>{{ item.enterprise.name }}</strong>
                    <small>{{ item.vehicle?.businessNo ?? '平台事件' }} · {{ typeText(item.alertType) }}</small>
                  </span>
                  <span class="alert-level" :class="item.level.toLowerCase()">{{ levelText(item.level) }}</span>
                  <em :class="alertStatusTone(item.status)">{{ statusText(item.status) }}</em>
                </button>
              </div>
              <div v-else class="dashboard-empty compact"><CircleAlert :size="20" /><strong>当前没有告警</strong></div>
            </template>
          </article>

          <article class="reg-card reg-focus">
            <header class="reg-card-header">
              <h2>重点监管对象</h2>
              <el-button link @click="go('/analytics/safety')">安全态势<ChevronRight :size="14" /></el-button>
            </header>
            <div class="reg-focus-tabs" role="tablist" aria-label="重点对象类别">
              <button type="button" role="tab" :aria-selected="focusTab === 'enterprises'" :class="{ active: focusTab === 'enterprises' }" @click="focusTab = 'enterprises'">重点企业</button>
              <button type="button" role="tab" :aria-selected="focusTab === 'vehicles'" :class="{ active: focusTab === 'vehicles' }" @click="focusTab = 'vehicles'">重点车辆</button>
              <button type="button" role="tab" :aria-selected="focusTab === 'organizations'" :class="{ active: focusTab === 'organizations' }" @click="focusTab = 'organizations'">重点区域</button>
            </div>
            <div v-if="errors.risks" class="module-error" role="alert"><strong>重点对象加载失败</strong><span>{{ errors.risks }}</span></div>
            <div v-else-if="focusItems.length" class="reg-focus-list">
              <button v-for="item in focusItems" :key="`${item.kind}-${item.id}`" type="button" :class="item.level.toLowerCase()" @click="focusObject(item)">
                <span>
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.detail }}</small>
                </span>
                <em>{{ levelText(item.level) }}</em>
                <ChevronRight :size="14" />
              </button>
            </div>
            <div v-else class="dashboard-empty compact"><strong>当前没有需要重点关注的对象</strong></div>
          </article>
        </section>

        <section class="reg-row reg-row-map">
          <article class="reg-card reg-approval">
            <header class="reg-card-header">
              <h2>审批与许可</h2>
              <el-button link type="primary" @click="go('/admission/approvals')">进入审批<ChevronRight :size="14" /></el-button>
            </header>
            <div v-if="errors.approvals" class="module-error" role="alert"><strong>审批摘要加载失败</strong><span>{{ errors.approvals }}</span></div>
            <template v-else-if="approvals?.available">
              <p class="reg-expiry-note" :class="{ watch: (approvals.overdue ?? 0) > 0 }">{{ approvals.overdue ? `${approvals.overdue} 项审批已超时，请优先办理` : `今日新提交 ${approvals.submittedToday} 项，平均办理 ${approvals.averageApprovalHours} 小时` }}</p>
              <div class="reg-stat-pills">
                <div v-for="item in approvals.pendingByType" :key="item.type"><b>{{ item.count }}</b><span>{{ ({ ENTERPRISE_ONBOARDING: '企业入驻', ROAD_TEST: '路测申请', LICENSE_RENEWAL: '续期申请' } as Record<string, string>)[item.type] }}</span></div>
                <div :class="{ 'is-watch': approvals.expiringLicenses > 0 }"><b>{{ approvals.expiringLicenses }}</b><span>即将到期</span></div>
              </div>
              <div class="reg-app-list">
                <button v-for="item in recentApprovals" :key="item.id" type="button" :class="applicationTone(item)" @click="go(item.route)">
                  <span>
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.currentNodeName ? `当前：${item.currentNodeName}` : statusText(item.status) }}</small>
                  </span>
                  <em>{{ item.overdue ? '已超时' : statusText(item.status) }}</em>
                  <ChevronRight :size="14" />
                </button>
                <div v-if="!recentApprovals.length" class="dashboard-empty compact"><strong>暂无重点审批事项</strong></div>
              </div>
            </template>
            <div v-else class="dashboard-empty compact"><strong>当前角色没有审批数据权限</strong></div>
          </article>

          <article id="regulatory-dashboard-map" class="reg-card reg-map-card">
            <header class="reg-card-header">
              <h2>辅助定位</h2>
              <span class="map-header-meta">实时车辆 {{ filteredVehicles.length }} ｜ 异常 {{ abnormalCount }}</span>
            </header>
            <div class="reg-map-toolbar">
              <button type="button" :class="{ active: filters.status === '' }" @click="filters.status = ''">全部</button>
              <button type="button" :class="{ active: filters.status === 'ATTENTION' }" @click="filters.status = 'ATTENTION'">异常</button>
              <button type="button" :class="{ active: filters.status === 'OFFLINE' }" @click="filters.status = 'OFFLINE'">离线</button>
              <el-select v-model="filters.enterpriseId" clearable placeholder="全部企业" aria-label="按企业筛选" size="small">
                <el-option v-for="item in summary.filters.enterprises" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
              <el-button link type="primary" @click="go('/operations/realtime')">实时监控<ChevronRight :size="14" /></el-button>
            </div>
            <OperationsMap
              ref="mapRef"
              mode="dashboard"
              group-by="enterprise"
              :points="filteredVehicles"
              :regions="filteredRegions"
              :risk-points="accidentPoints"
              :selected-id="selectedVehicleId"
              height="320px"
              @select="selectedVehicleId = $event"
              @action="mapAction"
            />
            <div v-if="selectedVehicle" class="map-selected dashboard-selected-vehicle">
              <span class="risk-dot" :class="selectedVehicle.attentionLevel?.toLowerCase()"></span>
              <div><strong>{{ selectedVehicle.businessNo }}</strong><small>{{ selectedVehicle.enterprise.name }} · {{ ({ RUNNING: '运行中', IDLE: '临停', PARKED: '停驶', OFFLINE: '离线' } as Record<string, string>)[selectedVehicle.realtimeStatus?.drivingState ?? ''] ?? '离线' }}</small></div>
              <el-button size="small" @click="go('/operations/realtime')">查看实时监控</el-button>
            </div>
          </article>
        </section>

        <nav v-if="summary.shortcuts.length" class="reg-quick" aria-label="快捷监管入口">
          <button v-for="item in summary.shortcuts" :key="item.path" type="button" @click="go(item.path)">
            <span class="reg-quick-icon"><component :is="iconMap[item.icon] ?? Activity" :size="16" /></span>
            <strong>{{ item.label }}</strong>
          </button>
        </nav>
      </div>
    </template>
  </div>
</template>
