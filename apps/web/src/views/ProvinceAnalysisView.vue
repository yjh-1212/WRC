<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Download, Info, RefreshCw } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import AnalyticsChart from '../components/AnalyticsChart.vue';
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import { analysisDay, analysisPeriod, type ProvinceAnalysisData, type ProvinceAnalysisOptions, type ProvinceAnalysisRow, type ProvinceAnalysisKpis } from '../province-analysis';
import { reportNumber as number, reportTime as time, reportError as errorText } from '../reports';
import '../province-analysis.css';

const route = useRoute(), router = useRouter(), session = useSessionStore();
const options = reactive<ProvinceAnalysisOptions>({ cities: [], enterprises: [] }), optionsError = ref('');
const filters = reactive({ dates: analysisPeriod(), workspaceId: '', enterpriseId: '' });
const data = ref<ProvinceAnalysisData | null>(null), loading = ref(false), error = ref(''), exporting = ref(false), keyword = ref('');
const metric = ref<'mileage' | 'trips' | 'durationHours'>('mileage');
const canExport = computed(() => session.user?.permissions.includes('analytics:report:export'));
const canArchive = computed(() => session.user?.permissions.includes('archive:vehicle:read'));
const filteredEnterprises = computed(() => options.enterprises.filter(row => !filters.workspaceId || row.workspaceId === filters.workspaceId));
const cityName = computed(() => options.cities.find(city => city.id === data.value?.scope.workspaceId)?.cityName ?? data.value?.cities[0]?.name ?? '所选地市');
const enterpriseName = computed(() => options.enterprises.find(row => row.id === data.value?.scope.enterpriseId)?.name ?? '所选企业');
const level = computed(() => data.value?.scope.enterpriseId ? 'vehicle' : data.value?.scope.workspaceId ? 'enterprise' : 'city');
const tableTitle = computed(() => ({ city: '地市运行明细', enterprise: '企业运行明细', vehicle: '车辆运行明细' }[level.value]));
const rows = computed(() => data.value ? level.value === 'city' ? data.value.cities : level.value === 'enterprise' ? data.value.enterprises : data.value.vehicles : []);
const displayedRows = computed(() => rows.value.filter(row => !keyword.value.trim() || `${row.name} ${row.businessNo ?? ''}`.includes(keyword.value.trim())));
const includesToday = computed(() => data.value?.period.to === analysisDay(new Date()));
const metricConfig = computed(() => ({ mileage: { title: '里程', unit: 'km' }, trips: { title: '运行次数', unit: '次' }, durationHours: { title: '运行时长', unit: 'h' } }[metric.value]));
let requestId = 0;
function queryValue(key: string) { return typeof route.query[key] === 'string' ? route.query[key] as string : ''; }
function parameters() {
  const [start, end] = analysisPeriod();
  const params = new URLSearchParams({ from: queryValue('from') || start!, to: queryValue('to') || end! });
  for (const key of ['workspaceId', 'enterpriseId']) if (queryValue(key)) params.set(key, queryValue(key));
  return params;
}
async function loadOptions() {
  optionsError.value = '';
  try { Object.assign(options, await api<ProvinceAnalysisOptions>('/province/analysis/options')); }
  catch (reason) { optionsError.value = errorText(reason); }
}
async function load() {
  const current = ++requestId, params = parameters();
  filters.dates = [params.get('from')!, params.get('to')!]; filters.workspaceId = queryValue('workspaceId'); filters.enterpriseId = queryValue('enterpriseId');
  loading.value = true; error.value = ''; keyword.value = '';
  try { const result = await api<ProvinceAnalysisData>(`/province/analysis?${params}`); if (current === requestId) data.value = result; }
  catch (reason) { if (current === requestId) { error.value = errorText(reason); data.value = null; } }
  finally { if (current === requestId) loading.value = false; }
}
async function search() {
  if (!filters.dates || filters.dates.length !== 2) return ElMessage.warning('请选择统计周期');
  if (filters.dates[0]! > filters.dates[1]!) return ElMessage.warning('开始日期不能晚于结束日期');
  const query = { from: filters.dates[0], to: filters.dates[1], workspaceId: filters.workspaceId || undefined, enterpriseId: filters.enterpriseId || undefined };
  const before = route.fullPath; await router.replace({ path: '/province/analysis', query }); if (before === route.fullPath) await load();
}
async function reset() { Object.assign(filters, { dates: analysisPeriod(), workspaceId: '', enterpriseId: '' }); await search(); }
async function quickPeriod(value: number | 'month') {
  filters.dates = value === 'month' ? [`${analysisDay(new Date()).slice(0, 7)}-01`, analysisDay(new Date())] : analysisPeriod(value);
  await search();
}
function activePeriod(value: number | 'month') {
  const dates = value === 'month' ? [`${analysisDay(new Date()).slice(0, 7)}-01`, analysisDay(new Date())] : analysisPeriod(value);
  return filters.dates?.join() === dates.join();
}
async function changeScope(workspaceId = '', enterpriseId = '') {
  if (!data.value) return;
  filters.dates = [data.value.period.from, data.value.period.to]; filters.workspaceId = workspaceId; filters.enterpriseId = enterpriseId;
  await search();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function drill(row: ProvinceAnalysisRow) {
  if (level.value === 'city') void changeScope(row.id);
  else if (level.value === 'enterprise') void changeScope(data.value?.scope.workspaceId ?? '', row.id);
  else if (canArchive.value) void router.push({ path: '/province/vehicles', query: { vehicleId: row.id } });
}
function changeDescription(key: keyof ProvinceAnalysisKpis) {
  if (!data.value) return '—';
  const current = data.value.kpis[key], previous = data.value.previousKpis[key];
  if (!data.value.previousKpis.hasRecords) return '上期无记录';
  if (!data.value.kpis.hasRecords || typeof current !== 'number' || typeof previous !== 'number') return '暂无可比数据';
  if (key === 'autonomousRate') { const change = Math.round((current - previous) * 10) / 10; return `较上期 ${change > 0 ? '+' : ''}${number(change)}个百分点`; }
  if (!previous) return '上期无可比基数';
  const change = Math.round((current - previous) / previous * 1000) / 10;
  return `较上期 ${change > 0 ? '+' : ''}${number(change)}%`;
}
const metrics = computed(() => {
  const k = data.value?.kpis;
  return [
    { label: '运行车辆', value: k?.hasRecords ? k.vehicles : null, unit: '辆', change: changeDescription('vehicles') },
    { label: '累计里程', value: k?.mileage, unit: 'km', change: changeDescription('mileage') },
    { label: '运行次数', value: k?.hasRecords ? k.trips : null, unit: '次', change: changeDescription('trips') },
    { label: '累计运行时长', value: k?.durationHours, unit: 'h', change: changeDescription('durationHours') },
    { label: '自主运行里程占比', value: k?.autonomousRate, unit: '%', change: k?.qualityIssue && k.autonomousRate === null ? '源数据口径待核对' : changeDescription('autonomousRate') },
    { label: '累计能耗', value: k?.energyUsed, unit: 'kWh', change: k?.energyPer100 !== null && k?.energyPer100 !== undefined ? `百公里能耗 ${number(k.energyPer100)} kWh` : '暂无可计算基数' },
  ];
});
const chartOption = computed(() => ({
  color: ['#2f6fed', '#9aaec9'], textStyle: { fontFamily: 'Microsoft YaHei, sans-serif' },
  legend: { bottom: 0, data: ['本期', '上期同周期'], itemWidth: 18, itemHeight: 7, textStyle: { color: '#71829a', fontSize: 11 } },
  tooltip: { trigger: 'axis', confine: true, formatter: (input: unknown) => {
    const params = input as { dataIndex: number }[]; const row = data.value?.trend[params[0]?.dataIndex ?? -1]; if (!row) return '';
    const current = row.current.hasRecords ? row.current[metric.value] : null, previous = row.previous.hasRecords ? row.previous[metric.value] : null;
    return `<div style="font-size:12px;line-height:23px"><b>${row.date}</b><br>本期：${number(current)} ${current !== null ? metricConfig.value.unit : '（无记录或口径待核对）'}<br>上期 ${row.previousDate}：${number(previous)} ${previous !== null ? metricConfig.value.unit : '（无记录或口径待核对）'}</div>`;
  } },
  grid: { left: 54, right: 18, top: 20, bottom: 56 },
  xAxis: { type: 'category' as const, boundaryGap: false, data: data.value?.trend.map(row => row.date.slice(5)) ?? [], axisLine: { lineStyle: { color: '#dfe6ef' } }, axisLabel: { color: '#7b8ba0', fontSize: 11 }, axisTick: { show: false } },
  yAxis: { type: 'value' as const, min: 0, axisLabel: { color: '#7b8ba0', fontSize: 11 }, splitLine: { lineStyle: { color: '#edf1f6' } } },
  series: [{ name: '本期', type: 'line' as const, data: data.value?.trend.map(row => row.current.hasRecords ? row.current[metric.value] : null) ?? [], symbolSize: 4, connectNulls: false, lineStyle: { width: 2 }, areaStyle: { color: 'rgba(47,111,237,.06)' } },
    { name: '上期同周期', type: 'line' as const, data: data.value?.trend.map(row => row.previous.hasRecords ? row.previous[metric.value] : null) ?? [], symbolSize: 3, connectNulls: false, lineStyle: { type: 'dashed' as const, width: 1.5 } }],
}));
const maxMileage = computed(() => Math.max(1, ...(data.value?.cities.map(city => city.mileage ?? 0) ?? [])));
function formatRow(row: ProvinceAnalysisRow, key: keyof ProvinceAnalysisRow, suffix = '') { return row.hasRecords && typeof row[key] === 'number' ? `${number(row[key])}${suffix}` : '—'; }
function summary({ columns }: { columns: { property: string }[] }) {
  const k = data.value?.kpis;
  return columns.map((column, index) => {
    if (!index) return level.value === 'city' ? '全省汇总' : '筛选范围汇总';
    if (!k?.hasRecords) return '—';
    if (column.property === 'share') return k.mileage ? '100%' : '—';
    if (column.property === 'autonomousRate') return k.autonomousRate === null ? '—' : `${number(k.autonomousRate)}%`;
    const value = k[column.property as keyof ProvinceAnalysisKpis]; return typeof value === 'number' ? number(value) : '—';
  });
}
async function exportData() {
  if (exporting.value || loading.value || !data.value) return;
  exporting.value = true;
  try {
    const params = parameters(); if (keyword.value.trim()) params.set('q', keyword.value.trim());
    const file = await api<{ filename: string; mimeType: string; content: string }>(`/province/analysis/export?${params}`);
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (reason) { ElMessage.error(`导出失败：${errorText(reason)}`); }
  finally { exporting.value = false; }
}
watch(() => route.fullPath, load);
onMounted(() => { void loadOptions(); void load(); });
onUnmounted(() => { requestId++; });
</script>

<template>
  <section class="province-analysis-page" aria-label="省域运行分析">
    <h1 class="sr-only">省域运行分析</h1>
    <QueryPanel :loading="loading" @search="search" @reset="reset">
      <QueryField label="统计周期" wide><el-date-picker v-model="filters.dates" aria-label="统计周期" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" :disabled-date="(value: Date) => analysisDay(value) > analysisDay(new Date())" /></QueryField>
      <div class="analysis-shortcuts" aria-label="快捷周期"><el-button v-for="days in [7, 30]" :key="days" :type="activePeriod(days) ? 'primary' : 'default'" :disabled="loading" @click="quickPeriod(days)">近{{ days }}日</el-button><el-button :type="activePeriod('month') ? 'primary' : 'default'" :disabled="loading" @click="quickPeriod('month')">本月</el-button></div>
      <QueryField label="地市"><el-select v-model="filters.workspaceId" aria-label="地市" placeholder="全部已开通城市" clearable :disabled="!!optionsError" @change="filters.enterpriseId = ''"><el-option v-for="city in options.cities" :key="city.id" :value="city.id" :label="city.cityName" /></el-select></QueryField>
      <QueryField label="运营企业"><el-select v-model="filters.enterpriseId" aria-label="运营企业" placeholder="全部企业" clearable filterable :disabled="!!optionsError"><el-option v-for="row in filteredEnterprises" :key="row.id" :label="row.name" :value="row.id" /></el-select></QueryField>
    </QueryPanel>
    <div v-if="optionsError" class="analysis-error-note" role="alert">筛选选项加载失败：{{ optionsError }} <el-button link type="primary" @click="loadOptions">重试</el-button></div>
    <div v-if="error" class="analysis-state" role="alert"><strong>省域运行分析暂时无法加载</strong><p>{{ error }}</p><el-button :icon="RefreshCw" @click="load">重试</el-button></div>
    <div v-else-if="loading && !data" class="analysis-state" aria-live="polite"><el-skeleton :rows="10" animated /><span>正在汇总省域运行数据…</span></div>
    <div v-else-if="data" v-loading="loading" :aria-busy="loading">
      <div class="analysis-scope-line"><span>统计范围：{{ data.scope.cityCount }}个已开通城市 · 按已入库运行记录汇总</span><span>统计更新 {{ time(data.computedAt) }}</span></div>
      <div v-if="data.scope.workspaceId || data.scope.enterpriseId" class="analysis-drill-path" aria-label="当前下钻范围"><el-button link type="primary" @click="changeScope()">全省</el-button><span v-if="data.scope.workspaceId">/</span><el-tag v-if="data.scope.workspaceId" closable @close="changeScope()">{{ cityName }}</el-tag><span v-if="data.scope.enterpriseId">/</span><el-tag v-if="data.scope.enterpriseId" closable @close="changeScope(data.scope.workspaceId ?? '')">{{ enterpriseName }}</el-tag><span class="analysis-muted">可清除条件返回上一级</span></div>
      <dl class="analysis-metric-band"><div v-for="item in metrics" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ number(item.value) }} <small v-if="typeof item.value === 'number'">{{ item.unit }}</small></dd><span>{{ item.change }}</span></div></dl>
      <div v-if="data.kpis.qualityIssue || data.scope.citiesWithRecords < data.scope.cityCount || includesToday" class="analysis-data-note"><Info :size="15" /><span><template v-if="data.kpis.qualityIssue">部分源记录存在里程或能耗口径异常，受影响指标显示为“—”。</template><template v-if="data.scope.citiesWithRecords < data.scope.cityCount"> 当前条件下{{ data.scope.cityCount - data.scope.citiesWithRecords }}个地市未查询到运行记录，不等同于没有业务。</template><template v-if="includesToday"> 周期包含今天，仅汇总已入库记录。</template></span></div>
      <div class="analysis-chart-grid">
        <section class="analysis-panel analysis-trend"><header><div><h2>{{ data.scope.enterpriseId ? '企业运行趋势' : data.scope.workspaceId ? '地市运行趋势' : '全省运行趋势' }}</h2><p>按日汇总 · 与上期等长周期对比</p></div><el-radio-group v-model="metric" aria-label="趋势指标" size="small"><el-radio-button value="mileage">里程</el-radio-button><el-radio-button value="trips">运行次数</el-radio-button><el-radio-button value="durationHours">运行时长</el-radio-button></el-radio-group></header><div class="analysis-chart-unit">{{ metricConfig.title }}（{{ metricConfig.unit }}）</div><AnalyticsChart :option="chartOption" height="250px" :aria-label="`本期与上期日${metricConfig.title}趋势`" /><p class="analysis-chart-footnote">本期 {{ data.period.from }}—{{ data.period.to }}；上期 {{ data.period.previousFrom }}—{{ data.period.previousTo }}。无记录的日期留空。</p></section>
        <section class="analysis-panel analysis-city-comparison"><header><div><h2>地市里程对比</h2><p>已开通城市 · 累计里程</p></div></header><div class="analysis-city-bars"><button v-for="city in data.cities" :key="city.id" type="button" :aria-label="`查看${city.name}分析`" :disabled="loading" @click="changeScope(city.id)"><span>{{ city.name }}</span><i><b :style="{ width: `${Math.max(0, (city.mileage ?? 0) / maxMileage * 100)}%` }" /></i><span class="analysis-city-value"><strong>{{ number(city.mileage) }}<small v-if="city.mileage !== null"> km</small></strong><small>{{ city.share !== null ? `${number(city.share)}%` : '无记录或无可比基数' }}</small></span></button><p v-if="!data.cities.length" class="analysis-muted">暂无已开通地市</p></div><p class="analysis-chart-footnote">共{{ data.cities.length }}个城市，点击查看该市明细</p></section>
      </div>
      <section class="analysis-panel analysis-detail" :aria-label="tableTitle"><header><div><h2>{{ tableTitle }}</h2><p>当前周期 · {{ displayedRows.length }}{{ level === 'city' ? '个城市' : level === 'enterprise' ? '家企业' : '辆车' }}</p></div><div class="analysis-table-actions"><el-input v-model="keyword" aria-label="搜索明细" :placeholder="level === 'city' ? '搜索地市' : level === 'enterprise' ? '搜索企业' : '车辆名称 / 编号'" clearable /><el-button v-if="canExport" :icon="Download" :loading="exporting" :disabled="loading" @click="exportData">导出数据</el-button></div></header>
        <el-table :data="displayedRows" show-summary :summary-method="summary" class="analysis-detail-table" row-key="id">
          <el-table-column :label="level === 'city' ? '地市' : level === 'enterprise' ? '企业' : '车辆'" prop="name" min-width="165"><template #default="{ row }"><div class="analysis-identity"><strong>{{ row.name }}</strong><span v-if="row.businessNo">{{ row.businessNo }}</span><small v-if="!row.hasRecords">未查询到运行记录</small><small v-else-if="row.qualityIssue" class="analysis-quality-label">口径待核对</small></div></template></el-table-column>
          <el-table-column v-if="level === 'city'" label="运行企业（家）" prop="enterprises" width="120" align="right"><template #default="{ row }">{{ formatRow(row, 'enterprises') }}</template></el-table-column>
          <el-table-column v-if="level !== 'vehicle'" label="运行车辆（辆）" prop="vehicles" width="120" align="right"><template #default="{ row }">{{ formatRow(row, 'vehicles') }}</template></el-table-column>
          <el-table-column label="运行次数（次）" prop="trips" width="120" align="right"><template #default="{ row }">{{ formatRow(row, 'trips') }}</template></el-table-column>
          <el-table-column label="累计里程（km）" prop="mileage" width="140" align="right"><template #default="{ row }">{{ formatRow(row, 'mileage') }}</template></el-table-column>
          <el-table-column label="里程占比" prop="share" width="110" align="right"><template #default="{ row }">{{ formatRow(row, 'share', '%') }}</template></el-table-column>
          <el-table-column label="自主运行里程占比" prop="autonomousRate" width="155" align="right"><template #default="{ row }">{{ formatRow(row, 'autonomousRate', '%') }}</template></el-table-column>
          <el-table-column label="百公里能耗（kWh）" prop="energyPer100" width="160" align="right"><template #default="{ row }">{{ formatRow(row, 'energyPer100') }}</template></el-table-column>
          <el-table-column label="操作" width="110"><template #default="{ row }"><el-button v-if="level !== 'vehicle' || canArchive" link type="primary" @click="drill(row)">{{ level === 'city' ? '查看分析' : level === 'enterprise' ? '查看车辆' : '车辆档案' }}</el-button><span v-else>—</span></template></el-table-column>
          <template #empty><el-empty :image-size="54" :description="keyword ? '没有符合条件的明细' : '当前周期未查询到运行记录'"><el-button v-if="keyword" @click="keyword = ''">清除检索</el-button></el-empty></template>
        </el-table>
        <p class="analysis-information"><Info :size="15" /><span>统计口径：运行主体按周期去重；自主运行里程占比＝自主里程 / 总里程；未查询到记录不计为已知零值。明细搜索不改变汇总统计范围。</span></p>
      </section>
    </div>
  </section>
</template>
