<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Layers, LocateFixed, Minus, Navigation, Plus, RefreshCw } from 'lucide-vue-next';
// @ts-ignore Shared city operations engine is deliberately outside Vue reactivity.
import { AmapCityEngine } from '../cockpit-map/AmapCityEngine.js';
// @ts-ignore The SVG region overlay shares the native map projection.
import { ShandongRegionLayer } from '../cockpit/ShandongRegionLayer.js';
import type { CockpitAppearance } from '../cockpit/province-appearance';
import type { ProvinceMapData } from '../cockpit/province-drill';
import '../province-cockpit.css';
import ShandongReliefMap from './ShandongReliefMap.vue';
import VehicleStatusLegend from './VehicleStatusLegend.vue';
const props = defineProps<{ data: ProvinceMapData; appearance?: CockpitAppearance; rootLabel?: string; connectedCities?: string[] }>();
const emit = defineEmits<{ select: [value: { kind: string; id: string; raw: any }]; reset: [] }>();
const host = ref<HTMLElement>(), state = ref('loading'), error = ref(''), modelState = ref('idle'), history = ref(false), following = ref(false);
const basemapState = ref('loading');
const layers = ref({ objects: true, admin: true, regions: true, labels: true, track: true });
const vehicle = computed(() => props.data.level === 'vehicle' ? props.data.vehicles[0] : undefined);
const running = computed(() => vehicle.value?.onlineStatus === 'ONLINE' && vehicle.value?.drivingState === 'RUNNING');
const shownTrack = computed<any[]>(() => history.value ? props.data.map.track : running.value ? props.data.map.currentTrack?.length ? props.data.map.currentTrack : props.data.map.track : []);
const trackKind = computed(() => history.value ? 'history' : props.data.map.currentTrack?.length ? 'current' : 'recent');
let engine: any, disposed = false, generation = 0, style = '', roads: boolean | undefined, pendingPopup = '', popupId = '', info: any, popup: HTMLElement | undefined, facts: HTMLElement | undefined, hit: any;
let administrative: any, selectedVehicle = '', wasRunning = false;
let cameraSignature = '', zoomOffset = 0;
let cameraFrame = 0;
const valid = (value: any) => Number.isFinite(value?.longitude) && Number.isFinite(value?.latitude);
function sidePadding() { return window.innerWidth < 1100 ? 0 : host.value?.closest('.province-cockpit, .cockpit')?.querySelector('.pc-side, .cockpit-col')?.getBoundingClientRect().width ?? 360; }
function cameraData() {
  const points = props.data.map.items.filter(valid), selected = props.data.vehicles.find(row => row.id === props.data.scope.vehicle?.id);
  const regionPoints = (props.data.map.operationRegions ?? []).flatMap(area => Array.isArray(area.polygon) ? area.polygon.map((point: any) => Array.isArray(point) ? { longitude: point[0], latitude: point[1] } : point).filter(valid) : []);
  const positions = props.data.level === 'vehicle' && valid(selected) ? [selected!] : [...props.data.vehicles.filter(valid), ...points, ...regionPoints];
  const center: [number, number] = valid(selected) ? [selected!.longitude!, selected!.latitude!] : positions.length ? [positions.reduce((sum, row) => sum + row.longitude, 0) / positions.length, positions.reduce((sum, row) => sum + row.latitude, 0) / positions.length] : [118.15, 36.55];
  const bounds = positions.length > 1 ? [[Math.min(...positions.map(row => row.longitude)), Math.min(...positions.map(row => row.latitude))], [Math.max(...positions.map(row => row.longitude)), Math.max(...positions.map(row => row.latitude))]] : [[center[0] - .005, center[1] - .005], [center[0] + .005, center[1] + .005]];
  const risks = props.data.vehicles.filter(row => (row.highRisks ?? 0) > 0 && valid(row)).map(row => ({ id: row.id, vehicleId: row.id, businessNo: row.businessNo, name: `${row.businessNo} · 高及重大未闭环 ${row.highRisks} 条`, longitude: row.longitude, latitude: row.latitude, level: 'HIGH' }));
  return { scene: { level: 'city', provinceOps: true, viewMode: '2D', regionCode: props.data.cityCode ?? '370000', camera: { longitude: center[0], latitude: center[1] }, bounds, sidePadding: sidePadding(), mapStyle: String(props.appearance?.mapStyle ?? 'blue'), cameraStyle: { pitch: 0, rotation: 0, zoomOffset: 0 } }, map: { vehicles: props.data.vehicles, operationRegions: props.data.map.operationRegions ?? [], forbiddenRegions: [], electronicFences: [], roadRights: [] }, risks };
}
function select(value: any) {
  if (value.mapKind === 'vehicles' && props.data.level === 'vehicle' && value.id === props.data.scope.vehicle?.id) { resumeLive(); showInfo(value.id); return; }
  if (value.mapKind === 'vehicles') pendingPopup = value.id;
  emit('select', { kind: value.mapKind, id: value.id, raw: value.raw });
}
function closeInfo() { info?.close(); popupId = ''; }
function updateInfo() {
  if (!popupId || !engine?.map || !facts) return;
  const row = props.data.vehicles.find(item => item.id === popupId);
  if (!valid(row)) { closeInfo(); return; }
  const ctx = props.data.context;
  const timestamp = row!.locationTime ?? row!.heartbeatAt;
  const stale = !timestamp || Date.now() - new Date(timestamp).getTime() > 600000;
  const status = row!.onlineStatus === 'OFFLINE' ? '已离线' : stale ? '上报已超10分钟' : '上报在线';
  const entries = [['所属企业', row!.enterprise || ctx.enterprise || '—'], ['所属区县', row!.organization || ctx.organization || '—'], ['上报状态', status], ['行驶状态', ({ RUNNING: '运行中', IDLE: '临停', PARKED: '停驶', OFFLINE: '离线' } as Record<string, string>)[row!.drivingState ?? ''] ?? '—'], ['速度', row!.speed == null ? '—' : `${row!.speed} km/h`], ['电量', row!.battery == null ? '—' : `${row!.battery}%`], ['当日里程', row!.mileageToday == null ? '—' : `${row!.mileageToday} km`], ['最后定位', timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '暂无定位上报']];
  const children: HTMLElement[] = [];
  for (const [label, value] of entries) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label!; dd.textContent = value!; if (label === '上报状态' && stale) dd.classList.add('stale'); children.push(dt, dd); }
  facts.replaceChildren(...children);
  info?.setPosition([row!.longitude, row!.latitude]);
}
function showInfo(id: string) {
  const row = props.data.vehicles.find(item => item.id === id);
  if (!valid(row) || !engine?.AMap || !engine.map) return;
  if (!info) {
    popup = document.createElement('section'); popup.className = 'pc-vehicle-popup'; popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', '无人车信息');
    const header = document.createElement('header'), title = document.createElement('strong'), close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '关闭车辆信息'); close.addEventListener('click', closeInfo);
    header.append(title, close); facts = document.createElement('dl'); popup.append(header, facts);
    info = new engine.AMap.InfoWindow({ isCustom: true, content: popup, offset: new engine.AMap.Pixel(0, -48), anchor: 'bottom-center', autoMove: true, closeWhenClickMap: true });
    info.on('close', () => { popupId = ''; });
  }
  popup!.querySelector('strong')!.textContent = row!.businessNo || row!.name;
  popupId = id; updateInfo(); info.open(engine.map, [row!.longitude, row!.latitude]); popupId = id;
}
function syncHit() {
  const row = vehicle.value;
  if (!valid(row) || !engine?.AMap || !engine.map) { if (hit) { engine?.map?.remove(hit); hit = undefined; } return; }
  if (!hit) {
    const target = document.createElement('button'); target.type = 'button'; target.className = 'pc-car-hit'; target.setAttribute('aria-label', '点击无人车查看信息'); target.title = '点击无人车查看信息'; target.addEventListener('click', event => { event.stopPropagation(); if (vehicle.value) showInfo(vehicle.value.id); });
    hit = new engine.AMap.Marker({ content: target, position: [row!.longitude, row!.latitude], offset: new engine.AMap.Pixel(-42, -80), zIndex: 190, bubble: false }); engine.map.add(hit);
  } else hit.setPosition([row!.longitude, row!.latitude]);
}
async function render() {
  if (!host.value || disposed) return;
  if (props.data.level === 'province') { generation++; cancelAnimationFrame(cameraFrame); closeInfo(); engine?.setMotion(false); return; }
  await nextTick();
  const current = ++generation; error.value = '';
  try {
    if (!engine) engine = new AmapCityEngine(host.value, { loading: () => { if (!engine?.loaded) state.value = 'loading'; }, ready: () => { state.value = 'ready'; }, basemap: (value: string) => { basemapState.value = value; }, select, drill: select, modelState: (value: string) => { modelState.value = value; }, follow: (value: boolean) => { following.value = value; }, position: updateInfo });
    const data = cameraData();
    const drill = { ...props.data, context: { ...props.data.context, displayedTrackKind: trackKind.value }, map: { ...props.data.map, track: shownTrack.value, liveTracking: running.value && !history.value } };
    engine.map?.resize();
    await engine.load(data, drill, 'overview');
    if (disposed || current !== generation) return;
    engine.setMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    engine.setSelected(props.data.scope.vehicle?.id ?? null);
    const id = props.data.scope.vehicle?.id ?? '';
    if (running.value && !history.value && (id !== selectedVehicle || !wasRunning)) engine.follow(id);
    if ((!running.value || history.value) && following.value) engine.follow(null);
    selectedVehicle = id; wasRunning = running.value;
    applyAppearance(); syncHit(); updateInfo();
    if (pendingPopup && props.data.scope.vehicle?.id === pendingPopup) { const id = pendingPopup; pendingPopup = ''; showInfo(id); }
  } catch (reason) { if (!disposed && current === generation) { state.value = 'error'; error.value = reason instanceof Error ? reason.message : '地图加载失败'; } }
}
function applyAppearance() {
  if (!engine?.map || props.data.level === 'province') return;
  const next = String(props.appearance?.mapStyle ?? 'blue');
  if (!engine.flat && style && style !== next) engine.map.setMapStyle(`amap://styles/${next}`);
  style = next;
  if (!administrative && engine.shandong) administrative = new ShandongRegionLayer(engine.map, engine.shandong);
  administrative?.update({ ...props.appearance, map3d: false }, props.connectedCities, props.data.cityCode, layers.value.admin);
  engine.visibility.nodes = props.data.map.kind !== 'cities' || props.appearance?.cityMarkers !== false;
  engine.visibility.heat = props.appearance?.riskMarkers !== false;
  for (const [name, visible] of Object.entries(layers.value)) if (!['admin', 'regions'].includes(name)) engine.visibility[name] = visible;
  engine.visibility.admin = layers.value.regions;
  engine.applyVisibility(); engine.syncMarkers();
  const nextRoads = props.appearance?.showRoads !== false;
  if (!engine.flat && roads !== nextRoads) { engine.map.setFeatures(nextRoads ? ['bg', 'point', 'road'] : ['bg', 'point']); roads = nextRoads; }
  const camera = cameraData().scene.cameraStyle, signature = JSON.stringify(camera);
  engine.data.scene.cameraStyle = camera;
  if (!engine.flat && signature !== cameraSignature) {
    const changed = !!cameraSignature; cameraSignature = signature;
    engine.map.setPitch(camera.pitch, true); engine.map.setRotation(camera.rotation, true);
    if (changed && camera.zoomOffset !== zoomOffset) engine.map.setZoom(engine.map.getZoom() + camera.zoomOffset - zoomOffset, true);
    zoomOffset = camera.zoomOffset;
    cancelAnimationFrame(cameraFrame);
    cameraFrame = requestAnimationFrame(() => { if (disposed || !engine?.map || cameraSignature !== signature || props.data.level === 'province' || !host.value?.clientWidth || !host.value?.clientHeight) return; engine.map.setPitch(camera.pitch, true); engine.map.setRotation(camera.rotation, true); });
  }
}
function toggle(id: string) { if (props.data.level === 'province' || !host.value?.clientWidth || !host.value?.clientHeight) return; if (id === 'admin') administrative?.update({ ...props.appearance, map3d: false }, props.connectedCities, props.data.cityCode, layers.value.admin); else engine?.setLayerVisible(id === 'regions' ? 'admin' : id, layers.value[id as keyof typeof layers.value]); if (id === 'objects') { if (layers.value.objects) hit?.show(); else { hit?.hide(); closeInfo(); } } }
function follow() { if (vehicle.value) engine?.follow(following.value ? null : vehicle.value.id); }
function resumeLive() { history.value = false; if (running.value && vehicle.value) engine?.follow(vehicle.value.id); }
function resetView() { engine?.overview(); if (engine?.map && !engine.flat) { const camera = cameraData().scene.cameraStyle; engine.map.setPitch(camera.pitch, true); engine.map.setRotation(camera.rotation, true); } emit('reset'); }
async function retry() { closeInfo(); administrative?.dispose(); administrative = undefined; engine?.dispose(); engine = undefined; hit = undefined; info = undefined; style = ''; roads = undefined; cameraSignature = ''; zoomOffset = 0; selectedVehicle = ''; state.value = 'loading'; await render(); }
watch(() => props.data, () => { if (props.data.scope.vehicle?.id !== selectedVehicle) history.value = false; if (props.data.level !== 'vehicle') closeInfo(); void render(); });
watch(history, () => { if (history.value) engine?.follow(null); void render(); });
watch(() => [props.appearance?.labels, props.appearance?.boundaries], () => { layers.value.labels = props.appearance?.labels !== false; layers.value.admin = props.appearance?.boundaries !== false; toggle('labels'); toggle('admin'); }, { immediate: true });
watch(() => props.appearance?.panelWidth, async () => { await nextTick(); if (props.data.level !== 'province' && host.value?.clientWidth && host.value?.clientHeight && engine?.data) { engine.data.scene.sidePadding = sidePadding(); engine.overview(); } });
watch(() => props.appearance, async () => { applyAppearance(); await nextTick(); if (engine?.data) engine.data.scene.sidePadding = sidePadding(); }, { deep: true });
watch(() => props.connectedCities, applyAppearance);
onMounted(render);
onActivated(async () => { await nextTick(); if (props.data.level !== 'province' && host.value?.clientWidth && host.value?.clientHeight && engine?.map) { engine.map.resize(); engine.scheduleMarkers(); } });
onBeforeUnmount(() => { disposed = true; generation++; cancelAnimationFrame(cameraFrame); closeInfo(); administrative?.dispose(); engine?.dispose(); });
</script>
<template>
  <ShandongReliefMap v-if="data.level === 'province'" :data="data" :appearance="appearance" @select="value => emit('select', value)"/>
  <VehicleStatusLegend :vehicles="data.vehicles" :track="!!vehicle" :show-areas="data.level !== 'province'"/>
  <div ref="host" class="pc-map pc-native-map" :class="{ 'is-cached': data.level === 'province' }" :inert="data.level === 'province'" :aria-hidden="data.level === 'province'" data-view-mode="2D" :data-map-state="state" :data-basemap-state="basemapState" :data-model-state="modelState" :data-level="data.level === 'province' ? 'cached' : data.level" :data-kind="data.map.kind" aria-label="无人车二维运行地图"/>
  <template v-if="data.level !== 'province'">
  <span class="pc-basemap-attribution">底图 © 高德地图 · GCJ-02</span>
  <div class="pc-map-controls"><span><Layers :size="14"/>二维地图</span><label><input v-model="layers.objects" type="checkbox" @change="toggle('objects')"/>无人车与聚合</label><label><input v-model="layers.admin" type="checkbox" @change="toggle('admin')"/>行政区域</label><label><input v-model="layers.regions" type="checkbox" @change="toggle('regions')"/>运营区域</label><label v-if="vehicle"><input v-model="layers.track" type="checkbox" @change="toggle('track')"/>车辆轨迹</label></div>
  <div class="pc-map-zoom"><button type="button" aria-label="放大地图" @click="engine?.zoom(1)"><Plus :size="17"/></button><button type="button" aria-label="缩小地图" @click="engine?.zoom(-1)"><Minus :size="17"/></button><button type="button" :aria-label="`恢复${rootLabel ?? '全省'}视角`" @click="resetView"><LocateFixed :size="17"/></button><button v-if="vehicle" type="button" :aria-pressed="following" aria-label="跟随无人车" @click="follow"><Navigation :size="17"/></button></div>
  <div v-if="vehicle" class="pc-live-track-tools"><span><i/>{{ running && following ? '运行中 · 自动跟随' : running ? '运行中 · 每5秒更新' : '每5秒读取定位上报' }}</span><button type="button" :aria-pressed="!history" @click="resumeLive">实时跟踪</button><button v-if="data.map.track.length > 1" type="button" :aria-pressed="history" @click="history = true">最近历史轨迹</button><small v-if="shownTrack.length > 1">{{ trackKind === 'current' ? '当前行程' : trackKind === 'history' ? '历史轨迹' : '最近记录轨迹' }} · {{ shownTrack.length }} 个点</small><small v-else>点击无人车查看信息</small></div>
  <div v-if="state === 'loading'" class="pc-map-progress" role="status">正在连接地图底图…</div>
  <div v-else-if="state === 'ready' && basemapState !== 'ready'" class="pc-map-progress pc-basemap-progress" role="status"><span>{{ basemapState === 'slow' ? '道路底图加载较慢，点位与下钻可正常使用' : '正在加载道路底图…' }}</span><button v-if="basemapState === 'slow'" type="button" @click="retry">重试底图</button></div>
  <div v-if="state === 'error'" class="pc-map-state" role="alert"><span>{{ error }}</span><button type="button" @click="retry"><RefreshCw :size="13"/>重试地图</button></div>
  </template>
</template>
