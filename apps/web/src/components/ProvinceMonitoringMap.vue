<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { LocateFixed, Minus, Plus, RefreshCw } from 'lucide-vue-next';
import { loadAMap } from '../amap';
import { loadShandongGeometry, restrictToShandong } from '../cockpit/shandong-map';
import { label, number, stamp } from '../province-monitoring';
import { useSessionStore } from '../stores/session';
const props = withDefaults(defineProps<{ points?: any[]; selectedId?: string; track?: any[]; cursorTime?: number; incidentAt?: number; maxGapSeconds?: number; maxCursorGapSeconds?: number; incident?: { longitude: number; latitude: number }; height?: string }>(), { points: () => [], track: () => [], height: '560px', maxGapSeconds:60, maxCursorGapSeconds:60 });
const emit = defineEmits<{ select: [id: string]; action: [kind: string, id: string] }>();
const host = ref<HTMLElement>(), state = ref('loading'), rendered = ref(false), error = ref('');
const session = useSessionStore();
let map: any, AMap: any, geometry: any, info: any, line: any, cursor: any, incident: any, cleanup: (() => void) | undefined, disposed = false, resize: ResizeObserver, frame = 0, trackKey = '', focused = '', generation = 0;
const markers = new Map<string, { marker: any; button: HTMLButtonElement; row: any }>();
const located = (row: any) => Number.isFinite(row?.realtimeStatus?.longitude ?? row?.longitude) && Number.isFinite(row?.realtimeStatus?.latitude ?? row?.latitude);
const position = (row: any) => [row.realtimeStatus?.longitude ?? row.longitude, row.realtimeStatus?.latitude ?? row.latitude];
function fit() {
  if (!map) return;
  if (line?.length) map.setFitView([...line, ...(incident ? [incident] : [])], true, [65, 50, 45, 45], 17);
  else if (incident && props.incident) map.setZoomAndCenter(13, position(props.incident), true);
  else if (geometry && host.value) {
    const width = host.value.clientWidth, height = host.value.clientHeight;
    map.setBounds(new AMap.Bounds(...geometry.bounds), true, [16, 40, 16, 16]);
    if (width > 80 && height > 100) {
      // Fill the available frame using a fractional zoom, rather than leaving
      // the spare space produced by the SDK's automatic bounds fitting.
      let southwest = map.lngLatToContainer(geometry.bounds[0]), northeast = map.lngLatToContainer(geometry.bounds[1]);
      const scale = Math.min((width - 32) / Math.max(1, Math.abs(northeast.x - southwest.x)), (height - 56) / Math.max(1, Math.abs(southwest.y - northeast.y)));
      map.setZoom(Math.max(6, Math.min(20, map.getZoom() + Math.log2(scale))), true);
      southwest = map.lngLatToContainer(geometry.bounds[0]); northeast = map.lngLatToContainer(geometry.bounds[1]);
      const center = map.containerToLngLat([(southwest.x + northeast.x) / 2, (southwest.y + northeast.y) / 2 + 12]);
      map.setCenter(center, true);
    }
  }
  focused = '';
}
function popup(row: any) {
  if (!map || !located(row)) return;
  info?.close(); const section = document.createElement('section'); section.className = 'pm-map-popup';
  const title = document.createElement('strong'); title.textContent = row.businessNo; const enterprise = document.createElement('span'); enterprise.textContent = row.enterprise?.name ?? row.enterprise ?? '';
  const state = document.createElement('span'); state.textContent = `${label(row.onlineStatus)} · ${number(row.realtimeStatus?.speed, ' km/h')}`;
  const time = document.createElement('small'); time.textContent = `最后上报 ${stamp(row.realtimeStatus?.heartbeatAt)}`;
  const actions = document.createElement('div');
  for (const [kind, name] of [['track', '实时跟踪'], ['archive', '车辆档案']]) { if (kind === 'track' && !session.user?.permissions.includes('dashboard:view') || kind === 'archive' && !session.user?.permissions.includes('archive:vehicle:read')) continue; const button = document.createElement('button'); button.type = 'button'; button.textContent = name!; button.addEventListener('click', () => emit('action', kind!, row.id)); actions.append(button); }
  const close = document.createElement('button'); close.className = 'pm-popup-close'; close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '关闭车辆信息'); close.addEventListener('click', () => info?.close()); section.append(close);
  section.append(title, enterprise, state, time, actions); info = new AMap.InfoWindow({ content: section, isCustom: true, offset: new AMap.Pixel(0, -20), anchor: 'bottom-center', autoMove: true, closeWhenClickMap: true }); info.open(map, position(row));
}
function focus(id: string, showInfo = true) { const row = props.points.find(row => row.id === id); if (!row || !map || !located(row)) return; focused = id; map.setZoomAndCenter(13, position(row), true); if (showInfo) popup(row); }
function draw() {
  if (!map || disposed) return;
  const groups = new Map<string, any[]>();
  for (const row of props.points.filter(located)) { const point = map.lngLatToContainer(position(row)); const key = row.id === props.selectedId || map.getZoom() >= 17 ? row.id : `cluster:${Math.floor(point.x / 44)}:${Math.floor(point.y / 44)}`; const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
  const rows = [...groups.entries()].map(([id, members]) => members.length === 1 ? members[0] : { id, cluster: true, count: members.length, longitude: members.reduce((sum, row) => sum + position(row)[0], 0) / members.length, latitude: members.reduce((sum, row) => sum + position(row)[1], 0) / members.length, riskCount: members.reduce((sum, row) => sum + (row.riskCount ?? 0), 0), onlineStatus: members.some(row => row.onlineStatus === 'ONLINE') ? 'ONLINE' : 'OFFLINE' });
  const ids = new Set(rows.map(row => row.id));
  for (const [id, entry] of markers) if (!ids.has(id)) { map.remove(entry.marker); markers.delete(id); }
  for (const row of rows) {
    let entry = markers.get(row.id);
    if (!entry) { const button = document.createElement('button'); button.type = 'button'; button.addEventListener('click', () => { const fresh = markers.get(row.id)?.row; if (!fresh) return; if (fresh.cluster) { map.setZoomAndCenter(Math.min(19, map.getZoom() + 2), position(fresh), true); return; } emit('select', fresh.id); popup(fresh); }); const marker = new AMap.Marker({ position: position(row), content: button, offset: new AMap.Pixel(-16, -16), zIndex: 110 }); map.add(marker); entry = { marker, button, row }; markers.set(row.id, entry); }
    entry.row = row;
    if (row.cluster) { entry.button.textContent = `${row.count}辆`; entry.button.setAttribute('aria-label', `${row.count}辆车辆聚合，点击放大`); } else { entry.button.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h11v12H3zM14 10h4l3 4v4h-7M5 18a2 2 0 1 0 4 0M15 18a2 2 0 1 0 4 0"/></svg>'; }
    entry.marker.setPosition(position(row)); entry.button.className = `pm-vehicle-marker ${row.cluster ? 'cluster' : ''} ${row.onlineStatus !== 'ONLINE' ? 'offline' : ''} ${row.riskCount > 0 ? 'warning' : ''} ${props.selectedId === row.id ? 'selected' : ''}`; if (!row.cluster) entry.button.setAttribute('aria-label', `定位车辆 ${row.businessNo}`);
  }
  const nextTrack = JSON.stringify([props.incidentAt,props.track.map(row => [row.id, row.longitude, row.latitude, row.recordedAt])]);
  if (nextTrack !== trackKey) {
    trackKey = nextTrack; if (line) map.remove(line); line = undefined;
    const rows=props.track.filter(located),segments:{path:number[][];after:boolean}[]=[];let segment:{path:number[][];after:boolean}|undefined;
    for(let i=1;i<rows.length;i++){
      const previous=rows[i-1],current=rows[i],a=position(previous),b=position(current),seconds=(Date.parse(current.recordedAt)-Date.parse(previous.recordedAt))/1000;
      const meters=Math.hypot((b[0]-a[0])*111320*Math.cos(b[1]*Math.PI/180),(b[1]-a[1])*110540);
      if(seconds<=0||seconds>props.maxGapSeconds||meters/seconds>40){segment=undefined;continue;}
      const after=!!props.incidentAt&&Date.parse(current.recordedAt)>props.incidentAt;
      if(!segment||segment.after!==after){segment={path:[a,b],after};segments.push(segment);}else segment.path.push(b);
    }
    if(segments.length){line=segments.map(s=>new AMap.Polyline({path:s.path,strokeColor:s.after?'#9569e5':'#2f6fed',strokeWeight:5,strokeOpacity:.9,strokeStyle:s.after?'dashed':'solid',strokeDasharray:[8,5],showDir:true,lineJoin:'round',zIndex:60}));map.add(line);}
    if (props.incident && located(props.incident)) { if (incident) map.remove(incident); const point = document.createElement('span'); point.className = 'pm-incident-pin'; point.textContent = '事发位置'; incident = new AMap.Marker({ content: point, position: position(props.incident), offset: new AMap.Pixel(-30, -26), zIndex: 120 }); map.add(incident); }
    fit();
  }
  seek();
}
function seek() {
  if (!map || !AMap) return;
  if (!props.track.length) { if (cursor) cursor.hide(); return; }
  const target = props.cursorTime ?? Date.parse(props.track[0]?.recordedAt), candidates = props.track.filter(located);
  const point = candidates.reduce((best, row) => Math.abs(Date.parse(row.recordedAt) - target) < Math.abs(Date.parse(best.recordedAt) - target) ? row : best, candidates[0]);
  if (!point || Math.abs(Date.parse(point.recordedAt) - target) > props.maxCursorGapSeconds*1000) { cursor?.hide(); return; }
  if (!cursor) { const dot = document.createElement('span'); dot.className = 'pm-track-cursor'; cursor = new AMap.Marker({ content: dot, position: position(point), offset: new AMap.Pixel(-7, -7), zIndex: 150 }); map.add(cursor); } else cursor.setPosition(position(point)); cursor.show();
}
async function init() {
  const current = ++generation; state.value = 'loading'; rendered.value = false; error.value = '';
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { [AMap, geometry] = await Promise.race([Promise.all([loadAMap(), loadShandongGeometry()]), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('地图服务连接超时，可重试地图或继续使用列表查询')), 15000); })]); clearTimeout(timeout); await nextTick(); if (disposed || current !== generation || !host.value) return;
    map = new AMap.Map(host.value, { center: [118.2, 36.5], zoom: 7, zooms: [6, 20], viewMode: '2D', mapStyle: 'amap://styles/normal', features: ['bg', 'road', 'point'], resizeEnable: true }); map.on('complete', () => { if (!disposed && current === generation) rendered.value = true; }); cleanup = restrictToShandong(map, geometry); map.on('moveend', schedule); map.on('zoomend', schedule); fit(); draw(); state.value = 'ready';
  } catch (reason) { clearTimeout(timeout); if (!disposed && current === generation) { state.value = 'error'; error.value = reason instanceof Error ? reason.message : '地图连接失败'; } }
}
function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); }
watch(() => [props.points, props.track, props.incident], schedule, { deep: false });
watch(() => props.cursorTime, seek);
watch(() => props.selectedId, id => { schedule(); if (id && id !== focused) focus(id); });
onMounted(() => { void init(); resize = new ResizeObserver(() => { map?.resize(); if (map && !focused && !line && !incident) fit(); }); if (host.value) resize.observe(host.value); });
onBeforeUnmount(() => { disposed = true; generation++; cancelAnimationFrame(frame); resize?.disconnect(); cleanup?.(); info?.close(); map?.destroy(); });
defineExpose({ focus, fit });
</script>
<template><div class="pm-map" :style="{ height }"><div ref="host" class="pm-map-canvas" :data-state="state" :data-rendered="rendered" aria-label="山东省车辆地图"/><div v-if="state === 'loading'" class="pm-map-note" role="status">正在连接地图…</div><div v-if="state === 'error'" class="pm-map-error" role="alert"><span>{{ error }}</span><el-button :icon="RefreshCw" @click="init">重试地图</el-button></div><div v-if="state === 'ready'" class="pm-map-tools"><button type="button" aria-label="放大地图" @click="map?.zoomIn()"><Plus :size="16"/></button><button type="button" aria-label="缩小地图" @click="map?.zoomOut()"><Minus :size="16"/></button><button type="button" aria-label="恢复地图范围" @click="fit"><LocateFixed :size="16"/></button></div><div v-if="!track.length" class="pm-map-legend"><span><i/>上报在线</span><span><i class="offline"/>离线</span><span><i class="warning"/>有待处理告警</span><small>点击车辆查看资料</small></div></div></template>
