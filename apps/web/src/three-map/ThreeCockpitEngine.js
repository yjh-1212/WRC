import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadGeo, createProjection, polygonParts, extrudeRegion, boundaryLines, disposeGroup } from './geography.js';
import { createSideMaterial, MapEffects } from './MapEffects.js';
import { buildPlanarBackdrop } from './PlanarBackdrop.js';
import { createProvinceTexture } from './ProvinceTexture.js';

const textColor = '#89bdd1';
const normalizeMode = value => ({ cities: 'ranking', operation: 'overview', situation: 'overview', enterprises: 'vehicles' }[value] ?? value ?? 'overview');
const imageLoader = new THREE.TextureLoader();
const fullName = feature => feature.properties.name ?? feature.properties.NAME ?? '';

export class ThreeCockpitEngine {
  constructor(container, callbacks = {}) {
    this.container = container; this.callbacks = callbacks; this.disposed = false; this.generation = 0;
    this.scene = new THREE.Scene(); this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 1_000_000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.22;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.domElement.setAttribute('aria-label', '三级监管交互地图');
    this.container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .085;
    this.controls.maxPolarAngle = Math.PI * .42; this.controls.minPolarAngle = .05;
    this.controls.enablePan = false; this.controls.zoomSpeed = .55; this.controls.rotateSpeed = .42;
    this.controls.addEventListener('start', () => { this.tween = null; this.followId = null; });
    this.mapGroup = new THREE.Group(); this.backdrop = new THREE.Group(); this.effectGroup = new THREE.Group();
    this.scene.add(this.mapGroup, this.backdrop, this.effectGroup);
    this.hemi = new THREE.HemisphereLight('#c0e9ff', '#11263d', 2.1);
    this.keyLight = new THREE.DirectionalLight('#d4efff', 2.4); this.keyLight.position.set(-40, 90, -20);
    this.rim = new THREE.DirectionalLight('#2f91d6', 1.1); this.rim.position.set(50, 15, 50);
    this.scene.add(this.hemi, this.keyLight, this.rim);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(10, 10);
    this.pickables = []; this.regions = new Map(); this.labels = []; this.screenLabels = [];
    this.selected = null; this.hovered = null; this.mode = 'overview'; this.metric = 'registeredVehicles';
    this.settings = { animate: true, performance: 'standard', stars: true, atmosphere: true, halos: true };
    this.visibility = {}; this.cameraMemory = new Map(); this.elapsed = 0; this.lastTime = 0; this.lastLabels = 0;
    this.setupBloom();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.pointerMove = e => this.onPointerMove(e); this.pointerDown = e => { this.pointerStart = [e.clientX, e.clientY]; };
    this.pointerClick = e => { if (!this.pointerStart || Math.hypot(e.clientX - this.pointerStart[0], e.clientY - this.pointerStart[1]) < 5) this.pick(e, false); };
    this.pointerDouble = e => this.pick(e, true); this.pointerLeave = () => this.setHover(null);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.pointerMove); canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('click', this.pointerClick); canvas.addEventListener('dblclick', this.pointerDouble); canvas.addEventListener('pointerleave', this.pointerLeave);
    this.resize(); this.renderer.setAnimationLoop(t => this.frame(t));
  }

  setupBloom() {
    this.bloomComposer = new EffectComposer(this.renderer); this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), .18, .35, .3); this.bloomComposer.addPass(this.bloomPass);
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composite = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, bloom: { value: this.bloomComposer.renderTarget2.texture } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform sampler2D tDiffuse;uniform sampler2D bloom;varying vec2 vUv;void main(){vec4 base=texture2D(tDiffuse,vUv);vec4 glow=texture2D(bloom,vUv);gl_FragColor=vec4(base.rgb+glow.rgb,max(base.a,max(glow.r,max(glow.g,glow.b))));}',
    }));
    this.composer.addPass(this.composite); this.composer.addPass(new OutputPass());
  }

  async load(data, drill, mode = this.mode) {
    if (!['national', 'province'].includes(data.scene.level)) throw new Error('城市级地图由高德引擎承接');
    const key = `${data.scene.level}:${data.scene.regionCode}`;
    this.mode = normalizeMode(mode); this.data = data; this.drill = drill;
    if (this.key === key && this.loaded) {
      this.updateRegionData(); this.rebuildEffects();
      return;
    }
    const generation = ++this.generation;
    this.loaded = false; this.callbacks.loading?.();
    if (this.key) this.cameraMemory.set(this.key, { position: this.camera.position.clone(), target: this.controls.target.clone() });
    this.clearScene(); this.key = key; this.level = data.scene.level; this.selected = null; this.applyLevelLight();
    this.controls.enablePan = false; this.controls.autoRotate = false;
    {
      const [national, geo, country, world] = await Promise.all([loadGeo('100000'), loadGeo(data.scene.regionCode), loadGeo('100000_bound'), this.level === 'national' ? loadGeo('world') : Promise.resolve(null)]);
      if (generation !== this.generation || this.disposed) return;
      this.geo = geo; this.national = national; this.country = country;
      this.projection = createProjection(geo.features); this.textureProjection = createProjection(national.features);
      this.depth = this.level === 'national' ? .95 : 1.5;
      this.texture ??= await imageLoader.loadAsync('/map/threemap/textures/china_tintable_hc.png').catch(() => imageLoader.loadAsync('/map/threemap/textures/china_tintable.png'));
      if (generation !== this.generation || this.disposed) return;
      this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.provinceTexture ??= createProvinceTexture(); this.provinceTexture.anisotropy = this.texture.anisotropy;
      if (world) this.backdrop.add(buildPlanarBackdrop(world, this.projection, this.settings)); else this.buildProvinceContext(national, geo, data.scene.regionCode);
      this.buildRegions(geo);
      this.bounds = new THREE.Box3().setFromObject(this.mapGroup);
      const borderFeatures = this.level === 'national' ? country.features : national.features.filter(f => String(f.properties.adcode) === data.scene.regionCode);
      this.outline = { features: borderFeatures };
      this.nationalOutline = boundaryLines(borderFeatures, this.projection, this.depth + .04, this.level === 'national' ? '#e7f7ff' : '#48b7ce', this.level === 'national' ? .85 : .8, .025);
      this.nationalOutline.layers.enable(1); this.mapGroup.add(this.nationalOutline);
      // Keep small-island source geometry; bounds/camera are fitted to administrative tops.
      this.updateRegionData(); this.rebuildEffects();
    }
    if (generation !== this.generation || this.disposed) return;
    this.loaded = true;
    this.fit(true);
    const remembered = this.cameraMemory.get(key);
    if (remembered) this.animateCamera(remembered.position, remembered.target, .7);
    this.mapGroup.scale.y = this.settings.animate ? .05 : 1; this.entryAt = this.elapsed;
    this.pendingReady = true; this.publishLabels();
  }

  buildRegions(geo) {
    this.side = createSideMaterial(this.depth, this.level === 'national' ? 'national' : 'default'); this.centers = new Map();
    for (const feature of geo.features) {
      const code = String(feature.properties.adcode); const region = this.data.regions.find(r => r.code === code);
      const group = new THREE.Group(); group.name = `region-${code}`;
      const national = this.level === 'national';
      const top = new THREE.MeshStandardMaterial({ color: national ? '#7ecfe2' : '#579bb8', map: national ? this.texture : this.provinceTexture, roughness: national ? .82 : .96, metalness: .02, emissive: national ? '#1c6078' : '#000000', emissiveIntensity: national ? .55 : 0, bumpMap: national ? this.texture : null, bumpScale: national ? .04 : .08 });
      const mesh = new THREE.Mesh(extrudeRegion(feature, this.projection, this.depth, national ? .024 : .005, national ? this.textureProjection : this.projection), [top, this.side]);
      const border = boundaryLines([feature], this.projection, this.depth + .025, national ? '#d5f3fb' : '#52a9c4', national ? .72 : .62, national ? .024 : .005);
      border.renderOrder = 5; border.material.depthWrite = false; border.material.depthTest = false;
      mesh.userData = { kind: 'region', id: code, code, name: region?.name ?? fullName(feature), connected: region?.connected, raw: region ?? { name: fullName(feature) } };
      group.add(mesh, border); this.mapGroup.add(group); this.pickables.push(mesh);
      const centroid = feature.properties.centroid ?? feature.properties.center ?? [region?.longitude, region?.latitude];
      let center = centroid?.every(Number.isFinite) ? this.projection.project(...centroid, this.depth + .15) : new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      center.y = this.depth + .15; this.centers.set(code, center);
      this.regions.set(code, { code, group, mesh, top, border, region, center, targetHeight: 0, feature });
    }
  }

  buildProvinceContext(national, target, code) {
    const targetBox = new THREE.Box3();
    for (const feature of target.features) for (const rings of polygonParts(feature)) for (const coord of rings[0]) targetBox.expandByPoint(this.projection.project(...coord));
    const expanded = targetBox.clone().expandByScalar(28);
    for (const feature of national.features) {
      if (String(feature.properties.adcode) === code) continue;
      const p = feature.properties.centroid ?? feature.properties.center;
      if (!p || !expanded.containsPoint(this.projection.project(...p))) continue;
      const geometry = extrudeRegion(feature, this.projection, .1, .03);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#102b3c', transparent: true, opacity: .38, depthWrite: false })); mesh.position.y = -1.4;
      this.backdrop.add(mesh, boundaryLines([feature], this.projection, -1.25, '#234b60', .45, .025));
      this.contextLabels ??= []; this.contextLabels.push({ id: `context-${feature.properties.adcode}`, name: fullName(feature), position: this.projection.project(...p, -.5), context: true });
    }
    const grid = new THREE.GridHelper(180, 26, '#1a5369', '#123345'); grid.position.y = -2; grid.material.transparent = true; grid.material.opacity = .25; this.backdrop.add(grid);
  }

  updateRegionData() {
    const key = this.mode === 'risks' ? 'riskEvents' : this.mode === 'quality' ? 'dataQualityRate' : this.metric;
    const max = Math.max(1, ...this.data.regions.map(r => Number(r.summary?.[key] ?? 0)));
    this.labels = [];
    for (const item of this.regions.values()) {
      item.region = this.data.regions.find(r => r.code === item.code);
      const region = item.region;
      const ratio = Math.min(1, Math.max(0, Number(region?.summary?.[key] ?? 0) / max));
      const tint = (from, to, amount) => new THREE.Color(from).lerp(new THREE.Color(to), Math.min(1, Math.max(0, amount)));
      const nationalRamp = amount => amount < .5 ? tint('#5eb6d0', '#8ed8ea', amount * 2) : tint('#8ed8ea', '#f2fdff', (amount - .5) * 2);
      let base;
      if (this.level === 'national') {
        if (!region?.summary) base = new THREE.Color('#5eb6d0');
        else if (this.mode === 'risks') base = tint('#5eb6d0', region?.summary?.majorEvents > 0 ? '#ff8f86' : '#ffc56a', .4 + ratio * .6);
        else if (this.mode === 'vehicles') base = tint('#5eb6d0', '#9cf0d0', .25 + ratio * .75);
        else if (this.mode === 'quality') base = nationalRamp(Math.max(0, (Number(region?.summary?.dataQualityRate ?? 0) - 70) / 30));
        else base = nationalRamp(ratio);
      } else {
        base = new THREE.Color('#24556f');
        if (this.mode === 'ranking') base = new THREE.Color('#28526f').lerp(new THREE.Color('#72d3de'), Math.ceil(ratio * 4) / 4);
        if (this.mode === 'risks') base = new THREE.Color('#365e78').lerp(new THREE.Color(region?.summary?.majorEvents > 0 ? '#d36c6c' : '#c28e5c'), ratio * .8);
        if (this.mode === 'vehicles') base = new THREE.Color('#416c98').lerp(new THREE.Color('#8d9ddd'), ratio * .72);
        if (this.mode === 'quality') base = new THREE.Color('#b07850').lerp(new THREE.Color('#64c5b5'), Math.max(0, (Number(region?.summary?.dataQualityRate ?? 0) - 75) / 25));
        if (!region?.summary) base = new THREE.Color('#395c6c');
      }
      item.baseColor = base;
      item.mesh.userData = { kind: 'region', id: item.code, code: item.code, name: region?.name ?? fullName(item.feature), connected: region?.connected, raw: region ?? { name: fullName(item.feature) } };
      this.labels.push({ ...item.mesh.userData, position: item.center, count: region?.summary?.registeredVehicles, priority: this.level === 'province' || region?.connected ? 10 : ratio });
    }
    this.styleRegions();
  }

  styleRegions() {
    for (const item of this.regions.values()) {
      const hovered = this.hovered === item.code, selected = this.selected === item.code, national = this.level === 'national';
      item.top.color.copy(item.baseColor ?? new THREE.Color(national ? '#7ecfe2' : '#579bb8'));
      if (hovered || selected) item.top.color.lerp(new THREE.Color(national ? '#ffffff' : '#b8f0fa'), selected ? (national ? .28 : .3) : (national ? .16 : .2));
      else if (this.selected) item.top.color.multiplyScalar(national ? .9 : .74);
      item.border.material.color.set(hovered || selected ? '#ffffff' : (national ? '#d5f3fb' : '#53a7c5'));
      item.border.material.opacity = hovered || selected ? 1 : .56;
      item.border.layers.set(hovered || selected ? 1 : 0); item.border.layers.enable(0);
      item.targetHeight = hovered ? .72 : selected ? .35 : 0;
    }
  }

  rebuildEffects() {
    this.effects?.dispose(); disposeGroup(this.effectGroup);
    this.effects = new MapEffects(this.effectGroup, this.projection, this.depth);
    this.effects.build(this.data, this.mode, this.centers, this.outline ?? { features: [] }, this.level === 'national');
    for (const [id, show] of Object.entries(this.visibility)) this.effects.setVisible(id, show);
  }

  applyLevelLight() {
    const national = this.level === 'national';
    this.hemi.color.set(national ? '#e7f7ff' : '#c0e9ff');
    this.hemi.groundColor.set(national ? '#1a3a4c' : '#11263d');
    this.hemi.intensity = national ? 2.35 : 2.1;
    this.keyLight.color.set(national ? '#f4fbff' : '#d4efff');
    this.keyLight.intensity = national ? 2.7 : 2.4;
    this.rim.color.set(national ? '#8fd0e4' : '#2f91d6');
    this.rim.intensity = national ? .9 : 1.1;
    this.renderer.toneMappingExposure = national ? 1.32 : 1.22;
    if (this.bloomPass) this.bloomPass.strength = national ? .12 : .18;
  }

  setMode(mode, metric) {
    this.mode = normalizeMode(mode); this.metric = metric ?? this.metric;
    if (!this.loaded) return;
    this.updateRegionData(); this.rebuildEffects();
    this.publishLabels();
  }

  setSelected(id, focus = false) {
    const changed = this.selected !== id; this.selected = id;
    this.styleRegions();
    if (changed && id && focus) {
      const center = this.centers?.get(id);
      if (center) { const nextTarget = this.controls.target.clone().lerp(center, .13); const diff = nextTarget.clone().sub(this.controls.target); this.animateCamera(this.camera.position.clone().add(diff), nextTarget, .55); }
    }
    this.publishLabels();
  }

  setHover(id, screen, payload) {
    if (this.hovered !== id) { this.hovered = id; this.styleRegions(); this.callbacks.hover?.(id); }
    const item = payload ?? this.regions.get(id)?.mesh.userData;
    if (item && screen) this.callbacks.tooltip?.({ ...item, x: screen.x, y: screen.y });
    else if (!id || this.tooltipId !== id) this.callbacks.tooltip?.(null);
    this.tooltipId = item && screen ? id : null;
    this.container.style.cursor = id ? 'pointer' : 'default';
  }

  onPointerMove(event) {
    if (event.buttons) return;
    const now = performance.now(); if (now - (this.lastPick ?? 0) < 28) return; this.lastPick = now;
    const hit = this.intersection(event); const payload = hit ? this.selectionFor(hit) : null;
    this.setHover(payload?.id ?? null, payload ? { x: event.offsetX, y: event.offsetY } : null, payload);
  }

  intersection(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.pickables, true).find(hit => hit.object.visible && this.objectVisible(hit.object));
  }
  objectVisible(object) { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; }
  selectionFor(hit) { return hit.object.userData; }
  pick(event, drill) { const hit = this.intersection(event); if (hit) { const item = this.selectionFor(hit); if (item) this.activate(item, drill); } }
  activate(item, drill = false) {
    if (item.cluster || item.raw?.cluster) {
      const center = item.raw?.position ?? item.position;
      if (center) this.animateCamera(center.clone().add(this.camera.position.clone().sub(this.controls.target).multiplyScalar(.45)), center, .65);
      return;
    }
    this.callbacks[drill ? 'drill' : 'select']?.(item);
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    const ratio = settings.performance === 'high' ? Math.min(2, window.devicePixelRatio) : settings.performance === 'low' ? 1 : Math.min(1.5, window.devicePixelRatio);
    this.renderer.setPixelRatio(ratio); this.resize(false);
    this.backdrop.visible = this.level !== 'national' || this.settings.atmosphere !== false;
    const stars = this.backdrop.getObjectByName('starfield'); if (stars) stars.visible = this.settings.stars;
  }
  setLayerVisible(id, show) { this.visibility[id] = show; if (id === 'admin') this.mapGroup.visible = show; this.effects?.setVisible(id, show); if (id === 'labels') this.publishLabels(); }
  setTrackProgress() { /* Trajectory controls are provided by the city engine. */ }
  follow(id) { this.followId = id || null; }
  toggleOrbit() { this.controls.autoRotate = !this.controls.autoRotate; this.controls.autoRotateSpeed = .18; return this.controls.autoRotate; }
  zoom(direction) { const delta = this.camera.position.clone().sub(this.controls.target); delta.multiplyScalar(direction > 0 ? .78 : 1.28); this.animateCamera(this.controls.target.clone().add(delta), this.controls.target, .28); }
  topDown() { const range = this.camera.position.distanceTo(this.controls.target); this.animateCamera(this.controls.target.clone().add(new THREE.Vector3(0, range, .01)), this.controls.target, .65); }
  north() { const delta = this.camera.position.clone().sub(this.controls.target); this.animateCamera(this.controls.target.clone().add(new THREE.Vector3(0, delta.y, Math.hypot(delta.x, delta.z))), this.controls.target, .5); }
  overview() { this.followId = null; this.fit(false); }

  fit(immediate = false) {
    if (!this.bounds || this.bounds.isEmpty()) return;
    const size = this.bounds.getSize(new THREE.Vector3()), target = this.bounds.getCenter(new THREE.Vector3());
    const width = this.container.clientWidth || 1920, height = this.container.clientHeight || 1080;
    const panel = Math.max(290, Math.min(width * .18, 620));
    const safeX = Math.max(.42, (width - panel * 2 - 110) / width), safeY = .73;
    const angle = this.level === 'national' ? 1.18 : 1.05;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const vertical = size.z * Math.sin(angle) + size.y * Math.cos(angle);
    const range = Math.max(size.x / (2 * tan * this.camera.aspect * safeX), vertical / (2 * tan * safeY), 10) * 1.07;
    this.controls.minDistance = range * .28; this.controls.maxDistance = range * 1.7;
    this.camera.near = Math.max(.05, range / 2000); this.camera.far = Math.max(2000, range * 18); this.camera.updateProjectionMatrix();
    const position = target.clone().add(new THREE.Vector3(0, Math.sin(angle) * range, Math.cos(angle) * range));
    this.home = { position, target };
    if (immediate) { this.camera.position.copy(position); this.controls.target.copy(target); this.controls.update(); }
    else this.animateCamera(position, target, .85);
  }

  animateCamera(position, target, duration = .8) {
    this.tween = { from: this.camera.position.clone(), to: position.clone(), targetFrom: this.controls.target.clone(), target: target.clone(), at: this.elapsed, duration: this.settings.animate ? duration : .001 };
  }
  projectScreen(position) {
    if (!position) return null;
    const p = position.clone().project(this.camera), w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, visible: p.z < 1 && p.z > -1 && Math.abs(p.x) < .96 && Math.abs(p.y) < .96 };
  }

  publishLabels() {
    if (!this.loaded || this.visibility.labels === false) { this.callbacks.labels?.([]); return; }
    const labels = [...this.labels, ...(this.contextLabels ?? [])];
    const candidates = labels.map(label => {
      const position = label.position?.clone(); if (!position) return null;
      if (!label.context) position.y += this.regions.get(label.id)?.group.position.y ?? 0;
      const p = this.projectScreen(position); return p?.visible ? { ...label, ...p, selected: this.selected === label.id, hovered: this.hovered === label.id } : null;
    }).filter(Boolean);
    candidates.sort((a, b) => Number(b.selected || b.hovered) - Number(a.selected || a.hovered) || (b.priority ?? 0) - (a.priority ?? 0));
    const placed = [];
    const max = this.level === 'national' ? 18 : 24;
    for (const label of candidates) {
      if (placed.length >= max) break;
      if (placed.some(p => Math.abs(p.x - label.x) < 70 && Math.abs(p.y - label.y) < 24) && !label.selected && !label.hovered) continue;
      placed.push(label);
    }
    this.screenLabels = placed; this.callbacks.labels?.(placed);
  }

  resize(refit = true) {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); this.composer.setSize(width, height); this.bloomComposer.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    if (refit && this.loaded) this.fit(true);
  }

  frame(now) {
    if (this.disposed) return;
    const delta = Math.min(.1, this.lastTime ? (now - this.lastTime) / 1000 : .016); this.lastTime = now; this.elapsed += delta;
    if (this.tween) {
      const t = Math.min(1, (this.elapsed - this.tween.at) / this.tween.duration), ease = 1 - (1 - t) ** 3;
      this.camera.position.lerpVectors(this.tween.from, this.tween.to, ease); this.controls.target.lerpVectors(this.tween.targetFrom, this.tween.target, ease);
      if (t >= 1) this.tween = null;
    }
    if (this.loaded && this.entryAt != null) { const t = Math.min(1, (this.elapsed - this.entryAt) / .9); this.mapGroup.scale.y = this.settings.animate ? 1 - (1 - t) ** 3 : 1; if (t >= 1 || !this.settings.animate) { this.entryAt = null; if (this.pendingReady) { this.pendingReady = false; this.callbacks.ready?.(); } } }
    for (const item of this.regions.values()) item.group.position.y = THREE.MathUtils.damp(item.group.position.y, item.targetHeight, 18, delta);
    if (this.side) { this.side.uniforms.time.value = this.elapsed; this.side.uniforms.scan.value = this.settings.animate ? 1 : 0; }
    this.effects?.update(this.settings.animate ? this.elapsed : 0);
    this.controls.update();
    if (this.settings.performance === 'low' || !this.settings.halos) this.renderer.render(this.scene, this.camera);
    else { this.camera.layers.set(1); this.bloomComposer.render(); this.camera.layers.set(0); this.composer.render(); }
    if (now - this.lastLabels > 90) { this.publishLabels(); this.lastLabels = now; }
    this.frames = (this.frames ?? 0) + 1;
    if (now - (this.statsAt ?? 0) > 1000) { this.callbacks.stats?.({ fps: Math.round(this.frames * 1000 / Math.max(1, now - (this.statsAt ?? now - 1000))), calls: this.renderer.info.render.calls, attribution: '', level: this.level }); this.frames = 0; this.statsAt = now; }
  }

  clearScene() {
    this.effects?.dispose(); this.effects = null;
    disposeGroup(this.mapGroup, true); disposeGroup(this.backdrop); disposeGroup(this.effectGroup);
    this.regions.clear(); this.pickables = []; this.labels = []; this.contextLabels = []; this.side = null; this.outline = null; this.hovered = null; this.followId = null; this.tween = null;
    this.mapGroup.visible = true;
    this.callbacks.labels?.([]); this.callbacks.tooltip?.(null);
  }

  dispose() {
    this.disposed = true; this.generation++; this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.pointerMove); canvas.removeEventListener('pointerdown', this.pointerDown); canvas.removeEventListener('click', this.pointerClick); canvas.removeEventListener('dblclick', this.pointerDouble); canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.clearScene(); this.texture?.dispose(); this.provinceTexture?.dispose(); this.controls.dispose(); this.bloomComposer.passes.forEach(p => p.dispose?.()); this.composer.passes.forEach(p => p.dispose?.()); this.bloomComposer.dispose(); this.composer.dispose(); this.renderer.dispose(); canvas.remove(); this.scene.clear();
  }
}
