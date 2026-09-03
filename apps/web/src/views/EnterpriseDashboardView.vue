<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watchEffect, type Component } from 'vue';
import { useRouter } from 'vue-router';
import {
  Activity, Building2, CalendarClock, ChevronRight, ClipboardPenLine, Gauge, ListChecks,
  MapPinned, RefreshCw, Route, ShieldAlert, ShieldCheck, ShieldX, Siren, Truck, Wifi,
} from 'lucide-vue-next';
import { api } from '../api';
import OperationsMap from '../components/OperationsMap.vue';
import { useDashboardMotion } from '../useDashboardMotion';
import type { DashboardTask, EnterpriseApplications, EnterpriseRisks, EnterpriseSummary, EnterpriseVehicles } from '../dashboard-types';

const router = useRouter();
const root = ref<HTMLElement | null>(null);
const summary = ref<EnterpriseSummary | null>(null);
const tasks = ref<DashboardTask[]>([]);
const taskTotal = ref(0);
const vehicles = ref<EnterpriseVehicles | null>(null);
const risks = ref<EnterpriseRisks | null>(null);
const applications = ref<EnterpriseApplications | null>(null);
const loading = reactive({ summary: true, tasks: true, vehicles: true, risks: true, applications: true });
const errors = reactive({ summary: '', tasks: '', vehicles: '', risks: '', applications: '' });
const selectedVehicleId = ref('');
const vehicleStatus = ref('');
const taskFilter = ref('');
const iconMap: Record<string, Component> = { Activity, Building2, CalendarClock, ClipboardPenLine, Gauge, ListChecks, MapPinned, Route, ShieldAlert, ShieldCheck, ShieldX, Siren, Truck, Wifi };
const shortcutOrder = ['新增车辆', '路测申请', '事故上报', '告警处置', '轨迹查询', '续期申请'];
const motionReady = computed(() => Boolean(summary.value));
useDashboardMotion(root, motionReady);

watchEffect(() => { document.title = '企业运营工作台 · 无人快递车监管平台'; });

async function loadPart<T>(key: keyof typeof loading, path: string, apply: (data: T) => void) {
  loading[key] = true; errors[key] = '';
  try { apply(await api<T>(path)); }
  catch (reason) { errors[key] = reason instanceof Error ? reason.message : '加载失败'; }
  finally { loading[key] = false; }
}
async function load() {
  await loadPart('summary', '/dashboard/enterprise/summary', (data: EnterpriseSummary) => { summary.value = data; });
  await Promise.all([
    loadPart('tasks', '/dashboard/enterprise/tasks', (data: { total: number; items: DashboardTask[] }) => { taskTotal.value = data.total; tasks.value = data.items; }),
    loadPart('vehicles', '/dashboard/enterprise/vehicles', (data: EnterpriseVehicles) => { vehicles.value = data; }),
    loadPart('risks', '/dashboard/enterprise/risks', (data: EnterpriseRisks) => { risks.value = data; }),
    loadPart('applications', '/dashboard/enterprise/applications', (data: EnterpriseApplications) => { applications.value = data; }),
  ]);
}
function go(path: string) { router.push(path); }
function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }
function formatShortTime(value: string) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function typeText(value: string) { return ({ VEHICLE_FAULT: '车辆故障', AUTONOMOUS_ABNORMAL: '自动驾驶异常', OVERSPEED: '超速', OUT_OF_BOUNDS: '越出运行区域', NO_ENTRY: '闯入禁行区', OFFLINE: '车辆离线', MANUAL_REPORT: '主动上报' } as Record<string, string>)[value] ?? value; }
function applicationTypeText(value: string) { return ({ ENTERPRISE_ONBOARDING: '企业入驻', ROAD_TEST: '路测申请', LICENSE_RENEWAL: '续期申请' } as Record<string, string>)[value] ?? value; }
function statusText(value: string) { return ({ DRAFT: '草稿', IN_REVIEW: '审批中', RETURNED: '待补正', APPROVED: '已通过', REJECTED: '未通过', PENDING_CONFIRMATION: '待确认', PENDING_HANDLING: '待处置', IN_PROGRESS: '处理中', PENDING_REVIEW: '待复核', CLOSED: '已关闭', EXPIRING: '即将到期', EXPIRED: '已过期' } as Record<string, string>)[value] ?? value; }
function levelText(value: string) { return ({ CRITICAL: '严重', HIGH: '高', MEDIUM: '一般', LOW: '低', INFO: '普通' } as Record<string, string>)[value] ?? value; }
function relativeDue(value?: string | null) {
  if (!value) return '';
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (minutes < 0) return `已超时 ${Math.abs(minutes) < 60 ? `${Math.abs(minutes)} 分钟` : `${Math.round(Math.abs(minutes) / 60)} 小时`}`;
  if (minutes < 60) return `剩余 ${minutes} 分钟`;
  if (minutes < 1440) return `剩余 ${Math.round(minutes / 60)} 小时`;
  return `${Math.round(minutes / 1440)} 天后到期`;
}
function mapAction(type: 'monitor' | 'trajectory' | 'archive' | 'alerts', id: string) {
  selectedVehicleId.value = id;
  go(({ monitor: '/enterprise/operations/realtime', trajectory: `/enterprise/operations/trajectories?vehicleId=${id}`, archive: '/enterprise/vehicles/archives', alerts: '/enterprise/safety/alerts' })[type]);
}
async function focusVehicle(id?: string | null) {
  if (!id) return;
  selectedVehicleId.value = id;
  if (vehicleStatus.value === 'OFFLINE') vehicleStatus.value = '';
  await nextTick();
  document.getElementById('enterprise-dashboard-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function handleTask(item: DashboardTask) {
  if (item.vehicleId) selectedVehicleId.value = item.vehicleId;
  go(item.route);
}
function taskAction(item: DashboardTask) {
  if (item.kind === 'ALERT') return '立即处理';
  if (item.kind === 'EMERGENCY') return '去反馈';
  if (item.status === 'RETURNED') return '去补正';
  if (item.kind === 'APPLICATION') return '查看申请';
  if (item.kind === 'EXPIRY' || item.kind === 'QUALIFICATION') return '去续期';
  return '去处理';
}
function taskContext(item: DashboardTask) {
  return item.description.split('·')[0]?.trim() || item.description;
}

const greet = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return '上午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});
const priorityCount = computed(() => tasks.value.filter((item) => item.level === 'CRITICAL' || item.level === 'HIGH').length);
const greetingTail = computed(() => {
  if (!taskTotal.value) return '当前没有待处理事项，运营状态正常。';
  return `今日共有 ${taskTotal.value} 项事项待处理，其中 ${priorityCount.value} 项需要优先关注。`;
});
const safetyState = computed(() => {
  if (!summary.value) return { label: '正常', tone: 'ok' };
  if (summary.value.metrics.severeAlerts > 0 || summary.value.metrics.overdueActions > 0) return { label: '需关注', tone: 'watch' };
  if (summary.value.metrics.todayAlerts > 0) return { label: '需关注', tone: 'watch' };
  return { label: '正常', tone: 'ok' };
});
const trend = computed(() => risks.value?.operations.trend ?? []);
const mileageDelta = computed(() => {
  if (trend.value.length < 2) return null;
  const today = trend.value[trend.value.length - 1]?.mileage ?? 0;
  const yesterday = trend.value[trend.value.length - 2]?.mileage ?? 0;
  if (!yesterday) return null;
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
});
const metrics = computed(() => {
  if (!summary.value) return [];
  const mileage = summary.value.metrics.todayMileage;
  const delta = mileageDelta.value;
  return [
    { label: '在册车辆', value: summary.value.metrics.registeredVehicles, hint: `正常 ${summary.value.metrics.activeVehicles} / 停用 ${summary.value.metrics.inactiveVehicles}`, icon: Truck, path: '/enterprise/vehicles/list' },
    { label: '当前在线', value: summary.value.metrics.currentOnline, hint: `在线率 ${summary.value.metrics.onlineRate}%`, icon: Wifi, path: '/enterprise/operations/monitor' },
    { label: '今日运行', value: `${mileage}`, hint: delta == null ? `${summary.value.metrics.todayRunning} 辆在跑` : `较昨日 ${delta > 0 ? '+' : ''}${delta}%`, icon: Activity, path: '/enterprise/operations/monitor', suffix: 'km' },
    { label: '今日告警', value: summary.value.metrics.todayAlerts, hint: `严重 ${summary.value.metrics.severeAlerts}`, hintRisk: summary.value.metrics.severeAlerts > 0, icon: Siren, path: '/enterprise/safety/alerts' },
    { label: '待处理', value: summary.value.metrics.pendingActions, hint: `超时 ${summary.value.metrics.overdueActions}`, hintRisk: summary.value.metrics.overdueActions > 0, icon: ShieldAlert, path: '/enterprise/safety/emergency' },
    { label: '待办申请', value: summary.value.metrics.pendingApplications, hint: `待补正 ${summary.value.metrics.corrections}`, hintRisk: summary.value.metrics.corrections > 0, icon: ClipboardPenLine, path: '/enterprise/applications/mine' },
  ];
});
const taskBuckets = computed(() => ({
  critical: tasks.value.filter((item) => item.kind === 'ALERT' && (item.level === 'CRITICAL' || item.label.includes('严重'))).length,
  correction: tasks.value.filter((item) => item.status === 'RETURNED' || item.label === '申请补正').length,
  emergency: tasks.value.filter((item) => item.kind === 'EMERGENCY').length,
  expiry: tasks.value.filter((item) => item.kind === 'EXPIRY' || item.kind === 'QUALIFICATION').length,
}));
const visibleTasks = computed(() => {
  const rows = tasks.value.filter((item) => {
    if (taskFilter.value === 'critical') return item.kind === 'ALERT' && (item.level === 'CRITICAL' || item.label.includes('严重'));
    if (taskFilter.value === 'correction') return item.status === 'RETURNED' || item.label === '申请补正';
    if (taskFilter.value === 'emergency') return item.kind === 'EMERGENCY';
    if (taskFilter.value === 'expiry') return item.kind === 'EXPIRY' || item.kind === 'QUALIFICATION';
    return true;
  });
  return rows.slice(0, 5);
});
const attentionSource = computed(() => {
  const fromRisks = risks.value?.attentionVehicles ?? [];
  if (fromRisks.length) return fromRisks;
  return vehicles.value?.attention ?? [];
});
const attentionVehicles = computed(() => attentionSource.value.slice(0, 5));
const abnormalCount = computed(() => attentionSource.value.length);
const vehicleCounts = computed(() => ({
  running: vehicles.value?.counts.running ?? 0,
  offline: vehicles.value?.counts.offline ?? 0,
  attention: attentionSource.value.length,
  lowBattery: vehicles.value?.counts.lowBattery ?? 0,
  fault: vehicles.value?.counts.fault ?? 0,
}));
const vehicleBar = computed(() => {
  const items = [
    { key: 'running', label: '运行中', value: vehicles.value?.counts.running ?? 0, color: '#2563EB' },
    { key: 'standby', label: '待机', value: vehicles.value?.counts.standby ?? 0, color: '#12B76A' },
    { key: 'offline', label: '离线', value: vehicles.value?.counts.offline ?? 0, color: '#98A2B3' },
    { key: 'fault', label: '故障', value: vehicles.value?.counts.fault ?? 0, color: '#D92D20' },
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  return items.filter((item) => item.value > 0).map((item) => ({ ...item, width: (item.value / total) * 100 }));
});
function vehicleTone(level?: string) {
  const value = (level || 'medium').toLowerCase();
  if (value === 'critical' || value === 'high') return value;
  return 'medium';
}
function applicationTone(status: string) {
  if (status === 'RETURNED') return 'returned';
  if (status === 'IN_REVIEW') return 'review';
  if (status === 'APPROVED') return 'ok';
  return '';
}
function alertStatusTone(status: string) {
  if (status === 'CLOSED') return 'done';
  if (status === 'IN_PROGRESS' || status === 'PENDING_REVIEW') return 'busy';
  if (status === 'PENDING_CONFIRMATION' || status === 'PENDING_HANDLING') return 'wait';
  return '';
}
const latestAlerts = computed(() => (risks.value?.alerts ?? []).slice(0, 5));
const recentApplications = computed(() => (applications.value?.recent ?? []).slice(0, 3));
const severeAlertCount = computed(() => (risks.value?.alerts ?? []).filter((item) => item.level === 'CRITICAL' || item.level === 'HIGH').length);
const filteredVehicles = computed(() => (summary.value?.map.vehicles ?? []).filter((item) => {
  if (vehicleStatus.value === 'OFFLINE') return item.onlineStatus === 'OFFLINE';
  if (vehicleStatus.value === 'ATTENTION') return item.attentionLevel && item.attentionLevel !== 'NORMAL';
  return true;
}));
const selectedVehicle = computed(() => summary.value?.map.vehicles.find((item) => item.id === selectedVehicleId.value) ?? null);
const shortcuts = computed(() => shortcutOrder
  .map((label) => summary.value?.shortcuts.find((item) => item.label === label))
  .filter((item): item is NonNullable<typeof item> => Boolean(item)));

onMounted(load);
</script>

<template>
  <div ref="root" class="dashboard-page enterprise-dashboard">
    <h1 class="sr-only">企业运营工作台</h1>
    <div v-if="errors.summary && !summary" class="error-state" role="alert">
      <strong>企业运营工作台暂时无法加载</strong><span>{{ errors.summary }}</span>
      <el-button :icon="RefreshCw" @click="load">重新加载</el-button>
    </div>
    <template v-else>
      <div v-if="!summary" class="dashboard-skeleton-metrics ent-skeleton" aria-label="正在加载企业指标"><el-skeleton-item v-for="n in 6" :key="n" variant="rect" /></div>
      <header v-else class="ent-head">
        <div>
          <p class="enterprise-brief ent-company"><strong>{{ summary.meta.enterprise.name }}</strong></p>
          <p class="ent-summary">{{ greet }}，{{ greetingTail }}</p>
        </div>
        <div class="ent-head-meta">
          <dl>
            <div><dt>在线率</dt><dd>{{ summary.metrics.onlineRate }}%</dd></div>
            <div><dt>今日里程</dt><dd>{{ summary.metrics.todayMileage }} km</dd></div>
            <div :class="safetyState.tone"><dt>安全状态</dt><dd>{{ safetyState.label }}</dd></div>
          </dl>
          <div class="ent-head-actions">
            <span>更新于 {{ formatTime(summary.meta.updatedAt) }}</span>
            <el-button :icon="RefreshCw" :loading="loading.summary" aria-label="刷新企业运营工作台" @click="load">刷新</el-button>
          </div>
        </div>
      </header>
      <div v-if="errors.summary" class="dashboard-refresh-error" role="alert">
        <span>部分企业数据刷新失败：{{ errors.summary }}</span>
        <el-button size="small" :icon="RefreshCw" @click="load">重新加载</el-button>
      </div>

      <div v-if="summary" class="ent-body">
        <section class="dashboard-metrics ent-strip" aria-label="企业核心指标">
          <button v-for="item in metrics" :key="item.label" type="button" class="dashboard-metric" @click="go(item.path)">
            <span class="ent-strip-icon"><component :is="item.icon" :size="15" /></span>
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}<small v-if="item.suffix">{{ item.suffix }}</small></strong>
            <small :class="{ 'hint-risk': item.hintRisk }">{{ item.hint }}</small>
          </button>
        </section>

        <section class="ent-row ent-row-primary">
          <article class="ent-card ent-task-center">
            <header class="ent-card-header">
              <h2>我的待办</h2>
              <span class="panel-count">{{ taskTotal }}</span>
            </header>
            <div class="ent-task-stats" role="tablist" aria-label="待办分类">
              <button type="button" :class="{ active: taskFilter === 'critical' }" @click="taskFilter = taskFilter === 'critical' ? '' : 'critical'"><strong>{{ taskBuckets.critical }}</strong><span>严重告警</span></button>
              <button type="button" :class="{ active: taskFilter === 'correction' }" @click="taskFilter = taskFilter === 'correction' ? '' : 'correction'"><strong>{{ taskBuckets.correction }}</strong><span>申请补正</span></button>
              <button type="button" :class="{ active: taskFilter === 'emergency' }" @click="taskFilter = taskFilter === 'emergency' ? '' : 'emergency'"><strong>{{ taskBuckets.emergency }}</strong><span>事故反馈</span></button>
              <button type="button" :class="{ active: taskFilter === 'expiry' }" @click="taskFilter = taskFilter === 'expiry' ? '' : 'expiry'"><strong>{{ taskBuckets.expiry }}</strong><span>资质到期</span></button>
            </div>
            <div v-if="loading.tasks" class="dashboard-empty compact"><span>正在加载待办…</span></div>
            <div v-else-if="errors.tasks" class="module-error" role="alert"><strong>待办加载失败</strong><span>{{ errors.tasks }}</span><el-button size="small" @click="load">重试</el-button></div>
            <div v-else-if="visibleTasks.length" class="dashboard-task-list ent-task-cards">
              <button v-for="item in visibleTasks" :key="`${item.kind}-${item.id}`" type="button" :class="item.level.toLowerCase()" @click="handleTask(item)">
                <span class="ent-task-main">
                  <span class="ent-task-meta">
                    <span class="task-level" :class="item.level.toLowerCase()">{{ item.label }}</span>
                    <em :class="{ overdue: item.dueAt && new Date(item.dueAt) < new Date() }">{{ item.dueAt ? relativeDue(item.dueAt) : formatShortTime(item.occurredAt) }}</em>
                  </span>
                  <strong>{{ item.title }}</strong>
                  <small>{{ taskContext(item) }}</small>
                </span>
                <span class="ent-task-action">{{ taskAction(item) }}</span>
              </button>
            </div>
            <div v-else class="dashboard-empty compact"><ShieldCheck :size="20" /><strong>{{ taskFilter ? '该分类暂无待办' : '当前暂无待处理事项' }}</strong></div>
          </article>

          <article class="ent-card ent-quick">
            <header class="ent-card-header"><h2>快捷入口</h2></header>
            <nav v-if="shortcuts.length" class="ent-shortcuts" aria-label="企业快捷操作">
              <button v-for="item in shortcuts" :key="item.path" type="button" @click="go(item.path)">
                <span class="ent-quick-icon"><component :is="iconMap[item.icon] ?? Gauge" :size="16" /></span>
                <strong>{{ item.label }}</strong>
                <ChevronRight :size="14" />
              </button>
            </nav>
            <div v-else class="dashboard-empty compact"><strong>当前角色没有可用快捷入口</strong></div>
          </article>
        </section>

        <section class="ent-row ent-row-split">
          <article class="ent-card ent-vehicle">
            <header class="ent-card-header">
              <h2>车辆运行状态</h2>
              <span>{{ attentionSource.length }} 辆需关注</span>
            </header>
            <div v-if="errors.vehicles" class="module-error" role="alert"><strong>车辆状态加载失败</strong><span>{{ errors.vehicles }}</span></div>
            <template v-else>
              <div class="ent-vehicle-body">
              <div class="ent-stat-pills">
                <div class="is-run"><b>{{ vehicleCounts.running }}</b><span>运行中</span></div>
                <div class="is-off"><b>{{ vehicleCounts.offline }}</b><span>离线</span></div>
                <div class="is-watch"><b>{{ vehicleCounts.attention }}</b><span>异常关注</span></div>
                <div class="is-watch"><b>{{ vehicleCounts.lowBattery }}</b><span>低电量</span></div>
                <div :class="{ 'is-risk': vehicleCounts.fault > 0 }"><b>{{ vehicleCounts.fault }}</b><span>故障</span></div>
              </div>
              <div class="ent-stack" role="img" aria-label="车辆运行占比">
                <span v-for="item in vehicleBar" :key="item.key" :style="{ width: `${item.width}%`, background: item.color }" :title="`${item.label} ${item.value}`"></span>
              </div>
              <div class="ent-stack-legend">
                <span v-for="item in vehicleBar" :key="`${item.key}-legend`"><i :style="{ background: item.color }"></i>{{ item.label }} {{ item.value }}</span>
              </div>
              <h3>需关注车辆</h3>
              <div class="ent-focus-list">
                <button v-for="item in attentionVehicles" :key="item.id" type="button" :class="vehicleTone(item.attentionLevel)" @click="focusVehicle(item.id)">
                  <span class="risk-dot" :class="vehicleTone(item.attentionLevel)"></span>
                  <strong>{{ item.businessNo }}</strong>
                  <em :class="{ mute: item.onlineStatus === 'OFFLINE' && item.openAlertCount === 0 }">{{ item.reason }}</em>
                  <ChevronRight :size="14" />
                </button>
                <div v-if="!attentionVehicles.length" class="dashboard-empty compact"><strong>暂无需要关注的车辆</strong></div>
              </div>
              </div>
            </template>
          </article>

          <article class="ent-card ent-safety">
            <header class="ent-card-header">
              <h2>安全风险与最新告警</h2>
              <el-button link type="primary" @click="go('/enterprise/safety/alerts')">查看全部<ChevronRight :size="14" /></el-button>
            </header>
            <div v-if="errors.risks" class="module-error" role="alert"><strong>告警加载失败</strong><span>{{ errors.risks }}</span></div>
            <template v-else>
              <div class="ent-stat-pills ent-stat-pills-4">
                <div><b>{{ risks?.todayAlerts ?? 0 }}</b><span>今日告警</span></div>
                <div :class="{ 'is-watch': (risks?.openAlerts ?? 0) > 0 }"><b>{{ risks?.openAlerts ?? 0 }}</b><span>未处理</span></div>
                <div :class="{ 'is-risk': severeAlertCount > 0 }"><b>{{ severeAlertCount }}</b><span>严重告警</span></div>
                <div :class="{ 'is-risk': (risks?.accidents ?? 0) > 0 }"><b>{{ risks?.accidents ?? 0 }}</b><span>事故</span></div>
              </div>
              <div v-if="latestAlerts.length" class="dashboard-alert-table enterprise-alert-table ent-alert-table" role="list" aria-label="本企业最新告警">
                <button v-for="item in latestAlerts" :key="item.id" type="button" @click="item.vehicle?.id ? focusVehicle(item.vehicle.id) : go('/enterprise/safety/alerts')">
                  <time>{{ formatShortTime(item.occurredAt) }}</time>
                  <span class="ent-alert-main">
                    <strong>{{ item.vehicle?.businessNo ?? '平台事件' }}</strong>
                    <small>{{ typeText(item.alertType) }}</small>
                  </span>
                  <span class="alert-level" :class="item.level.toLowerCase()">{{ levelText(item.level) }}</span>
                  <em :class="alertStatusTone(item.status)">{{ statusText(item.status) }}</em>
                </button>
              </div>
              <div v-else class="dashboard-empty compact"><ShieldCheck :size="20" /><strong>今日没有告警</strong></div>
            </template>
          </article>
        </section>

        <section class="ent-row ent-row-map">
          <article class="ent-card ent-app-card">
            <header class="ent-card-header">
              <h2>申请与许可</h2>
              <el-button link type="primary" @click="go('/enterprise/applications/mine')">查看申请<ChevronRight :size="14" /></el-button>
            </header>
            <div v-if="errors.applications" class="module-error" role="alert"><strong>申请摘要加载失败</strong><span>{{ errors.applications }}</span></div>
            <template v-else>
              <p class="ent-expiry-note" :class="{ watch: Boolean(applications?.expiry.items.length) }">{{ applications?.expiry.items.length ? `${applications.expiry.items.length} 项许可或资质将在 30 天内到期` : '30天内暂无许可或资质到期事项' }}</p>
              <div class="ent-stat-pills ent-stat-pills-4">
                <div class="is-run"><b>{{ applications?.active ?? 0 }}</b><span>进行中</span></div>
                <div :class="{ 'is-watch': (applications?.corrections ?? 0) > 0 }"><b>{{ applications?.corrections ?? 0 }}</b><span>待补正</span></div>
                <div><b>{{ applications?.approvedThisMonth ?? 0 }}</b><span>本月通过</span></div>
                <div :class="{ 'is-watch': (applications?.expiring ?? 0) > 0 }"><b>{{ applications?.expiring ?? 0 }}</b><span>即将到期</span></div>
              </div>
              <div class="ent-app-list">
                <button v-for="item in recentApplications" :key="item.id" type="button" :class="applicationTone(item.status)" @click="go('/enterprise/applications/mine')">
                  <span>
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.currentNodeName ? `当前：${item.currentNodeName}` : applicationTypeText(item.applicationType) }}</small>
                  </span>
                  <em>{{ item.status === 'RETURNED' ? '待补正' : statusText(item.status) }}</em>
                  <ChevronRight :size="14" />
                </button>
                <div v-if="!recentApplications.length" class="dashboard-empty compact"><strong>暂无申请记录</strong></div>
              </div>
            </template>
          </article>

          <article id="enterprise-dashboard-map" class="ent-card ent-map-card">
            <header class="ent-card-header">
              <h2>车辆快速定位</h2>
              <span class="map-header-meta">实时车辆 {{ summary.map.vehicles.length }} ｜ 异常 {{ abnormalCount }}</span>
            </header>
            <div class="ent-map-toolbar">
              <button type="button" :class="{ active: vehicleStatus === '' }" @click="vehicleStatus = ''">全部</button>
              <button type="button" :class="{ active: vehicleStatus === 'ATTENTION' }" @click="vehicleStatus = 'ATTENTION'">异常</button>
              <button type="button" :class="{ active: vehicleStatus === 'OFFLINE' }" @click="vehicleStatus = 'OFFLINE'">离线</button>
              <el-button link type="primary" @click="go('/enterprise/operations/realtime')">实时车辆<ChevronRight :size="14" /></el-button>
            </div>
            <OperationsMap mode="dashboard" group-by="none" :points="filteredVehicles" :selected-id="selectedVehicleId" height="320px" @select="selectedVehicleId = $event" @action="mapAction" />
            <div v-if="selectedVehicle" class="map-selected dashboard-selected-vehicle">
              <span class="risk-dot" :class="selectedVehicle.attentionLevel?.toLowerCase()"></span>
              <div><strong>{{ selectedVehicle.businessNo }}</strong><small>{{ selectedVehicle.name }} · {{ ({ RUNNING: '运行中', IDLE: '临停', PARKED: '停驶', OFFLINE: '离线' } as Record<string, string>)[selectedVehicle.realtimeStatus?.drivingState ?? ''] ?? '离线' }}</small></div>
              <el-button size="small" @click="go(`/enterprise/vehicles/archives?q=${encodeURIComponent(selectedVehicle.businessNo)}`)">车辆档案</el-button>
            </div>
          </article>
        </section>
      </div>
    </template>
  </div>
</template>
