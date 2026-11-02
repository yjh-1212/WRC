<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { Activity, Bell, ChartNoAxesCombined, ChartPie, ListOrdered, ShieldCheck } from 'lucide-vue-next';
import { gsap } from 'gsap';
import { effectiveVisuals, isStale } from '../cockpit/visual-settings';
import CockpitTrend from './CockpitTrend.vue';
import type { CockpitSceneData } from '../cockpit/types';

const props = defineProps<{ data: CockpitSceneData | null; topic: string; metric: string; city?: any; selectedId?: string; hoveredId?: string; selection?: any; selectionData?: CockpitSceneData | null; vehicleType?: string }>();
const emit = defineEmits<{ select: [item: any]; drill: [item: any]; hover: [id: string | null]; metric: [key: string]; type: [key: string] }>();
const isCity = computed(() => props.data?.scene.level === 'city');
const risk = computed(() => props.topic === 'risks');
const quality = computed(() => props.topic === 'quality');
const compare = computed(() => props.topic === 'ranking');
const fleet = computed(() => props.topic === 'vehicles');
const format = (n: number | undefined | null) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const compact = (n: number | undefined | null) => n == null ? '—' : n >= 10000 ? `${(n / 10000).toFixed(1)}万` : format(Math.round(n));
const types = [{ code: 'DELIVERY', name: '无人配送', color: '#20d9f7' }, { code: 'SANITATION', name: '无人环卫', color: '#2c7bff' }, { code: 'PATROL', name: '无人巡逻', color: '#8b6cf7' }, { code: 'RETAIL', name: '无人零售', color: '#2ee6c5' }, { code: 'SHUTTLE', name: '无人接驳', color: '#f2c94c' }];
const selectedScope = computed(() => props.selection?.name ?? (isCity.value ? props.city?.scope.vehicle?.businessNo ?? props.city?.scope.enterprise?.name ?? props.city?.scope.district?.name : null) ?? (props.data?.scene.regionName === '中华人民共和国' ? '全国' : props.data?.scene.regionName));
const fullScope = computed(() => props.data?.scene.regionName === '中华人民共和国' ? '全国' : props.data?.scene.regionName);
const detailScope = computed(() => props.selectionData?.scene.regionName ?? (isCity.value ? props.city?.scope.vehicle?.businessNo ?? props.city?.scope.enterprise?.name ?? props.city?.scope.district?.name : null) ?? fullScope.value);
const typeValues = computed<Record<string, number>>(() => props.selectionData?.vehicleTypes ?? (isCity.value ? props.city?.vehicleTypes : props.data?.vehicleTypes) ?? {});
const typeTotal = computed(() => Object.values(typeValues.value).reduce((a, b) => a + b, 0));
const metrics = [{ key: 'registeredVehicles', label: '在册车辆', unit: '辆' }, { key: 'onlineRate', label: '在线率', unit: '%' }, { key: 'runningVehicles', label: '运行车辆', unit: '辆' }, { key: 'operatingEnterprises', label: '运营企业', unit: '家' }, { key: 'mileageToday', label: '今日里程', unit: 'km' }];
const currentMetric = computed(() => metrics.find(m => m.key === props.metric) ?? metrics[0]!);
const cityVehicleRows = computed<any[]>(() => (props.city?.map.kind === 'vehicles' ? props.city.map.items : []).map((row: any) => {
  const full = props.data?.map?.vehicles.find(vehicle => vehicle.id === row.id);
  return { ...full, ...row, name: row.businessNo, vehicleId: row.id, registeredVehicles: 1, riskEvents: full?.openAlerts, reportDelay: row.heartbeatAt ? Math.max(0, (Date.now() - new Date(row.heartbeatAt).getTime()) / 60000) : null, reportedAt: row.heartbeatAt };
}));
const summary = computed<any>(() => {
  if (props.selectionData) return props.selectionData.summary;
  if (props.selection?.raw?.summary) return props.selection.raw.summary;
  if (!isCity.value || !props.city) return props.data?.summary ?? {};
  if (props.selection) {
    const r = props.selection.raw;
    if (props.selection.kind === 'vehicle') return { registeredVehicles: 1, onlineVehicles: r.onlineStatus === 'ONLINE' ? 1 : 0, onlineRate: r.onlineStatus === 'ONLINE' ? 100 : 0, runningVehicles: r.drivingState === 'RUNNING' ? 1 : 0, operatingEnterprises: 1, mileageToday: r.mileageToday, riskEvents: r.openAlerts ?? r.alerts };
    const count = r.count ?? r.registeredVehicles;
    return { registeredVehicles: count, onlineVehicles: r.online ?? r.onlineVehicles, onlineRate: count ? (r.online ?? r.onlineVehicles ?? 0) / count * 100 : 0, runningVehicles: r.running, riskEvents: r.riskEvents };
  }
  const s = props.city.summary;
  return { registeredVehicles: s.registered, onlineVehicles: s.online, runningVehicles: s.running, operatingEnterprises: s.enterprises, mileageToday: s.mileageToday, onlineRate: s.onlineRate, riskEvents: (props.city.riskSnapshot?.alertToday ?? 0) + (props.city.riskSnapshot?.accidents ?? 0), majorEvents: props.city.riskSnapshot?.majorToday, unresolvedMajor: props.city.riskSnapshot?.alertHigh, dataQualityRate: s.dataQualityRate };
});
const animated = reactive<Record<string, number>>({});
let numberTween: gsap.core.Tween | undefined;
watch(summary, value => {
  numberTween?.kill();
  const numbers = Object.fromEntries(Object.entries(value).filter(([, n]) => typeof n === 'number'));
  for (const key of Object.keys(animated)) if (!(key in numbers)) delete animated[key];
  for (const key of Object.keys(numbers)) if (!(key in animated)) animated[key] = 0;
  if (!effectiveVisuals.value.animate) Object.assign(animated, numbers);
  else numberTween = gsap.to(animated, { ...numbers, duration: .75, ease: 'power2.out' });
}, { immediate: true });
onUnmounted(() => numberTween?.kill());
const regionRows = computed<any[]>(() => isCity.value ? (props.city?.map.kind === 'vehicles' ? cityVehicleRows.value : (props.city?.distribution?.items ?? []).map((r: any) => {
  const map = props.city.map.items.find((item: any) => item.id === r.id) ?? {};
  return { ...r, ...map, registeredVehicles: r.count, onlineVehicles: r.online, summary: { registeredVehicles: r.count, runningVehicles: map.running, onlineRate: r.count ? r.online / r.count * 100 : 0 } };
})) : props.data?.regions ?? []);
const rowKey = computed(() => risk.value ? 'riskEvents' : quality.value ? isCity.value ? 'reportDelay' : 'dataQualityRate' : compare.value ? props.metric : 'registeredVehicles');
const value = (row: any) => row.summary?.[rowKey.value] ?? row[rowKey.value] ?? null;
const rows = computed(() => [...regionRows.value].filter(r => value(r) != null).sort((a, b) => quality.value && !isCity.value ? value(a) - value(b) : value(b) - value(a)).slice(0, isCity.value ? 100 : 34));
const rowMax = computed(() => Math.max(1, ...rows.value.map(value)));
const rowUnit = computed(() => rowKey.value === 'reportDelay' ? '分钟' : ['onlineRate', 'dataQualityRate'].includes(rowKey.value) ? '%' : rowKey.value === 'mileageToday' ? 'km' : rowKey.value === 'operatingEnterprises' ? '家' : risk.value ? '项' : '辆');
const coverage = computed(() => isCity.value ? { total: summary.value.registeredVehicles ?? 0, reported: summary.value.onlineVehicles ?? 0 } : props.selectionData ? { total: props.selectionData.regions.length, reported: props.selectionData.regions.filter(r => r.summary).length } : { total: regionRows.value.length, reported: regionRows.value.filter(r => r.summary).length });
const trendMetric = ref('runningVehicles');
const trendChoices = [{ key: 'runningVehicles', label: '运行车辆' }, { key: 'onlineRate', label: '在线率' }, { key: 'mileage', label: '运行里程' }];
const trendPoints = computed(() => props.selectionData?.trend ?? (isCity.value ? props.city?.trend : props.data?.trend) ?? []);
const trends = computed(() => trendPoints.value.map((p: any) => ({ date: p.date, value: risk.value ? p.riskEvents : quality.value ? p.onlineRate : p[trendMetric.value] })));
const trendUnit = computed(() => risk.value ? '风险事件 · 项' : quality.value || trendMetric.value === 'onlineRate' ? '在线率 · %' : trendMetric.value === 'mileage' ? '运行里程 · km' : '运行车辆 · 辆');
const liveStatusInsteadOfHistory = computed(() => isCity.value && !trends.value.some((p: any) => p.value != null));
const statusGradient = computed(() => {
  const total = Math.max(1, summary.value.registeredVehicles ?? 0);
  const running = (summary.value.runningVehicles ?? 0) / total * 100;
  const online = (summary.value.onlineVehicles ?? 0) / total * 100;
  return `conic-gradient(#20d9f7 0% ${running}%, #708da6 ${running}% ${online}%, #33475a ${online}% 100%)`;
});
const distribution = computed(() => {
  if (quality.value) return [{ name: isCity.value ? '在线报送车辆' : '已有汇总报送', value: coverage.value.reported }, { name: isCity.value ? '离线车辆' : '缺少汇总报送', value: coverage.value.total - coverage.value.reported }];
  if (risk.value) return isCity.value ? [{ name: '未结告警', value: props.city?.riskSnapshot.alertUnhandled }, { name: '待处理违规', value: props.city?.riskSnapshot.violations }, { name: '异常离线', value: props.city?.riskSnapshot.offlineAbnormal }] : [{ name: '重大风险区域', value: regionRows.value.filter(r => r.summary?.riskLevel === 'HIGH').length }, { name: '重点关注区域', value: regionRows.value.filter(r => r.summary?.riskLevel === 'MEDIUM').length }, { name: '常态监管区域', value: regionRows.value.filter(r => r.summary?.riskLevel === 'LOW').length }];
  return [{ name: '在线在运', value: summary.value.runningVehicles }, { name: '在线待机', value: summary.value.onlineVehicles == null || summary.value.runningVehicles == null ? undefined : Math.max(0, summary.value.onlineVehicles - summary.value.runningVehicles) }, { name: '离线车辆', value: summary.value.registeredVehicles == null || summary.value.onlineVehicles == null ? undefined : Math.max(0, summary.value.registeredVehicles - summary.value.onlineVehicles) }];
});
const distributionColors = computed(() => risk.value ? ['#eb5757', '#f2994a', '#2ee6c5'] : ['#20d9f7', '#708da6', '#33475a']);
const events = computed<any[]>(() => isCity.value ? (props.city?.focusItems ?? []).map((r: any) => ({ ...r, name: r.businessNo, vehicleId: r.id, status: r.reason, level: 'MEDIUM' })) : quality.value ? regionRows.value.filter(r => !r.summary || r.summary.dataQualityRate < 95 || isStale(r.reportedAt)) : props.selection ? [props.selection.raw].filter(r => r.summary?.riskEvents > 0) : props.data?.risks ?? []);
const source = computed(() => props.selectionData?.source ?? props.data?.source);
// 风险数量较多不等同于重大事件；只有已报送的重大事件使用红色。
const attentionColor = (item: any) => quality.value ? '#f2c94c' : (item.summary?.majorEvents ?? item.majorEvents ?? 0) > 0 ? '#eb5757' : '#f2994a';
watch(() => props.selectedId, async () => { await nextTick(); document.querySelector('.cockpit-ranking-list .selected')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); document.querySelector('.cockpit-event-list .selected')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
watch(() => props.hoveredId, async () => { if (!props.hoveredId) return; await nextTick(); document.querySelector('.cockpit-ranking-list .hovered')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
const headings = computed(() => ({ first: risk.value ? '风险监管总览' : quality.value ? '数据接入质量' : fleet.value ? '车辆接入概览' : compare.value ? '区域运行对比' : isCity.value ? '城市监管态势' : props.data?.scene.level === 'province' ? '省域监管态势' : '监管核心态势', second: risk.value ? '近 7 日风险趋势' : quality.value ? '近 7 日在线报送' : '近 7 日运行趋势', third: risk.value ? '风险分级分布' : quality.value ? '报送覆盖情况' : '车辆类型结构', fourth: quality.value ? '数据报送质量' : fleet.value || compare.value ? '车辆运行状态' : '风险处置态势', fifth: risk.value ? '风险对象排行' : quality.value ? isCity.value ? '车辆报送延迟' : '区域完整率排行' : isCity.value ? props.city?.map.kind === 'vehicles' ? '监管车辆' : '重点区县排行' : compare.value ? currentMetric.value.label + '排行' : props.data?.scene.level === 'province' ? '重点地市排行' : '重点区域排行', sixth: quality.value ? '数据质量关注' : isCity.value ? '运行异常关注' : '重点监管关注' }));
</script>

<template>
  <aside class="cockpit-hud-column cockpit-hud-column--left" aria-label="监管概览">
    <section class="cockpit-hud-panel left-panel">
      <header><Activity :size="15" /><h2>{{ headings.first }}</h2><small :title="selectedScope">{{ selectedScope }}</small></header>
      <template v-if="risk">
        <div class="cockpit-primary-metrics"><article><strong class="warning">{{ compact(animated.riskEvents) }}</strong><span>当日风险事件</span></article><article><strong class="danger">{{ compact(animated.unresolvedMajor) }}</strong><span>待处置重大事件</span></article></div>
        <div class="cockpit-metric-grid"><div><span>重大事件</span><b>{{ compact(animated.majorEvents) }}</b></div><div><span>风险区域</span><b>{{ regionRows.filter(r => (r.summary?.riskEvents ?? r.riskEvents) > 0).length }}</b></div></div>
      </template>
      <template v-else-if="quality">
        <div class="cockpit-primary-metrics"><article><strong>{{ format(animated.dataQualityRate) }}<em>%</em></strong><span>报送数据完整率</span></article><article><strong>{{ coverage.reported }}<em>/ {{ coverage.total }}</em></strong><span>{{ isCity ? '车辆在线报送' : '区域报送覆盖' }}</span></article></div>
        <div class="cockpit-quality-note">{{ isCity ? '关注车辆最后上报时间、离线状态与定位完整性。' : '持续跟踪各区域的数据完整性与报送时效。' }}</div>
      </template>
      <template v-else>
        <div class="cockpit-primary-metrics"><article><strong>{{ compact(animated.registeredVehicles) }}</strong><span>在册车辆 <em>辆</em></span></article><article><strong>{{ format(animated.onlineRate) }}<em>%</em></strong><span>当前在线率</span></article></div>
        <div class="cockpit-metric-grid"><div><span>在线车辆</span><b>{{ compact(animated.onlineVehicles) }}</b></div><div><span>运行车辆</span><b>{{ compact(animated.runningVehicles) }}</b></div><div><span>运营企业</span><b>{{ compact(animated.operatingEnterprises) }}</b></div><div><span>今日里程</span><b>{{ compact(animated.mileageToday) }}<small>km</small></b></div></div>
      </template>
    </section>
    <section class="cockpit-hud-panel left-panel">
      <header><ChartNoAxesCombined :size="15" /><h2>{{ liveStatusInsteadOfHistory ? '车辆在线状态' : headings.second }}</h2><small :title="detailScope">{{ detailScope }}</small></header>
      <div v-if="liveStatusInsteadOfHistory" class="cockpit-live-status"><div class="cockpit-status-donut" :style="{ background: statusGradient }"><span><strong>{{ format(summary.onlineRate) }}%</strong>在线率</span></div><ul><li v-for="(item, i) in distribution" :key="item.name"><i :style="{ background: distributionColors[i] }"></i><span>{{ item.name }}</span><b>{{ format(item.value) }}</b></li></ul><small>暂无历史报送，显示当前车辆状态</small></div>
      <template v-else><div v-if="!risk && !quality" class="cockpit-trend-options"><button v-for="choice in trendChoices" :key="choice.key" :class="{ active: trendMetric === choice.key }" @click="trendMetric = choice.key">{{ choice.label }}</button></div><CockpitTrend :points="trends" :unit="trendUnit" :color="risk ? '#f2994a' : '#20d9f7'" /></template>
    </section>
    <section class="cockpit-hud-panel left-panel">
      <header><ChartPie :size="15" /><h2>{{ headings.third }}</h2><small :title="detailScope">{{ detailScope }}</small></header>
      <div v-if="risk || quality" class="cockpit-status-list"><div v-for="(item, i) in distribution" :key="item.name"><i :style="{ background: distributionColors[i] }"></i><span>{{ item.name }}</span><strong>{{ format(item.value) }}</strong></div></div>
      <div v-else class="cockpit-fleet-list"><button v-for="item in types" :key="item.code" type="button" :class="{ selected: vehicleType === item.code }" :aria-pressed="vehicleType === item.code" @click="emit('type', vehicleType === item.code ? 'ALL' : item.code)"><span><i :style="{ background: item.color }"></i>{{ item.name }}</span><strong>{{ compact(typeValues[item.code]) }} <small>{{ typeTotal ? ((typeValues[item.code] ?? 0) / typeTotal * 100).toFixed(1) : '0' }}%</small></strong><div><b :style="{ width: `${(typeValues[item.code] ?? 0) / Math.max(1, typeTotal) * 100}%`, background: item.color }"></b></div></button></div>
    </section>
  </aside>
  <aside class="cockpit-hud-column cockpit-hud-column--right" aria-label="重点监管">
    <section class="cockpit-hud-panel right-panel">
      <header><ShieldCheck :size="15" /><h2>{{ headings.fourth }}</h2><small :title="selectedScope">{{ selectedScope }}</small></header>
      <div v-if="quality" class="cockpit-quality-list"><div><span>汇总报送时间</span><b>{{ source?.reportedAt ? new Date(source.reportedAt).toLocaleString('zh-CN', { hour12: false }) : '未报送' }}</b></div><div><span>最近采集时间</span><b>{{ source?.capturedAt ? new Date(source.capturedAt).toLocaleString('zh-CN', { hour12: false }) : '未采集' }}</b></div><div><span>接口可用率 / 重复率</span><b>暂无报送</b></div></div>
      <div v-else-if="fleet || compare" class="cockpit-status-list"><div v-for="(item, i) in distribution" :key="item.name"><i :style="{ background: distributionColors[i] }"></i><span>{{ item.name }}</span><strong>{{ compact(item.value) }}</strong></div></div>
      <div v-else class="cockpit-risk-ring"><div><strong>{{ compact(animated.riskEvents) }}</strong><span>当日风险事件</span></div><ul><li><span>重大事件</span><b class="danger">{{ compact(animated.majorEvents) }}</b></li><li><span>待处置重大</span><b class="warning">{{ compact(animated.unresolvedMajor) }}</b></li><li><span>处置中</span><b>{{ format(summary.processingEvents) }}</b></li><li><span>处置完成率</span><b :title="summary.completionRate == null ? '暂无报送' : ''">{{ format(summary.completionRate) }}{{ summary.completionRate == null ? '' : '%' }}</b></li></ul></div>
    </section>
    <section class="cockpit-hud-panel right-panel">
      <header><ListOrdered :size="15" /><h2>{{ headings.fifth }}</h2><small>{{ rowUnit }}</small></header>
      <select v-if="compare" class="cockpit-metric-select" aria-label="区域对比指标" :value="metric" @change="emit('metric', ($event.target as HTMLSelectElement).value)"><option v-for="m in metrics" :key="m.key" :value="m.key">{{ m.label }}</option></select>
      <div class="cockpit-ranking-list"><button v-for="(item, i) in rows" :key="item.code ?? item.id" type="button" :class="{ selected: selectedId === (item.code ?? item.id), hovered: hoveredId === (item.code ?? item.id) }" :aria-pressed="selectedId === (item.code ?? item.id)" @mouseenter="emit('hover', item.code ?? item.vehicleId ?? item.id)" @mouseleave="emit('hover', null)" @focus="emit('hover', item.code ?? item.vehicleId ?? item.id)" @blur="emit('hover', null)" @click="emit('select', item)" @dblclick="emit('drill', item)"><em>{{ String(i + 1).padStart(2, '0') }}</em><span :title="item.name">{{ item.name }}</span><i><b :style="{ width: `${value(item) / rowMax * 100}%` }"></b></i><strong>{{ compact(value(item)) }}</strong></button><div v-if="!rows.length" class="cockpit-panel-empty">暂无当前范围指标</div></div>
    </section>
    <section class="cockpit-hud-panel right-panel">
      <header><Bell :size="15" /><h2>{{ headings.sixth }}</h2><small>{{ events.length }} 项</small></header>
      <div class="cockpit-event-list"><button v-for="item in events" :key="item.code ?? item.id" type="button" :class="{ selected: selectedId === (item.code ?? item.vehicleId ?? item.id) }" @mouseenter="emit('hover', item.code ?? item.vehicleId ?? item.id)" @mouseleave="emit('hover', null)" @focus="emit('hover', item.code ?? item.vehicleId ?? item.id)" @blur="emit('hover', null)" @click="emit('select', item)"><span class="cockpit-event-symbol" :style="{ color: attentionColor(item) }">{{ quality ? '◇' : '!' }}</span><span><b>{{ item.name }}</b><small>{{ quality && !isCity ? isStale(item.reportedAt) ? '数据逾期或未上报' : item.summary ? `完整率 ${item.summary.dataQualityRate}%` : '缺少报送数据' : item.summary ? `${item.summary.riskEvents} 项风险 · ${item.summary.majorEvents} 项重大` : item.status ?? '待核查' }}</small></span><em :style="{ background: attentionColor(item) }"></em></button><div v-if="!events.length" class="cockpit-panel-empty">当前范围暂无关注事项</div></div>
    </section>
  </aside>
</template>
