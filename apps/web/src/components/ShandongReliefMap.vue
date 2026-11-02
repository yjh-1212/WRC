<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { Compass, Layers, LocateFixed, Minus, Pause, Play, Plus, RefreshCw } from 'lucide-vue-next';
import type { ProvinceMapData } from '../cockpit/province-drill';
import type { CockpitAppearance } from '../cockpit/province-appearance';
import { loadGeo, createProjection, polygonParts } from '../three-map/geography.js';
import { ShandongReliefEngine } from '../cockpit/ShandongReliefEngine.js';
import '../cockpit/shandong-relief.css';

const props = defineProps<{ data: ProvinceMapData; appearance?: CockpitAppearance }>();
const emit = defineEmits<{ select: [value: { kind: string; id: string; raw: any }] }>();
const host = ref<HTMLElement>(), stage = ref<HTMLElement>(), state = ref('loading'), textureState = ref('loading'), error = ref(''), flat = ref(false), paused = ref(false);
const layers = ref({ texture: true, heat: true, objects: true, admin: true, labels: props.appearance?.labels !== false });
const anchors = ref<Array<{ id: string; x: number; y: number; visible: boolean }>>([]), hovered = ref(''), size = ref({ width: 1, height: 1 });
const geo = ref<any>();
let engine: any, observer: ResizeObserver | undefined, disposed = false, version = 0, active = true;
const valid = (row: any) => Number.isFinite(row.longitude) && Number.isFinite(row.latitude);
const labels = computed(() => {
  if (!layers.value.labels) return [];
  const positions = new Map(anchors.value.map(row => [row.id, row])), occupied: Array<{ x: number; y: number; width: number; height: number }> = [], result: any[] = [];
  const ordered = [...props.data.map.items].sort((a, b) => Number(b.id === hovered.value) - Number(a.id === hovered.value) || Number(b.connected) - Number(a.connected) || b.count - a.count);
  const side = size.value.width < 1100 ? 15 : size.value.width * Number(props.appearance?.panelWidth ?? 21.5) / 100 + 28;
  for (const city of ordered) {
    const point = positions.get(String(city.id)); if (!point?.visible) continue;
    const width = city.connected ? 102 : 58, height = city.connected ? 43 : 25, x = point.x, y = point.y - (city.connected ? 37 : 17);
    if (x - width / 2 < side || x + width / 2 > size.value.width - side || y < 120 || y + height > size.value.height - 115) continue;
    if (city.id !== hovered.value && occupied.some(row => Math.abs(row.x - x) < (row.width + width) / 2 + 4 && Math.abs(row.y - y) < (row.height + height) / 2 + 3)) continue;
    occupied.push({ x, y, width, height }); result.push({ ...city, x, y });
  }
  return result;
});
const flatPaths = computed(() => {
  if (!geo.value) return [];
  const projection = createProjection(geo.value.features, 100);
  return geo.value.features.map((feature: any) => ({ id: String(feature.properties.adcode), name: feature.properties.name,
    path: polygonParts(feature).map((polygon: any) => polygon.map((ring: number[][]) => ring.map((coord, index) => { const p = projection.project(...coord); return `${index ? 'L' : 'M'}${p.x},${p.z}`; }).join(' ') + ' Z').join(' ')).join(' ') }));
});
const recordedLocations = computed(() => props.data.vehicles.filter(valid).length);
function select(id: string) { const raw = props.data.map.items.find(row => row.id === id); if (raw) emit('select', { kind: 'cities', id, raw }); }
function flatAnchors() {
  if (!geo.value) return;
  const projection = createProjection(geo.value.features, 100), scale = Math.min(Math.max(200, size.value.width * (size.value.width < 1100 ? .8 : .5)) / 118, Math.max(200, size.value.height - 220) / 90);
  anchors.value = props.data.map.items.filter(valid).map(row => { const p = projection.project(row.longitude, row.latitude); return { id: String(row.id), x: size.value.width / 2 + p.x * scale, y: size.value.height * .55 + p.z * scale, visible: true }; });
}
function update() { engine?.setData(props.data); if (flat.value) flatAnchors(); }
function apply() { engine?.apply(props.appearance); layers.value.labels = props.appearance?.labels !== false; layers.value.admin = props.appearance?.boundaries !== false; }
function toggle(id: keyof typeof layers.value) { engine?.setLayer(id, layers.value[id]); }
function pause() { paused.value = !paused.value; engine?.setPaused(paused.value); }
async function load() {
  if (!host.value || disposed) return;
  const current = ++version; state.value = 'loading'; error.value = ''; flat.value = false; textureState.value = 'loading';
  try {
    const [boundaries, response] = await Promise.all([loadGeo('370000'), fetch('/map/shandong-relief/shandong-satellite.json')]);
    if (!response.ok) throw new Error('卫星影像坐标资料暂不可用');
    const atlas = await response.json(); if (disposed || current !== version) return; geo.value = boundaries;
    try {
      engine = new ShandongReliefEngine(host.value, boundaries, atlas, { anchors: (rows: typeof anchors.value) => { if (rows.length !== anchors.value.length || rows.some((row, index) => row.id !== anchors.value[index]?.id || Math.abs(row.x - anchors.value[index].x) > .5 || Math.abs(row.y - anchors.value[index].y) > .5 || row.visible !== anchors.value[index].visible)) anchors.value = rows; }, hover: (id: string) => { hovered.value = id; }, select: (value: { kind: string; id: string; raw: any }) => emit('select', value), texture: (value: string) => { textureState.value = value; }, error: (message: string) => { error.value = message; state.value = 'error'; } });
      engine.apply(props.appearance); engine.setData(props.data); engine.setPaused(paused.value); engine.setActive(active); engine.enter(); void engine.loadTexture();
    } catch { engine?.dispose(); engine = undefined; host.value.replaceChildren(); flat.value = true; textureState.value = 'unavailable'; flatAnchors(); }
    state.value = 'ready';
  } catch (reason) { if (!disposed && current === version) { state.value = 'error'; error.value = reason instanceof Error ? reason.message : '三维地图加载失败'; } }
}
function retry() { engine?.dispose(); engine = undefined; void load(); }
watch(() => props.data, update);
watch(() => props.appearance, apply, { deep: true });
onMounted(() => { observer = new ResizeObserver(() => { if (stage.value) { const box = stage.value.getBoundingClientRect(); size.value = { width: box.width, height: box.height }; if (flat.value) flatAnchors(); } }); if (stage.value) observer.observe(stage.value); void load(); });
onActivated(() => { active = true; engine?.setActive(true); engine?.resize(); });
onDeactivated(() => { active = false; engine?.setActive(false); });
onBeforeUnmount(() => { disposed = true; version++; observer?.disconnect(); engine?.dispose(); });
</script>

<template>
  <section ref="stage" class="pc-map pc-relief-map" :data-map-state="state" data-level="province" data-kind="cities" :data-city-count="data.map.items.length" :data-location-count="recordedLocations" :data-renderer="flat ? 'svg' : 'three'" :data-texture-state="textureState" :data-motion-paused="paused" aria-label="山东省三维监管总览">
    <div ref="host" class="pc-relief-engine"/>
    <svg v-if="flat" class="pc-relief-flat" viewBox="-59 -45 118 90" aria-label="山东省二维监管地图"><path v-for="city in flatPaths" :key="city.id" :d="city.path" fill-rule="evenodd" :aria-label="`查看${city.name}监管数据`" role="button" tabindex="0" @click="select(city.id)" @keydown.enter="select(city.id)"/></svg>
    <div class="pc-relief-labels"><button v-for="city in labels" :key="city.id" class="pc-relief-city" :class="{ connected: city.connected, hovered: city.id === hovered }" :data-city-code="city.id" :style="{ transform: `translate(${city.x}px,${city.y}px) translate(-50%,-50%)` }" :aria-label="`查看${city.name}监管数据`" @click="select(city.id)"><span>{{ city.name }}</span><small v-if="city.connected">在册 <b>{{ city.count }}</b> 辆</small></button></div>
    <div class="pc-map-controls pc-relief-controls"><span><Layers :size="14"/>三维图层</span><label><input v-model="layers.texture" type="checkbox" @change="toggle('texture')"/>卫星影像</label><label><input v-model="layers.heat" type="checkbox" @change="toggle('heat')"/>定位集聚</label><label><input v-model="layers.objects" type="checkbox" @change="toggle('objects')"/>定位与地市</label><label><input v-model="layers.admin" type="checkbox" @change="toggle('admin')"/>行政区界</label><label><input v-model="layers.labels" type="checkbox" @change="toggle('labels')"/>地市名称</label></div>
    <div class="pc-relief-motion"><button type="button" :aria-label="paused ? '继续地图动效' : '暂停地图动效'" :aria-pressed="paused" @click="pause"><Play v-if="paused" :size="15"/><Pause v-else :size="15"/>{{ paused ? '继续动效' : '暂停动效' }}</button><button type="button" aria-label="复位三维地图" @click="engine?.reset()"><LocateFixed :size="15"/>复位</button></div>
    <div class="pc-map-zoom pc-relief-zoom"><button type="button" aria-label="放大地图" @click="engine?.zoom(1)"><Plus :size="17"/></button><button type="button" aria-label="缩小地图" @click="engine?.zoom(-1)"><Minus :size="17"/></button></div>
    <div class="pc-relief-key"><span>定位集聚<i/>低—高</span><span>已上报定位 <b>{{ recordedLocations }}</b> 辆</span><span>点击地市 / 定位点下钻</span></div>
    <div class="pc-relief-attribution"><Compass :size="22"/><a v-if="textureState === 'ready'" href="https://www.amap.com/" target="_blank" rel="noopener noreferrer">© 高德地图 · 卫星影像</a><span v-else-if="textureState === 'error'">影像暂不可用 <button type="button" @click="textureState = 'loading';engine?.loadTexture()">重试影像</button></span><span v-else-if="flat">当前设备使用二维总览</span><span v-else>卫星影像加载中…</span></div>
    <p class="pc-relief-note">地市按台账汇总 · 定位以最后上报为准 · 拖动旋转 / 滚轮缩放</p>
    <div v-if="state === 'loading'" class="pc-map-state" role="status">正在构建山东省三维地图…</div>
    <div v-if="state === 'error'" class="pc-map-state" role="alert"><span>{{ error }}</span><button type="button" @click="retry"><RefreshCw :size="14"/>重试地图</button></div>
  </section>
</template>
