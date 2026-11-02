<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RegulatoryReport } from '../types';
import AnalyticsChart from './AnalyticsChart.vue';
import { reportDay, reportNumber, reportTime, validReportPercentage } from '../reports';

const props = defineProps<{ report: RegulatoryReport }>();
const operations = computed(() => props.report.summary?.operations);
const safety = computed(() => props.report.summary?.safety);
const showOperations = computed(() => props.report.category !== 'SAFETY');
const showSafety = computed(() => props.report.category !== 'OPERATIONS');
const hasAutonomy = computed(() => operations.value?.kpis?.mileage > 0 && validReportPercentage(operations.value?.kpis?.autonomousRate));
const invalidAutonomy = computed(() => operations.value?.kpis?.mileage > 0 && !validReportPercentage(operations.value?.kpis?.autonomousRate));
const active = ref('information');
const sections = computed(() => [
  { id: 'information', label: '报告信息' },
  ...(showOperations.value ? [{ id: 'operations', label: '一、运行概况' }, { id: 'trend', label: '二、运行趋势' }] : []),
  ...(showSafety.value ? [{ id: 'safety', label: showOperations.value ? '三、安全态势' : '一、安全态势' }] : []),
  { id: 'definitions', label: showOperations.value && showSafety.value ? '四、统计口径' : showOperations.value ? '三、统计口径' : '二、统计口径' },
]);
const metrics = computed(() => {
  const k = operations.value?.kpis;
  return [
    ['运行车辆', k?.vehicles, '辆'], ['运行次数', k?.trips, '次'], ['累计里程', k?.mileage, 'km'],
    ['累计运行时长', k?.durationHours, 'h'], ['自主运行里程占比', hasAutonomy.value ? k?.autonomousRate : undefined, '%'], ['累计能耗', k?.energyUsed, 'kWh'],
  ];
});
const trend = computed(() => Array.isArray(operations.value?.trend) ? operations.value.trend : []);
const trendOption = computed(() => ({
  color: ['#2f6fed'], tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => `${reportNumber(value)} km` },
  grid: { top: 22, left: 55, right: 20, bottom: 30 },
  xAxis: { type: 'category' as const, boundaryGap: false, data: trend.value.map((row: { date: string }) => row.date.slice(5)),
    axisLine: { lineStyle: { color: '#dce4ee' } }, axisTick: { show: false }, axisLabel: { color: '#7b8ba0', fontSize: 11 } },
  yAxis: { type: 'value' as const, min: 0, axisLabel: { color: '#7b8ba0', fontSize: 11 }, splitLine: { lineStyle: { color: '#edf1f6' } } },
  series: [{ type: 'line' as const, data: trend.value.map((row: { mileage: number }) => row.mileage), symbolSize: 4,
    lineStyle: { width: 2 }, areaStyle: { color: 'rgba(47,111,237,.07)' }, connectNulls: false }],
}));
function navigate(id: string) {
  active.value = id;
  document.getElementById(`report-${id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
</script>

<template>
  <div class="report-workspace">
    <aside class="report-directory" aria-label="报告目录">
      <h2>报告目录</h2>
      <a v-for="item in sections" :key="item.id" :href="`#report-${item.id}`" :class="{ active: active === item.id }" :aria-current="active === item.id ? 'location' : undefined" @click.prevent="navigate(item.id)">{{ item.label }}</a>
      <div class="report-directory-meta"><strong>数据快照</strong><span>{{ reportTime(report.generatedAt) }}</span></div>
    </aside>
    <article class="report-paper" aria-label="报告正文">
      <header id="report-information" class="report-document-head">
        <h1>{{ report.title }}</h1>
        <p>统计周期：{{ reportDay(report.periodStart) }} 至 {{ reportDay(report.periodEnd) }}</p>
        <dl class="report-metadata"><div><dt>报告编号</dt><dd>{{ report.businessNo }}</dd></div><div><dt>生成单位</dt><dd>{{ report.organization.name }}</dd></div><div><dt>生成人</dt><dd>{{ report.generatedByName }}</dd></div><div><dt>生成时间</dt><dd>{{ reportTime(report.generatedAt) }}</dd></div></dl>
        <p class="report-scope">{{ report.enterprise ? `统计范围：${report.enterprise.name}` : `统计范围：${report.organization.name}授权监管范围` }} · 本报告保留生成时的数据快照</p>
      </header>
      <section v-if="showOperations" id="report-operations" class="report-document-section">
        <h2>一、运行概况</h2>
        <template v-if="operations?.kpis">
          <dl class="report-metric-band"><div v-for="[label, value, unit] in metrics" :key="String(label)"><dt>{{ label }}</dt><dd>{{ reportNumber(value) }} <small v-if="typeof value === 'number'">{{ unit }}</small></dd></div></dl>
          <p class="report-summary-text">本期共{{ reportNumber(operations.kpis.vehicles) }}辆车辆产生运行记录，累计运行里程{{ reportNumber(operations.kpis.mileage) }} km<span v-if="hasAutonomy">，自主运行里程占比{{ reportNumber(operations.kpis.autonomousRate) }}%</span>。</p>
          <p v-if="invalidAutonomy" class="report-data-issue">自主运行里程占比口径待核对：快照中的比例无效或超出0%–100%，请核对源运行记录。</p>
        </template>
        <p v-else class="report-missing">该报告未保存运行指标，无法展示该部分内容。</p>
      </section>
      <section v-if="showOperations" id="report-trend" class="report-document-section">
        <h2>二、运行趋势</h2><div class="report-chart-caption"><span>日运行里程（km）</span><span>按日汇总</span></div>
        <AnalyticsChart v-if="trend.length" :option="trendOption" height="220px" aria-label="报告快照中的日运行里程趋势" />
        <p v-else class="report-missing">该报告未保存运行趋势数据。</p>
      </section>
      <section v-if="showSafety" id="report-safety" class="report-document-section">
        <h2>{{ showOperations ? '三' : '一' }}、安全态势</h2>
        <template v-if="safety?.kpis"><div class="report-table-scroll"><table class="report-safety-table"><thead><tr><th>安全告警（条）</th><th>已闭环告警（条）</th><th>告警闭环率</th><th>事故（起）</th><th>违规记录（条）</th></tr></thead><tbody><tr><td>{{ reportNumber(safety.kpis.alerts) }}</td><td>{{ reportNumber(typeof safety.kpis.openAlerts === 'number' ? safety.kpis.alerts - safety.kpis.openAlerts : undefined) }}</td><td>{{ safety.kpis.alerts > 0 ? `${reportNumber(safety.kpis.closureRate)}%` : '—' }}</td><td>{{ reportNumber(safety.kpis.accidents) }}</td><td>{{ reportNumber(safety.kpis.violations) }}</td></tr></tbody></table></div><p class="report-caption">告警闭环率按本期告警中已闭环记录计算；无告警时不计算闭环率。</p></template>
        <p v-else class="report-missing">该报告未保存安全指标，无法展示该部分内容。</p>
      </section>
      <section id="report-definitions" class="report-document-section"><h2>{{ showOperations && showSafety ? '四' : showOperations ? '三' : '二' }}、统计口径</h2><p>运行车辆按统计周期去重；运行次数按运行记录条数统计；自主运行里程占比＝自主里程 / 总里程。</p><p>“—”表示无可用数据或无可计算基数。导出内容为本报告保存的统计指标 CSV。</p><p>报告不用于证明未接入或未上报的业务没有发生，后续台账变化不覆盖本报告。</p></section>
      <footer class="report-document-footer"><span>{{ report.organization.name }}</span><span>报告快照 · {{ reportTime(report.generatedAt).slice(0, 10) }}</span></footer>
    </article>
  </div>
</template>
