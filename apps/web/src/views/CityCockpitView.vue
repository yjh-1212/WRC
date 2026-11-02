<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, MapPinned, Maximize2, Minimize2, RefreshCw } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import ProvinceCockpitMap from '../components/ProvinceCockpitMap.vue';
import CockpitCityPanels from '../components/CockpitCityPanels.vue';
import type { ProvinceMapData } from '../cockpit/province-drill';
import '../province-cockpit.css';
import '../city-cockpit.css';

type CityData = ProvinceMapData & { mapModes: { id: string; label: string }[]; riskSnapshot: Record<string, number> };
const route = useRoute(), router = useRouter(), session = useSessionStore(), root = ref<HTMLElement>();
const data = ref<CityData>(), error = ref(''), loading = ref(false), now = ref(new Date()), fullscreen = ref(false);
const appearance = { mapStyle: 'blue', showRoads: true, map3d: false, labels: true, boundaries: true };
const level = computed(() => route.query.vehicleId ? 'vehicle' : route.query.enterpriseId ? 'enterprise' : route.query.organizationId ? 'district' : 'city');
const cityName = computed(() => session.user?.workspace?.cityName ?? data.value?.cityName ?? '市级');
const scopeLabel = computed(() => data.value?.scope.vehicle?.businessNo ?? data.value?.scope.enterprise?.name ?? data.value?.scope.district?.name.replace(/交通运输局$/, '') ?? cityName.value);
const mapMode = computed(() => typeof route.query.mapMode === 'string' ? route.query.mapMode : 'situation');
const query = computed(() => {
  const values = new URLSearchParams({ level: level.value });
  for (const key of ['organizationId', 'enterpriseId', 'vehicleId', 'mapMode']) if (typeof route.query[key] === 'string') values.set(key, route.query[key] as string);
  return values.toString();
});
const crumbs = computed(() => {
  const result: { name: string; query: Record<string, string> }[] = [{ name: cityName.value, query: {} }];
  if (data.value?.scope.district && route.query.organizationId) result.push({ name: data.value.scope.district.name.replace(/交通运输局$/, ''), query: { organizationId: String(route.query.organizationId) } });
  if (data.value?.scope.enterprise && route.query.enterpriseId) result.push({ name: data.value.scope.enterprise.name, query: { ...(route.query.organizationId ? { organizationId: String(route.query.organizationId) } : {}), enterpriseId: String(route.query.enterpriseId) } });
  if (data.value?.scope.vehicle && route.query.vehicleId) result.push({ name: data.value.scope.vehicle.businessNo, query: { vehicleId: String(route.query.vehicleId), mapMode: 'vehicles' } });
  return result;
});
let generation = 0, controller: AbortController | undefined, lastRead = 0;
async function load() {
  if (route.path !== '/regulatory/cockpit') return;
  const current = ++generation; controller?.abort(); controller = new AbortController(); loading.value = true; error.value = ''; lastRead = Date.now();
  try { const result = await api<CityData>('/dashboard/regulator/cockpit?' + query.value, { signal: controller.signal }); if (current === generation) data.value = result; }
  catch (cause) { if (current === generation && !controller.signal.aborted) error.value = cause instanceof Error ? cause.message : '驾驶舱数据加载失败，请重试'; }
  finally { if (current === generation) loading.value = false; }
}
function navigate(values: Record<string, string>) { void router.replace({ path: '/regulatory/cockpit', query: values }); }
function reset() { navigate({}); }
function drill(item: { kind: string; id: string; raw?: any }) {
  const next: Record<string, string> = {};
  const organizationId = typeof route.query.organizationId === 'string' ? route.query.organizationId : '';
  const enterpriseId = typeof route.query.enterpriseId === 'string' ? route.query.enterpriseId : '';
  if (item.kind === 'districts') next.organizationId = item.id;
  else if (item.kind === 'enterprises') { if (organizationId) next.organizationId = organizationId; next.enterpriseId = item.id; }
  else if (item.kind === 'vehicles') {
    const point = item.raw ?? data.value?.vehicles.find(row => row.id === item.id);
    if (point?.organizationId || organizationId) next.organizationId = point?.organizationId ?? organizationId;
    if (point?.enterpriseId || enterpriseId) next.enterpriseId = point?.enterpriseId ?? enterpriseId;
    next.vehicleId = item.id; next.mapMode = 'vehicles';
  } else return;
  navigate(next);
}
function changeMode(value: string) { navigate({ ...Object.fromEntries(Object.entries(route.query).filter(([, item]) => typeof item === 'string')) as Record<string, string>, mapMode: value }); }
async function toggleFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.value?.requestFullscreen(); }
  catch { error.value = '浏览器暂不支持全屏，可继续在当前窗口查看'; }
}
function fullscreenChanged() { fullscreen.value = !!document.fullscreenElement; }
watch(query, load, { immediate: true });
document.addEventListener('fullscreenchange', fullscreenChanged);
const timer = setInterval(() => { now.value = new Date(); if (!document.hidden && !loading.value && Date.now() - lastRead >= (level.value === 'vehicle' ? 5000 : 30000)) void load(); }, 1000);
onBeforeUnmount(() => { generation++; controller?.abort(); clearInterval(timer); document.removeEventListener('fullscreenchange', fullscreenChanged); });
</script>

<template>
  <main ref="root" class="province-cockpit city-cockpit" :class="{ 'pc-vehicle-view': level === 'vehicle' }" :data-level="data?.level ?? level" aria-label="市级驾驶舱">
    <header class="pc-titlebar">
      <div class="pc-title-left"><button type="button" aria-label="返回监管工作台" @click="router.push('/regulatory/overview')"><ArrowLeft :size="17" /></button><span>市级监管<span class="pc-title-dot">/</span>{{ cityName }}</span></div>
      <h1>{{ cityName }}无人车综合监管驾驶舱</h1>
      <div class="pc-title-actions"><time>{{ now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }}</time><button type="button" aria-label="刷新驾驶舱" :disabled="loading" @click="load"><RefreshCw :size="16" /></button><button type="button" :aria-label="fullscreen ? '退出全屏' : '进入全屏'" @click="toggleFullscreen"><component :is="fullscreen ? Minimize2 : Maximize2" :size="16" /></button></div>
    </header>
    <div v-if="error" class="pc-data-error" role="alert"><span>{{ error }}{{ data ? ' · 当前保留上次成功读取的数据' : '' }}</span><button type="button" @click="load">重试</button><button type="button" @click="reset">返回全市</button></div>
    <div class="pc-stage">
      <ProvinceCockpitMap v-if="data" :data="data" :appearance="appearance" :root-label="cityName" @select="drill" @reset="reset" />
      <div v-else class="pc-map-state" role="status"><span>{{ error || '正在读取本市监管数据…' }}</span><button v-if="error" type="button" @click="load">重新加载</button></div>
      <div class="pc-map-scope"><span><MapPinned :size="14" />当前范围</span><strong :title="scopeLabel">{{ scopeLabel }}</strong></div>
      <nav v-if="crumbs.length > 1" class="pc-drill-nav" aria-label="当前地图层级"><button type="button" aria-label="返回上一级地图" @click="navigate(crumbs[Math.max(0, crumbs.length - 2)]!.query)"><ArrowLeft :size="14" /></button><ol><li v-for="(crumb, index) in crumbs" :key="index"><button v-if="index < crumbs.length - 1" type="button" @click="navigate(crumb.query)">{{ crumb.name }}</button><span v-else aria-current="page">{{ crumb.name }}</span></li></ol></nav>
      <div v-if="data?.mapModes?.length && level !== 'vehicle'" class="city-map-modes" role="group" aria-label="地图统计视图"><button v-for="mode in data.mapModes" :key="mode.id" type="button" :class="{ active: mapMode === mode.id }" :aria-pressed="mapMode === mode.id" @click="changeMode(mode.id)">{{ mode.label }}</button></div>
      <CockpitCityPanels v-if="data" :city="data" @drill="drill" />
      <span v-if="loading && data" class="city-map-refresh" role="status">正在读取最新上报…</span>
    </div>
    <footer class="pc-bottom"><span>● 每{{ level === 'vehicle' ? 5 : 30 }}秒刷新 <i/>数据时点 {{ data?.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—' }}</span><span>上报状态不等同于实时探活</span></footer>
  </main>
</template>
