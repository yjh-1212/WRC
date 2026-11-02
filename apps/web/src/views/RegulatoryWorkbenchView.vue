<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ChevronRight, ClipboardList, CircleAlert, CircleCheck, Clock3, RefreshCw } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import AnalyticsChart from '../components/AnalyticsChart.vue';
import WorkbenchRing from '../components/WorkbenchRing.vue';
import WorkbenchPanel from '../components/WorkbenchPanel.vue';
import CityEnterpriseDrawer from '../components/CityEnterpriseDrawer.vue';
import { rwbBars, rwbColors, rwbDay, rwbNumber as number, rwbPreset, rwbTrend, type RegulatoryWorkbench } from '../regulatory-workbench';
import '../regulatory-workbench.css';

const router = useRouter(), route = useRoute(), session = useSessionStore();
const data = ref<RegulatoryWorkbench | null>(null), error = ref(''), loading = ref(false), metric = ref<'mileage' | 'trips'>('mileage');
const dates = ref<[string, string]>(rwbPreset('month')), drawer = ref(false), enterpriseId = ref('');
const enterprisePage = ref(1), pageSize = 5;
let generation = 0, controller: AbortController | undefined;
const presets = [{ key: 'today', label: '今日' }, { key: 'week', label: '近7日' }, { key: 'month', label: '本月' }] as const;
const selectedPreset = computed(() => presets.find(item => rwbPreset(item.key).join() === dates.value.join())?.key);
const enterpriseRows = computed(() => data.value?.enterprises?.slice((enterprisePage.value - 1) * pageSize, enterprisePage.value * pageSize) ?? []);
const trendOption = computed(() => rwbTrend(data.value?.operations ?? null, metric.value));
const eventOption = computed(() => rwbBars(data.value?.safety?.types ?? [], false));
const districtOption = computed(() => rwbBars(data.value?.districts ?? []));
const typeSegments = computed(() => (data.value?.vehicleTypes ?? []).map(row => ({ value: row.value, color: rwbColors[row.key] ?? rwbColors.UNKNOWN! })));
const activeVehicleTypes = computed(() => data.value?.vehicleTypes?.filter(row => row.value > 0).length ?? 0);
const manufacturerMax = computed(() => Math.max(1, ...(data.value?.manufacturers ?? []).map(row => row.value)));
const manufacturerScale = computed(() => Math.ceil(manufacturerMax.value / 10) * 10);
const fleetRows = computed(() => [
  { key: 'running', label: '运行中', value: data.value?.fleet?.running ?? 0, color: '#327cff' },
  { key: 'idle', label: '在线临停', value: data.value?.fleet?.idle ?? 0, color: '#22c894' },
  { key: 'offline', label: '离线', value: data.value?.fleet?.offline ?? 0, color: '#aebcd1' },
]);
const reminders = computed(() => [
  { key: 'applications', label: '业务待受理', value: data.value?.reminders.applications, icon: ClipboardList, tone: 'blue', path: '/admission/applications', query: { status: 'SUBMITTED' } },
  { key: 'events', label: '事件待核查', value: data.value?.reminders.events, icon: CircleAlert, tone: 'orange', path: '/safety/events', query: { queue: 'PENDING' } },
  { key: 'rectifications', label: '整改待复核', value: data.value?.reminders.rectifications, icon: CircleCheck, tone: 'green', path: '/safety/emergency', query: { taskType: 'RECTIFICATION', status: 'PENDING_REVIEW' } },
].filter(row => row.value != null));
const canOpenEnterprise = computed(() => session.user?.permissions.includes('archive:enterprise-archive:read'));
const ratio = (value: number, total: number) => total ? `${(value / total * 100).toFixed(1)}%` : '—';
function disableFuture(date: Date) { return rwbDay(date) > rwbDay(); }
async function load() {
  const id = ++generation; controller?.abort(); controller = new AbortController(); loading.value = true; error.value = ''; data.value = null;
  try {
    const response = await api<RegulatoryWorkbench>('/dashboard/regulator/workbench?' + new URLSearchParams({ from: dates.value[0], to: dates.value[1] }), { signal: controller.signal });
    if (id === generation) { data.value = response; enterprisePage.value = 1; }
  } catch (cause) { if (id === generation && !(cause instanceof DOMException && cause.name === 'AbortError')) error.value = cause instanceof Error ? cause.message : '统计数据加载失败'; }
  finally { if (id === generation) loading.value = false; }
}
function setPeriod(key: 'today' | 'week' | 'month') { dates.value = rwbPreset(key); applyDates(); }
function applyDates() {
  const [from, to] = dates.value ?? [];
  if (!from || !to) return;
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 365) { ElMessage.warning('统计日期最多选择366天'); return; }
  const query = { ...route.query, from, to };
  if (router.resolve({ path: route.path, query }).fullPath === route.fullPath) void load(); else void router.replace({ path: route.path, query });
}
function showEnterprise(id: string) { enterpriseId.value = id; drawer.value = true; }
function enterpriseRowClick(row: { id: string }) { if (canOpenEnterprise.value) showEnterprise(row.id); }
watch(() => [route.query.from, route.query.to], ([from, to]) => {
  dates.value = typeof from === 'string' && typeof to === 'string' ? [from, to] : rwbPreset('month'); void load();
}, { immediate: true });
watch(() => session.user?.workspaceId, () => { if (session.user) void load(); });
onBeforeUnmount(() => { generation++; controller?.abort(); });
</script>

<template>
  <section class="city-workbench" aria-label="监管工作台" :aria-busy="loading">
    <h1 class="sr-only">监管工作台</h1>
    <div v-if="error" class="rwb-error" role="alert"><CircleAlert :size="24" /><strong>监管统计加载失败</strong><p>{{ error }}</p><el-button :icon="RefreshCw" @click="load">重新加载</el-button></div>
    <div v-else-if="loading || !data" class="rwb-skeleton" aria-label="正在加载监管统计"><el-skeleton v-for="n in 8" :key="n" animated :rows="4" /></div>
    <div v-else class="rwb-grid">
      <WorkbenchPanel class="rwb-trend" title="运行趋势">
        <template #actions><div class="rwb-segment small" role="group" aria-label="运行趋势指标"><button type="button" :class="{ active: metric === 'mileage' }" :aria-pressed="metric === 'mileage'" @click="metric = 'mileage'">运行里程</button><button type="button" :class="{ active: metric === 'trips' }" :aria-pressed="metric === 'trips'" @click="metric = 'trips'">运行次数</button></div></template>
        <div class="rwb-period-controls"><span class="rwb-muted">统计日期</span><div class="rwb-segment" role="group" aria-label="统计周期"><button v-for="item in presets" :key="item.key" type="button" :aria-pressed="selectedPreset === item.key" :class="{ active: selectedPreset === item.key }" @click="setPeriod(item.key)">{{ item.label }}</button></div><el-date-picker v-model="dates" type="daterange" value-format="YYYY-MM-DD" format="YYYY/MM/DD" range-separator="—" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="统计日期" :clearable="false" :disabled-date="disableFuture" @change="applyDates" /></div>
        <template v-if="data.operations"><div class="rwb-trend-summary"><span>{{ metric === 'mileage' ? '累计里程' : '累计运行' }}</span><strong>{{ number(data.operations[metric], metric === 'mileage' ? 1 : 0) }}<small>{{ metric === 'mileage' ? 'km' : '次' }}</small></strong><span class="rwb-muted">按日统计</span><span class="rwb-line-key"><i></i>{{ metric === 'mileage' ? '运行里程' : '运行次数' }}</span></div>
          <AnalyticsChart v-if="data.operations.trips" :option="trendOption" height="100%" :aria-label="`${dates[0]}至${dates[1]}${metric === 'mileage' ? '运行里程，单位公里' : '运行次数，单位次'}`" class="rwb-trend-chart" /><div v-else class="rwb-empty">所选日期暂无运行记录</div>
          <span v-if="data.operations.qualityIssue" class="rwb-quality">部分里程记录待核对，受影响数据以“—”显示</span>
        </template><div v-else class="rwb-empty">当前账号暂无运行统计权限</div>
      </WorkbenchPanel>
      <WorkbenchPanel class="rwb-fleet" title="车辆运行状态" note="当前">
        <template v-if="data.fleet"><WorkbenchRing :segments="fleetRows" :value="number(data.fleet.total)" label="接入车辆" :size="156" :description="`接入${data.fleet.total}辆，运行${data.fleet.running}辆，在线临停${data.fleet.idle}辆，离线${data.fleet.offline}辆`" />
          <dl class="rwb-fleet-legend"><div v-for="row in fleetRows" :key="row.key"><dt><i :style="{ background: row.color }"></i>{{ row.label }}</dt><dd>{{ number(row.value) }}<small>辆</small><span>{{ ratio(row.value, data.fleet.total) }}</span></dd></div></dl>
          <div class="rwb-panel-footer">在线车辆 <b>{{ number(data.fleet.online) }}</b> / {{ number(data.fleet.total) }}<span>在线率 {{ data.fleet.onlineRate == null ? '—' : data.fleet.onlineRate + '%' }}</span></div>
        </template><div v-else class="rwb-empty">当前账号暂无车辆统计权限</div>
      </WorkbenchPanel>
      <WorkbenchPanel class="rwb-safety" title="安全事件分析">
        <template v-if="data.safety"><div class="rwb-closure"><span>闭环率</span><strong>{{ data.safety.closureRate == null ? '—' : data.safety.closureRate + '%' }}</strong><small>已闭环 <b>{{ data.safety.closed }} / {{ data.safety.total }}</b></small></div>
          <div class="rwb-progress" role="img" :aria-label="`事件闭环率${data.safety.closureRate ?? 0}%`"><i :style="{ width: `${data.safety.closureRate ?? 0}%` }"></i></div>
          <div class="rwb-safety-states"><span class="orange">待核查 <b>{{ data.safety.pending }}</b></span><span class="blue">处置中 <b>{{ data.safety.processing }}</b></span><span class="green">已闭环 <b>{{ data.safety.closed }}</b></span></div>
          <AnalyticsChart v-if="data.safety.total" :option="eventOption" height="100%" class="rwb-safety-chart" :aria-label="`安全事件类型统计，共${data.safety.total}起`" /><div v-else class="rwb-empty">所选日期暂无安全事件记录</div>
        </template><div v-else class="rwb-empty">当前账号暂无安全事件统计权限</div>
      </WorkbenchPanel>
      <WorkbenchPanel class="rwb-types" title="无人车类型分布" note="当前接入">
        <div v-if="data.vehicleTypes?.length" class="rwb-types-content"><WorkbenchRing :segments="typeSegments" :value="String(activeVehicleTypes)" label="已接入类型" :size="154" :description="data.vehicleTypes.map(row => `${row.name}${row.value}辆`).join('，')" />
          <table class="rwb-type-table"><thead><tr><th>类型</th><th>数量</th><th>占比</th></tr></thead><tbody><tr v-for="row in data.vehicleTypes" :key="row.key"><th><i :style="{ background: rwbColors[row.key] ?? rwbColors.UNKNOWN }"></i>{{ row.name }}</th><td>{{ number(row.value) }}</td><td>{{ row.share.toFixed(1) }}%</td></tr></tbody><tfoot><tr><td colspan="3">合计 {{ number(data.fleet?.total) }} 辆</td></tr></tfoot></table>
        </div><div v-else class="rwb-empty">{{ data.vehicleTypes ? '当前暂无接入车辆' : '当前账号暂无车辆统计权限' }}</div>
      </WorkbenchPanel>
      <WorkbenchPanel class="rwb-manufacturers" title="车辆厂商分布" :note="data.manufacturers ? `${data.manufacturers.length}家厂商` : undefined">
        <div v-if="data.manufacturers?.length" class="rwb-manufacturer-list"><div class="rwb-manufacturer-head"><span>厂商</span><span>数量</span><span>占比</span></div><div class="rwb-manufacturer-rows"><div v-for="row in data.manufacturers" :key="row.key" class="rwb-manufacturer-row"><span :title="row.name">{{ row.name }}</span><i class="rwb-manufacturer-track"><i :style="{ width: `${row.value / manufacturerScale * 100}%` }"></i></i><b>{{ number(row.value) }}</b><small>{{ row.share.toFixed(1) }}%</small></div></div><div class="rwb-manufacturer-axis" aria-label="厂商车辆数量坐标轴"><span>车辆数（辆）</span><div><span>0</span><span>{{ manufacturerScale / 2 }}</span><span>{{ manufacturerScale }}</span></div></div><footer class="rwb-muted">按车辆档案中的生产厂商统计</footer></div>
        <div v-else class="rwb-empty">{{ data.manufacturers ? '当前暂无接入车辆' : '当前账号暂无厂商统计权限' }}</div>
      </WorkbenchPanel>
      <WorkbenchPanel class="rwb-districts" title="辖区车辆分布" :note="data.fleet ? `共${number(data.fleet.total)}辆` : undefined">
        <div v-if="data.districts?.length" class="rwb-bar-scroll"><AnalyticsChart :option="districtOption" :height="`${Math.max(180, data.districts.length * 30 + 52)}px`" aria-label="各监管辖区车辆数量，单位辆" /></div><div v-else class="rwb-empty">{{ data.districts ? '当前暂无接入车辆' : '当前账号暂无辖区统计权限' }}</div>
      </WorkbenchPanel>
      <WorkbenchPanel class="rwb-enterprises" title="企业运行统计">
        <template #actions><el-button v-if="data.enterprises" link type="primary" @click="router.push('/archives/enterprises')">查看企业<ChevronRight :size="14" /></el-button></template>
        <template v-if="data.enterprises"><div class="rwb-enterprise-table"><el-table :data="enterpriseRows" row-key="id" empty-text="当前监管范围暂无企业" size="small" @row-click="enterpriseRowClick">
          <el-table-column label="运营企业" min-width="270"><template #default="{ row }"><button v-if="canOpenEnterprise" type="button" class="rwb-enterprise-name" @click.stop="showEnterprise(row.id)">{{ row.name }}</button><span v-else>{{ row.name }}</span></template></el-table-column>
          <el-table-column label="接入车辆" min-width="90" align="right"><template #default="{ row }">{{ number(row.vehicles) }}</template></el-table-column><el-table-column label="在线车辆" min-width="90" align="right"><template #default="{ row }">{{ number(row.online) }}</template></el-table-column><el-table-column label="运行中" min-width="85" align="right"><template #default="{ row }">{{ number(row.running) }}</template></el-table-column><el-table-column label="里程（km）" min-width="125" align="right"><template #default="{ row }">{{ number(row.mileage, 1) }}</template></el-table-column>
          <el-table-column v-if="canOpenEnterprise" width="35"><template #default="{ row }"><el-button link type="primary" :aria-label="`查看${row.name}详情`" @click.stop="showEnterprise(row.id)"><ChevronRight :size="16" /></el-button></template></el-table-column>
        </el-table></div>
          <footer class="rwb-enterprise-footer"><span>共 {{ data.enterprises.length }} 家<span v-if="data.fleet"> · 接入 {{ number(data.fleet.total) }} 辆 · 在线 {{ number(data.fleet.online) }} 辆 · 运行中 {{ number(data.fleet.running) }} 辆</span></span><el-pagination v-if="data.enterprises.length > pageSize" v-model:current-page="enterprisePage" small :page-size="pageSize" :total="data.enterprises.length" layout="prev,pager,next" /></footer>
        </template><div v-else class="rwb-empty">当前账号暂无企业统计权限</div>
      </WorkbenchPanel>
      <WorkbenchPanel class="rwb-reminders" title="待办提醒" note="当前">
        <div v-if="reminders.length" class="rwb-reminder-list"><button v-for="row in reminders" :key="row.key" type="button" @click="router.push({ path: row.path, query: row.query })"><span class="rwb-reminder-icon" :class="row.tone"><component :is="row.icon" :size="17" /></span><span>{{ row.label }}</span><b :class="row.tone">{{ number(row.value) }}</b><ChevronRight :size="15" /></button></div><div v-else class="rwb-empty">当前账号暂无待办数据权限</div>
        <button v-if="data.reminders.expiringVehicles != null" type="button" class="rwb-permit-reminder" @click="router.push({ path: '/admission/licenses', query: { status: 'EXPIRING' } })"><Clock3 :size="19" /><span>许可临期</span><b>{{ number(data.reminders.expiringVehicles) }}</b><small>辆</small><span class="rwb-permit-action">查看<ChevronRight :size="14" /></span></button>
      </WorkbenchPanel>
    </div>
    <CityEnterpriseDrawer v-if="canOpenEnterprise" v-model="drawer" :enterprise-id="enterpriseId" @changed="load" />
  </section>
</template>
