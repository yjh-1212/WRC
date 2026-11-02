<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowUpRight, ChevronRight, ClipboardCheck, Gauge, MapPinned, Maximize2, Minimize2, Settings2, ShieldAlert, Truck } from 'lucide-vue-next';
import { api } from '../api';
import ProvinceCockpitPanel from '../components/ProvinceCockpitPanel.vue';
import ProvinceCockpitMap from '../components/ProvinceCockpitMap.vue';
import ProvinceAppearanceSettings from '../components/ProvinceAppearanceSettings.vue';
import CockpitCityPanels from '../components/CockpitCityPanels.vue';
import { appearancePalette, appearanceVariables, useProvinceAppearance } from '../cockpit/province-appearance';
import { useProvinceDrill } from '../cockpit/province-drill';
import type { ProvinceCockpitData } from '../province-cockpit';
import '../province-cockpit.css';

const route = useRoute(), router = useRouter(), root = ref<HTMLElement>();
defineOptions({ name: 'ProvinceCockpitView' });
const drill = useProvinceDrill();
const { data: mapData, error: mapError, loading: mapLoading, level: drillLevel, vehicleMode, crumbs: drillCrumbs } = drill;
const data = ref<ProvinceCockpitData>(), loading = ref(false), error = ref(''), fullscreen = ref(false), now = ref(new Date());
const appearance = useProvinceAppearance();
const { current: screenStyle, draft: styleDraft, fields: styleFields, builtins: styleBuiltins, presets: stylePresets, opened: styleOpened, ready: styleReady, loading: styleLoading, busy: styleBusy, canEdit: styleCanEdit, feedback: styleFeedback, syncError: styleSyncError } = appearance;
const screenVariables = computed(() => appearanceVariables(screenStyle.value));
const cityCode = computed(() => typeof route.query.cityCode === 'string' ? route.query.cityCode : '');
let controller: AbortController | undefined, generation = 0, lastLoadAt = 0, active = true;
const fmt = (value?: number | null) => value == null || data.value?.scope.connected === false ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const date = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无当日上报';
const scopeLabel = computed(() => drillLevel.value === 'enterprise' ? mapData.value?.scope.enterprise?.name ?? '企业' : drillLevel.value === 'district' ? mapData.value?.scope.district?.name ?? '区县' : data.value?.scope.name ?? '山东省');
const summary = computed(() => drillLevel.value !== 'province' && mapData.value?.summary ? mapData.value.summary : data.value?.summary ?? {});
const scopeRows = computed(() => mapData.value?.distribution?.items ?? []);
const scopeMax = computed(() => Math.max(1, ...scopeRows.value.map(row => row.count)));
const scopeTitle = computed(() => mapData.value?.distribution?.title ?? '当前区域分布');
const detailScope = computed(() => ['district', 'enterprise'].includes(drillLevel.value));
const cityRank = computed(() => [...(data.value?.cities ?? [])].filter(city => city.connected).sort((a, b) => b.registered - a.registered));
const connectedCityCodes = computed(() => data.value?.cities.filter(city => city.connected).map(city => city.code) ?? []);
const rankMax = computed(() => Math.max(1, ...cityRank.value.map(city => city.registered)));
const usage = computed(() => (data.value?.usage ?? []).map((item, index) => { const count = drillLevel.value !== 'province' && mapData.value?.vehicleTypes ? mapData.value.vehicleTypes[item.code] ?? 0 : item.count; return { ...item, count, percentage: summary.value.registered ? Math.round(count / summary.value.registered * 1000) / 10 : 0, color: appearancePalette(screenStyle.value)[index] }; }).filter(item => item.code !== 'OTHER' || item.count));
const matterPaths: Record<string, string> = { RISK_NOTICE: '/province/risk-notices', SUPERVISION: '/province/supervision', CROSS_CITY: '/province/collaboration', EMERGENCY: '/province/emergency' };
async function load() {
  if (!active || route.path !== '/province/cockpit') return;
  const current = ++generation; controller?.abort(); controller = new AbortController(); loading.value = true; error.value = ''; lastLoadAt = Date.now();
  try {
    const result = await api<ProvinceCockpitData>(`/dashboard/regulator/province-cockpit${cityCode.value ? `?cityCode=${encodeURIComponent(cityCode.value)}` : ''}`, { signal: controller.signal });
    if (current === generation) data.value = result;
  } catch (reason) { if (current === generation && !controller.signal.aborted) error.value = reason instanceof Error ? reason.message : '驾驶舱数据加载失败，请重试'; }
  finally { if (current === generation) loading.value = false; }
}
function chooseCity(code: string) { drill.chooseCity(code); }
function selectMap(value: { kind: string; id: string; raw: any }) { drill.drill(value.kind, value.id, value.raw); }
function selectPanel(value: { kind: string; id: string }) { drill.drill(value.kind, value.id, mapData.value?.vehicles.find(row => row.id === value.id) ?? mapData.value?.map.items.find(row => row.id === value.id)); }
function selectScope(id: string) { const kind = mapData.value?.distribution?.kind; if (kind) drill.drill(kind, id, mapData.value?.vehicles.find(row => row.id === id) ?? mapData.value?.map.items.find(row => row.id === id)); }
function selectCity(code: string) { chooseCity(code === 'ALL' ? '' : code); }
function openRisks() { void router.push({ path: '/province/risks', query: data.value?.scope.workspaceId ? { workspaceId: data.value.scope.workspaceId } : {} }); }
function openRisk(id: string) { void router.push({ path: '/province/search', query: { type: 'INCIDENT', eventType: 'ALERT', entityId: id } }); }
function openTask(item: { id: string; kind: string }) { void router.push({ path: matterPaths[item.kind] ?? '/province/supervision', query: { matterId: item.id } }); }
async function toggleFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.value?.requestFullscreen(); }
  catch { error.value = '浏览器未能进入全屏，可以使用 F11 或继续在当前窗口查看。'; }
}
function fullscreenChanged() { fullscreen.value = !!document.fullscreenElement; }
watch(cityCode, load, { immediate: true });
const refreshTimer = setInterval(() => { if (active && !document.hidden && !loading.value && Date.now() - lastLoadAt >= Number(screenStyle.value?.refreshSeconds ?? 30) * 1000) void load(); }, 1000);
const clockTimer = setInterval(() => { if (active) now.value = new Date(); }, 1000);
document.addEventListener('fullscreenchange', fullscreenChanged);
onDeactivated(() => { active = false; generation++; controller?.abort(); loading.value = false; });
onActivated(() => { active = true; if (!loading.value && Date.now() - lastLoadAt > 2000) void load(); });
onBeforeUnmount(() => { generation++; controller?.abort(); clearInterval(refreshTimer); clearInterval(clockTimer); document.removeEventListener('fullscreenchange', fullscreenChanged); });
</script>

<template>
  <main ref="root" class="province-cockpit" :class="{ 'pc-vehicle-view': vehicleMode }" :data-level="drillLevel" :style="screenVariables" :data-style-frame="screenStyle?.showFrame !== false" aria-label="省级驾驶舱">
    <header class="pc-titlebar">
      <div class="pc-title-left"><button type="button" aria-label="返回全省工作台" @click="router.push('/province/overview')"><ArrowLeft :size="17"/></button><span>省级监管<span class="pc-title-dot">/</span>全省态势</span></div>
      <h1>山东省无人车综合监管驾驶舱</h1>
      <div class="pc-title-actions"><time>{{ now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }}</time><button type="button" aria-label="大屏风格设置" @click="appearance.begin"><Settings2 :size="17"/></button><button type="button" :aria-label="fullscreen ? '退出全屏' : '进入全屏'" @click="toggleFullscreen"><component :is="fullscreen ? Minimize2 : Maximize2" :size="16"/></button></div>
    </header>
    <div v-if="error" class="pc-data-error" role="alert"><span>{{ error }}{{ data ? ` · 仍显示上次成功读取的${data.scope.name}数据` : '' }}</span><button type="button" @click="load">重试</button><button v-if="!data && cityCode" type="button" @click="chooseCity('')">返回全省</button></div>
    <div class="pc-stage">
      <ProvinceCockpitMap v-if="styleReady && mapData" :data="mapData" :appearance="screenStyle" :connected-cities="connectedCityCodes" @select="selectMap" @reset="chooseCity('')"/>
      <div v-else class="pc-map-state" role="status"><span>{{ styleSyncError || mapError || error || '正在读取共享风格与监管数据…' }}</span><button v-if="styleSyncError" type="button" @click="appearance.refresh">重试共享风格</button><button v-else-if="mapError" type="button" @click="drill.load">重试地图数据</button><button v-else-if="error" type="button" @click="load">重试监管数据</button></div>
      <div class="pc-map-scope"><span><MapPinned :size="14"/>当前范围</span><el-select :model-value="cityCode || 'ALL'" aria-label="选择监管地市" popper-class="pc-select-popper" @update:model-value="selectCity"><el-option label="山东省 · 全省" value="ALL"/><el-option v-for="city in data?.cities ?? []" :key="city.code" :label="`${city.name}${city.connected ? '' : ' · 未开通'}`" :value="city.code"/></el-select></div>
      <nav v-if="drillCrumbs.length > 1" class="pc-drill-nav" aria-label="当前地图层级"><button type="button" aria-label="返回上一级地图" @click="drill.back"><ArrowLeft :size="14"/></button><ol><li v-for="(crumb, index) in drillCrumbs" :key="index"><button v-if="index < drillCrumbs.length - 1" type="button" @click="drill.navigate(crumb.query)">{{ crumb.name }}</button><span v-else aria-current="page">{{ crumb.name }}</span></li></ol></nav>
      <div v-if="mapError" class="pc-map-business-error" role="alert">{{ mapError }}<button type="button" @click="drill.load">重试地图数据</button></div>
      <div v-if="data && !data.scope.connected" class="pc-not-connected" role="status">{{ scopeLabel }}尚未开通，暂无已接入的业务台账。<button type="button" @click="chooseCity('')">查看全省</button></div>
      <CockpitCityPanels v-if="mapData?.connected && styleReady && drillLevel !== 'province'" :city="mapData" @drill="selectPanel"/>
      <aside v-if="data && styleReady && drillLevel === 'province'" class="pc-side pc-left" aria-label="运行与规模">
        <ProvinceCockpitPanel title="运行总体态势" :icon="Gauge" :subtitle="scopeLabel">
          <div class="pc-operation-overview"><figure class="pc-online-ring" :aria-label="`上报在线率 ${fmt(summary.onlineRate)}%`"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="orbit" cx="80" cy="80" r="71"/><circle class="base" cx="80" cy="80" r="58"/><circle class="progress" cx="80" cy="80" r="58" pathLength="100" :stroke-dasharray="`${summary.onlineRate} 100`"/></svg><strong>{{ fmt(summary.onlineRate) }}<small>%</small></strong><span>上报在线率</span></figure><div class="pc-operation-states"><div><span><i/>上报在线</span><strong>{{ fmt(summary.online) }}<small>辆</small></strong></div><div><span><i class="muted"/>上报离线</span><strong>{{ fmt(summary.offline) }}<small>辆</small></strong></div><div><span><i class="cyan"/>上报运行</span><strong>{{ fmt(summary.running) }}<small>辆</small></strong></div></div></div>
          <div class="pc-panel-foot"><span>当日上报里程</span><strong>{{ fmt(summary.mileageToday) }}<small>km</small></strong></div>
        </ProvinceCockpitPanel>
        <ProvinceCockpitPanel :title="drillLevel === 'province' ? '地市车辆分布' : scopeTitle" :icon="MapPinned" :subtitle="drillLevel === 'province' ? `${data.coverage.connected} / ${data.coverage.total} 地市已开通` : scopeLabel">
          <div v-if="drillLevel === 'province'" class="pc-city-ranking"><button v-for="(city, index) in cityRank" :key="city.code" type="button" :class="{ selected: cityCode === city.code }" :aria-pressed="cityCode === city.code" @click="chooseCity(city.code)"><span class="pc-rank-index">{{ index + 1 }}</span><div><p><span>{{ city.name }}</span><strong>{{ city.registered.toLocaleString() }}<small>辆</small></strong></p><span class="pc-meter"><i :style="{ width: `${city.registered / rankMax * 100}%` }"/></span><small>上报在线率 {{ city.onlineRate }}%</small></div></button><p v-if="!cityRank.length" class="pc-empty">暂无已开通城市</p></div>
          <div v-else class="pc-city-ranking"><button v-for="(row, index) in scopeRows" :key="row.id" type="button" @click="selectScope(row.id)"><span class="pc-rank-index">{{ index + 1 }}</span><div><p><span>{{ row.name }}</span><strong>{{ row.count }}<small>辆</small></strong></p><span class="pc-meter"><i :style="{ width: `${row.count / scopeMax * 100}%` }"/></span><small>上报在线 {{ row.online }} 辆 · 点击下钻</small></div></button><p v-if="!scopeRows.length" class="pc-empty">当前区域暂无已接入对象</p></div>
          <div class="pc-panel-foot"><span>{{ drillLevel === 'province' ? '全省地市比较' : '按当前层级统计' }}</span><button v-if="cityCode" type="button" @click="chooseCity('')">取消地市筛选<ChevronRight :size="12"/></button><small v-else>点击地市联动查看</small></div>
        </ProvinceCockpitPanel>
        <ProvinceCockpitPanel title="车辆用途结构" :icon="Truck" subtitle="在册车辆">
          <div class="pc-usage-list"><div v-for="item in usage" :key="item.code" :style="{ '--usage-color': item.color }"><span><i/>{{ item.name }}</span><span class="pc-meter"><i :style="{ width: `${item.percentage}%` }"/></span><strong>{{ fmt(item.count) }}</strong><small>{{ data.scope.connected ? `${item.percentage}%` : '—' }}</small></div></div><p class="pc-inline-note">按车辆台账用途分类 · {{ scopeLabel }}</p>
        </ProvinceCockpitPanel>
      </aside>
      <aside v-if="data && styleReady && drillLevel === 'province'" class="pc-side pc-right" aria-label="风险与协同">
        <ProvinceCockpitPanel title="风险处置态势" :icon="ShieldAlert"><template #action><button type="button" class="pc-more" @click="openRisks">风险监测<ArrowUpRight :size="12"/></button></template>
          <div class="pc-risk-summary"><div><span>高及重大未闭环</span><strong>{{ fmt(detailScope ? mapData?.riskSnapshot?.alertHigh : data.risks.high) }}<small>条</small></strong></div><div><span>今日新增告警</span><strong>{{ fmt(detailScope ? mapData?.riskSnapshot?.alertToday : data.risks.today) }}<small>条</small></strong></div></div>
          <div v-if="!detailScope" class="pc-risk-levels" aria-label="未闭环风险等级分布"><div v-for="level in data.risks.levels" :key="level.code" :style="{ '--level-color': level.color }"><strong>{{ fmt(level.count) }}</strong><span class="pc-risk-bar"><i :style="{ height: `${Math.max(level.count ? 5 : 0, level.count / Math.max(1, data.risks.total) * 100)}%` }"/></span><small>{{ level.name }}风险</small></div></div>
          <div v-else class="pc-scope-risk-stats"><div v-for="([label, key]) in [['未处理告警', 'alertUnhandled'], ['离线异常', 'offlineAbnormal'], ['今日事故', 'accidents'], ['待处理违规', 'violations']]" :key="key"><span>{{ label }}</span><strong>{{ fmt(mapData?.riskSnapshot?.[key!]) }}</strong></div></div>
        </ProvinceCockpitPanel>
        <ProvinceCockpitPanel v-if="detailScope" title="待关注无人车" :icon="ShieldAlert" :subtitle="scopeLabel"><div class="pc-risk-list"><button v-for="item in mapData?.focusItems ?? []" :key="item.id" type="button" @click="drill.drill('vehicles', item.id, mapData?.vehicles.find(row => row.id === item.id))"><span class="pc-risk-badge">关注</span><div><strong>{{ item.businessNo }}</strong><p>{{ item.reason }}</p></div><ChevronRight :size="13"/></button><p v-if="!mapData?.focusItems?.length" class="pc-empty">当前区域暂无待关注车辆</p></div></ProvinceCockpitPanel>
        <ProvinceCockpitPanel v-else title="重点风险关注" :icon="ShieldAlert" subtitle="最新高及重大 · 前6条">
          <div class="pc-risk-list"><button v-for="item in data.risks.items" :key="item.id" type="button" @click="openRisk(item.id)"><span class="pc-risk-badge" :class="{ critical: item.level === 'CRITICAL' }">{{ item.level === 'CRITICAL' ? '重大' : '高' }}</span><div><strong>{{ item.title }}</strong><p>{{ item.cityName }}<span>{{ date(item.occurredAt) }}</span></p></div><ChevronRight :size="13"/></button><p v-if="!data.risks.items.length" class="pc-empty">{{ data.scope.connected ? '当前没有高或重大未闭环告警' : '暂无已接入风险数据' }}</p></div>
        </ProvinceCockpitPanel>
        <ProvinceCockpitPanel title="协同督办进度" :icon="ClipboardCheck" :subtitle="data.scope.name"><template #action><button type="button" class="pc-more" @click="router.push({ path: '/province/supervision', query: data?.scope.workspaceId ? { workspaceId: data.scope.workspaceId } : {} })">协同事项<ArrowUpRight :size="12"/></button></template>
          <div class="pc-collaboration"><div class="pc-collaboration-rate"><span>事项办结率</span><strong>{{ fmt(data.collaboration.completionRate) }}<small>%</small></strong><span class="pc-meter"><i :style="{ width: `${data.collaboration.completionRate}%` }"/></span></div><div class="pc-collaboration-states"><span>已办结<b>{{ fmt(data.collaboration.closed) }}</b></span><span>在办<b>{{ fmt(data.collaboration.open) }}</b></span><span class="warning">逾期<b>{{ fmt(data.collaboration.overdue) }}</b></span></div></div>
          <div class="pc-task-list"><button v-for="item in data.collaboration.items" :key="item.id" type="button" @click="openTask(item)"><span>{{ item.title }}</span><small :class="{ overdue: item.dueAt && new Date(item.dueAt) < now }">{{ item.dueAt ? date(item.dueAt) : '未设期限' }}</small><ChevronRight :size="12"/></button><p v-if="!data.collaboration.items.length" class="pc-empty">当前暂无在办协同事项</p></div>
        </ProvinceCockpitPanel>
      </aside>
    </div>
    <ProvinceAppearanceSettings :opened="styleOpened" :draft="styleDraft" :fields="styleFields" :builtins="styleBuiltins" :presets="stylePresets" :ready="styleReady" :loading="styleLoading" :busy="styleBusy" :can-edit="styleCanEdit" :feedback="styleFeedback" :sync-error="styleSyncError" @cancel="appearance.cancel" @change="appearance.change" @save="appearance.save" @save-preset="appearance.savePreset" @delete-preset="appearance.deletePreset" @retry="appearance.begin"/>
    <footer class="pc-bottom"><span><i/>每{{ vehicleMode ? 5 : screenStyle?.refreshSeconds ?? 30 }}秒刷新<span class="pc-footer-separator">|</span>数据时点 {{ data ? date(data.updatedAt) : '尚未读取' }}</span><span>上报状态不等同于实时探活<span class="pc-footer-separator">|</span>当日心跳 {{ date(data?.summary.telemetryAt) }}</span></footer>
  </main>
</template>
