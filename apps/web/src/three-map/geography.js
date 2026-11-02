import * as THREE from 'three';
import { simplifyRing } from '../cockpit/cartography.js';

const jsonCache = new Map();
export const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
export const polygonParts = (feature) => feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : [];
export async function loadGeo(code) {
  const url = `/map/threemap/geojson/${code}.json`;
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then(r => {
    if (!r.ok) throw new Error(`行政区资源加载失败（${code}）`);
    return r.json();
  }).then(async geo => {
    // The reference's national file omits Hong Kong/Macao; preserve their supplied
    // district polygons under a parent feature rather than dropping those regions.
    if (String(code) !== '100000') return geo;
    const extra = await Promise.all([loadGeo('810000'), loadGeo('820000')]);
    const features = [...geo.features];
    for (const [index, source] of extra.entries()) {
      const adcode = index === 0 ? 810000 : 820000;
      if (features.some(feature => Number(feature.properties.adcode) === adcode)) continue;
      const centers = source.features.map(feature => feature.properties.centroid ?? feature.properties.center).filter(Boolean);
      const center = [0, 1].map(axis => centers.reduce((sum, point) => sum + point[axis], 0) / centers.length);
      features.push({ type: 'Feature', properties: { adcode, name: index === 0 ? '香港特别行政区' : '澳门特别行政区', center, centroid: center, level: 'province' }, geometry: { type: 'MultiPolygon', coordinates: source.features.flatMap(polygonParts) } });
    }
    return { ...geo, features };
  }).catch(error => { jsonCache.delete(url); throw error; }));
  return jsonCache.get(url);
}

// One projection and one UV extent for the whole scene, including every province.
export function createProjection(features, size = 100) {
  const bounds = new THREE.Box2();
  for (const feature of features) for (const rings of polygonParts(feature)) for (const ring of rings) {
    for (const [lng, lat] of ring) bounds.expandByPoint(new THREE.Vector2(lng * Math.PI / 180, mercatorY(lat)));
  }
  const center = bounds.getCenter(new THREE.Vector2());
  const span = bounds.getSize(new THREE.Vector2());
  const scale = size / Math.max(span.x, span.y, .0001);
  return {
    bounds, center, scale,
    project(lng, lat, height = 0) { return new THREE.Vector3((lng * Math.PI / 180 - center.x) * scale, height, -(mercatorY(lat) - center.y) * scale); },
    unproject(x, z) { return [(x / scale + center.x) * 180 / Math.PI, (2 * Math.atan(Math.exp(-z / scale + center.y)) - Math.PI / 2) * 180 / Math.PI]; },
    uv(x, y) { return [(x / scale + center.x - bounds.min.x) / span.x, (y / scale + center.y - bounds.min.y) / span.y]; },
  };
}

export function regionShapes(feature, projection, tolerance = .015) {
  return polygonParts(feature).flatMap(rings => {
    if (!rings[0] || rings[0].length < 4) return [];
    const points = (ring) => simplifyRing(ring, tolerance).map(([lng, lat]) => {
      const p = projection.project(lng, lat); return new THREE.Vector2(p.x, -p.z);
    });
    const shape = new THREE.Shape(points(rings[0]));
    shape.holes = rings.slice(1).map(ring => new THREE.Path(points(ring)));
    return [shape];
  });
}

export function extrudeRegion(feature, projection, depth, tolerance, textureProjection = projection) {
  const geometry = new THREE.ExtrudeGeometry(regionShapes(feature, projection, tolerance), { depth, bevelEnabled: false, steps: 1, curveSegments: 2 });
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const texturePoint = textureProjection === projection ? null : textureProjection.project(...projection.unproject(position.getX(i), -position.getY(i)));
    const [u, v] = textureProjection.uv(texturePoint?.x ?? position.getX(i), texturePoint ? -texturePoint.z : position.getY(i));
    uv.setXY(i, u, v);
  }
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function boundaryLines(features, projection, height, color, opacity = 1, tolerance = .015) {
  const vertices = [];
  for (const feature of features) for (const rings of polygonParts(feature)) for (const ring of rings) {
    const points = simplifyRing(ring, tolerance);
    for (let i = 1; i < points.length; i++) {
      vertices.push(...projection.project(...points[i - 1], height).toArray(), ...projection.project(...points[i], height).toArray());
    }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

export function disposeGroup(group, preserveTextures = false) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) {
      materials.add(material);
      if (!preserveTextures) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  group.clear();
}
