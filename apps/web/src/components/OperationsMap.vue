<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { AlertTriangle, MapPinned, RefreshCw } from 'lucide-vue-next';
import { isAmapConfigured, loadAMap } from '../amap';
import type { ElectronicFenceItem, OperationPoint, OperationRegionItem, RiskPoint, TrackPoint } from '../types';

const props = withDefaults(defineProps<{
  points?: OperationPoint[]; track?: TrackPoint[]; regions?: OperationRegionItem[]; fences?: ElectronicFenceItem[]; riskPoints?: RiskPoint[];
  monitoring?: boolean; selectedId?: string; mode?: 'dashboard' | 'realtime' | 'distribution' | 'trajectory' | 'regions' | 'fences' | 'risk';
  displayLayer?: 'scatter' | 'cluster' | 'heat'; groupBy?: 'enterprise' | 'organization' | 'none'; height?: string;
}>(), { points: () => [], track: () => [], regions: () => [], fences: () => [], riskPoints: () => [], selectedId: '', mode: 'realtime', displayLayer: 'scatter', groupBy: 'none', height: '560px' });
const emit = defineEmits<{ select: [id: string]; action: [type: 'monitor' | 'trajectory' | 'archive' | 'alerts', id: string]; regionSelect: [id: string]; fenceSelect: [id: string]; polygonDrawn: [points: Array<{ longitude: number; latitude: number }>]; ready: [] }>();
const container = ref<HTMLElement | null>(null); const state = ref<'loading' | 'ready' | 'error'>('loading'); const message = ref('');
const mapComplete = ref(false);
const authWarning = ref(false);
const originalConsoleError = console.error;
const map = shallowRef<any>(null); const AMapRef = shallowRef<any>(null); const overlays: any[] = []; const cluster = shallowRef<any>(null); const heatmap = shallowRef<any>(null); const movingMarker = shallowRef<any>(null); const mouseTool = shallowRef<any>(null);
let replayFrame=0,replayElapsed=0,replayClock=0,replayPaused=false;
function cancelReplay(){if(replayFrame)cancelAnimationFrame(replayFrame);replayFrame=0}
let renderFrame = 0; let fittedMode = ''; let lastDashboardMode = '';
let controlsInstalled = false;
let resizeObserver: ResizeObserver | null = null;
let disposed = false; let generation = 0; let resizeFrame = 0;
let regionDrawing=false,regionDraft:Array<{longitude:number;latitude:number}>=[],regionPreview:any=null,previousDoubleClickZoom=true;
function regionCoordinate(event:MouseEvent){const rect=container.value?.getBoundingClientRect();if(!rect||!map.value||!AMapRef.value)return null;const point=map.value.containerToLngLat(new AMapRef.value.Pixel(event.clientX-rect.left,event.clientY-rect.top));return {longitude:point.getLng(),latitude:point.getLat()}}
function addRegionVertex(event:MouseEvent){
  if(!regionDrawing||(event.target as HTMLElement)?.closest?.('.amap-controls,.amap-logo,.amap-copyright'))return;
  const point=regionCoordinate(event);if(!point)return;const last=regionDraft.at(-1);if(last&&Math.abs(last.longitude-point.longitude)<1e-8&&Math.abs(last.latitude-point.latitude)<1e-8)return;
  regionDraft.push(point);if(regionPreview)map.value.remove(regionPreview);
  const path=regionDraft.map(p=>[p.longitude,p.latitude]),style={path,strokeColor:'#3268f6',strokeWeight:3,fillColor:'#6a9fff',fillOpacity:.12,zIndex:95,bubble:true};
  regionPreview=regionDraft.length>=3?new AMapRef.value.Polygon(style):new AMapRef.value.Polyline(style);map.value.add(regionPreview);
}
function finishRegionDrawing(event:MouseEvent){if(!regionDrawing)return;event.preventDefault();event.stopPropagation();addRegionVertex(event);if(regionDraft.length<3)return;const points=regionDraft.map(p=>({...p}));cancelPolygonDraw();emit('polygonDrawn',points)}
function startRegionDrawing(){
  if(!map.value||!AMapRef.value||state.value!=='ready'||!container.value)return false;
  cancelPolygonDraw();regionDrawing=true;regionDraft=[];previousDoubleClickZoom=map.value.getStatus?.().doubleClickZoom??true;map.value.setStatus({doubleClickZoom:false});container.value.style.cursor='crosshair';
  container.value.addEventListener('click',addRegionVertex,true);container.value.addEventListener('dblclick',finishRegionDrawing,true);return true;
}
function hasMapSize() { return Boolean(container.value && container.value.clientWidth > 0 && container.value.clientHeight > 0); }
function initialRegionView(){
  if(!['regions','fences'].includes(props.mode)&&!props.monitoring||!container.value)return null;
  const points=props.mode==='fences'?props.fences.flatMap(f=>f.polygon):props.monitoring?props.points.filter(p=>p.realtimeStatus&&p.health?.locationValid!==false).map(p=>p.realtimeStatus!):props.regions.flatMap(region=>region.polygon);if(!points.length)return null;
  const west=Math.min(...points.map(p=>p.longitude)),east=Math.max(...points.map(p=>p.longitude)),south=Math.min(...points.map(p=>p.latitude)),north=Math.max(...points.map(p=>p.latitude));
  const mercator=(latitude:number)=>Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,latitude))*Math.PI/360));
  const dx=Math.max((east-west)/360,1e-9),dy=Math.max((mercator(north)-mercator(south))/(2*Math.PI),1e-9);
  const zoom=Math.max(8,Math.min(15,Math.log2(Math.max(100,container.value.clientWidth-128)/(256*dx)),Math.log2(Math.max(100,container.value.clientHeight-128)/(256*dy))));
  return {center:[(west+east)/2,(south+north)/2],zoom:Math.floor(zoom*100)/100};
}
function resizeMap() {
  if (disposed || resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    // Hidden/collapsed containers have no valid map projection bounds.
    if (!disposed && map.value && hasMapSize()) map.value.resize?.();
  });
}

function statusColor(point: OperationPoint) {
  if(props.monitoring)return point.onlineStatus!=='ONLINE'?'#98a6ba':point.realtimeStatus?.drivingState==='RUNNING'?'#3268f6':'#18b985';
  if (point.attentionLevel === 'CRITICAL') return '#D92D20';
  if (point.attentionLevel === 'HIGH' || point.attentionLevel === 'MEDIUM') return '#F79009';
  if (point.onlineStatus !== 'ONLINE') return '#98A2B3';
  if ((point.realtimeStatus?.battery ?? 100) < 25) return '#F79009';
  if (point.realtimeStatus?.drivingState === 'RUNNING') return '#2563EB';
  return '#12B76A';
}
function isDashboardDot() { return props.mode === 'dashboard'; }
function markerOffset() {
  return isDashboardDot() ? new AMapRef.value.Pixel(-8, -8) : new AMapRef.value.Pixel(-14, -14);
}
function markerNode(point: OperationPoint) {
  const pulse = isDashboardDot() && point.attentionLevel === 'CRITICAL';
  const root = document.createElement('button');
  root.type = 'button';
  root.className = `operation-marker${props.selectedId === point.id ? ' selected' : ''}${isDashboardDot() ? ' round' : ''}${pulse ? ' pulse' : ''}`;
  root.style.setProperty('--marker-color', statusColor(point));
  root.setAttribute('aria-label', `${point.name}，${point.onlineStatus === 'ONLINE' ? '在线' : '离线'}`);
  if(props.monitoring){root.classList.add('monitor-map-car');if(point.currentAlert||point.onlineStatus==='ONLINE'&&point.attentionLevel&&point.attentionLevel!=='NORMAL')root.classList.add('has-anomaly');root.setAttribute('aria-pressed',String(props.selectedId===point.id));}
  const dot = document.createElement('span'); dot.className = 'operation-marker-dot';if(props.monitoring){dot.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 17H3V9l3-5h12l3 5v8h-2M5 17h14M5 10h14M6 4l-1 6m13-6 1 6"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>';}
  const label = document.createElement('span'); label.className = 'operation-marker-label'; label.textContent = props.monitoring?point.name:point.businessNo.replace('VEH-2026-', '#');
  root.append(dot, label); root.addEventListener('click', () => selectPoint(point)); return root;
}
function infoNode(point: OperationPoint) {
  const box = document.createElement('div'); box.className = 'operation-map-info';
  const title = document.createElement('strong'); title.textContent = point.name;
  const meta = document.createElement('span'); meta.textContent = `${point.businessNo} · ${point.enterprise.name}`;
  const data = document.createElement('div'); data.className = 'operation-map-info-data'; data.textContent = `${point.model?.name ?? '车型未登记'}　${point.realtimeStatus?.speed ?? 0} km/h　${point.realtimeStatus?.battery ?? '--'}%　${stateText(point.realtimeStatus?.drivingState)}　${point.realtimeStatus?.autonomousState ?? '—'}`;
  const heartbeat = document.createElement('small'); heartbeat.textContent = `最后上报：${point.realtimeStatus?.heartbeatAt ? new Date(point.realtimeStatus.heartbeatAt).toLocaleString('zh-CN') : '暂无'}${point.currentAlert ? ` · 当前告警：${point.currentAlert.title}` : ''}`;
  const actions = document.createElement('div'); actions.className = 'operation-map-info-actions';
  ([['monitor', '实时监控'], ['trajectory', '轨迹'], ['archive', '档案'], ['alerts', '告警']] as const).forEach(([type, label]) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', (event) => { event.stopPropagation(); emit('action', type, point.id); map.value?.clearInfoWindow?.(); }); actions.append(button);
  });
  box.append(title, meta, data, heartbeat, actions); return box;
}
function stateText(value?: string) { return ({ RUNNING: '运行中', IDLE: '临停', PARKED: '停驶', OFFLINE: '离线' } as Record<string, string>)[value ?? ''] ?? '未知'; }
function selectPoint(point: OperationPoint) {
  emit('select', point.id);
  if (!map.value || !AMapRef.value || !point.realtimeStatus || isDashboardDot() || props.monitoring) return;
  const info = new AMapRef.value.InfoWindow({ content: infoNode(point), anchor: 'bottom-center', offset: new AMapRef.value.Pixel(0, -18), autoMove: true, closeWhenClickMap: true });
  info.open(map.value, [point.realtimeStatus.longitude, point.realtimeStatus.latitude]);
}
function clearBusinessLayers() {
  cancelReplay();
  if (cluster.value) { cluster.value.setMap?.(null); cluster.value = null; }
  if (heatmap.value) { heatmap.value.setMap?.(null); heatmap.value = null; }
  if (overlays.length && map.value) map.value.remove(overlays.splice(0));
  movingMarker.value = null;
}
function renderRegions() {
  if (!map.value || !AMapRef.value) return;
  props.regions.forEach((region) => {
    if (region.polygon.length < 3) return;
    const polygon = new AMapRef.value.Polygon({ path: region.polygon.map((p) => [p.longitude, p.latitude]), strokeColor: props.selectedId === region.id || region.status === 'ACTIVE' ? '#3268f6' : '#9aabc0', strokeWeight: props.mode === 'regions' || props.monitoring ? 3 : 1.5, strokeOpacity: .9, fillColor: region.status === 'ACTIVE' ? '#7aa7d1' : '#d4d4d8', fillOpacity: props.mode === 'regions' ? .12 : .08, zIndex: 20 });
    polygon.on('click', () => emit('regionSelect', region.id)); map.value.add(polygon); overlays.push(polygon);
  });
}
function fenceColor(type: string) { return ({ NO_ENTRY: '#dc2626', SPEED_LIMIT: '#d97706', OPERATION: '#315f91', TEMPORARY: '#7c3aed' } as Record<string, string>)[type] ?? '#52525b'; }
function renderFences() {
  if (!map.value || !AMapRef.value) return;
  props.fences.forEach((fence) => {
    if (fence.polygon.length < 3) return;
    const selected = props.selectedId === fence.id; const color = fenceColor(fence.fenceType);
    const polygon = new AMapRef.value.Polygon({ path: fence.polygon.map((p) => [p.longitude, p.latitude]), strokeColor: color, strokeWeight: selected ? 4 : 2.5, strokeOpacity: fence.active ? 1 : .55, strokeStyle: fence.active ? 'solid' : 'dashed', fillColor: color, fillOpacity: selected ? .07 : fence.active ? .05 : .02, zIndex: selected ? 75 : 45, extData: { id: fence.id } });
    polygon.on('click', () => emit('fenceSelect', fence.id)); map.value.add(polygon); overlays.push(polygon);
  });
}
function renderTrack() {
  if (!map.value || !AMapRef.value || !props.track.length) return;
  const track = performanceTrack();
  const path = track.map((point) => [point.longitude, point.latitude]);
  drawTrackPath(path, track);
  // Preserve original coordinates; a corrected visual route must never replace evidence.
}
function drawTrackPath(path: number[][], track: typeof props.track) {
  if (!map.value || !AMapRef.value) return;
  const segments:number[][][]=[];let segment:number[][]=[];
  path.forEach((p,i)=>{const gap=i>0?(+new Date(track[i].recordedAt)-+new Date(track[i-1].recordedAt))/1000:0;const jump=i>0?Math.hypot((p[0]-path[i-1][0])*85000,(p[1]-path[i-1][1])*111000):0;if(i>0&&(gap>300||gap>0&&jump/gap>60)){segments.push(segment);segment=[]}segment.push(p)});if(segment.length)segments.push(segment);
  const lines=segments.map(points=>new AMapRef.value.Polyline({path:points,strokeColor:'#3268f6',strokeWeight:4,strokeOpacity:.9,lineJoin:'round',showDir:true,zIndex:60}));
  lines.forEach(line=>{map.value.add(line);overlays.push(line)});
  track.filter((point) => point.pointType !== 'NORMAL').forEach((point) => {
    const node = document.createElement('span'); node.className = `track-event ${point.pointType.toLowerCase()}`; node.title = point.pointType === 'STOP' ? '停留点' : '轨迹事件';
    const marker = new AMapRef.value.Marker({ position: [point.longitude, point.latitude], content: node, offset: new AMapRef.value.Pixel(-7, -7), zIndex: 75 });
    map.value.add(marker); overlays.push(marker);
  });
  const car = document.createElement('span'); car.className = 'moving-vehicle'; car.textContent = '●';
  movingMarker.value = new AMapRef.value.Marker({ position: path[0], content: car, offset: new AMapRef.value.Pixel(-12, -12), angle: track[0].heading, zIndex: 90 });
  map.value.add(movingMarker.value); overlays.push(movingMarker.value); map.value.setFitView(lines, true, [72, 72, 72, 72], 16);
}
async function snapTrackToRoad(track: typeof props.track) {
  const instance = map.value;
  if (track.length < 2) return;
  try {
    const AMap = await loadAMap(['AMap.GraspRoad']);
    if (disposed || !instance || map.value !== instance) return;
    AMapRef.value = AMap;
  } catch {
    return;
  }
  if (!AMapRef.value?.GraspRoad) return;
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 1600);
    try {
      const grasp = new AMapRef.value.GraspRoad();
      const first = Math.floor(new Date(track[0].recordedAt).getTime() / 1000);
      grasp.driving(track.map((point, index) => ({
        x: point.longitude, y: point.latitude, ag: point.heading, sp: point.speed,
        tm: index === 0 ? first : Math.max(1, Math.floor(new Date(point.recordedAt).getTime() / 1000) - first),
      })), (error: unknown, result: { data?: { points?: Array<{ x: number; y: number }> } }) => {
        window.clearTimeout(timer);
        const snapped = result?.data?.points?.map((point) => [point.x, point.y]) ?? [];
        if (!error && snapped.length >= 2 && !disposed && map.value === instance && props.mode === 'trajectory') {
          clearBusinessLayers();
          drawTrackPath(snapped, track);
        }
        resolve();
      });
    } catch {
      window.clearTimeout(timer);
      resolve();
    }
  });
}
function dashboardZoomMode(zoom: number) {
  if (zoom < 11) return 'cluster';
  if (zoom < 14 && props.groupBy !== 'none') return 'group';
  return 'marker';
}
function clusterNode(count: number, hasRisk: boolean) {
  const root = document.createElement('button'); root.type = 'button'; root.className = `operation-cluster${hasRisk ? ' risk' : ''}`;
  root.setAttribute('aria-label', `${count} 辆车辆聚合`); root.textContent = String(count); return root;
}
function setMarkerLayer(marker: any, zIndex: number) {
  if (typeof marker?.setzIndex === 'function') marker.setzIndex(zIndex);
  else if (typeof marker?.setZIndex === 'function') marker.setZIndex(zIndex);
  else marker?.setOptions?.({ zIndex });
}
function groupNode(name: string, count: number, hasRisk: boolean) {
  const root = document.createElement('button'); root.type = 'button'; root.className = `operation-group${hasRisk ? ' risk' : ''}`;
  const shortName = name.replace(/有限公司|股份有限公司|科技|智能|配送/g, '').replace(/[()（）\s]/g, '') || name;
  const labelText = shortName.slice(0, 8);
  root.setAttribute('aria-label', `${name} ${count} 辆`);
  root.title = `${name} · ${count} 辆`;
  const label = document.createElement('strong'); label.textContent = labelText;
  const badge = document.createElement('span'); badge.textContent = String(count);
  root.append(label, badge); return root;
}
function renderDashboardPoints() {
  if (!map.value || !AMapRef.value) return;
  const points = [...props.points.filter((item) => item.realtimeStatus)].sort((a, b) => {
    const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, NORMAL: 1 } as Record<string, number>;
    return (rank[a.attentionLevel ?? 'NORMAL'] ?? 0) - (rank[b.attentionLevel ?? 'NORMAL'] ?? 0);
  });
  const zoom = map.value.getZoom?.() ?? 12;
  const mode = dashboardZoomMode(zoom);
  lastDashboardMode = mode;
  if (mode === 'cluster' && AMapRef.value.MarkerCluster) {
    cluster.value = new AMapRef.value.MarkerCluster(map.value, points.map((item) => ({ lnglat: [item.realtimeStatus!.longitude, item.realtimeStatus!.latitude], weight: item.attentionLevel === 'CRITICAL' ? 10 : item.attentionLevel === 'HIGH' ? 5 : 1, point: item })), {
      gridSize: 70, maxZoom: 10, averageCenter: true, clusterByZoomChange: true,
      renderClusterMarker: (context: any) => {
        const marker = context.marker;
        if (!marker) return;
        const list = context.clusterData ?? context.data ?? [];
        const hasRisk = list.some((item: any) => ['CRITICAL', 'HIGH'].includes(item.point?.attentionLevel));
        marker.setContent?.(clusterNode(context.count, hasRisk));
        marker.setOffset?.(new AMapRef.value.Pixel(-18, -18));
        setMarkerLayer(marker, hasRisk ? 90 : 60);
      },
      renderMarker: (context: any) => {
        const marker = context.marker;
        if (!marker) return;
        const position = marker.getPosition?.();
        const point = context.data?.point ?? points.find((item) => Math.abs(item.realtimeStatus!.longitude - Number(position?.lng ?? position?.getLng?.())) < .000001 && Math.abs(item.realtimeStatus!.latitude - Number(position?.lat ?? position?.getLat?.())) < .000001);
        if (!point) return;
        marker.setContent?.(markerNode(point));
        marker.setOffset?.(markerOffset());
        marker.setTitle?.(point.name);
        setMarkerLayer(marker, point.attentionLevel === 'CRITICAL' ? 110 : point.attentionLevel === 'HIGH' ? 95 : 70);
        marker.on?.('click', () => selectPoint(point));
      },
    });
    return;
  }
  if (mode === 'group') {
    const groups = new Map<string, { name: string; points: typeof points }>();
    points.forEach((item) => {
      const key = props.groupBy === 'organization' ? item.organizationId : item.enterpriseId;
      const name = props.groupBy === 'organization' ? item.organization.name : item.enterprise.name;
      const group = groups.get(key) ?? { name, points: [] };
      group.points.push(item); groups.set(key, group);
    });
    groups.forEach((group) => {
      const lng = group.points.reduce((sum, item) => sum + item.realtimeStatus!.longitude, 0) / group.points.length;
      const lat = group.points.reduce((sum, item) => sum + item.realtimeStatus!.latitude, 0) / group.points.length;
      const hasRisk = group.points.some((item) => item.attentionLevel === 'CRITICAL' || item.attentionLevel === 'HIGH');
      const marker = new AMapRef.value.Marker({ position: [lng, lat], content: groupNode(group.name, group.points.length, hasRisk), offset: new AMapRef.value.Pixel(0, 0), anchor: 'center', zIndex: hasRisk ? 88 : 55 });
      marker.on('click', () => map.value.setZoomAndCenter(14.5, [lng, lat], true));
      map.value.add(marker); overlays.push(marker);
    });
    return;
  }
  points.forEach((point) => {
    const marker = new AMapRef.value.Marker({
      position: [point.realtimeStatus!.longitude, point.realtimeStatus!.latitude], content: markerNode(point),
      offset: markerOffset(), title: point.name,
      zIndex: props.selectedId === point.id ? 120 : point.attentionLevel === 'CRITICAL' ? 110 : point.attentionLevel === 'HIGH' ? 95 : 70,
    });
    marker.on('click', () => selectPoint(point)); map.value.add(marker); overlays.push(marker);
  });
}
function renderAccidentMarkers() {
  if (!map.value || !AMapRef.value) return;
  props.riskPoints.filter((item) => item.kind === 'ACCIDENT' || item.level === 'CRITICAL').forEach((item) => {
    const node = document.createElement('button'); node.type = 'button'; node.className = `risk-marker ${item.kind.toLowerCase()}`; node.title = item.title; node.setAttribute('aria-label', `事故位置：${item.title}`);
    const marker = new AMapRef.value.Marker({ position: [item.longitude, item.latitude], content: node, offset: new AMapRef.value.Pixel(-9, -9), zIndex: 125 });
    map.value.add(marker); overlays.push(marker);
  });
}
function renderPoints() {
  if (!map.value || !AMapRef.value) return;
  const points = props.points.filter((item) => item.realtimeStatus && (!props.monitoring || item.health?.locationValid!==false));
  if (props.mode === 'dashboard') {
    renderDashboardPoints();
    if (props.riskPoints.length) renderAccidentMarkers();
    return;
  }
  if (props.mode === 'distribution' && props.displayLayer === 'heat' && AMapRef.value.HeatMap) {
    heatmap.value = new AMapRef.value.HeatMap(map.value, { radius: 34, opacity: [.18, .78], zooms: [8, 19], zIndex: 45 });
    heatmap.value.setDataSet({ max: 10, data: points.map((item) => ({ lng: item.realtimeStatus!.longitude, lat: item.realtimeStatus!.latitude, count: item.realtimeStatus?.drivingState === 'RUNNING' ? 10 : item.onlineStatus === 'ONLINE' ? 6 : 2 })) }); return;
  }
  if (props.mode === 'distribution' && props.displayLayer === 'cluster' && AMapRef.value.MarkerCluster) {
    cluster.value = new AMapRef.value.MarkerCluster(map.value, points.map((item) => ({ lnglat: [item.realtimeStatus!.longitude, item.realtimeStatus!.latitude], weight: item.realtimeStatus?.drivingState === 'RUNNING' ? 2 : 1, id: item.id })), { gridSize: 62, maxZoom: 16, averageCenter: true }); return;
  }
  points.forEach((point) => {
    const marker = new AMapRef.value.Marker({ position: [point.realtimeStatus!.longitude, point.realtimeStatus!.latitude], content: markerNode(point), offset: new AMapRef.value.Pixel(-14, -14), title: point.name, zIndex: props.selectedId === point.id ? 100 : 70 });
    map.value.add(marker); overlays.push(marker);
  });
}
function renderRiskPoints() {
  if (!map.value || !AMapRef.value || !props.riskPoints.length) return;
  if (AMapRef.value.HeatMap) {
    heatmap.value = new AMapRef.value.HeatMap(map.value, { radius: 42, opacity: [.2, .82], zooms: [8, 19], zIndex: 42 });
    heatmap.value.setDataSet({ max: 10, data: props.riskPoints.map((item) => ({ lng: item.longitude, lat: item.latitude, count: item.weight })) });
  }
  props.riskPoints.filter((item) => item.kind === 'ACCIDENT' || item.level === 'CRITICAL').forEach((item) => {
    const node = document.createElement('button'); node.type = 'button'; node.className = `risk-marker ${item.kind.toLowerCase()}`; node.title = item.title; node.setAttribute('aria-label', `${item.kind === 'ACCIDENT' ? '事故' : '高风险事件'}：${item.title}`);
    const marker = new AMapRef.value.Marker({ position: [item.longitude, item.latitude], content: node, offset: new AMapRef.value.Pixel(-9, -9), zIndex: 85 });
    map.value.add(marker); overlays.push(marker);
  });
}
function render() {
  if (disposed || !map.value || !hasMapSize()) return;
  try {
    clearBusinessLayers();
    if (props.mode === 'fences') { renderRegions(); renderFences(); }
    else if (props.mode !== 'risk') { renderRegions(); if (props.fences.length) renderFences(); }
    if (props.mode === 'trajectory') renderTrack();
    else if (props.mode === 'risk') renderRiskPoints();
    else renderPoints();
    const visible = overlays.filter((item) => item.getPosition?.() || item.getPath?.());
    const shouldFit = visible.length && !['dashboard', 'realtime', 'distribution'].includes(props.mode);
    if (shouldFit && fittedMode !== props.mode) {
      map.value.setFitView(visible, true, [64, 64, 64, 64], 15);
      fittedMode = props.mode;
    }
  } catch (error) {
    state.value = 'error';
    message.value = error instanceof Error ? error.message : '地图图层渲染失败';
  }
}
function performanceTrack() {
  const maxPoints = 1200;
  if (props.track.length <= maxPoints) return props.track;
  const step = Math.ceil(props.track.length / maxPoints);
  return props.track.filter((point, index) => index === 0 || index === props.track.length - 1 || point.pointType !== 'NORMAL' || index % step === 0);
}
function scheduleRender() {
  if (disposed) return;
  if (renderFrame) cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); });
}
function handleZoomEnd() {
  const zoom = map.value?.getZoom?.() ?? 12;
  container.value?.classList.toggle('compact-map-labels', isDashboardDot() || zoom < 12);
  if (props.mode === 'dashboard' && state.value === 'ready') {
    const nextMode = dashboardZoomMode(zoom);
    if (nextMode !== lastDashboardMode) {
      lastDashboardMode = nextMode;
      if (nextMode === 'cluster' && !AMapRef.value?.MarkerCluster) {
        void loadAMap(['AMap.MarkerCluster']).then((AMap) => { if (disposed || !map.value) return; AMapRef.value = AMap; scheduleRender(); }).catch(() => scheduleRender());
      } else scheduleRender();
    }
  }
}
function revealMap() {
  if (state.value === 'ready') { render(); return; }
  state.value = 'ready';
  emit('ready');
  render();
}
function handleMapComplete() { mapComplete.value = true; revealMap(); }
function deferredPlugins() {
  const plugins = ['AMap.Scale'];
  if (props.mode !== 'dashboard') plugins.push('AMap.ToolBar');
  if (props.mode === 'distribution' && props.displayLayer === 'cluster') plugins.push('AMap.MarkerCluster');
  if ((props.mode === 'distribution' && props.displayLayer === 'heat') || props.mode === 'risk') plugins.push('AMap.HeatMap');

  return [...new Set(plugins)];
}
async function installDeferredFeatures() {
  const instance = map.value;
  try {
    const AMap = await loadAMap(deferredPlugins());
    if (disposed || !instance || map.value !== instance) return;
    AMapRef.value = AMap;
    if (!controlsInstalled) {
      map.value.addControl(new AMap.Scale());
      if (props.mode !== 'dashboard') map.value.addControl(new AMap.ToolBar({ position: { right: '12px', top: '72px' } }));
      controlsInstalled = true;
    }
    if (props.mode === 'fences' && AMap.MouseTool && !mouseTool.value) {
      mouseTool.value = new AMap.MouseTool(map.value);
      mouseTool.value.on('draw', handleFenceDraw);
    }
    scheduleRender();
  } catch {
    // 基础地图已经可用；可选插件失败时保留当前点位/矢量降级展示。
  }
}
async function init() {
  const attempt = ++generation;
  if (!isAmapConfigured()) { state.value = 'error'; message.value = '地图配置缺失，请在本地环境变量中配置高德 Web 端 Key 与安全密钥。'; return; }
  state.value = 'loading'; message.value = '';
  mapComplete.value = false;
  try {
    const AMap = await loadAMap();
    await nextTick();
    if (disposed || attempt !== generation || !container.value) return;
    if (!hasMapSize()) {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => { if (!disposed && attempt === generation && hasMapSize()) { resizeObserver?.disconnect(); void init(); } });
      resizeObserver.observe(container.value);
      return;
    }
    if (map.value) {
      cancelPolygonDraw();
      clearBusinessLayers();
      map.value.off('complete', handleMapComplete); map.value.off('zoomend', handleZoomEnd);
      map.value.destroy(); controlsInstalled = false;
    }
    AMapRef.value = AMap;
    const regionView=initialRegionView();
    fittedMode = regionView ? props.mode : '';
    const usePitch = props.mode === 'realtime' && !props.monitoring;
    map.value = new AMap.Map(container.value, {
      viewMode: usePitch ? '3D' : '2D',
      center: regionView?.center??[117.000923, 36.675807],
      zoom: regionView?.zoom??11,
      pitch: usePitch ? 28 : 0,
      rotation: 0,
      mapStyle: 'amap://styles/whitesmoke',
      zooms: [8, 19],
      animateEnable: false,
      jogEnable: false,
      rotateEnable: false,
      pitchEnable: usePitch,
      showBuildingBlock: false,
      showIndoorMap: false,
      isHotspot: false,
      features: usePitch ? ['bg', 'point', 'road', 'building'] : ['bg', 'point', 'road'],
      showLabel: true,
    });
    map.value.on('complete', handleMapComplete);
    map.value.on('zoomend', handleZoomEnd);
    resizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'undefined' && container.value) {
      resizeObserver = new ResizeObserver(resizeMap);
      resizeObserver.observe(container.value);
    }
    await nextTick();
    if (disposed || attempt !== generation) return;
    resizeMap();
    void installDeferredFeatures();
  } catch (error) { if (!disposed && attempt === generation) { state.value = 'error'; message.value = error instanceof Error ? error.message : '高德地图加载失败'; } }
}
async function playTrack() {
  if(props.monitoring){replayElapsed=0;replayPaused=false;replayClock=performance.now();runReplay();return}
  if (!movingMarker.value || !AMapRef.value || props.track.length < 2) return;
  try { AMapRef.value = await loadAMap(['AMap.MoveAnimation']); } catch { return; }
  if (!map.value || !movingMarker.value) return;
  const track = performanceTrack(); movingMarker.value.stopMove?.(); movingMarker.value.setPosition([track[0].longitude, track[0].latitude]);
  movingMarker.value.moveAlong(track.map((point, index) => ({ position: new AMapRef.value.LngLat(point.longitude, point.latitude), duration: index === 0 ? 0 : 220 })), { autoRotation: true });
}
function runReplay(){
  cancelReplay();const points=performanceTrack();if(!points.length||!movingMarker.value)return;const start=+new Date(points[0].recordedAt),end=+new Date(points.at(-1)!.recordedAt);
  const tick=(now:number)=>{if(disposed||!movingMarker.value||replayPaused)return;replayElapsed+=(now-replayClock)*64;replayClock=now;const at=Math.min(end,start+replayElapsed);let i=0;while(i<points.length-1&&+new Date(points[i+1].recordedAt)<=at)i++;const a=points[i],b=points[i+1];let lng=a.longitude,lat=a.latitude;if(b){const dt=+new Date(b.recordedAt)-+new Date(a.recordedAt),jump=Math.hypot((b.longitude-a.longitude)*85000,(b.latitude-a.latitude)*111000);if(dt>0&&dt<=300000&&jump/(dt/1000)<=60){const t=(at-+new Date(a.recordedAt))/dt;lng+=(b.longitude-a.longitude)*t;lat+=(b.latitude-a.latitude)*t}}movingMarker.value.setPosition([lng,lat]);if(at<end)replayFrame=requestAnimationFrame(tick);else replayFrame=0};replayClock=performance.now();replayFrame=requestAnimationFrame(tick);
}
function pauseTrack() {if(props.monitoring){replayPaused=true;cancelReplay()}else movingMarker.value?.pauseMove?.(); }
function resumeTrack() { if(props.monitoring){replayPaused=false;runReplay()}else movingMarker.value?.resumeMove?.(); }
function stopTrack() { cancelReplay();replayElapsed=0;replayPaused=false;movingMarker.value?.stopMove?.(); if (props.track[0]) movingMarker.value?.setPosition([props.track[0].longitude, props.track[0].latitude]); }
function handleFenceDraw(event: any) {
  mouseTool.value?.close(false); let path = event.obj?.getPath?.() ?? [];
  while(Array.isArray(path[0])&&typeof path[0][0]!=='number')path=path[0];
  const points = path.map((point: any) => ({ longitude: Number(point.getLng?.() ?? point.lng ?? point[0]), latitude: Number(point.getLat?.() ?? point.lat ?? point[1]) })).filter((point: any) => Number.isFinite(point.longitude) && Number.isFinite(point.latitude));
  if (event.obj) overlays.push(event.obj); if (points.length >= 3) emit('polygonDrawn', points);
}
function startPolygonDraw() { if (!mouseTool.value) return false; mouseTool.value.close(true); mouseTool.value.polygon({ strokeColor: '#244d7c', strokeWeight: 3, fillColor: '#6d98bf', fillOpacity: .22, zIndex: 90 }); return true; }
function cancelPolygonDraw() { mouseTool.value?.close(true);if(regionDrawing)map.value?.setStatus?.({doubleClickZoom:previousDoubleClickZoom});regionDrawing=false;regionDraft=[];if(regionPreview)map.value?.remove(regionPreview);regionPreview=null;container.value?.removeEventListener('click',addRegionVertex,true);container.value?.removeEventListener('dblclick',finishRegionDrawing,true);if(container.value)container.value.style.cursor=''; }
async function beginPolygonDraw(){return startRegionDrawing()}
function handleMapError(event: ErrorEvent) { if (event.message === 'Unimplemented type: 3' && String(event.error?.stack ?? '').includes('webapi.amap.com')) authWarning.value = true; }
function handleConsoleError(...args: unknown[]) { if (args.some((value) => String(value).includes('INVALID_USER_DOMAIN'))) authWarning.value = true; originalConsoleError.apply(console, args); }
function fitVisible() {
  if (!map.value || !AMapRef.value) return;
  if(props.mode==='trajectory'){map.value.setFitView(overlays.filter(o=>o.getPath?.()),true,[48,48,48,48],16);return}
  const points = props.points.filter((item) => item.realtimeStatus&&(!props.monitoring||item.health?.locationValid!==false));
  if (!points.length) return;
  if (points.length === 1) {
    map.value.setZoomAndCenter(15, [points[0].realtimeStatus!.longitude, points[0].realtimeStatus!.latitude], false);
    return;
  }
  const lngs = points.map((item) => item.realtimeStatus!.longitude);
  const lats = points.map((item) => item.realtimeStatus!.latitude);
  map.value.setBounds(new AMapRef.value.Bounds([Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]), false, [48, 48, 48, 48]);
}
defineExpose({ playTrack, pauseTrack, resumeTrack, stopTrack, startPolygonDraw, beginPolygonDraw, cancelPolygonDraw, fitVisible });

watch(() => [props.points, props.track, props.regions, props.fences, props.riskPoints, props.displayLayer, props.mode, props.groupBy], () => {
  if (state.value !== 'ready') return;
  scheduleRender();
  void installDeferredFeatures();
}, { deep: true });
watch(() => [props.selectedId, state.value], ([id, mapState], previous) => {
  if (!id || mapState !== 'ready' || disposed || !map.value || !hasMapSize()) return;
  if (previous && previous[0] === id && previous[1] === mapState) return;
  if(props.monitoring)scheduleRender();
  const point = props.points.find((item) => item.id === id);
  if (!point?.realtimeStatus||props.monitoring&&point.health?.locationValid===false) return;
  const zoom = Number(map.value.getZoom?.());
  map.value.setZoomAndCenter(Number.isFinite(zoom) ? Math.max(zoom, 15) : 15, [point.realtimeStatus.longitude, point.realtimeStatus.latitude], true);
  if(!props.monitoring)nextTick(() => selectPoint(point));
}, { flush: 'post' });
onMounted(() => { window.addEventListener('error', handleMapError); console.error = handleConsoleError; init(); }); onBeforeUnmount(() => { cancelReplay();cancelPolygonDraw(); disposed = true; generation++; if (resizeFrame) cancelAnimationFrame(resizeFrame); window.removeEventListener('error', handleMapError); resizeObserver?.disconnect(); resizeObserver = null; if (renderFrame) cancelAnimationFrame(renderFrame); if (console.error === handleConsoleError) console.error = originalConsoleError; mouseTool.value?.off?.('draw', handleFenceDraw); mouseTool.value?.close?.(true); mouseTool.value = null; map.value?.off?.('complete', handleMapComplete); map.value?.off?.('zoomend', handleZoomEnd); clearBusinessLayers(); map.value?.destroy(); map.value = null; AMapRef.value = null; controlsInstalled = false; });
</script>

<template>
  <div class="operations-map" :class="{ compact: Number.parseInt(height, 10) > 0 && Number.parseInt(height, 10) <= 360, 'compact-map-labels': mode === 'dashboard' }" :style="{ height }" :data-map-state="state" :data-map-complete="mapComplete">
    <div ref="container" class="operations-map-canvas" :aria-busy="state === 'loading'" aria-label="车辆运行高德地图"></div>
    <div v-if="state === 'loading'" class="map-cover" role="status" aria-live="polite"><MapPinned :size="22"/><strong>正在加载高德地图</strong><span>同步业务图层与车辆状态…</span></div>
    <div v-else-if="state === 'error'" class="map-cover map-error" role="alert"><AlertTriangle :size="22"/><strong>地图暂时无法加载</strong><span>{{ message }}</span><el-button :icon="RefreshCw" @click="init">重试</el-button></div>
    <div v-if="authWarning" class="map-auth-warning"><AlertTriangle :size="14"/><span>底图域名未获高德 Key 授权，请在控制台加入当前开发域名</span></div>
    <div v-if="state === 'ready' && !['trajectory', 'fences', 'risk'].includes(mode)" class="map-legend" aria-label="地图图例">
      <template v-if="monitoring"><span><i style="background:#3268f6"></i>运行中</span><span><i style="background:#18b985"></i>在线临停</span><span><i style="background:#98a6ba"></i>离线最后位置</span><span><i style="background:#efa222"></i>异常关注</span><span v-if="regions.length"><i style="background:#3268f6"></i>许可通行范围</span></template><template v-else-if="mode === 'regions'"><span><i style="background:#3268f6"></i>许可通行范围</span></template>
      <template v-else-if="mode === 'dashboard'">
        <span><i class="running"></i>运行</span>
        <span><i class="online"></i>待机</span>
        <span><i class="offline"></i>离线</span>
        <span><i class="low"></i>关注</span>
        <span><i class="critical"></i>严重</span>
      </template>
      <template v-else>
        <span><i class="running"></i>运行中</span>
        <span><i class="online"></i>在线停驶</span>
        <span><i class="low"></i>低电量</span>
        <span><i class="offline"></i>离线</span>
      </template>
    </div>
    <div v-if="state === 'ready' && mode === 'fences'" class="map-legend fence-legend" aria-label="围栏图例"><span><i class="no-entry"></i>禁行区</span><span><i class="speed-limit"></i>限速区</span><span v-if="regions.length"><i class="operation"></i>通行区域参考</span><span><i class="temporary"></i>临时管制</span></div>
    <div v-if="state === 'ready' && mode === 'risk'" class="map-legend risk-legend" aria-label="风险图例"><span><i class="risk-low"></i>低密度</span><span><i class="risk-high"></i>高密度</span><span><i class="risk-accident"></i>事故点</span></div>
    <div v-if="state === 'ready'" class="map-source">高德地图 · 业务数据 {{ mode === 'fences' ? fences.length : mode === 'regions' ? regions.length : mode === 'trajectory' ? track.length : mode === 'risk' ? riskPoints.length : points.length }} 条</div>
  </div>
</template>

<style scoped>
.operations-map{position:relative;min-height:360px;overflow:hidden;border:1px solid var(--hairline);border-radius:10px;background:#edf1f4}.operations-map.compact{min-height:0}.operations-map-canvas{width:100%;height:100%}.map-cover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;background:#f4f6f8;color:var(--ink-2);z-index:3}.map-cover strong{font-size:14px;color:var(--ink)}.map-cover span{font-size:12px}.map-error svg{color:var(--warning)}.map-legend,.map-source{position:absolute;z-index:2;background:rgba(255,255,255,.94);box-shadow:0 3px 14px rgba(15,23,42,.1);border:1px solid rgba(228,228,231,.9);backdrop-filter:blur(8px)}.map-legend{left:12px;bottom:12px;display:flex;gap:12px;padding:7px 9px;border-radius:7px;font-size:11px}.map-legend span{display:flex;align-items:center;gap:5px}.map-legend i{width:7px;height:7px;border-radius:50%}.critical{background:#D92D20}.running{background:#2563EB}.online{background:#12B76A}.low{background:#F79009}.offline{background:#98A2B3}.map-source{right:12px;bottom:12px;padding:6px 8px;border-radius:6px;color:var(--ink-2);font-size:11px}.operations-map.compact .map-source{display:none}.operations-map.compact .map-legend{gap:8px;padding:6px 8px;box-shadow:0 1px 2px rgba(16,24,40,.06);backdrop-filter:none}
.fence-legend .no-entry{background:#dc2626}.fence-legend .speed-limit{background:#d97706}.fence-legend .operation{background:#315f91}.fence-legend .temporary{background:#7c3aed}
.risk-legend .risk-low{background:#fbbf24}.risk-legend .risk-high{background:#dc2626}.risk-legend .risk-accident{background:#7f1d1d}.risk-marker{width:18px;height:18px;border:3px solid #fff;border-radius:50%;background:#b91c1c;box-shadow:0 2px 8px rgba(127,29,29,.45);cursor:pointer}.risk-marker.accident{background:#7f1d1d}
.map-auth-warning{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:6px;max-width:calc(100% - 100px);padding:7px 10px;border:1px solid #f5d3a5;border-radius:7px;background:rgba(255,248,235,.96);color:#8a4b08;font-size:11px;box-shadow:0 3px 12px rgba(84,48,8,.08);white-space:nowrap}.map-auth-warning svg{flex:none}
:global(.operation-cluster),:global(.operation-group){appearance:none;border:2px solid #fff;cursor:pointer;color:#fff;box-shadow:0 2px 8px rgba(15,23,42,.22);box-sizing:border-box}
:global(.operation-cluster){width:36px;height:36px;border-radius:50%;background:#244d7c;font:650 12px/36px ui-monospace,monospace;display:grid;place-items:center}
:global(.operation-cluster.risk),:global(.operation-group.risk){background:#b91c1c}
:global(.operation-group){display:inline-flex;flex-direction:row;align-items:center;gap:8px;width:max-content;height:auto;min-height:28px;padding:5px 10px;border-radius:8px;background:#315f91;white-space:nowrap;line-height:1.2}
:global(.operation-group strong){font-size:12px;font-weight:650;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:8.5em;flex:none}
:global(.operation-group span){font:650 12px/1 ui-monospace,monospace;flex:none}
:global(.operation-marker){appearance:none;border:0;background:transparent;position:relative;width:28px;height:28px;padding:0;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(15,23,42,.25))}:global(.operation-marker-dot){display:block;width:22px;height:22px;border:3px solid white;border-radius:8px;background:var(--marker-color);transform:rotate(45deg);transition:transform .16s ease}:global(.operation-marker:hover .operation-marker-dot),:global(.operation-marker.selected .operation-marker-dot){transform:rotate(45deg) scale(1.2);box-shadow:0 0 0 4px rgba(36,77,124,.2)}:global(.operation-marker-label){position:absolute;top:-20px;left:50%;transform:translateX(-50%);padding:2px 5px;border-radius:4px;background:rgba(255,255,255,.94);color:#27272a;font:10px ui-monospace,monospace;white-space:nowrap;border:1px solid #e4e4e7}:global(.operation-map-info){min-width:280px;padding:2px 1px}:global(.operation-map-info>strong),:global(.operation-map-info>span),:global(.operation-map-info>small){display:block}:global(.operation-map-info>strong){font-size:13px}:global(.operation-map-info>span){font-size:10px;color:#71717a;margin:3px 0 8px}:global(.operation-map-info-data){border-top:1px solid #e4e4e7;padding-top:7px;font-size:11px;color:#3f3f46}:global(.operation-map-info>small){font-size:10px;color:#71717a;margin-top:6px;max-width:300px}:global(.operation-map-info-actions){display:flex;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid #e4e4e7}:global(.operation-map-info-actions button){border:0;border-radius:4px;background:#eef4fa;color:#244d7c;padding:4px 6px;font-size:10px;cursor:pointer}:global(.operation-map-info-actions button:hover){background:#dce9f4}:global(.track-event){display:block;width:14px;height:14px;border:3px solid white;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.25)}:global(.track-event.stop){background:#d97706}:global(.track-event.alert){background:#dc2626}:global(.moving-vehicle){width:24px;height:24px;border-radius:8px;background:#244d7c;border:3px solid white;display:grid;place-items:center;color:white;font-size:10px;box-shadow:0 2px 8px rgba(0,0,0,.28)}
:global(.compact-map-labels .operation-marker-label){display:none}
:global(.operation-marker.round){width:16px;height:16px;filter:drop-shadow(0 1px 2px rgba(16,24,40,.18))}
:global(.operation-marker.round .operation-marker-dot){width:12px;height:12px;border-width:2px;border-radius:50%;transform:none}
:global(.operation-marker.round:hover .operation-marker-dot),:global(.operation-marker.round.selected .operation-marker-dot){transform:scale(1.18);box-shadow:0 0 0 3px rgba(37,99,235,.16)}
:global(.operation-marker.round.pulse .operation-marker-dot){animation:operation-marker-pulse 1.6s ease-out infinite}
@keyframes operation-marker-pulse{0%{box-shadow:0 0 0 0 rgba(217,45,32,.42)}70%{box-shadow:0 0 0 8px rgba(217,45,32,0)}100%{box-shadow:0 0 0 0 rgba(217,45,32,0)}}
@media(prefers-reduced-motion:reduce){:global(.operation-marker.round.pulse .operation-marker-dot){animation:none}}
@media(max-width:900px){.operations-map:not(.compact){height:440px!important}.map-legend{gap:7px;flex-wrap:wrap;right:12px}.map-source{display:none}}
:global(.monitor-map-car){transform:none!important;width:30px;height:30px;justify-content:center;background:transparent!important;border:0!important;box-shadow:none!important;position:relative}:global(.monitor-map-car .operation-marker-dot){display:grid;place-items:center;width:28px;height:28px;border:2px solid #fff;border-radius:50%;background:var(--marker-color);color:#fff;box-shadow:0 1px 5px #30405a30}:global(.monitor-map-car .operation-marker-label){display:none}:global(.monitor-map-car.selected .operation-marker-label){display:block;position:absolute;bottom:39px;left:50%;transform:translateX(-50%);padding:5px 8px;border:1px solid #dce6f5;border-radius:4px;background:white;white-space:nowrap;color:#31517c;font-size:11px}:global(.monitor-map-car.selected .operation-marker-dot){box-shadow:0 0 0 8px #3268f626}:global(.monitor-map-car.has-anomaly:not(.selected) .operation-marker-dot){outline:3px solid #efa22270}
</style>
