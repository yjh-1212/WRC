<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';
import { FileText, Send, MessageCircle, Settings, UserRound, CircleCheck, Clock3, Building2, Users, ClipboardList, TriangleAlert, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-vue-next';
import { api } from '../api';
import { reportNumber as number, reportTime as time, reportError as errorText } from '../reports';
import { workbenchDay, workbenchEventTypes, type WorkbenchData, type WorkbenchEvent } from '../workbench';
import { useSessionStore } from '../stores/session';
import { useResponsiveDrawer } from '../province-monitoring';
import WorkbenchRing from '../components/WorkbenchRing.vue';
import AnalyticsChart from '../components/AnalyticsChart.vue';
import '../workbench.css';

const router = useRouter(), route = useRoute(), session = useSessionStore();
const drawerWidth = useResponsiveDrawer(620);
const data = ref<WorkbenchData | null>(null), loading = ref(false), error = ref('');
const month = ref(workbenchDay(new Date()).slice(0, 7));
const selectedDate = ref(''), selectedType = ref(''), dayOpen = ref(false);
let generation = 0;
const canMonitor = computed(() => session.user?.permissions.includes('operation:realtime:read'));
const isCurrent = computed(() => month.value === workbenchDay(new Date()).slice(0, 7));
const tileIcons: Record<string, Component> = { DRAFT: Send, DISPATCHED: MessageCircle, RESPONDING: Settings, PENDING_REVIEW: UserRound, CLOSED: CircleCheck, OVERDUE: Clock3 };
const tiles = computed(() => data.value ? [...data.value.matters.states, { status: 'OVERDUE', label: '已逾期', value: data.value.matters.overdue, color: '#ffaf24' }] : []);
const fleetSegments = computed(() => data.value?.fleet ? [{ value: data.value.fleet.online, color: '#4384ff' }, { value: data.value.fleet.total - data.value.fleet.online, color: '#e7ebf3' }] : []);
const safetySegments = computed(() => data.value?.safety ? [{ value: data.value.safety.closed, color: '#3892ff' }, { value: data.value.safety.total - data.value.safety.closed, color: '#e7ebf3' }] : []);
const citiesMax = computed(() => Math.max(1, ...(data.value?.operations?.cities.map(row => row.mileage ?? 0) ?? [])));
const typesMax = computed(() => Math.max(1, ...(data.value?.safety?.types.map(row => row.value) ?? [])));
const secondaryMetric = computed(() => {
  const operations = data.value?.operations;
  if (operations?.kpis.autonomousRate != null) return { field: 'autonomousRate' as const, label: '自主里程占比', value: operations.kpis.autonomousRate, unit: '%' };
  return { field: 'mileage' as const, label: '运行里程', value: operations?.kpis.mileage ?? null, unit: 'km' };
});
const hasMileageFallback = computed(() => data.value?.operations?.kpis.autonomousRate == null && data.value?.operations?.kpis.qualityIssue);
const safetyStates = computed(() => data.value?.safety ? [
  { key: 'PENDING_CONFIRMATION', label: '待核查', value: data.value.safety.pending, icon: ClipboardList, color: '#168aff' },
  { key: 'HANDLING', label: '处置中', value: data.value.safety.processing, icon: TriangleAlert, color: '#ffae23' },
  { key: 'CLOSED', label: '已闭环', value: data.value.safety.closed, icon: CircleCheck, color: '#25bf88' },
] : []);
const calendarCells = computed(() => {
  const first = new Date(`${month.value}-01T00:00:00+08:00`), firstWeekday = (new Date(first.getTime() + 8 * 3600000).getUTCDay() + 6) % 7;
  const days = data.value?.calendar.days.length ?? new Date(Number(month.value.slice(0, 4)), Number(month.value.slice(5)), 0).getDate();
  return Array.from({ length: Math.ceil((firstWeekday + days) / 7) * 7 }, (_, index) => {
    const date = workbenchDay(new Date(first.getTime() + (index - firstWeekday) * 86400000));
    return { date, day: Number(date.slice(-2)), outside: !date.startsWith(month.value), today: date === workbenchDay(new Date()), counts: data.value?.calendar.days.find(row => row.date === date) };
  });
});
const dayEvents = computed(() => data.value?.calendar.events.filter(event => workbenchDay(new Date(event.at)) === selectedDate.value && (!selectedType.value || event.type === selectedType.value)) ?? []);
const drawerTitle = computed(() => `${selectedDate.value} · ${workbenchEventTypes.find(type => type.key === selectedType.value)?.label ?? '监管记录'}`);
async function load() {
  const request = ++generation; loading.value = true; error.value = '';
  month.value = typeof route.query.month === 'string' ? route.query.month : workbenchDay(new Date()).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.value)) { error.value = '请选择有效月份'; data.value = null; loading.value = false; return; }
  try { const result = await api<WorkbenchData>(`/province/workbench?month=${month.value}`); if (request === generation) data.value = result; }
  catch (reason) { if (request === generation) { error.value = errorText(reason); data.value = null; } }
  finally { if (request === generation) loading.value = false; }
}
async function selectMonth(value: string | null) {
  const next = value || workbenchDay(new Date()).slice(0, 7);
  const query = { ...route.query, month: next }; const before = route.fullPath;
  await router.replace({ path: '/province/overview', query }); if (before === route.fullPath) await load();
}
function offsetMonth(offset: number) {
  const year = Number(month.value.slice(0, 4)), part = Number(month.value.slice(5)) - 1;
  const date = new Date(Date.UTC(year, part + offset, 1));
  if (date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) return;
  void selectMonth(date.toISOString().slice(0, 7));
}
function matters(status?: string, monthly = true) {
  const query: LocationQueryRaw = monthly ? { createdMonth: month.value } : {};
  if (status === 'OVERDUE') query.bucket = 'OVERDUE'; else if (status && status !== 'OTHER') query.status = status;
  void router.push({ path: '/province/coordination', query });
}
function monitor(workspaceId?: string) { if (canMonitor.value) void router.push({ path: '/province/monitoring', query: { workspaceId } }); else void router.push({ path: '/province/vehicles', query: { workspaceId } }); }
function risk(status = 'ALL') { if (data.value) void router.push({ path: '/province/monitoring', query: { view: 'alerts', from: data.value.from, to: data.value.to, alertStatus: status } }); }
function openDay(date: string, type = '') { selectedDate.value = date; selectedType.value = type; dayOpen.value = true; }
function openMatter(id: string) { dayOpen.value = false; void router.push({ path: '/province/coordination', query: { matterId: id } }); }
function reminder(row: WorkbenchData['reminders'][number]) { if (row.matterId) openMatter(row.matterId); else matters('OVERDUE', false); }
function eventLabel(event: WorkbenchEvent) { return workbenchEventTypes.find(type => type.key === event.type)?.label ?? '事项'; }
function analysis(workspaceId?: string) { if (data.value?.operations) void router.push({ path: '/province/analysis', query: { from: data.value.from, to: data.value.to > workbenchDay(new Date()) ? workbenchDay(new Date()) : data.value.to, workspaceId } }); }
function spark(field: 'trips' | 'autonomousRate' | 'mileage', color: string) {
  const unit = field === 'trips' ? '次' : field === 'mileage' ? 'km' : '%';
  const full = data.value?.operations?.trend ?? [], first = full.findIndex(row => row[field] !== null);
  const last = full.map(row => row[field] !== null).lastIndexOf(true);
  // Keep missing dates as null for the axis and tooltip; connect the recorded observations visually.
  const rows = first < 0 ? [] : full.slice(first, last + 1);
  return { color: [color], grid: { left: 6, right: 12, top: 21, bottom: 29, containLabel: true },
    tooltip: { trigger: 'axis', confine: true, valueFormatter: (value: unknown) => `${number(value)} ${unit}` },
    xAxis: { type: 'category' as const, data: rows.map(row => row.date), boundaryGap: rows.length === 1,
      name: '日期', nameLocation: 'middle' as const, nameGap: 24, nameTextStyle: { color: '#8393ad', fontSize: 10 },
      axisLine: { show: true, lineStyle: { color: '#cbd5e3' } }, axisTick: { show: false },
      axisLabel: { color: '#8393ad', fontSize: 10, margin: 7, hideOverlap: true, showMinLabel: true, showMaxLabel: true, alignMinLabel: 'left' as const, alignMaxLabel: 'right' as const, formatter: (value: string) => value.slice(5).replace('-', '/') } },
    yAxis: { type: 'value' as const, name: unit, nameGap: 8, nameTextStyle: { color: '#8393ad', fontSize: 10 },
      min: 0, max: field === 'autonomousRate' ? 100 : undefined, minInterval: field === 'trips' ? 1 : undefined, splitNumber: 2,
      axisLine: { show: true, lineStyle: { color: '#cbd5e3' } }, axisTick: { show: false },
      axisLabel: { color: '#8393ad', fontSize: 10, margin: 6, formatter: (value: number) => value >= 10000 ? `${Math.round(value / 1000)}k` : number(value) },
      splitLine: { show: true, lineStyle: { color: '#edf1f7', type: 'dashed' as const } } },
    graphic: rows.length ? [] : [{ type: 'text' as const, left: 'center', top: 'middle', style: { text: '暂无趋势记录', fill: '#93a1b7', fontSize: 10 } }],
    series: [{ type: 'line' as const, smooth: true, connectNulls: true, symbol: 'circle', symbolSize: rows.length === 1 ? 6 : 3, data: rows.map(row => row[field]), lineStyle: { width: 2 },
      areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: field === 'trips' ? 'rgba(48,207,152,.68)' : 'rgba(150,119,252,.68)' }, { offset: 1, color: field === 'trips' ? 'rgba(48,207,152,.04)' : 'rgba(150,119,252,.04)' }] } } }],
  };
}
watch(() => route.query.month, load);
onMounted(load); onUnmounted(() => { generation++; });
</script>

<template>
  <section class="workbench-page" aria-label="全省工作台"><h1 class="sr-only">全省工作台</h1>
    <div v-if="error" class="wb-page-state" role="alert"><strong>全省工作台暂时无法加载</strong><span>{{ error }}</span><el-button @click="load">重试</el-button></div>
    <div v-else-if="!data" class="wb-skeleton" aria-live="polite"><el-skeleton v-for="index in 6" :key="index" :rows="5" animated /><span>正在汇总工作台数据…</span></div>
    <div v-else class="wb-grid" v-loading="loading" :aria-busy="loading">
      <div class="wb-top">
        <section class="wb-panel wb-matters" aria-label="协同事项"><header><h2>协同事项</h2><button class="wb-link" @click="matters()">查看全部 <ChevronRight :size="14" /></button></header><div class="wb-status-layout"><button class="wb-total" aria-label="查看当月全部协同事项" @click="matters()"><strong>{{ number(data.matters.total) }}</strong><span>{{ isCurrent ? '本月事项' : '当月事项' }}</span><i><FileText :size="23" /></i></button><div class="wb-status-tiles"><button v-for="tile in tiles" :key="tile.status" :class="`wb-tile wb-tile-${tile.status}`" :aria-label="`${tile.label}${tile.value}项`" @click="matters(tile.status)"><strong>{{ number(tile.value) }}</strong><span>{{ tile.label }}</span><i :style="{ background: tile.color }"><component :is="tileIcons[tile.status] ?? FileText" :size="20" /></i></button></div></div><p class="wb-tile-note">所选月份创建的事项 · 逾期包含于在办事项</p></section>
        <section class="wb-panel wb-fleet" aria-label="车辆状态"><header><h2>车辆状态</h2><button v-if="data.fleet" class="wb-link" @click="monitor()">查看车辆 <ChevronRight :size="14" /></button></header><div v-if="data.fleet" class="wb-fleet-body"><div class="wb-fleet-bars"><div v-for="state in data.fleet.states" :key="state.key" class="wb-horizontal-row"><span>{{ state.label }}</span><i><b :style="{ width: `${data.fleet.total ? state.value / data.fleet.total * 100 : 0}%`, background: state.color }" /></i><strong>{{ number(state.value) }}</strong></div></div><div class="wb-fleet-ring"><WorkbenchRing :size="164" :segments="fleetSegments" :value="data.fleet.onlineRate === null ? '—' : `${number(data.fleet.onlineRate)}%`" label="上报在线率" :description="`上报在线${data.fleet.online}辆，在册${data.fleet.total}辆`"/><p>在线 <strong>{{ number(data.fleet.online) }}</strong> / 在册 <strong>{{ number(data.fleet.total) }}</strong> 辆</p></div></div><div v-else class="wb-empty">暂无车辆监管查看权限</div><p v-if="data.fleet" class="wb-caption">当前上报快照 · 最新上报 {{ time(data.fleet.latestReportAt) }}</p></section>
      </div>
      <div class="wb-middle">
        <section class="wb-panel wb-cities" aria-label="地市概况"><header><h2>地市概况</h2></header><div class="wb-city-metrics"><button @click="router.push('/province/workspaces')"><i><Building2 :size="21" /></i><span><strong>{{ number(data.cities.length) }}</strong><small>已开通城市</small></span></button><div><i class="wb-green"><Users :size="21" /></i><span><strong>{{ number(data.enterpriseCount) }}</strong><small>运营企业</small></span></div></div><h3>地市车辆情况</h3><div class="wb-city-list"><button v-for="city in data.cities" :key="city.id" :disabled="!data.fleet" @click="monitor(city.id)"><Building2 :size="23" /><strong>{{ city.name }}</strong><span>在册 <b>{{ number(city.vehicles) }}</b> 辆</span><span>上报在线 <b>{{ number(city.online) }}</b> 辆</span></button><p v-if="!data.cities.length" class="wb-empty">暂无已开通城市</p></div></section>
        <div class="wb-center">
          <section class="wb-panel wb-operations" aria-label="本月运行"><header><h2>{{ isCurrent ? '本月运行' : '当月运行' }}</h2><button v-if="data.operations" class="wb-link" aria-label="查看运行分析" @click="analysis()"><ArrowUpRight :size="15" /></button></header><template v-if="data.operations"><div class="wb-mileage"><span>累计里程</span><strong>{{ number(data.operations.kpis.mileage) }} <small v-if="data.operations.kpis.mileage !== null">km</small></strong></div><div class="wb-sparks"><div><span>运行次数</span><strong>{{ number(data.operations.kpis.hasRecords ? data.operations.kpis.trips : null) }} <small>次</small></strong><AnalyticsChart :option="spark('trips', '#31ce98')" height="126px" aria-label="有记录日期的每日运行次数趋势" /></div><div><span>{{ secondaryMetric.label }}</span><strong>{{ number(secondaryMetric.value) }}<small v-if="secondaryMetric.value !== null">{{ secondaryMetric.unit }}</small></strong><AnalyticsChart :option="spark(secondaryMetric.field, '#9877fb')" height="126px" :aria-label="`有记录日期的每日${secondaryMetric.label}趋势`" /></div></div><p class="wb-caption" :class="{ 'wb-quality': data.operations.kpis.qualityIssue }">{{ hasMileageFallback ? '自主里程口径待核对，紫色图展示运行里程；趋势连接已记录日期，缺失日期不补值' : '趋势连接已记录日期，缺失日期不补值' }}</p></template><div v-else class="wb-empty">{{ data.permissions.operations ? '所选月份暂无运行记录' : '暂无运行分析查看权限' }}</div></section>
          <section class="wb-panel wb-safety" aria-label="风险处置"><header><h2>风险处置</h2><button v-if="data.safety" class="wb-link" @click="risk()">{{ isCurrent ? '本月' : '当月' }}告警 <b>{{ number(data.safety.total) }}</b> 条</button></header><div v-if="data.safety" class="wb-safety-body"><WorkbenchRing :size="126" :segments="safetySegments" :value="data.safety.closureRate === null ? '—' : `${number(data.safety.closureRate)}%`" label="告警闭环率" :description="`当月告警${data.safety.total}条，已闭环${data.safety.closed}条`"/><div class="wb-safety-states"><button v-for="state in safetyStates" :key="state.key" @click="risk(state.key)"><i :style="{ background: state.color }"><component :is="state.icon" :size="21" /></i><span>{{ state.label }}</span><strong>{{ number(state.value) }}</strong></button></div></div><div v-else class="wb-empty">暂无风险告警查看权限</div></section>
        </div>
        <section class="wb-panel wb-calendar" aria-label="本月监管日历"><header><h2>{{ isCurrent ? '本月监管日历' : '监管日历' }}</h2><div class="wb-month-switch"><button aria-label="上个月" :disabled="loading" @click="offsetMonth(-1)"><ChevronLeft :size="15" /></button><el-date-picker v-model="month" type="month" aria-label="监管日历月份" format="YYYY年M月" value-format="YYYY-MM" :clearable="false" :disabled="loading" @change="selectMonth" /><button aria-label="下个月" :disabled="loading" @click="offsetMonth(1)"><ChevronRight :size="15" /></button></div></header><div class="wb-calendar-legend"><span v-for="type in workbenchEventTypes" :key="type.key"><i :style="{ background: type.color }" />{{ type.label }}</span></div><div class="wb-weekdays"><span v-for="weekday in ['一','二','三','四','五','六','日']" :key="weekday">{{ weekday }}</span></div><div class="wb-calendar-grid"><div v-for="cell in calendarCells" :key="cell.date" class="wb-calendar-day" :class="{ 'is-outside': cell.outside, 'is-today': cell.today }"><button class="wb-day-number" :disabled="cell.outside" :aria-label="`${cell.date}监管记录`" @click="openDay(cell.date)">{{ cell.day }}</button><div class="wb-day-events"><template v-for="type in workbenchEventTypes" :key="type.key"><button v-if="cell.counts?.[type.key]" :style="{ background: type.color }" :aria-label="`${cell.date}${type.label}${cell.counts[type.key]}条`" @click="openDay(cell.date,type.key)">{{ cell.counts[type.key] }}</button></template></div></div></div></section>
      </div>
      <div class="wb-bottom">
        <section class="wb-panel wb-reminders" aria-label="待办提醒"><header><h2>待办提醒</h2><button class="wb-link" @click="matters(undefined,false)">查看全部 <ChevronRight :size="14" /></button></header><button v-for="row in data.reminders" :key="row.id" class="wb-reminder" @click="reminder(row)"><i :class="{ 'wb-amber': row.kind === 'overdue' }"><component :is="row.kind === 'overdue' ? Clock3 : ClipboardList" :size="20" /></i><span><strong>{{ row.title }}</strong><span>{{ row.text }}</span><small>{{ time(row.at).slice(11) }} · 查看{{ row.matterId ? '详情' : '事项' }}</small></span></button><div v-if="!data.reminders.length" class="wb-empty">当前没有待处理提醒</div></section>
        <section class="wb-panel wb-distribution" aria-label="协同事项分布"><header><h2>协同事项分布</h2><button class="wb-link" @click="matters()">查看详情 <ChevronRight :size="14" /></button></header><div class="wb-distribution-body"><WorkbenchRing :size="142" :segments="data.matters.states" :value="number(data.matters.total)" label="当月事项" :description="`当月协同事项${data.matters.total}项`"/><div class="wb-state-legend"><button v-for="state in data.matters.states" :key="state.status" @click="matters(state.status)"><i :style="{ background: state.color }"/><span>{{ state.label }}</span><strong>{{ number(state.value) }}</strong></button></div></div></section>
        <section class="wb-panel wb-city-mileage" aria-label="地市运行里程"><header><h2>地市运行里程 <small>（km）</small></h2></header><div v-if="data.operations" class="wb-comparison-bars"><button v-for="(city,index) in data.operations.cities" :key="city.id" @click="analysis(city.id)"><span>{{ city.name }}</span><i><b :style="{ width: `${(city.mileage ?? 0) / citiesMax * 100}%`, background: ['linear-gradient(90deg,#67b5ff,#4964ff)','linear-gradient(90deg,#74dfc7,#35ca94)','linear-gradient(90deg,#c9adff,#9b65ff)'][index % 3] }" /></i><strong>{{ number(city.mileage) }}</strong></button><div v-if="!data.operations.cities.length" class="wb-empty">暂无地市运行记录</div></div><div v-else class="wb-empty">暂无可展示的运行数据</div></section>
        <section class="wb-panel wb-risk-types" aria-label="告警类型分布"><header><h2>告警类型分布 <small>（条）</small></h2></header><div v-if="data.safety" class="wb-comparison-bars"><div v-for="type in data.safety.types" :key="type.key"><span>{{ type.name }}</span><i><b :style="{ width: `${type.value / typesMax * 100}%`, background: type.color }" /></i><strong>{{ number(type.value) }}</strong></div></div><div v-else class="wb-empty">暂无风险告警查看权限</div></section>
      </div>
    </div>
    <el-drawer v-model="dayOpen" :title="drawerTitle" :size="drawerWidth" class="wb-event-drawer"><p class="wb-caption">派发、反馈与复核按已记录的发生时间展示，到期按事项截止时间展示。</p><div v-if="!dayEvents.length" class="wb-empty">当天未记录{{ selectedType ? workbenchEventTypes.find(type => type.key === selectedType)?.label : '该类流程' }}事件</div><article v-for="event in dayEvents" :key="event.id" class="wb-calendar-detail"><el-tag size="small">{{ eventLabel(event) }}</el-tag><h3>{{ event.title }}</h3><p>{{ event.cityName || '省级协同事项' }} · {{ time(event.at) }}</p><el-button link type="primary" @click="openMatter(event.matterId)">查看事项</el-button></article></el-drawer>
  </section>
</template>
