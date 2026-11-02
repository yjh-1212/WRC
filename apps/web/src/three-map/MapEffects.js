import * as THREE from 'three';
import { polygonParts } from './geography.js';

export function createSideMaterial(depth, tone = 'default') {
  const national = tone === 'national';
  const base = national ? 'vec3 base=mix(vec3(.08,.18,.24),vec3(.28,.58,.66),vHeight);' : 'vec3 base=mix(vec3(.018,.068,.115),vec3(.045,.255,.37),vHeight);';
  const glow = national ? 'gl_FragColor=vec4(base+vec3(.25,.55,.62)*band*.35,1.);' : 'gl_FragColor=vec4(base+vec3(.08,.42,.53)*band*.5,1.);';
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, depth: { value: depth }, scan: { value: 1 } },
    vertexShader: 'varying float vHeight; uniform float depth; void main(){vHeight=clamp(position.y/depth,0.,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying float vHeight;uniform float time;uniform float scan;void main(){float head=fract(time/4.5)*1.35;float band=max(0.,1.-abs(vHeight-head)/.24)*scan;${base}${glow}}`,
  });
}

export class MapEffects {
  constructor(group, projection, depth) {
    this.group = group; this.projection = projection; this.depth = depth; this.updates = [];
    this.groups = Object.fromEntries(['columns', 'routes', 'heat', 'trail'].map(id => { const g = new THREE.Group(); g.name = id; group.add(g); return [id, g]; }));
    this.ringGeometry = new THREE.RingGeometry(.42, .51, 48).rotateX(-Math.PI / 2);
    this.dotGeometry = new THREE.SphereGeometry(.15, 10, 8);
    this.towerGeometry = new THREE.CylinderGeometry(.075, .23, 1, 10, 1, true);
    this.texture = new THREE.TextureLoader().load('/map/threemap/effects/point.png');
  }

  build(data, mode, centers, outline, national) {
    const sorted = [...data.regions].filter(r => centers.has(r.code)).sort((a, b) => (b.summary?.registeredVehicles ?? 0) - (a.summary?.registeredVehicles ?? 0));
    if (mode === 'overview' || mode === 'vehicles') {
      const top = sorted.filter(r => r.summary?.registeredVehicles > 0).slice(0, 5);
      const max = top[0]?.summary?.registeredVehicles ?? 1;
      for (const [i, region] of top.entries()) {
        const center = centers.get(region.code).clone(); center.y = this.depth + .04;
        const h = 2.2 + region.summary.registeredVehicles / max * 4.3;
        const pillar = new THREE.Mesh(this.towerGeometry, new THREE.MeshBasicMaterial({ color: national ? '#5fbfb6' : '#43d6ed', transparent: true, opacity: national ? .28 : .36, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        pillar.scale.y = h; pillar.position.copy(center); pillar.position.y += h / 2; pillar.layers.enable(1);
        const ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color: national ? '#7ec8c3' : '#5de4fa', transparent: true, opacity: national ? .42 : .7, depthWrite: false, side: THREE.DoubleSide }));
        ring.position.copy(center); ring.layers.enable(1);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(.25, .7, 4), new THREE.MeshBasicMaterial({ color: national ? '#d7efe8' : '#87efff', transparent: true, opacity: national ? .62 : .8 }));
        cone.position.copy(center); cone.position.y += h + .45; cone.rotation.z = Math.PI; cone.layers.enable(1);
        this.groups.columns.add(pillar, ring, cone);
        this.updates.push(t => { ring.rotation.y = t * .4 + i; cone.rotation.y = t * .5; });
      }
    }
    if (mode === 'overview' && sorted.length > 1) {
      // Demo relationships are deliberately separate from real aggregate counts.
      const relationships = national ? [['110000','370000'], ['310000','370000'], ['320000','370000'], ['440000','370000'], ['370000','340000'], ['510000','370000']] : sorted.slice(1, 7).map(r => [sorted[0].code, r.code]);
      for (const [i, pair] of relationships.entries()) {
        if (!centers.has(pair[0]) || !centers.has(pair[1])) continue;
        const start = centers.get(pair[0]).clone(), end = centers.get(pair[1]).clone();
        start.y = end.y = this.depth + .16;
        const middle = start.clone().lerp(end, .5); middle.y += Math.max(2.8, start.distanceTo(end) * .32);
        const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), new THREE.LineBasicMaterial({ color: national ? '#6f8ea3' : '#479bb4', transparent: true, opacity: national ? .32 : .4, depthWrite: false }));
        const streak = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, .022, 3, false), new THREE.MeshBasicMaterial({ color: national ? '#8fd0c8' : '#65d5ee', transparent: true, opacity: national ? .16 : .24, depthWrite: false }));
        const dot = new THREE.Mesh(this.dotGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(national ? '#d7efe8' : '#a0f1ff').multiplyScalar(national ? 1 : 1.6) })); dot.layers.enable(1);
        this.groups.routes.add(line, streak, dot);
        this.updates.push(t => dot.position.copy(curve.getPoint((t / 6 + i * .14) % 1)));
      }
    }
    if (['overview', 'risks', 'quality'].includes(mode)) {
      const key = mode === 'quality' ? 'dataQualityRate' : 'riskEvents';
      const risks = sorted.filter(r => r.summary && (mode === 'quality' ? r.summary.dataQualityRate < 95 : r.summary.riskEvents > 0)).sort((a, b) => mode === 'quality' ? a.summary[key] - b.summary[key] : b.summary[key] - a.summary[key]).slice(0, mode === 'overview' ? 3 : 8);
      for (const [i, region] of risks.entries()) {
        const center = centers.get(region.code).clone(); center.y = this.depth + .1;
        const color = region.summary.majorEvents > 0 && mode !== 'quality' ? '#eb5757' : '#f2994a';
        const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, color, transparent: true, opacity: .92, depthWrite: false })); core.position.copy(center); core.position.y += .1; core.scale.setScalar(1.15); core.layers.enable(1);
        const pulse = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false })); pulse.position.copy(center);
        this.groups.heat.add(core, pulse);
        this.updates.push(t => { const phase = (t / 2.8 + i * .17) % 1; pulse.scale.setScalar(.65 + phase * 2.1); pulse.material.opacity = .45 * (1 - phase); });
        if (!national && mode === 'risks') {
          const heat = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.texture, color, transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }));
          heat.position.copy(center); heat.position.y -= .02;
          const scale = .6 + Math.min(1.5, region.summary.riskEvents / 12); heat.scale.setScalar(scale); this.groups.heat.add(heat);
        }
      }
    }
    let longest = [];
    for (const feature of outline.features ?? []) for (const rings of polygonParts(feature)) if (rings[0].length > longest.length) longest = rings[0];
    if (longest.length > 2) {
      const points = longest.map(p => this.projection.project(...p, this.depth + .12));
      const count = Math.min(90, Math.max(12, Math.floor(points.length * .06)));
      const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { const c = new THREE.Color(national ? '#8fd0c8' : '#a5f7ff').multiplyScalar(i / count); c.toArray(colors, i * 3); }
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)).setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .95, depthWrite: false })); trail.layers.enable(1); trail.frustumCulled = false; this.groups.trail.add(trail);
      this.updates.push(t => { const start = Math.floor((t / 14 % 1) * points.length); for (let i = 0; i < count; i++) points[(start + i) % points.length].toArray(positions, i * 3); geo.attributes.position.needsUpdate = true; });
    }
  }

  setVisible(id, visible) { if (this.groups[id]) this.groups[id].visible = visible; }
  update(t) { this.updates.forEach(fn => fn(t)); }
  dispose() { this.updates = []; this.ringGeometry.dispose(); this.dotGeometry.dispose(); this.towerGeometry.dispose(); this.texture.dispose(); }
}
