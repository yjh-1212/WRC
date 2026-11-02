<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Box, Compass, Globe2, Layers3, LocateFixed, Minus, Navigation, Orbit, Plus, Settings2 } from 'lucide-vue-next';
// @ts-ignore The rendering engine is isolated from Vue's reactive graph.
import { ThreeCockpitEngine } from '../three-map/ThreeCockpitEngine.js';
import type { CockpitSceneData, SceneSelection } from '../cockpit/types';
import { effectiveVisuals, isStale, reducedMotion, reportTime } from '../cockpit/visual-settings';
import CockpitVisualSettings from './CockpitVisualSettings.vue';
import '../three-map/three-map.css';

const props = defineProps<{ data: CockpitSceneData; selectedId?: string; hoveredId?: string; viewMode?: string; cityDrill?: any; metric?: string }>();
const emit = defineEmits<{ select: [value: SceneSelection]; drill: [value: SceneSelection]; hover: [value: string | null]; 'city-select': [value: any]; 'city-drill': [value: any]; ready: []; error: [value: string] }>();
const host = ref<HTMLElement>();
const sceneReady = ref(false), loading = ref(true), error = ref(''), notice = ref('');
const labels = ref<any[]>([]), tooltip = ref<any>(null), layersOpen = ref(false), orbiting = ref(false), tracking = ref(false);
const settingsOpen = ref(false);
const stats = ref({ fps: 0, calls: 0, attribution: '' });
const modelState = ref<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
const layerVisible = ref<Record<string, boolean>>({ admin: true, columns: true, routes: true, heat: true, labels: true, objects: true, track: true });
let engine: any, loadVersion = 0, engineKind = '', disposed = false, macroMemory: any;
const city = computed(() => props.data.scene.level === 'city');
const cityCaption = computed(() => props.cityDrill?.scope?.level === 'vehicle' ? '无人车三维监控' : props.cityDrill?.map?.kind === 'districts' ? '区县监管区域' : props.cityDrill?.map?.kind === 'enterprises' ? '运营公司分布' : '无人车分布');
const layerItems = computed(() => city.value ? [['objects', '车辆与聚合'], ['routes', '准行道路'], ['admin', '运营区域与围栏'], ['heat', '风险定位'], ['track', '车辆轨迹'], ['labels', '文字标注']] : [['admin', '行政区地图'], ['columns', '重点区域光柱'], ['routes', '示意关联飞线'], ['heat', '风险标记'], ['labels', '区域标注']]);
const track = computed<any[]>(() => props.cityDrill?.map?.track ?? []);
const replayIndex = ref(0), playing = ref(false), replayActive = ref(false), replaySpeed = ref(16);
let replayTimer: ReturnType<typeof setInterval> | undefined, replayTime = 0, replayLast = 0;
const trackTimestamp = (index: number) => new Date(track.value[index]?.recordedAt ?? track.value[index]?.timestamp ?? 0).getTime();
const activeVehicle = computed(() => props.cityDrill?.map?.items?.find((item: any) => item.id === props.selectedId && props.cityDrill?.map?.kind === 'vehicles') ?? props.data.map?.vehicles.find((item: any) => item.id === props.selectedId));
function pauseReplay() { playing.value = false; if (replayTimer) clearInterval(replayTimer); replayTimer = undefined; }
function exitReplay() { pauseReplay(); replayActive.value = false; replayIndex.value = 0; engine?.setTrackProgress(null); }
function seekReplay(event: Event) { pauseReplay(); replayIndex.value = Number((event.target as HTMLInputElement).value); replayActive.value = true; engine?.setTrackProgress(replayIndex.value); }
function toggleReplay() {
  if (playing.value) { pauseReplay(); return; }
  if (track.value.length < 2) return;
  if (replayIndex.value >= track.value.length - 1) replayIndex.value = 0;
  replayActive.value = true; playing.value = true;
  replayTime = trackTimestamp(replayIndex.value); replayLast = performance.now(); engine?.setTrackProgress(replayIndex.value);
  replayTimer = setInterval(() => {
    const now = performance.now(); replayTime += (now - replayLast) * replaySpeed.value; replayLast = now;
    while (replayIndex.value < track.value.length - 1 && trackTimestamp(replayIndex.value + 1) <= replayTime) replayIndex.value++;
    engine?.setTrackProgress(replayIndex.value);
    if (replayIndex.value >= track.value.length - 1) pauseReplay();
  }, 50);
}
function selection(item: any): SceneSelection {
  if (item.kind === 'city') return { kind: item.mapKind === 'vehicles' ? 'vehicle' : 'region', id: item.id, name: item.name, raw: { ...item.raw, kind: item.mapKind } };
  return { kind: 'region', id: item.id, code: item.code ?? item.id, name: item.name, connected: item.connected, raw: item.raw };
}
function selectItem(item: any, drill = false) {
  if (item.cluster || item.raw?.cluster) { engine?.activate(item); return; }
  if (!city.value && !drill) return;
  const value = selection(item);
  if (!city.value && drill) { emit('drill', value); return; }
  emit('select', value);
  if (drill) { if (item.kind === 'city') emit('city-drill', { kind: item.mapKind, id: item.id }); else emit('drill', value); }
}
function hoverLabel(item: any, event: Event) { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); engine?.setHover(item.id, { x: rect.left + rect.width / 2, y: rect.top }, item); }
function clearHover() { engine?.setHover(null); }
function toggleLayer(id: string) { layerVisible.value[id] = !layerVisible.value[id]; engine?.setLayerVisible(id, layerVisible.value[id]); }
function toggleFollow() { tracking.value = !tracking.value; engine?.follow(tracking.value ? props.selectedId : null); }
const tooltipStyle = computed(() => {
  if (!tooltip.value) return {};
  const width = host.value?.clientWidth ?? window.innerWidth, height = host.value?.clientHeight ?? window.innerHeight;
  return { left: `${Math.max(18, Math.min(width - 310, tooltip.value.x + 20))}px`, top: `${Math.max(140, Math.min(height - 290, tooltip.value.y - 100))}px` };
});
const number = (value: any) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN') : '—';
const tooltipTime = computed(() => tooltip.value?.raw?.reportedAt ?? tooltip.value?.raw?.recordedAt ?? tooltip.value?.raw?.heartbeatAt);
const tooltipEnterprise = computed(() => { const raw = tooltip.value?.raw; return raw?.enterpriseName ?? (typeof raw?.enterprise === 'string' ? raw.enterprise : raw?.enterprise?.name) ?? '—'; });
async function renderScene() {
  if (!host.value || disposed) return;
  const version = ++loadVersion; error.value = '';
  try {
    const kind = city.value ? 'amap' : 'three';
    if (engineKind !== kind || !engine) {
      if (engineKind === 'three' && engine) {
        if (engine.key) engine.cameraMemory.set(engine.key, { position: engine.camera.position.clone(), target: engine.controls.target.clone() });
        macroMemory = engine.cameraMemory;
      }
      engine?.dispose(); engine = null; engineKind = kind;
      loading.value = true; sceneReady.value = false; labels.value = []; tooltip.value = null; modelState.value = 'idle';
      const Engine = kind === 'amap'
        // @ts-ignore City JSAPI adapter shares the component event contract.
        ? (await import('../cockpit-map/AmapCityEngine.js')).AmapCityEngine : ThreeCockpitEngine;
      if (version !== loadVersion || disposed) return;
      engine = new Engine(host.value, callbacks());
      if (kind === 'three' && macroMemory) engine.cameraMemory = macroMemory;
      engine.setSettings(effectiveVisuals.value);
    }
    await engine.load(props.data, props.cityDrill, props.viewMode ?? 'overview');
    if (version !== loadVersion) return;
    engine.setMode(props.viewMode ?? 'overview', props.metric); engine.setSelected(props.selectedId ?? null, false);
  } catch (reason) { if (version !== loadVersion) return; error.value = reason instanceof Error ? reason.message : '地图加载失败'; loading.value = false; sceneReady.value = false; emit('error', error.value); }
}
function callbacks() {
  return {
    loading: () => { loading.value = true; sceneReady.value = false; notice.value = ''; labels.value = []; tracking.value = false; exitReplay(); },
    ready: () => { loading.value = false; sceneReady.value = true; emit('ready'); },
    labels: (value: any[]) => { labels.value = value; }, tooltip: (value: any) => { tooltip.value = value; },
    hover: (value: string | null) => emit('hover', value), select: (value: any) => selectItem(value), drill: (value: any) => selectItem(value, true),
    follow: (value: boolean) => { tracking.value = value; },
    modelState: (value: 'idle' | 'loading' | 'ready' | 'fallback') => { modelState.value = value; },
    notice: (value: string) => { notice.value = value; }, stats: (value: any) => { stats.value = value; },
  };
}
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const onMotion = (event: MediaQueryListEvent) => { reducedMotion.value = event.matches; };
onMounted(() => {
  void renderScene(); motionQuery.addEventListener('change', onMotion);
});
watch([() => props.data, () => props.cityDrill], renderScene);
watch([() => props.viewMode, () => props.metric], () => engine?.setMode(props.viewMode ?? 'overview', props.metric));
watch(() => props.selectedId, id => { engine?.setSelected(id ?? null, true); if (!id) { tracking.value = false; engine?.follow(null); } });
watch(() => props.hoveredId, id => engine?.setHover(id || null));
watch(effectiveVisuals, settings => engine?.setSettings(settings), { deep: true });
watch(track, exitReplay);
onBeforeUnmount(() => { disposed = true; loadVersion++; pauseReplay(); motionQuery.removeEventListener('change', onMotion); engine?.dispose(); });
</script>

<template>
  <div class="geo-map-shell three-map-shell" :class="{ 'is-city': city }" :data-engine="city ? 'amap' : 'three'" :data-ready="sceneReady" :data-level="data.scene.level" :data-mode="viewMode ?? 'overview'" :data-selected="selectedId ?? ''" :data-fps="stats.fps" :data-model-state="modelState">
    <div ref="host" class="geo-map-host three-map-host" />
    <div class="three-map-vignette" />
    <div class="three-scene-caption"><span>{{ city ? cityCaption : data.scene.level === 'province' ? '省域监管态势' : '全国运行态势' }}</span><small>{{ data.scene.regionName }} · {{ city ? '路网 / 车辆 / 运营区域' : '行政区划 / 运行规模 / 风险感知' }}</small></div>
    <div class="three-map-labels">
      <template v-for="label in labels" :key="label.id">
        <span v-if="label.context" class="three-context-label" :style="{ left: `${label.x}px`, top: `${label.y}px` }">{{ label.name }}</span>
        <button v-else class="three-node-label" :class="{ 'three-region-label': !city, selected: label.selected, hovered: label.hovered, 'is-cluster': label.cluster, 'is-major': label.raw?.summary?.majorEvents > 0 }" :style="{ left: `${label.x}px`, top: `${label.y}px` }" :aria-label="`${label.name}${label.mapKind === 'vehicles' && !label.cluster ? '车辆' : '区域'}`" @click.stop="selectItem(label)" @dblclick.stop="selectItem(label, true)" @mouseenter="hoverLabel(label, $event)" @mouseleave="clearHover" @focus="hoverLabel(label, $event)" @blur="clearHover">
          <i /><span>{{ label.name }}</span><b v-if="label.cluster">{{ label.count ?? label.members?.length }}</b><b v-else-if="label.selected && label.count != null">{{ number(label.count) }}</b>
        </button>
      </template>
    </div>
    <section v-if="tooltip && !loading" class="three-map-tooltip" :style="tooltipStyle" role="tooltip">
      <header>{{ tooltip.name }}</header>
      <dl v-if="tooltip.raw?.summary"><div><dt>在册车辆</dt><dd>{{ number(tooltip.raw.summary.registeredVehicles) }} <small>辆</small></dd></div><div><dt>在线车辆</dt><dd>{{ number(tooltip.raw.summary.onlineVehicles) }} <small>辆</small></dd></div><div><dt>运行车辆</dt><dd>{{ number(tooltip.raw.summary.runningVehicles) }} <small>辆</small></dd></div><div><dt>风险事件</dt><dd>{{ number(tooltip.raw.summary.riskEvents) }} <small>项</small></dd></div></dl>
      <dl v-else><div><dt>当前速度</dt><dd>{{ number(tooltip.raw?.speed) }} <small>km/h</small></dd></div><div><dt>剩余电量</dt><dd>{{ number(tooltip.raw?.battery) }} <small>%</small></dd></div><div><dt>运营主体</dt><dd>{{ tooltipEnterprise }}</dd></div></dl>
      <footer><span v-if="isStale(tooltipTime)" class="stale">上报延迟</span>{{ reportTime(tooltipTime) }}</footer>
      <small class="three-tooltip-hint">{{ city ? '单击查看详情 · 双击进入下一级' : tooltip.connected ? '双击进入下一级' : '该区域暂未接入下一级明细' }}</small>
    </section>
    <div v-if="loading || error" class="three-map-loading" :class="{ error }" role="status"><span v-if="loading" class="three-spinner" /><strong>{{ error ? '监管地图暂不可用' : city ? '正在加载高德城市地图' : '正在构建三维监管场景' }}</strong><small>{{ error || (city ? '加载城市路网与车辆数据…' : '加载行政区、纹理与监管数据…') }}</small><button v-if="error" @click="renderScene">重新加载</button></div>
    <div v-if="notice && !loading" class="three-map-notice">{{ notice }}</div>
    <nav class="three-map-toolbar" aria-label="三维地图工具">
      <button title="全览当前监管范围" aria-label="全览当前监管范围" @click="engine?.overview(); tracking = false"><Globe2 /></button>
      <button title="切换俯视视角" aria-label="切换俯视视角" @click="engine?.topDown()"><Box /></button>
      <button title="恢复正北方向" aria-label="恢复正北方向" @click="engine?.north()"><Compass /></button>
      <hr /><button title="放大" aria-label="放大" @click="engine?.zoom(1)"><Plus /></button><button title="缩小" aria-label="缩小" @click="engine?.zoom(-1)"><Minus /></button>
      <template v-if="city"><hr /><button title="跟随选中车辆" aria-label="跟随选中车辆" :disabled="!activeVehicle" :class="{ active: tracking }" @click="toggleFollow"><LocateFixed /></button></template>
      <button title="环绕当前区域" aria-label="环绕当前区域" :class="{ active: orbiting }" @click="orbiting = engine?.toggleOrbit()"><Orbit /></button>
      <hr /><button title="业务图层" aria-label="业务图层" :aria-expanded="layersOpen" :class="{ active: layersOpen }" @click="layersOpen = !layersOpen"><Layers3 /></button>
      <button title="显示设置" aria-label="显示设置" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen"><Settings2 /></button>
      <div v-if="settingsOpen" class="three-layer-menu three-settings-menu"><CockpitVisualSettings /></div>
      <div v-if="layersOpen" class="three-layer-menu"><strong>业务图层</strong><label v-for="[id, name] in layerItems" :key="id"><input type="checkbox" :checked="layerVisible[id!]" @change="toggleLayer(id!)" />{{ name }}</label></div>
    </nav>
    <div v-if="city && track.length > 1" class="three-replay"><button :aria-label="playing ? '暂停回放' : '轨迹回放'" @click="toggleReplay">{{ playing ? 'Ⅱ 暂停' : '▶ 回放' }}</button><input aria-label="轨迹回放进度" type="range" min="0" :max="track.length - 1" :value="replayIndex" @input="seekReplay" /><select v-model.number="replaySpeed" aria-label="回放倍速"><option v-for="speed in [1, 2, 4, 16, 64]" :key="speed" :value="speed">{{ speed }}×</option></select><time>{{ reportTime(track[replayIndex]?.recordedAt) }}</time><button v-if="replayActive" @click="exitReplay">结束回放</button></div>
    <div v-if="tracking" class="three-follow"><Navigation :size="13" />车辆跟随中<button @click="toggleFollow">退出跟随</button></div>
    <div class="three-map-footer"><span>{{ city ? stats.attribution : '行政区立体地图 · 双击下钻' }}</span><span>{{ city ? '高德地图' : 'THREE.JS' }}</span></div>
  </div>
</template>
