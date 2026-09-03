<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { isAmapConfigured, loadAMap } from '../amap';
import { attachVehicleModel } from '../cockpitVehicleLayer';

export type CockpitMapItem = {
  id: string; name: string; count?: number; online?: number; running?: number;
  longitude?: number; latitude?: number; businessNo?: string; onlineStatus?: string;
  drivingState?: string; battery?: number | null; speed?: number; enterprise?: string;
  hasOrder?: boolean;
  polygon?: Array<{ longitude: number; latitude: number }>;
};
export type CockpitTrackPoint = { longitude: number; latitude: number; recordedAt: string; speed: number; heading?: number };
export type CockpitTrip = { startName: string; endName: string; startLng: number; startLat: number; endLng: number; endLat: number };

const props = defineProps<{
  kind: 'districts' | 'enterprises' | 'vehicles' | 'regions';
  items: CockpitMapItem[];
  track?: CockpitTrackPoint[];
  selectedId?: string;
  trip?: CockpitTrip | null;
}>();
const emit = defineEmits<{ select: [payload: { kind: string; id: string }] }>();
const container = ref<HTMLElement | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const modelState = ref<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
const message = ref('');
const map = shallowRef<any>(null);
const AMapRef = shallowRef<any>(null);
const overlays: any[] = [];
let resizeObserver: ResizeObserver | null = null;
let modelLayer: { remove: () => void } | null = null;
let modelToken = 0;
let lastSceneKey = '';
let aimedVehicle = '';

function sceneKey() {
  const track = props.track ?? [];
  const last = track[track.length - 1];
  return [
    props.kind,
    props.selectedId ?? '',
    props.items.map((item) => item.id).join(','),
    String(track.length),
    track[0] ? `${track[0].longitude.toFixed(5)},${track[0].latitude.toFixed(5)}` : '',
    last ? `${last.longitude.toFixed(5)},${last.latitude.toFixed(5)}` : '',
    props.trip?.endName ?? '',
  ].join('|');
}

function colorFor(item: CockpitMapItem) {
  if (item.hasOrder || item.drivingState === 'RUNNING') return '#17d6ff';
  if (item.onlineStatus === 'ONLINE' || (item.online ?? 0) > 0) return '#ffb340';
  return '#6b8094';
}

function clear() {
  modelToken += 1;
  modelState.value = 'idle';
  modelLayer?.remove();
  modelLayer = null;
  aimedVehicle = '';
  if (overlays.length && map.value) map.value.remove(overlays.splice(0));
}


function clusterNode(item: CockpitMapItem) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cockpit-cluster';
  el.style.setProperty('--dot', colorFor(item));
  const online = item.online ?? 0;
  const count = item.count ?? 0;
  const rate = count > 0 ? ((online / count) * 100).toFixed(1) : '—';
  el.innerHTML = `<strong>${count}</strong><span>${item.name}</span><span style="font-size:10px;color:var(--dot)">${rate}% 在线</span>`;
  el.addEventListener('click', () => emit('select', { kind: props.kind, id: item.id }));
  return el;
}

function vehicleNode(item: CockpitMapItem, plateOnly = false) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `cockpit-vehicle${props.selectedId === item.id ? ' is-selected' : ''}${plateOnly ? ' is-plate' : ''}`;
  el.style.setProperty('--dot', colorFor(item));
  el.setAttribute('aria-label', item.businessNo || item.name);
  el.innerHTML = plateOnly
    ? `<span>${(item.businessNo ?? item.name).replace('VEH-2026-', '#')}</span>`
    : `<i></i><span>${(item.businessNo ?? item.name).replace('VEH-2026-', '#')}</span>`;
  el.addEventListener('click', () => emit('select', { kind: 'vehicles', id: item.id }));
  return el;
}

async function renderDistricts() {
  const AMap = AMapRef.value;
  if (!AMap || !map.value) return;

  // 放所有区级 marker
  const markerList: any[] = [];
  for (const item of props.items) {
    if (!Number.isFinite(item.longitude) || !Number.isFinite(item.latitude)) continue;
    const marker = new AMap.Marker({
      position: [item.longitude, item.latitude],
      content: clusterNode(item),
      offset: new AMap.Pixel(-52, -42),
      zIndex: 90,
    });
    map.value.add(marker);
    overlays.push(marker);
    markerList.push(marker);
  }

  // setFitView 基于 marker 位置，留出两侧面板空间，zoom 11-12 恰好城区级别
  if (markerList.length) {
    map.value.setFitView(markerList, false, [80, 380, 80, 380], 12);
  }
}

function render() {
  if (!map.value || !AMapRef.value) return;
  const key = sceneKey();
  if (key === lastSceneKey) return;
  lastSceneKey = key;
  clear();

  if (props.kind === 'districts') {
    void renderDistricts();
    return;
  }

  if (props.kind === 'regions') {
    props.items.forEach((item) => {
      if (!item.polygon || item.polygon.length < 3) return;
      const polygon = new AMapRef.value.Polygon({
        path: item.polygon.map((p) => [p.longitude, p.latitude]),
        strokeColor: '#38bdf8', strokeWeight: 2, fillColor: '#0ea5e9', fillOpacity: 0.16, zIndex: 20,
      });
      polygon.on('click', () => emit('select', { kind: 'regions', id: item.id }));
      map.value.add(polygon); overlays.push(polygon);
    });
    const vis = overlays.filter((o) => o.getPath?.());
    if (vis.length) map.value.setFitView(vis, false, [80, 360, 80, 360], 12);
    return;
  }

  if (props.kind === 'vehicles') {
    const selected = props.items.find((item) => item.id === props.selectedId && Number.isFinite(item.longitude) && Number.isFinite(item.latitude));
    const single = Boolean(selected && props.items.length === 1);
    props.items.forEach((item) => {
      if (!Number.isFinite(item.longitude) || !Number.isFinite(item.latitude)) return;
      if (single && item.id === selected?.id) return;
      const marker = new AMapRef.value.Marker({
        position: [item.longitude, item.latitude],
        content: vehicleNode(item),
        offset: new AMapRef.value.Pixel(-16, -16),
        zIndex: props.selectedId === item.id ? 121 : 80,
      });
      map.value.add(marker); overlays.push(marker);
    });
    if (props.track && props.track.length > 1) {
      const line = new AMapRef.value.Polyline({
        path: props.track.map((p) => [p.longitude, p.latitude]),
        strokeColor: '#17d6ff',
        strokeWeight: 6,
        strokeOpacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
        geodesic: false,
        showDir: true,
        zIndex: 50,
      });
      map.value.add(line); overlays.push(line);
    }
    const trip = props.trip;
    if (trip && Number.isFinite(trip.startLng) && Number.isFinite(trip.endLng)) {
      const start = new AMapRef.value.Marker({
        position: [trip.startLng, trip.startLat],
        content: `<div class="cockpit-trip-pin start"><i></i><span>起 · ${trip.startName}</span></div>`,
        offset: new AMapRef.value.Pixel(-10, -28), zIndex: 100,
      });
      const end = new AMapRef.value.Marker({
        position: [trip.endLng, trip.endLat],
        content: `<div class="cockpit-trip-pin end"><i></i><span>终 · ${trip.endName}</span></div>`,
        offset: new AMapRef.value.Pixel(-10, -28), zIndex: 100,
      });
      map.value.add([start, end]); overlays.push(start, end);
    }
    if (selected) {
      const token = ++modelToken;
      modelState.value = 'loading';
      const running = Boolean(selected.hasOrder || selected.drivingState === 'RUNNING');
      const trackSamples = (props.track ?? []).map((point) => ({
        longitude: point.longitude,
        latitude: point.latitude,
        heading: Number.isFinite(point.heading) ? (point.heading as number) * Math.PI / 180 : undefined,
      }));
      const headingRad = Number.isFinite(trackSamples[0]?.heading)
        ? trackSamples[Math.min(trackSamples.length - 1, 1)]?.heading
        : undefined;
      void attachVehicleModel(AMapRef.value, map.value, selected.longitude!, selected.latitude!, {
        track: trackSamples,
        animate: running && trackSamples.length > 1,
        heading: headingRad,
      }).then((layer) => {
        if (token !== modelToken) { layer?.remove(); return; }
        modelLayer = layer;
        modelState.value = layer ? 'ready' : 'fallback';
        if (!layer && selected) {
          const marker = new AMapRef.value.Marker({
            position: [selected.longitude, selected.latitude],
            content: vehicleNode(selected),
            offset: new AMapRef.value.Pixel(-16, -16),
            zIndex: 121,
          });
          map.value.add(marker); overlays.push(marker);
        }
      }).catch(() => { modelState.value = 'fallback'; });
      if (single && aimedVehicle !== selected.id) {
        aimedVehicle = selected.id;
        map.value.setPitch(36);
        map.value.setZoomAndCenter(17.2, [selected.longitude, selected.latitude], false);
        return;
      }
      if (single) return;
    }
    const vis = overlays.filter((o) => o.getPosition?.() || o.getPath?.());
    if (vis.length) map.value.setFitView(vis, false, [80, 360, 80, 360], 17);
    return;
  }

  // enterprises
  props.items.forEach((item) => {
    if (!Number.isFinite(item.longitude) || !Number.isFinite(item.latitude)) return;
    const marker = new AMapRef.value.Marker({
      position: [item.longitude, item.latitude], content: clusterNode(item),
      offset: new AMapRef.value.Pixel(-52, -42), zIndex: 90,
    });
    map.value.add(marker); overlays.push(marker);
  });
  const vis = overlays.filter((o) => o.getPosition?.());
  if (vis.length) map.value.setFitView(vis, false, [80, 360, 80, 360], 12);
}

async function init() {
  if (!isAmapConfigured()) { state.value = 'error'; message.value = '地图配置缺失，请配置高德 Web 端 Key。'; return; }
  state.value = 'loading';
  try {
    const AMap = await loadAMap();
    await nextTick();
    if (!container.value) return;
    AMapRef.value = AMap;
    map.value = new AMap.Map(container.value, {
      viewMode: '3D',
      center: [120.15, 30.28],
      zoom: 10,
      pitch: 28,
      rotation: 0,
      mapStyle: 'amap://styles/dark',
      zooms: [7, 20],
      features: ['bg', 'point', 'road', 'building'],
      pitchEnable: true,
      rotateEnable: false,
      showLabel: true,
    });
    map.value.addControl(new AMap.Scale());
    map.value.addControl(new AMap.ToolBar({ position: { right: '12px', bottom: '24px' } }));
    map.value.on('complete', () => {
      map.value.setStatus({ showLabel: true });
      map.value.setFeatures(['bg', 'point', 'road', 'building']);
      state.value = 'ready';
      lastSceneKey = '';
      render();
    });
    if (typeof ResizeObserver !== 'undefined' && container.value) {
      resizeObserver = new ResizeObserver(() => map.value?.resize?.());
      resizeObserver.observe(container.value);
    }
  } catch (err) {
    state.value = 'error';
    message.value = err instanceof Error ? err.message : '高德地图加载失败';
  }
}

watch(() => [props.kind, props.selectedId, props.trip?.endName, props.items.map((item) => item.id).join(','), props.track?.length], () => {
  if (state.value === 'ready') render();
});
onMounted(init);
onUnmounted(() => {
  resizeObserver?.disconnect();
  clear();
  map.value?.destroy?.();
});
</script>
<template>
  <div class="cockpit-map" :data-map-state="state" :data-model-state="modelState">
    <div ref="container" class="cockpit-map-canvas" />
    <div v-if="state !== 'ready'" class="cockpit-map-state">{{ state === 'loading' ? '正在加载地图…' : message }}</div>
  </div>
</template>
