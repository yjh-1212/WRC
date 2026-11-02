import * as THREE from 'three';
import { polygonParts, regionShapes } from './geography.js';

const FLOOR = -1.8;
const DEG = 180 / Math.PI;
const latitude = (mercator) => (2 * Math.atan(Math.exp(mercator)) - Math.PI / 2) * DEG;

// Preserve each source ring's short edges when a country crosses the date line.
function unwrapRing(ring, centerLng) {
  const points = [];
  let previous = centerLng;
  for (const coordinate of ring) {
    if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) continue;
    let lng = coordinate[0];
    while (lng - previous > 180) lng -= 360;
    while (lng - previous < -180) lng += 360;
    points.push([lng, coordinate[1]]);
    previous = lng;
  }
  return points;
}

// Clip fills to the local map extent before triangulation; this keeps distant
// countries out of the scene and avoids enormous world-space bounding boxes.
function clipRing(ring, extent) {
  let result = ring;
  for (const [axis, limit, positive] of [[0, extent.west, true], [0, extent.east, false], [1, extent.south, true], [1, extent.north, false]]) {
    const input = result;
    result = [];
    if (!input.length) break;
    let previous = input[input.length - 1];
    let wasInside = positive ? previous[axis] >= limit : previous[axis] <= limit;
    for (const current of input) {
      const inside = positive ? current[axis] >= limit : current[axis] <= limit;
      if (inside !== wasInside) {
        const t = (limit - previous[axis]) / (current[axis] - previous[axis]);
        result.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t]);
      }
      if (inside) result.push(current);
      previous = current;
      wasInside = inside;
    }
  }
  if (result.length < 3) return [];
  const first = result[0], last = result[result.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) result.push([...first]);
  return result;
}

// Clip original edges individually. A clipped country must never gain a drawn
// border along the rectangular rendering extent.
function clipSegment(a, b, extent) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let start = 0, end = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - extent.west, extent.east - a[0], a[1] - extent.south, extent.north - a[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return null; continue; }
    const ratio = q[i] / p[i];
    if (p[i] < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end) return null;
  }
  return [[a[0] + start * dx, a[1] + start * dy], [a[0] + end * dx, a[1] + end * dy]];
}

function fadedMaterial(color, opacity, bounds, fade = .16) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
      uExtent: { value: bounds }, uFade: { value: fade },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vMapPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vMapPosition = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec4 uExtent;
      uniform float uFade;
      varying vec2 vMapPosition;
      void main() {
        vec2 uv = (vMapPosition - uExtent.xy) / (uExtent.zw - uExtent.xy);
        vec2 edge = min(uv, 1.0 - uv);
        float alpha = smoothstep(0.0, uFade, edge.x) * smoothstep(0.0, uFade, edge.y);
        gl_FragColor = vec4(uColor, uOpacity * alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function lineSegments(vertices, material, name) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = name;
  lines.raycast = () => {};
  return lines;
}

/** A shared-projection, non-interactive geographic context below the China map. */
export function buildPlanarBackdrop(world, projection, { stars = true } = {}) {
  const group = new THREE.Group();
  group.name = 'planar-world-context';
  const extent = {
    west: projection.bounds.min.x * DEG - 15,
    east: projection.bounds.max.x * DEG + 15,
    south: Math.max(-75, latitude(projection.bounds.min.y) - 15),
    north: Math.min(75, latitude(projection.bounds.max.y) + 15),
  };
  const northwest = projection.project(extent.west, extent.north);
  const southeast = projection.project(extent.east, extent.south);
  const bounds = new THREE.Vector4(northwest.x, northwest.z, southeast.x, southeast.z);
  group.userData.geographicExtent = extent;

  const oceanGeometry = new THREE.PlaneGeometry(southeast.x - northwest.x, southeast.z - northwest.z);
  oceanGeometry.rotateX(-Math.PI / 2);
  oceanGeometry.translate((northwest.x + southeast.x) / 2, FLOOR, (northwest.z + southeast.z) / 2);
  const ocean = new THREE.Mesh(oceanGeometry, fadedMaterial('#07121e', .88, bounds));
  ocean.name = 'planar-ocean'; ocean.renderOrder = -4; ocean.raycast = () => {};
  group.add(ocean);

  const shapes = [], borders = [];
  const centerLng = (extent.west + extent.east) / 2;
  for (const feature of world?.features ?? []) {
    const clippedParts = [];
    const isChina = feature.properties?.name === '中国' || feature.properties?.name === 'China' || feature.properties?.iso_a3 === 'CHN';
    for (const rings of polygonParts(feature)) {
      const unwrapped = rings.map(ring => unwrapRing(ring, centerLng));
      const outer = clipRing(unwrapped[0] ?? [], extent);
      if (!outer.length) continue;
      const holes = unwrapped.slice(1).map(ring => clipRing(ring, extent)).filter(ring => ring.length >= 4);
      clippedParts.push([outer, ...holes]);
      // China's detailed foreground already owns its national border.
      if (isChina) continue;
      for (const ring of unwrapped) for (let i = 1; i < ring.length; i++) {
        const segment = clipSegment(ring[i - 1], ring[i], extent);
        if (!segment) continue;
        borders.push(...projection.project(...segment[0], FLOOR + .05).toArray(), ...projection.project(...segment[1], FLOOR + .05).toArray());
      }
    }
    if (clippedParts.length) shapes.push(...regionShapes({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: clippedParts } }, projection, .075));
  }
  if (shapes.length) {
    const landGeometry = new THREE.ShapeGeometry(shapes, 2);
    landGeometry.rotateX(-Math.PI / 2);
    landGeometry.translate(0, FLOOR + .025, 0);
    const land = new THREE.Mesh(landGeometry, fadedMaterial('#142331', .64, bounds));
    land.name = 'planar-land'; land.renderOrder = -3; land.raycast = () => {};
    group.add(land);
  }
  const boundary = lineSegments(borders, fadedMaterial('#365060', .19, bounds), 'planar-context-borders');
  boundary.renderOrder = -2;
  group.add(boundary);

  const grid = [];
  for (let lng = Math.ceil(extent.west / 10) * 10; lng < extent.east; lng += 10) {
    grid.push(...projection.project(lng, extent.south, FLOOR + .06).toArray(), ...projection.project(lng, extent.north, FLOOR + .06).toArray());
  }
  for (let lat = Math.ceil(extent.south / 10) * 10; lat < extent.north; lat += 10) {
    grid.push(...projection.project(extent.west, lat, FLOOR + .06).toArray(), ...projection.project(extent.east, lat, FLOOR + .06).toArray());
  }
  const graticule = lineSegments(grid, fadedMaterial('#315264', .115, bounds, .2), 'planar-graticule');
  graticule.renderOrder = -1;
  group.add(graticule);

  const particles = [];
  const fraction = n => n - Math.floor(n);
  for (let i = 0; i < 56; i++) {
    const x = northwest.x + fraction(Math.sin(i * 127.1 + 9.2) * 43758.5453) * (southeast.x - northwest.x);
    const z = northwest.z + fraction(Math.sin(i * 269.5 + 4.7) * 31397.8371) * (southeast.z - northwest.z);
    particles.push(x, FLOOR + .08, z);
  }
  const starfield = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(particles, 3)), new THREE.PointsMaterial({ color: '#63818e', size: .095, transparent: true, opacity: .17, depthWrite: false, sizeAttenuation: true }));
  starfield.name = 'starfield'; starfield.visible = stars; starfield.raycast = () => {};
  group.add(starfield);
  return group;
}
