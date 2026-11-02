import { loadAMap } from '../amap';
import { attachVehicleModel } from '../cockpitVehicleLayer';
import { loadShandongGeometry, restrictToShandong, fitShandongView } from '../cockpit/shandong-map';
import { vehicleState } from '../cockpit/vehicle-status.js';

const STATUS = { running: '#24d6f4', idle: '#819cab', warning: '#f6be6a', risk: '#ff6c77', offline: '#72808d' };
const TYPES = { DELIVERY: '#24d6f4', SANITATION: '#579cff', PATROL: '#a899ff', RETAIL: '#50d5b3', SHUTTLE: '#f6be6a' };
const AREAS = { operation: '#28bdd8', forbidden: '#ff6079', fence: '#ecb566', test: '#a496ec' };
const coord = item => {
  const lng = Number(item?.longitude ?? item?.lng ?? item?.[0]);
  const lat = Number(item?.latitude ?? item?.lat ?? item?.[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) < 85 ? [lng, lat] : null;
};
// JSAPI rejects an empty/single-point path, including repeated copies of one fix.
function linePath(points) {
  const result = [];
  for (const point of points) {
    const value = coord(point); if (!value) continue;
    const previous = result.at(-1);
    if (!previous || previous[0] !== value[0] || previous[1] !== value[1]) result.push(value);
  }
  return result;
}
const delayed = raw => !raw.heartbeatAt || Date.now() - Date.parse(raw.heartbeatAt) > 600000;
const stateColor = raw => raw.majorEvents > 0 || raw.riskLevel === 'CRITICAL' ? STATUS.risk : raw.openAlerts > 0 || raw.focused || ['HIGH', 'MEDIUM'].includes(raw.riskLevel) || raw.battery < 20 && raw.battery != null ? STATUS.warning : raw.onlineStatus === 'OFFLINE' ? STATUS.offline : raw.drivingState === 'RUNNING' || raw.speed > 0 ? STATUS.running : STATUS.idle;
const areaType = raw => {
  const value = String(raw.type ?? raw.regionType ?? raw.fenceType ?? raw.rightType ?? '').toUpperCase();
  return /FORBID|PROHIBIT|NO_ENTRY|禁/.test(value) ? 'forbidden' : /FENCE|SPEED_LIMIT|围栏/.test(value) ? 'fence' : /TEST|测试/.test(value) ? 'test' : 'operation';
};
function polygons(value) {
  if (typeof value === 'string') { try { return polygons(JSON.parse(value)); } catch { return []; } }
  if (!value) return [];
  if (value.type === 'Feature') return polygons(value.geometry);
  if (value.type === 'Polygon') return [value.coordinates];
  if (value.type === 'MultiPolygon') return value.coordinates;
  if (!Array.isArray(value) || !value.length) return [];
  if (coord(value[0])) return [[value.map(coord)]];
  if (coord(value[0]?.[0])) return [value.map(ring => ring.map(coord).filter(Boolean))];
  return value.flatMap(polygons);
}

/** Native AMap JSAPI city operations. National/province scenes stay independent. */
export class AmapCityEngine {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.city = this;
    this.level = 'city';
    this.disposed = false;
    this.generation = 0;
    this.selected = null;
    this.followId = null;
    this.mode = 'overview';
    this.settings = { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches };
    this.visibility = { admin: true, routes: true, heat: true, objects: true, track: true, labels: true };
    this.vehicles = new Map();
    this.markers = new Map();
    this.layers = { admin: [], routes: [], heat: [], track: [] };
    this.replayIndex = null;
    this.modelLayer = null;
    this.modelVehicleId = null;
    this.modelToken = 0;
    this.modelState = 'idle';
    this.labels = [];
    this.attribution = '底图与路网 © 高德地图 · GCJ-02';
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .amap-city-marker{--marker:#29d8f0;display:flex;align-items:center;gap:5px;min-height:25px;padding:3px 7px 3px 5px;border:1px solid color-mix(in srgb,var(--marker) 46%,transparent);border-radius:3px;background:rgba(3,20,33,.9);color:#d8edf5;font-family:inherit;font-size:11px;line-height:1.3;white-space:nowrap;box-shadow:0 2px 9px #0004;cursor:pointer;outline-offset:4px;pointer-events:auto}
      .amap-city-marker:focus-visible,.amap-city-marker.is-selected{outline:1px solid #d7f7ff;border-color:#d7f7ff;z-index:4;background:#123448}
      .amap-city-marker>i{position:relative;display:block;width:10px;height:13px;background:var(--marker);border:1px solid #ffffff8a;border-radius:3px;flex:none;transform:rotate(var(--heading,0deg))}
      .amap-city-marker>i:before{content:'';position:absolute;top:-6px;left:1px;border-left:3px solid transparent;border-right:3px solid transparent;border-bottom:4px solid var(--marker)}
      .amap-city-marker.is-node>i{width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 4px color-mix(in srgb,var(--marker) 14%,transparent);transform:none}.amap-city-marker.is-node>i:before{display:none}
      .amap-city-marker.is-cluster{border-radius:18px;font-weight:600;min-width:36px;justify-content:center;padding:7px 10px;border-color:#36accb;background:#0c354a}
      .amap-city-marker.is-risk{border-color:#b65364;background:#321724}.amap-city-marker.is-risk>i{background:#ff6376;transform:rotate(45deg);border-radius:1px;width:10px;height:10px}.amap-city-marker.is-risk>i:before{display:none}
      .amap-city-marker.is-compact>span{display:none}.amap-city-marker.is-compact{padding:4px;background:#092231b3}
      .amap-city-marker.is-model-anchor{transform:translate(-40%,-125px);padding:3px 6px}.amap-city-marker.is-model-anchor>i{display:none}
      .amap-city-trip{border:1px solid #43b8b4;color:#daf6f5;background:#052d38;padding:3px 6px;font-size:11px;border-radius:3px;white-space:nowrap}
    `;
    document.head.append(this.styleElement);
    this.resizeObserver = new ResizeObserver(() => { if (container.clientWidth && container.clientHeight) { this.map?.resize?.(); this.scheduleMarkers(); } });
    this.resizeObserver.observe(container);
  }

  async initialize(data) {
    if (this.map && this.mapComplete) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const [AMap, shandong] = await Promise.all([loadAMap(), loadShandongGeometry()]);
      if (this.disposed) return;
      this.AMap = AMap;
      this.flat = data.scene.viewMode === '2D';
      const supplied = import.meta.env.VITE_AMAP_MAP_STYLE || import.meta.env.VITE_AMAP_STYLE_ID;
      const mapStyle = this.flat ? 'amap://styles/blue' : data.scene.mapStyle ? `amap://styles/${data.scene.mapStyle}` : supplied ? supplied.startsWith('amap://') ? supplied : `amap://styles/${supplied}` : 'amap://styles/dark';
      this.map = new AMap.Map(this.container, {
        viewMode: this.flat ? '2D' : '3D', center: [data.scene.camera.longitude, data.scene.camera.latitude], zoom: data.scene.provinceOps ? 7 : 11.5,
        zooms: [6, 20], pitch: this.flat ? 0 : data.scene.cameraStyle?.pitch ?? 42, rotation: this.flat ? 0 : data.scene.cameraStyle?.rotation ?? 0, mapStyle,
        features: this.flat ? ['bg', 'road', 'point'] : ['bg', 'road', 'point', 'building'], showLabel: true, showBuildingBlock: !this.flat,
        skyColor: '#071724', resizeEnable: true, pitchEnable: !this.flat, rotateEnable: !this.flat,
        doubleClickZoom: false,
      });
      this.shandong = shandong;
      // The province mask contains every coastal island. Keep that expensive 3D
      // clipping out of street-level 2D maps; the SVG overlay draws the boundary.
      if (!this.flat) this.removeShandongConstraint = restrictToShandong(this.map, shandong);
      if (data.scene.provinceOps && data.scene.bounds) this.map.setBounds(new AMap.Bounds(data.scene.bounds[0], data.scene.bounds[1]), true, [145, 140, data.scene.sidePadding + 55, data.scene.sidePadding + 55]);
      this.onMapMove = () => this.scheduleMarkers();
      this.onMapGesture = () => { if (this.followId) { this.followId = null; this.callbacks.follow?.(false); } };
      this.map.on('moveend', this.onMapMove);
      this.map.on('zoomend', this.onMapMove);
      this.map.on('rotatechange', this.onMapMove);
      this.map.on('dragstart', this.onMapGesture);
      this.map.on('moveend', () => this.callbacks.position?.());
      this.map.on('zoomend', () => this.callbacks.position?.());
      if (this.flat) {
        this.callbacks.basemap?.('loading');
        this.onBasemapComplete = () => { clearTimeout(this.basemapTimer); this.callbacks.basemap?.('ready'); };
        this.map.on('complete', this.onBasemapComplete);
        this.basemapTimer = setTimeout(() => this.callbacks.basemap?.('slow'), 12000);
      }
      await new Promise((resolve, reject) => {
        const finish = () => { clearTimeout(timer); this.map?.off('complete', finish); this.completeCancel = null; this.mapComplete = true; resolve(); };
        const timer = setTimeout(() => { this.map?.off('complete', finish); this.completeCancel = null; reject(new Error('高德地图连接超时，请检查网络后重试。')); }, this.flat ? 60000 : 20000);
        this.completeCancel = finish;
        this.map.on('complete', finish);
        // Native vector overlays need the SDK's initialized vector layer; a
        // nonzero canvas size alone does not guarantee that it is ready.
      });
    })().catch(error => {
      clearTimeout(this.basemapTimer);
      this.map?.destroy(); this.map = null; this.initializing = null;
      throw error;
    });
    return this.initializing;
  }

  async load(data, drill, mode = this.mode) {
    const generation = ++this.generation;
    const scopeKey = [data.scene.regionCode, drill?.scope?.level, drill?.scope?.district?.id, drill?.scope?.enterprise?.id, drill?.scope?.vehicle?.id, drill?.map?.kind].join(':');
    const changed = scopeKey !== this.scopeKey;
    if (!this.loaded || changed) this.callbacks.loading?.();
    await this.initialize(data);
    if (this.disposed || generation !== this.generation || !this.map) return;
    this.scopeKey = scopeKey;
    this.data = data; this.drill = drill; this.mode = mode; this.mapKind = drill?.map?.kind ?? 'vehicles';
    const details = new Map((data.map?.vehicles ?? []).map(vehicle => [vehicle.id, vehicle]));
    const source = this.mapKind === 'vehicles' ? drill?.map?.items ?? data.map?.vehicles ?? [] : data.scene.provinceOps ? data.map?.vehicles ?? [] : [];
    const seen = new Set();
    for (const sourceRaw of source) {
      const raw = { ...details.get(sourceRaw.id), ...sourceRaw };
      const position = coord(raw); if (!position) continue;
      const id = String(raw.id); const saved = this.vehicles.get(id);
      if (saved) {
        if (id === this.selected && (saved.position[0] !== position[0] || saved.position[1] !== position[1])) saved.history = [...saved.history, saved.position].slice(-127);
        saved.raw = raw; saved.position = position;
      } else this.vehicles.set(id, { id, raw, position, history: [position] });
      seen.add(id);
    }
    for (const id of this.vehicles.keys()) if (!seen.has(id)) this.vehicles.delete(id);
    this.nodes = ['cities', 'districts', 'enterprises'].includes(this.mapKind) ? (drill?.map?.items ?? []).filter(raw => coord(raw)) : [];
    if (this.mapKind !== 'vehicles') this.clearVehicleModel();
    this.syncGeography(); this.syncRisks(); this.syncTrack(); this.syncMarkers(); this.applyVisibility();
    if (changed) { this.followId = null; this.overview(); }
    this.loaded = true;
    this.callbacks.labels?.([]);
    this.reportStats();
    this.callbacks.ready?.();
    this.callbacks.position?.();
  }

  selection(raw, mapKind = this.mapKind) { return { kind: 'city', id: String(raw.id), name: raw.businessNo ?? raw.name ?? '监管对象', mapKind, raw }; }
  screen(position) {
    if (!this.container.clientWidth || !this.container.clientHeight || !position) return null;
    const point = this.map?.lngLatToContainer(position);
    return point ? { x: point.getX?.() ?? point.x, y: point.getY?.() ?? point.y } : null;
  }
  color(raw) {
    if (this.data?.scene.provinceOps) return vehicleState(raw).color;
    if (this.mode === 'vehicles') return TYPES[raw.vehicleType] ?? STATUS.running;
    if (this.mode === 'quality') return delayed(raw) ? STATUS.warning : '#4fd3ac';
    if (this.mode === 'risks' && !raw.openAlerts && !['HIGH', 'CRITICAL', 'MEDIUM'].includes(raw.riskLevel)) return '#617f91';
    return stateColor(raw);
  }
  createMarker(record) {
    const button = document.createElement('button'); button.type = 'button';
    const symbol = document.createElement('i'); const label = document.createElement('span'); button.append(symbol, label);
    const marker = new this.AMap.Marker({ position: record.position, content: button, offset: new this.AMap.Pixel(-8, -12), zIndex: 100, bubble: false });
    const entry = { marker, button, symbol, label, record };
    button.addEventListener('click', event => { event.stopPropagation(); this.activate(entry.record, false); });
    button.addEventListener('dblclick', event => { event.stopPropagation(); this.activate(entry.record, true); });
    button.addEventListener('mouseenter', () => this.showTooltip(entry.record));
    button.addEventListener('focus', () => this.showTooltip(entry.record));
    button.addEventListener('mouseleave', () => this.setHover(null));
    button.addEventListener('blur', () => this.setHover(null));
    this.map.add(marker);
    return entry;
  }
  renderMarker(entry, record) {
    entry.record = record;
    const selected = String(record.raw.id) === this.selected;
    const status = this.data?.scene.provinceOps && record.mapKind === 'vehicles' ? vehicleState(record.raw) : null;
    entry.marker.setPosition(record.position);
    const base = record.cluster ? 'is-cluster' : record.risk ? 'is-risk' : record.mapKind !== 'vehicles' ? 'is-node' : '';
    entry.button.className = `amap-city-marker ${base}${selected ? ' is-selected' : ''}${(!this.visibility.labels || this.data?.scene.provinceOps && this.mapKind !== 'vehicles' && record.mapKind === 'vehicles') && !record.cluster ? ' is-compact' : ''}${record.raw.connected === false ? ' is-unopened' : ''}`;
    if (record.mapKind === 'vehicles' && selected && this.modelState === 'ready') entry.button.classList.add('is-model-anchor');
    entry.button.style.setProperty('--marker', status?.color ?? (selected ? '#d6f8ff' : record.color ?? this.color(record.raw)));
    entry.button.classList.toggle('has-risk', !!status && (record.raw.highRisks > 0 || record.raw.openAlerts > 0));
    if (status) entry.button.dataset.vehicleState = status.key; else delete entry.button.dataset.vehicleState;
    entry.button.style.setProperty('--heading', `${(record.raw.heading ?? 0) - (this.map.getRotation?.() ?? 0)}deg`);
    entry.label.textContent = record.cluster ? status ? String(record.members.length) : `${record.members.length} 辆无人车` : record.mapKind === 'vehicles' ? `${selected && this.modelState === 'ready' ? '3D · ' : ''}${record.raw.businessNo ?? record.raw.name}` : `${record.raw.name} · ${record.raw.connected === false ? '未开通' : record.raw.count ?? 0}`;
    entry.marker.setOffset(new this.AMap.Pixel(status && record.cluster ? -9 : record.cluster && this.mapKind !== 'vehicles' ? 8 : -8, status && record.cluster ? -9 : record.cluster && this.mapKind !== 'vehicles' ? 24 : -12));
    entry.symbol.style.display = record.cluster && !status ? 'none' : '';
    entry.button.title = status ? `${status.label}${record.cluster ? ` · ${record.members.length} 辆` : ` · ${record.raw.businessNo ?? record.raw.name}`}${record.raw.highRisks > 0 ? ' · 关联未闭环风险' : ''}` : '';
    entry.button.setAttribute('aria-label', record.cluster ? `${record.members.length} 辆车辆聚合` : `${record.raw.businessNo ?? record.raw.name}${record.mapKind === 'vehicles' ? '车辆' : '区域'}`);
    entry.button.dataset.mapId = String(record.raw.id); entry.button.dataset.mapKind = record.mapKind;
    entry.marker.setzIndex?.(selected ? 180 : record.mapKind === 'cities' ? 160 : record.mapKind !== 'vehicles' ? 150 : record.risk ? 140 : 100);
  }
  scheduleMarkers() {
    if (this.disposed || this.markerFrame) return;
    this.markerFrame = requestAnimationFrame(() => { this.markerFrame = null; this.syncMarkers(); });
  }
  syncMarkers() {
    if (!this.map || !this.data || this.disposed || !this.container.clientWidth || !this.container.clientHeight) return;
    const records = new Map();
    if (this.visibility.objects) {
      const max = Math.max(1, ...(this.nodes ?? []).map(raw => raw.count ?? 0));
      for (const raw of this.visibility.nodes === false ? [] : this.nodes ?? []) {
        const ratio = (raw.count ?? 0) / max;
        const color = this.mode === 'ranking' ? `hsl(191 70% ${36 + ratio * 32}%)` : this.mode === 'quality' ? raw.count && raw.online / raw.count > .9 ? '#4fd3ac' : STATUS.warning : '#40cbe7';
        records.set(`node:${raw.id}`, { raw, position: coord(raw), mapKind: this.mapKind, color });
      }
      const buckets = new Map();
      const zoom = this.map.getZoom(); const size = zoom < 12 ? 68 : zoom < 15 ? 44 : 28;
      for (const vehicle of this.vehicles.values()) {
        const position = vehicle.id === this.selected && this.replayIndex != null ? coord(this.track[this.replayIndex]) : vehicle.position;
        const screen = this.screen(position); if (!screen) continue;
        if (vehicle.id !== this.selected && (screen.x < -80 || screen.y < -80 || screen.x > this.container.clientWidth + 80 || screen.y > this.container.clientHeight + 80)) continue;
        const category = this.data.scene.provinceOps ? vehicleState(vehicle.raw).key + ':' : '';
        const key = vehicle.id === this.selected || zoom >= 17 ? `vehicle:${vehicle.id}` : `cluster:${category}${Math.floor(screen.x / size)}:${Math.floor(screen.y / size)}`;
        const bucket = buckets.get(key) ?? { members: [], longitude: 0, latitude: 0 };
        bucket.members.push(vehicle); bucket.longitude += position[0]; bucket.latitude += position[1]; buckets.set(key, bucket);
      }
      for (const [key, bucket] of buckets) {
        if (bucket.members.length === 1) {
          const vehicle = bucket.members[0];
          const history = vehicle.id === this.selected && this.replayIndex != null ? this.track[this.replayIndex] : null;
          records.set(key, { raw: history ? { ...vehicle.raw, ...history } : vehicle.raw, position: [bucket.longitude, bucket.latitude], mapKind: 'vehicles' });
        } else {
          const center = [bucket.longitude / bucket.members.length, bucket.latitude / bucket.members.length];
          // A cluster anchors to one real member, never an average in a building
          // or water. Province clusters are also partitioned by vehicle state.
          const distance = item => (item.position[0] - center[0]) ** 2 + (item.position[1] - center[1]) ** 2;
          const representative = bucket.members.reduce((best, item) => distance(item) < distance(best) ? item : best);
          const position = representative.position;
          records.set(key, { cluster: true, members: bucket.members.map(item => item.raw), position, mapKind: 'vehicles', raw: { ...representative.raw, id: key, name: `${bucket.members.length} 辆车`, cluster: true } });
        }
      }
    }
    if (!this.data.scene.provinceOps && this.mapKind === 'vehicles' && this.visibility.heat && ['overview', 'risks', 'quality'].includes(this.mode)) for (const record of this.riskRecords ?? []) records.set(`risk:${record.raw.id}`, record);
    for (const [id, entry] of this.markers) if (!records.has(id)) { this.map.remove(entry.marker); this.markers.delete(id); }
    for (const [id, record] of records) {
      let entry = this.markers.get(id);
      if (!entry) { entry = this.createMarker(record); this.markers.set(id, entry); }
      this.renderMarker(entry, record);
    }
    this.updateLiveTrack(); this.syncVehicleModel(); this.reportStats();
  }
  clearVehicleModel() {
    if (!this.modelVehicleId && !this.modelLayer) return;
    this.modelToken++;
    this.modelLayer?.remove();
    this.modelLayer = null;
    this.modelVehicleId = null;
    this.modelState = 'idle';
    this.callbacks.modelState?.('idle');
  }
  syncVehicleModel() {
    if (this.flat) { this.clearVehicleModel(); return; }
    const id = this.drill?.scope?.level === 'vehicle' && this.mapKind === 'vehicles' ? String(this.drill.scope.vehicle?.id ?? '') : '';
    const position = id ? this.vehiclePosition(id) : null;
    if (!id || !position || this.visibility.objects === false) { this.clearVehicleModel(); return; }
    const raw = this.vehicles.get(id)?.raw;
    const trackPoint = this.replayIndex == null ? null : this.track?.[this.replayIndex];
    const heading = Number(trackPoint?.heading ?? raw?.heading);
    if (this.modelVehicleId === id) {
      this.modelLayer?.setPose(position[0], position[1], Number.isFinite(heading) ? heading * Math.PI / 180 : undefined);
      return;
    }
    this.clearVehicleModel();
    this.modelVehicleId = id;
    this.modelState = 'loading';
    this.callbacks.modelState?.('loading');
    const token = ++this.modelToken;
    void attachVehicleModel(this.AMap, this.map, position[0], position[1], {
      heading: Number.isFinite(heading) ? heading * Math.PI / 180 : undefined,
    }).then(layer => {
      if (this.disposed || token !== this.modelToken) { layer?.remove(); return; }
      this.modelLayer = layer;
      this.modelState = layer ? 'ready' : 'fallback';
      this.callbacks.modelState?.(this.modelState);
      if (layer) this.syncVehicleModel();
      this.scheduleMarkers();
    });
  }
  activate(record, drill = false) {
    if (record.cluster || record.raw?.cluster) {
      const position = record.position;
      if (position) this.map.setZoomAndCenter(Math.min(19, this.map.getZoom() + 2), position, !this.settings.animate);
      return;
    }
    this.callbacks[drill ? 'drill' : 'select']?.(this.selection(record.raw, record.mapKind));
  }
  showTooltip(record) {
    if (record.cluster) return;
    const screen = this.screen(record.position);
    if (screen) this.setHover(String(record.raw.id), screen, this.selection(record.raw, record.mapKind));
  }
  setHover(id, screen, payload) {
    this.hovered = id;
    this.callbacks.hover?.(id);
    if (!id) this.callbacks.tooltip?.(null);
    else if (screen && payload) this.callbacks.tooltip?.({ ...payload, ...screen });
  }

  clearLayer(id) { if (this.map && this.layers[id].length) this.map.remove(this.layers[id]); this.layers[id] = []; }
  syncGeography() {
    const areas = [...(this.data.map?.operationRegions ?? []), ...(this.data.map?.forbiddenRegions ?? []), ...(this.data.map?.electronicFences ?? []), ...(this.data.map?.testRegions ?? []), ...(this.mapKind === 'regions' ? this.drill?.map?.items ?? [] : [])];
    const roads = this.data.map?.roadRights ?? [];
    const signature = JSON.stringify([areas, roads]);
    if (signature === this.geoSignature) return;
    this.geoSignature = signature; this.clearLayer('admin'); this.clearLayer('routes');
    const seen = new Set();
    for (const raw of areas) {
      if (seen.has(raw.id)) continue; seen.add(raw.id);
      const color = AREAS[areaType(raw)];
      for (const path of polygons(raw.polygon ?? raw.geometry ?? raw.polygonJson)) {
        if (path[0]?.length < 3) continue;
        if (this.flat) {
          // A dark casing keeps the operating boundary readable over any road.
          const casing = new this.AMap.Polygon({ path, strokeColor: '#061627', strokeOpacity: .95, strokeWeight: 6, fillOpacity: 0, zIndex: 29, bubble: true });
          this.layers.admin.push(casing);
        }
        const polygon = new this.AMap.Polygon({ path, strokeColor: this.flat ? '#56dcff' : color, strokeOpacity: this.flat ? 1 : .75, strokeWeight: this.flat ? 3 : 1.5, fillColor: color, fillOpacity: this.flat ? 0 : .10, zIndex: 30, bubble: false, extData: raw });
        polygon.on('click', () => this.callbacks.select?.(this.selection(raw, 'regions')));
        this.layers.admin.push(polygon);
      }
    }
    for (const raw of roads) {
      const geometry = raw.geometry?.coordinates ?? raw.geometry;
      if (!Array.isArray(geometry)) continue;
      const paths = coord(geometry[0]) ? [geometry] : geometry;
      for (const source of paths) {
        if (!Array.isArray(source)) continue;
        const path = linePath(source); if (path.length < 2) continue;
        const line = new this.AMap.Polyline({ path, strokeColor: AREAS[areaType(raw)], strokeWeight: 3, strokeOpacity: .85, zIndex: 40, lineJoin: 'round', extData: raw });
        line.on('click', () => this.callbacks.select?.(this.selection(raw, 'regions')));
        this.layers.routes.push(line);
      }
    }
    this.map.add([...this.layers.admin, ...this.layers.routes]);
  }
  syncRisks() {
    this.riskRecords = (this.data.risks ?? []).slice(0, 80).flatMap(risk => {
      const vehicle = this.vehicles.get(String(risk.vehicleId));
      const position = coord(risk) ?? vehicle?.position;
      if (!position) return [];
      const raw = { ...vehicle?.raw, ...risk, id: risk.vehicleId ?? risk.id, name: risk.name, businessNo: risk.businessNo ?? vehicle?.raw.businessNo, risk: true };
      return [{ raw, position, mapKind: risk.vehicleId ? 'vehicles' : 'regions', risk: true, color: ['MAJOR', 'CRITICAL'].includes(risk.level) ? STATUS.risk : STATUS.warning }];
    });
  }
  syncTrack() {
    const raw = (this.drill?.map?.track ?? []).filter(point => coord(point));
    const signature = JSON.stringify([this.drill?.scope?.vehicle?.id, raw]);
    if (signature === this.trackSignature) return;
    this.trackSignature = signature; this.clearLayer('track'); this.replayIndex = null; this.track = raw;
    this.trackPath = []; this.trackIndices = [];
    this.trackLine = null; this.realtimeLine = null;
    this.trackLineHasPath = false; this.realtimeLineHasPath = false;
    const stride = Math.max(1, Math.ceil((raw.length - 1) / 2399));
    for (let index = 0; index < raw.length - 1; index += stride) { this.trackPath.push(coord(raw[index])); this.trackIndices.push(index); }
    if (raw.length) { this.trackPath.push(coord(raw.at(-1))); this.trackIndices.push(raw.length - 1); }
    const path = linePath(this.trackPath);
    if (path.length > 1) {
      const background = new this.AMap.Polyline({ path, strokeColor: '#477f97', strokeOpacity: .4, strokeWeight: 5, zIndex: 60, lineJoin: 'round' });
      this.trackLine = new this.AMap.Polyline({ path, strokeColor: STATUS.running, strokeWeight: 5, strokeOpacity: .9, showDir: true, lineJoin: 'round', zIndex: 61 });
      this.trackLineHasPath = true;
      this.layers.track.push(background, this.trackLine);
      const history = this.drill?.context?.displayedTrackKind === 'current' ? this.drill?.context?.currentTrip : this.drill?.context?.historyTrack;
      for (const [position, text] of [[this.trackPath[0], history?.startName ? `起 · ${history.startName}` : '历史起点'], [this.trackPath.at(-1), history?.endName ? `终 · ${history.endName}` : '历史终点']]) {
        const content = document.createElement('span'); content.className = 'amap-city-trip'; content.textContent = text;
        this.layers.track.push(new this.AMap.Marker({ position, content, offset: new this.AMap.Pixel(-14, -12), zIndex: 115 }));
      }
    }
    if (this.layers.track.length) this.map.add(this.layers.track);
  }
  updateLiveTrack() {
    const vehicle = this.vehicles.get(this.selected);
    const path = linePath(vehicle && this.replayIndex == null && this.drill?.map?.liveTracking !== false ? [...vehicle.history, vehicle.position] : []);
    this.realtimeLineHasPath = path.length > 1;
    if (this.realtimeLineHasPath) {
      if (!this.realtimeLine) {
        this.realtimeLine = new this.AMap.Polyline({ path, strokeColor: stateColor(vehicle.raw), strokeWeight: 4, strokeOpacity: .85, zIndex: 65, lineJoin: 'round' });
        this.layers.track.push(this.realtimeLine); this.map.add(this.realtimeLine);
      } else this.realtimeLine.setPath(path);
      this.realtimeLine.setOptions({ strokeColor: stateColor(vehicle.raw) });
      if (this.visibility.track !== false) this.realtimeLine.show(); else this.realtimeLine.hide();
    } else {
      this.realtimeLine?.hide();
    }
    if (this.followId) this.centerFollow();
  }
  setTrackProgress(index) {
    if (!this.track?.length) return;
    this.replayIndex = index == null || index < 0 ? null : Math.max(0, Math.min(this.track.length - 1, Math.round(index)));
    if (this.trackLine) {
      const path = this.replayIndex == null ? this.trackPath : this.trackPath.filter((_, sample) => this.trackIndices[sample] <= this.replayIndex);
      if (this.replayIndex != null) path.push(coord(this.track[this.replayIndex]));
      const validPath = linePath(path);
      this.trackLineHasPath = validPath.length > 1;
      if (this.trackLineHasPath) {
        this.trackLine.setPath(validPath);
        if (this.visibility.track !== false) this.trackLine.show(); else this.trackLine.hide();
      } else this.trackLine.hide();
      this.trackLine.setOptions({ strokeColor: this.replayIndex != null && !this.track[this.replayIndex].speed ? STATUS.idle : STATUS.running });
    }
    this.syncMarkers();
  }
  vehiclePosition(id) {
    return String(id) === this.selected && this.replayIndex != null ? coord(this.track[this.replayIndex]) : this.vehicles.get(String(id))?.position ?? null;
  }
  setSelected(id, focus = false) {
    const changed = this.selected !== id; this.selected = id == null ? null : String(id);
    this.syncMarkers();
    if (changed && focus && id) {
      const position = this.vehiclePosition(id) ?? coord(this.nodes?.find(raw => String(raw.id) === String(id)));
      if (position) this.map?.setCenter(position, !this.settings.animate);
    }
  }
  setMode(mode) {
    this.mode = mode;
    for (const polygon of this.layers.admin) polygon.setOptions({ fillOpacity: this.flat ? 0 : mode === 'ranking' ? .2 : .1 });
    this.syncMarkers();
  }
  setMotion(enabled) { this.settings.animate = Boolean(enabled); }
  setSettings(settings) { this.settings = { ...this.settings, ...settings }; }
  setLayerVisible(id, visible) { this.visibility[id] = visible; this.applyVisibility(); this.syncMarkers(); }
  setVisible(id, visible) { this.setLayerVisible(id, visible); }
  applyVisibility() {
    for (const [name, overlays] of Object.entries(this.layers)) for (const overlay of overlays) {
      const hasPath = overlay === this.trackLine ? this.trackLineHasPath : overlay === this.realtimeLine ? this.realtimeLineHasPath : true;
      if (this.visibility[name] !== false && hasPath) overlay.show?.(); else overlay.hide?.();
    }
  }
  follow(id) {
    this.followId = id || null;
    if (id) { const position = this.vehiclePosition(id); if (position) this.map?.setZoomAndCenter(Math.max(16, this.map.getZoom()), position, !this.settings.animate); if (!this.flat) this.map?.setPitch(this.data?.scene.cameraStyle?.pitch ?? 46, !this.settings.animate); }
    this.callbacks.follow?.(Boolean(this.followId));
  }
  centerFollow() {
    const position = this.vehiclePosition(this.followId); const center = this.map?.getCenter();
    if (position && center && (Math.abs(center.getLng() - position[0]) > .000001 || Math.abs(center.getLat() - position[1]) > .000001)) this.map.setCenter(position, true);
  }
  toggleOrbit() {
    if (this.orbitTimer) { clearInterval(this.orbitTimer); this.orbitTimer = null; return false; }
    this.orbitTimer = setInterval(() => { if (this.map && this.settings.animate) this.map.setRotation((this.map.getRotation() + .3) % 360, true); }, 80);
    return true;
  }
  zoom(direction) { if (this.map) this.map.setZoom(Math.max(6, Math.min(20, this.map.getZoom() + (direction > 0 ? 1 : -1))), !this.settings.animate); }
  topDown() { this.followId = null; this.map?.setPitch(0, !this.settings.animate); }
  north() { this.map?.setRotation(0, !this.settings.animate); }
  overview() {
    if (!this.map) return;
    this.followId = null;
    const camera = this.data?.scene.cameraStyle;
    if (camera && !this.flat) { this.map.setPitch(camera.pitch, true); this.map.setRotation(camera.rotation, true); }
    if (this.drill?.scope?.level === 'province' && this.shandong) {
      const panel = this.data.scene.sidePadding ?? 360;
      fitShandongView(this.map, this.shandong, panel, camera?.zoomOffset);
      this.scheduleMarkers(); return;
    }
    const focusedVehicle = this.drill?.scope?.level === 'vehicle' ? this.vehiclePosition(this.drill.scope.vehicle?.id) : null;
    if (focusedVehicle) {
      this.map.setZoomAndCenter(17.5, focusedVehicle, !this.settings.animate);
      if (!this.flat) { this.map.setPitch(camera?.pitch ?? 55, !this.settings.animate); this.map.setRotation(camera?.rotation ?? -18, !this.settings.animate); }
      this.scheduleMarkers();
      return;
    }
    const panel = this.data?.scene.provinceOps ? this.data.scene.sidePadding : Math.min(620, Math.max(280, this.container.clientWidth * .19));
    const padding = this.data?.scene.provinceOps ? [145, 140, panel + 55, panel + 55] : [180, panel + 50, 140, panel + 30];
    const primaryNodes = this.data?.scene.provinceOps && ['cities', 'districts', 'enterprises'].includes(this.mapKind);
    const targets = this.drill?.scope?.level === 'vehicle' && this.trackLine ? [this.trackLine] : [...this.markers.values()].filter(entry => !entry.record.risk && (this.data?.scene.provinceOps || !primaryNodes || entry.record.mapKind === this.mapKind)).map(entry => entry.marker);
    if (this.data?.scene.provinceOps && this.visibility.admin) targets.push(...this.layers.admin);
    const maximum = this.drill?.scope?.level === 'province' ? 8 : this.data?.scene.provinceOps && this.mapKind === 'enterprises' ? 17 : this.data?.scene.provinceOps && this.mapKind === 'districts' ? 15 : this.drill?.scope?.level === 'vehicle' ? 16 : 13;
    if (targets.length) this.map.setFitView(targets, !this.settings.animate, padding, maximum);
    else if (this.data?.scene.provinceOps && this.data.scene.bounds) this.map.setBounds(new this.AMap.Bounds(this.data.scene.bounds[0], this.data.scene.bounds[1]), true, padding);
    else this.map.setZoomAndCenter(11.5, [this.data.scene.camera.longitude, this.data.scene.camera.latitude], !this.settings.animate);
    if (!this.flat) this.map.setPitch(camera?.pitch ?? (this.drill?.scope?.level === 'province' ? 42 : this.drill?.scope?.level === 'vehicle' ? 46 : 35), !this.settings.animate);
    this.scheduleMarkers();
  }
  reportStats() { this.callbacks.stats?.({ fps: 0, calls: this.markers.size, attribution: this.attribution, level: 'city', engine: 'amap' }); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.generation++;
    this.clearVehicleModel();
    if (this.markerFrame) cancelAnimationFrame(this.markerFrame);
    if (this.orbitTimer) clearInterval(this.orbitTimer);
    this.completeCancel?.(); this.resizeObserver.disconnect();
    clearTimeout(this.basemapTimer); this.map?.off('complete', this.onBasemapComplete);
    this.removeShandongConstraint?.();
    this.map?.off('moveend', this.onMapMove); this.map?.off('zoomend', this.onMapMove); this.map?.off('rotatechange', this.onMapMove); this.map?.off('dragstart', this.onMapGesture);
    this.map?.destroy(); this.map = null; this.markers.clear(); this.vehicles.clear(); this.styleElement.remove();
    this.callbacks.labels?.([]); this.callbacks.tooltip?.(null);
  }
}
