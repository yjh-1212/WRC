import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import { extrudeRegion, polygonParts, createProjection, disposeGroup } from '../three-map/geography.js';
import { vehicleState } from './vehicle-status.js';

const mercatorDegrees = latitude => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * 180 / Math.PI;
const finiteLocation = row => Number.isFinite(row.longitude) && Number.isFinite(row.latitude);
const sideVertex = 'varying vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const sideFragment = `uniform vec3 tint;uniform float time;uniform float motion;varying vec3 vPosition;
void main(){float h=clamp(vPosition.y,0.,1.);float rib=pow(abs(sin((vPosition.x+vPosition.z)*4.8)),18.);
float scan=pow(max(0.,1.-abs(h-fract(time*.13))/.18),2.)*motion;
vec3 base=mix(tint*.48,mix(tint,vec3(.83,.9,1.),.42),h);
gl_FragColor=vec4(base+vec3(.13,.21,.36)*rib+vec3(.15,.35,.5)*scan*.4,1.);}`;
const flowVertex = 'attribute float lineDistance;varying float vDistance;void main(){vDistance=lineDistance;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const flowFragment = 'uniform float time;uniform float motion;uniform vec3 tint;varying float vDistance;void main(){float head=pow(max(0.,sin(vDistance*.45-time*.8)),14.);gl_FragColor=vec4(tint,(.13+head*.68)*motion);}';

/** Shandong-only relief scene. Regional framing/material strategy follows liaoliang's GrainSourceMapEngine. */
export class ShandongReliefEngine {
  constructor(host, geo, atlas, callbacks = {}) {
    this.host = host; this.geo = geo; this.atlas = atlas; this.callbacks = callbacks;
    this.disposed = false; this.active = true; this.paused = false; this.dirty = true;
    this.elapsed = 0; this.frameCount = 0; this.lastAt = 0; this.drawAt = 0; this.hoverAt = 0;
    this.style = {}; this.depth = 3; this.layers = { texture: true, labels: true, objects: true, heat: true, admin: true };
    this.projection = createProjection(geo.features, 100); this.raycaster = new THREE.Raycaster();
    this.bounds = new THREE.Box3();
    for (const feature of geo.features) for (const polygon of polygonParts(feature)) for (const coord of polygon[0]) this.bounds.expandByPoint(this.projection.project(...coord));
    this.center = this.bounds.getCenter(new THREE.Vector3()); this.span = this.bounds.getSize(new THREE.Vector3());
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(36, 1, .1, 2000);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0, 0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.domElement.setAttribute('aria-label', '山东省卫星纹理三维监管地图'); host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .1; this.controls.rotateSpeed = .45; this.controls.zoomSpeed = .55;
    this.controls.minPolarAngle = .05; this.controls.maxPolarAngle = Math.PI * .43; this.controls.enablePan = true;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('start', () => { this.cameraTween?.kill(); this.targetTween?.kill(); });
    this.land = new THREE.Group(); this.foundation = new THREE.Group(); this.base = new THREE.Group(); this.business = new THREE.Group();
    this.scene.add(this.foundation, this.land, this.base, this.business);
    this.scene.add(new THREE.HemisphereLight('#e1ebff', '#17324e', 2));
    const light = new THREE.DirectionalLight('#c9dcff', 2.3); light.position.set(-70, 150, 60); this.scene.add(light);
    this.surfaces = new Map(); this.flowMaterials = []; this.markerPulses = []; this.regionMeshes = [];
    this.glow = this.glowTexture(); this.createLand(); this.createBase();
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.motionChange = () => { this.intro?.progress(1); this.lastAt = 0; this.dirty = true; };
    this.reduce.addEventListener('change', this.motionChange);
    this.visibility = () => { this.lastAt = 0; if (document.hidden) { cancelAnimationFrame(this.frameId); this.intro?.pause(); } else if (this.active) { this.intro?.resume(); this.start(); } };
    document.addEventListener('visibilitychange', this.visibility);
    this.pointerDown = event => { this.down = [event.clientX, event.clientY]; };
    this.pointerUp = event => { if (this.down && Math.hypot(event.clientX - this.down[0], event.clientY - this.down[1]) < 5) this.pick(event, true); this.down = null; };
    this.pointerMove = event => { if (!this.down && performance.now() - this.hoverAt > 80) { this.hoverAt = performance.now(); this.pick(event, false); } };
    this.pointerLeave = () => { this.down = null; this.hover(''); };
    this.contextLost = event => { event.preventDefault(); this.setActive(false); this.callbacks.error?.('三维地图显示连接已中断，请重试地图'); };
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.pointerDown); canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointermove', this.pointerMove); canvas.addEventListener('pointerleave', this.pointerLeave); canvas.addEventListener('webglcontextlost', this.contextLost);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.resize(); this.start();
  }

  glowTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.14, '#ffffff'); gradient.addColorStop(.4, '#ffffff88'); gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(canvas);
  }

  createLand() {
    this.side = new THREE.ShaderMaterial({ uniforms: { tint: { value: new THREE.Color('#a9bdf0') }, time: { value: 0 }, motion: { value: 1 } }, vertexShader: sideVertex, fragmentShader: sideFragment });
    for (const feature of this.geo.features) {
      const id = String(feature.properties.adcode), geometry = extrudeRegion(feature, this.projection, 1, .006);
      const positions = geometry.attributes.position, uv = geometry.attributes.uv, bounds = this.atlas.bounds;
      for (let i = 0; i < positions.count; i++) {
        const [lng, lat] = this.projection.unproject(positions.getX(i), positions.getZ(i));
        uv.setXY(i, (lng - bounds.west) / (bounds.east - bounds.west), (mercatorDegrees(lat) - bounds.south) / (bounds.north - bounds.south));
      }
      const top = new THREE.MeshBasicMaterial({ color: '#b1bfc9', toneMapped: false });
      const mesh = new THREE.Mesh(geometry, [top, this.side]); mesh.userData = { kind: 'cities', id }; this.land.add(mesh); this.regionMeshes.push(mesh);
      const lower = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ color: '#254a77' }));
      lower.scale.y = .34; lower.position.y = -.58; this.foundation.add(lower);
      const borders = [], flows = [];
      for (const polygon of polygonParts(feature)) for (const ring of polygon) {
        const points = ring.map(coord => this.projection.project(...coord, 1.013));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#7abaff', transparent: true, opacity: .62, depthWrite: false }));
        line.renderOrder = 4; this.land.add(line); borders.push(line);
        if (points.length < 15) continue;
        const material = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, motion: { value: 1 }, tint: { value: new THREE.Color('#a6edff') } }, vertexShader: flowVertex, fragmentShader: flowFragment, transparent: true, depthWrite: false });
        const flow = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material); flow.computeLineDistances(); flow.renderOrder = 5;
        this.land.add(flow); flows.push(flow); this.flowMaterials.push(material);
      }
      this.surfaces.set(id, { top, mesh, borders, flows });
    }
  }

  createBase() {
    const radius = Math.max(this.span.x, this.span.z) * .63;
    this.base.position.set(this.center.x, -.8, this.center.z);
    this.orbits = [];
    for (const [index, multiplier] of [1, 1.06, 1.13].entries()) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * multiplier, radius * multiplier + (index ? .07 : .12), 160, 1, index * .7, Math.PI * 1.8), new THREE.MeshBasicMaterial({ color: '#487cca', transparent: true, opacity: index ? .17 : .32, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; this.base.add(ring); this.orbits.push(ring);
    }
    this.sweep = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.06, 64, 0, Math.PI / 7), new THREE.MeshBasicMaterial({ color: '#3674c7', transparent: true, opacity: .065, side: THREE.DoubleSide, depthWrite: false }));
    this.sweep.rotation.x = -Math.PI / 2; this.base.add(this.sweep);
    const ticks = [];
    for (let i = 0; i < 100; i++) {
      const angle = i / 100 * Math.PI * 2, inner = radius * 1.14, outer = inner + (i % 5 ? .55 : 1.1);
      ticks.push(Math.cos(angle) * inner, 0, Math.sin(angle) * inner, Math.cos(angle) * outer, 0, Math.sin(angle) * outer);
    }
    this.base.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3)), new THREE.LineBasicMaterial({ color: '#638dce', transparent: true, opacity: .3 })));
  }

  async loadTexture() {
    try {
      const texture = await new THREE.TextureLoader().loadAsync('/map/shandong-relief/shandong-satellite.webp');
      if (this.disposed) { texture.dispose(); return; }
      this.texture?.dispose(); this.texture = texture; texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.paint(); this.dirty = true; this.callbacks.texture?.('ready');
    } catch { if (!this.disposed) this.callbacks.texture?.('error'); }
  }

  setData(data) {
    this.data = data; this.cityRows = new Map(data.map.items.map(row => [String(row.id), row]));
    this.paint(); disposeGroup(this.business, true); this.heatTexture?.dispose(); this.heatTexture = null; this.heat = null; this.markerPulses = [];
    this.positions = data.vehicles.filter(finiteLocation).filter(row => {
      const position = this.projection.project(row.longitude, row.latitude);
      return position.x >= this.bounds.min.x - 3 && position.x <= this.bounds.max.x + 3 && position.z >= this.bounds.min.z - 3 && position.z <= this.bounds.max.z + 3;
    });
    if (this.positions.length) {
      const points = this.positions.flatMap(row => this.projection.project(row.longitude, row.latitude, .12).toArray());
      const colors = this.positions.flatMap(row => new THREE.Color(vehicleState(row).color).toArray());
      this.vehiclePoints = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)).setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)), new THREE.PointsMaterial({ map: this.glow, vertexColors: true, size: .85, transparent: true, opacity: .9, depthWrite: false, sizeAttenuation: true }));
      this.vehiclePoints.renderOrder = 8;
      this.vehiclePoints.userData.kind = 'vehicles'; this.business.add(this.vehiclePoints); this.createHeat();
    } else this.vehiclePoints = null;
    this.cityHits = [];
    for (const row of data.map.items.filter(finiteLocation)) {
      const position = this.projection.project(row.longitude, row.latitude, .18), connected = !!row.connected;
      const risk = data.vehicles.some(vehicle => vehicle.cityCode === row.id && vehicle.highRisks > 0);
      const color = !connected ? '#597a9d' : risk ? '#ffc36a' : '#78ddff';
      const dot = new THREE.Mesh(new THREE.SphereGeometry(connected ? .38 : .21, 12, 8), new THREE.MeshBasicMaterial({ color }));
      dot.position.copy(position); dot.userData = { kind: 'cities', id: row.id }; this.business.add(dot); this.cityHits.push(dot);
      if (!connected) continue;
      const ring = new THREE.Mesh(new THREE.RingGeometry(.65, .73, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.copy(position); this.business.add(ring); this.markerPulses.push(ring);
      const height = 3 + Math.min(5, Math.sqrt(Math.max(0, row.count)) * .35);
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.18, .55, height, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beacon.position.copy(position); beacon.position.y += height / 2; this.business.add(beacon);
    }
    this.business.position.y = this.depth; this.applyLayers(); this.dirty = true;
  }

  createHeat() {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = Math.round(1200 * this.span.z / this.span.x);
    const density = document.createElement('canvas'); density.width = canvas.width; density.height = canvas.height;
    const ctx = density.getContext('2d'), width = canvas.width, height = canvas.height;
    // Intensity uses real reported positions, not synthetic locations or inter-city routes.
    for (const row of this.positions) {
      const point = this.projection.project(row.longitude, row.latitude), x = (point.x - this.bounds.min.x) / this.span.x * width, y = (point.z - this.bounds.min.z) / this.span.z * height;
      const radius = width * .033, gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,.16)'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const pixels = ctx.getImageData(0, 0, width, height), out = canvas.getContext('2d'), colors = out.createImageData(width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const amount = pixels.data[i + 3] / 255;
      if (amount < .01) continue;
      const stops = [[0, 26, 219, 155], [.35, 157, 230, 57], [.62, 255, 198, 35], [.82, 255, 113, 30], [1, 255, 47, 39]];
      const upper = stops.findIndex(stop => stop[0] >= amount), low = stops[Math.max(0, upper - 1)], high = stops[Math.max(1, upper)];
      const blend = (amount - low[0]) / (high[0] - low[0]);
      colors.data.set([1, 2, 3].map(channel => Math.round(low[channel] + (high[channel] - low[channel]) * blend)).concat(Math.round(Math.pow(amount, .65) * 205)), i);
    }
    out.putImageData(colors, 0, 0); out.globalCompositeOperation = 'destination-in'; out.fillStyle = '#fff'; out.beginPath();
    for (const feature of this.geo.features) for (const polygon of polygonParts(feature)) for (const ring of polygon) {
      ring.forEach((coord, index) => { const point = this.projection.project(...coord), x = (point.x - this.bounds.min.x) / this.span.x * width, y = (point.z - this.bounds.min.z) / this.span.z * height; if (index) out.lineTo(x, y); else out.moveTo(x, y); }); out.closePath();
    }
    out.fill('evenodd'); this.heatTexture = new THREE.CanvasTexture(canvas);
    this.heat = new THREE.Mesh(new THREE.PlaneGeometry(this.span.x, this.span.z).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.heatTexture, transparent: true, opacity: .87, depthWrite: false, toneMapped: false }));
    this.heat.position.set(this.center.x, .05, this.center.z); this.heat.renderOrder = 6; this.business.add(this.heat);
  }

  apply(style = {}) {
    const cameraChanged = ['map3d', 'mapPitch', 'mapRotation', 'mapZoomOffset', 'panelWidth'].some(key => this.style[key] !== style[key]);
    this.style = { ...style }; this.depth = style.map3d === false ? .12 : Math.max(.4, Number(style.mapRegionHeight ?? 12000) / 4000);
    this.land.scale.y = this.depth; this.business.position.y = this.depth;
    this.side.uniforms.tint.value.set(style.mapSideColor ?? '#a9bdf0').lerp(new THREE.Color('#cbd8ff'), .5);
    this.layers.labels = style.labels !== false; this.layers.admin = style.boundaries !== false;
    for (const surface of this.surfaces.values()) for (const border of surface.borders) { border.material.color.set(style.mapEdge ?? '#77aaf4'); }
    this.applyLayers(); this.paint(); if (cameraChanged) this.reset(false); this.dirty = true;
  }

  paint() {
    for (const [id, surface] of this.surfaces) {
      surface.top.map = this.layers.texture ? this.texture ?? null : null;
      surface.top.color.set(surface.top.map ? '#ffffff' : this.style.mapColor ?? '#28517f');
      if (id === this.hovered) surface.top.color.lerp(new THREE.Color('#92ccff'), .25);
      surface.top.needsUpdate = true;
    }
  }
  setLayer(name, value) { this.layers[name] = value; this.applyLayers(); if (name === 'texture') this.paint(); this.dirty = true; }
  applyLayers() {
    for (const surface of this.surfaces.values()) { surface.borders.forEach(border => border.visible = this.layers.admin); surface.flows.forEach(flow => flow.visible = this.layers.admin && this.style.mapFlow !== false); }
    if (this.heat) this.heat.visible = this.layers.heat;
    if (this.vehiclePoints) this.vehiclePoints.visible = this.layers.objects;
    for (const object of this.business.children) if (object !== this.heat && object !== this.vehiclePoints) object.visible = this.layers.objects && this.style.cityMarkers !== false;
    this.base.visible = this.style.mapHalo !== false; this.sweep.visible = this.style.mapSweep !== false;
  }
  hover(id) { if (id !== this.hovered) { this.hovered = id; this.paint(); this.callbacks.hover?.(id); this.dirty = true; } }
  pick(event, select) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    this.raycaster.params.Points.threshold = .65;
    const city = this.raycaster.intersectObjects(this.cityHits ?? [])[0];
    const point = !city && this.layers.objects && this.vehiclePoints ? this.raycaster.intersectObject(this.vehiclePoints)[0] : null;
    const region = !city && !point ? this.raycaster.intersectObjects(this.regionMeshes)[0] : null;
    const row = point ? this.positions[point.index] : this.cityRows?.get(String((city ?? region)?.object.userData.id));
    this.renderer.domElement.style.cursor = row ? 'pointer' : 'grab';
    if (select && row) this.callbacks.select?.({ kind: point ? 'vehicles' : 'cities', id: row.id, raw: row });
    else this.hover(row && !point ? row.id : '');
  }

  resize() {
    if (this.disposed) return;
    const rect = this.host.getBoundingClientRect(); this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix(); this.renderer.setSize(this.width, this.height, false);
    this.reset(false); this.dirty = true;
  }
  reset(animated = true) {
    if (!this.width) return;
    const panel = this.width < 1100 ? 0 : this.width * Number(this.style.panelWidth ?? 21.5) / 100 + 34;
    const usableWidth = Math.max(250, this.width - panel * 2), usableHeight = Math.max(200, this.height - 190);
    const fov = THREE.MathUtils.degToRad(this.camera.fov), tilt = THREE.MathUtils.degToRad(this.style.map3d === false ? 0 : Number(this.style.mapPitch ?? 42));
    const rotation = THREE.MathUtils.degToRad(Number(this.style.mapRotation ?? -10));
    const fit = Math.max(this.span.x / (usableWidth / this.height), this.span.z * Math.cos(tilt) / (usableHeight / this.height));
    const distance = fit / (2 * Math.tan(fov / 2)) * 1.16 * Math.pow(.84, Number(this.style.mapZoomOffset ?? 0));
    const target = { x: this.center.x, y: this.depth / 2, z: this.center.z };
    const position = { x: target.x + Math.sin(rotation) * distance * Math.sin(tilt), y: target.y + distance * Math.cos(tilt), z: target.z + Math.cos(rotation) * distance * Math.sin(tilt) + .001 };
    this.controls.minDistance = distance * .4; this.controls.maxDistance = distance * 2.3;
    this.camera.setViewOffset(this.width, this.height, 0, -this.height * .055, this.width, this.height);
    this.cameraTween?.kill(); this.targetTween?.kill();
    if (animated && !this.reduce?.matches) {
      this.cameraTween = gsap.to(this.camera.position, { ...position, duration: .8, ease: 'power2.inOut', onUpdate: () => { this.dirty = true; } });
      this.targetTween = gsap.to(this.controls.target, { ...target, duration: .8, ease: 'power2.inOut' });
    } else { this.camera.position.set(position.x, position.y, position.z); this.controls.target.set(target.x, target.y, target.z); this.controls.update(); }
    this.dirty = true;
  }
  zoom(amount) { const delta = this.camera.position.clone().sub(this.controls.target); delta.multiplyScalar(amount > 0 ? .84 : 1.19); delta.clampLength(this.controls.minDistance, this.controls.maxDistance); this.camera.position.copy(this.controls.target).add(delta); this.dirty = true; }
  enter() { if (!this.reduce.matches && !this.paused) { this.land.scale.y = .1; this.intro = gsap.to(this.land.scale, { y: this.depth, duration: 1.1, ease: 'power2.out', onUpdate: () => { this.dirty = true; } }); } }
  setPaused(value) { this.paused = value; this.lastAt = 0; if (value) this.intro?.progress(1); this.dirty = true; }
  setActive(value) { this.active = value; this.lastAt = 0; if (value) { if (!this.paused) this.intro?.resume(); this.start(); } else { cancelAnimationFrame(this.frameId); this.intro?.pause(); } }
  start() { cancelAnimationFrame(this.frameId); if (this.active && !document.hidden && !this.disposed) this.frameId = requestAnimationFrame(this.frame); }
  frame = at => {
    if (this.disposed || !this.active || document.hidden) return;
    this.frameId = requestAnimationFrame(this.frame); if (at - this.drawAt < 1000 / 30) return; this.drawAt = at;
    const animated = !this.paused && !this.reduce.matches;
    if (this.lastAt && animated) this.elapsed += Math.min(.1, (at - this.lastAt) / 1000); this.lastAt = at;
    this.controls.update(); if (!animated && !this.dirty) return;
    const motion = animated ? 1 : 0;
    this.side.uniforms.time.value = this.elapsed; this.side.uniforms.motion.value = motion;
    for (const material of this.flowMaterials) { material.uniforms.time.value = this.elapsed; material.uniforms.motion.value = motion; }
    this.orbits.forEach((ring, index) => ring.rotation.z = this.elapsed * (index % 2 ? .025 : -.018)); this.sweep.rotation.z = -this.elapsed * .14;
    this.markerPulses.forEach((ring, index) => { const progress = (this.elapsed * .22 + index * .3) % 1; ring.scale.setScalar(this.style.pulse === false ? 1 : 1 + progress * 2.5); ring.material.opacity = this.style.pulse === false ? .4 : .6 * (1 - progress); });
    this.renderer.render(this.scene, this.camera); this.frameCount++; this.dirty = false;
    this.host.dataset.effectTime = this.elapsed.toFixed(3); this.host.dataset.frameCount = String(this.frameCount);
    this.callbacks.anchors?.((this.data?.map.items ?? []).filter(finiteLocation).map(row => {
      const point = this.projection.project(row.longitude, row.latitude, this.depth + .35).project(this.camera);
      return { id: String(row.id), x: (point.x + 1) * this.width / 2, y: (1 - point.y) * this.height / 2, visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1 };
    }));
  };

  dispose() {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frameId); this.intro?.kill(); this.cameraTween?.kill(); this.targetTween?.kill();
    this.observer.disconnect(); this.controls.dispose(); this.reduce.removeEventListener('change', this.motionChange); document.removeEventListener('visibilitychange', this.visibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown); canvas.removeEventListener('pointerup', this.pointerUp); canvas.removeEventListener('pointermove', this.pointerMove); canvas.removeEventListener('pointerleave', this.pointerLeave); canvas.removeEventListener('webglcontextlost', this.contextLost);
    disposeGroup(this.scene, true); this.texture?.dispose(); this.heatTexture?.dispose(); this.glow.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); canvas.remove();
  }
}
