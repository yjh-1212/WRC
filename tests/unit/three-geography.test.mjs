import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mercatorY, createProjection, polygonParts, regionShapes, extrudeRegion, boundaryLines } from '../../apps/web/src/three-map/geography.js';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const square = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
const polygon = coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } });

test('Mercator stays finite at the poles and preserves north/south orientation', () => {
  close(mercatorY(0), 0);
  close(mercatorY(40), -mercatorY(-40));
  close(mercatorY(90), mercatorY(85));
  close(mercatorY(-90), mercatorY(-85));
  assert.ok(Number.isFinite(mercatorY(90)));
});

test('geographic coordinates round-trip on the shared map plane without changing source data', () => {
  const features = [polygon([square(73, 18, 135, 54)])];
  const original = structuredClone(features);
  const projection = createProjection(features);
  for (const [lng, lat] of [[73, 18], [135, 54], [105, 35], [120.16, 30.25]]) {
    const point = projection.project(lng, lat, 2.2);
    const restored = projection.unproject(point.x, point.z);
    close(restored[0], lng);
    close(restored[1], lat);
    close(point.y, 2.2);
  }
  assert.ok(projection.project(120, 30).x > projection.project(110, 30).x);
  assert.ok(projection.project(120, 40).z < projection.project(120, 30).z);
  assert.deepEqual(features, original);
});

test('adjacent provinces share UV coordinates instead of restarting the whole texture', () => {
  const west = polygon([square(100, 20, 110, 30)]);
  const east = polygon([square(110, 20, 120, 30)]);
  const projection = createProjection([west, east]);
  const uv = (lng, lat) => { const p = projection.project(lng, lat); return projection.uv(p.x, -p.z); };
  close(uv(100, 20)[0], 0);
  close(uv(110, 20)[0], .5);
  close(uv(120, 20)[0], 1);
  close(uv(110, 20)[1], 0);
  close(uv(110, 30)[1], 1);
  for (const feature of [west, east]) {
    const geometry = extrudeRegion(feature, projection, 2.2, 0);
    const p = geometry.attributes.position, texture = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const expected = projection.uv(p.getX(i), -p.getZ(i));
      close(texture.getX(i), expected[0], 1e-6);
      close(texture.getY(i), expected[1], 1e-6);
    }
    geometry.dispose();
  }
});

test('extrusion keeps polygon holes open and has the specified vertical depth', () => {
  const feature = polygon([square(100, 20, 110, 30), square(102, 22, 104, 24)]);
  const projection = createProjection([feature]);
  const shapes = regionShapes(feature, projection, 0);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].holes.length, 1);
  const depth = 3;
  const geometry = extrudeRegion(feature, projection, depth, 0);
  geometry.computeBoundingBox();
  close(geometry.boundingBox.min.y, 0, 1e-6);
  close(geometry.boundingBox.max.y, depth, 1e-6);
  const positions = geometry.attributes.position;
  let topArea = 0;
  for (let i = 0; i < positions.count; i += 3) {
    if ([0, 1, 2].every(offset => Math.abs(positions.getY(i + offset) - depth) < 1e-5)) {
      const ax = positions.getX(i), az = positions.getZ(i);
      const bx = positions.getX(i + 1), bz = positions.getZ(i + 1);
      const cx = positions.getX(i + 2), cz = positions.getZ(i + 2);
      topArea += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
    }
  }
  const rectangleArea = (west, south, east, north) => {
    const a = projection.project(west, south), b = projection.project(east, north);
    return Math.abs((b.x - a.x) * (b.z - a.z));
  };
  const expectedArea = rectangleArea(100, 20, 110, 30) - rectangleArea(102, 22, 104, 24);
  close(topArea, expectedArea, .002);
  geometry.dispose();
});

test('island polygon parts and boundary elevations remain present', () => {
  const feature = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[square(100, 20, 110, 30)], [square(112, 22, 112.001, 22.001)]] } };
  assert.equal(polygonParts(feature).length, 2);
  const projection = createProjection([feature]);
  assert.equal(regionShapes(feature, projection).length, 2);
  const lines = boundaryLines([feature], projection, 3.15, '#ffffff');
  assert.equal(lines.geometry.attributes.position.count, 16);
  for (let i = 0; i < lines.geometry.attributes.position.count; i++) close(lines.geometry.attributes.position.getY(i), 3.15, 1e-6);
  lines.geometry.dispose();
  lines.material.dispose();
});

test('the supplied national and Zhejiang assets produce finite geometry and normalized UVs', async () => {
  const file = new URL('../../apps/web/public/map/threemap/geojson/100000.json', import.meta.url);
  const national = JSON.parse(await readFile(file, 'utf8'));
  const projection = createProjection(national.features);
  const feature = national.features.find(row => String(row.properties.adcode) === '330000');
  assert.ok(feature, 'The supplied national asset is missing Zhejiang');
  const geometry = extrudeRegion(feature, projection, 2.2, .024);
  assert.ok(geometry.attributes.position.count > 0);
  for (const attribute of ['position', 'normal', 'uv']) {
    assert.ok([...geometry.attributes[attribute].array].every(Number.isFinite), `${attribute} contains non-finite values`);
  }
  assert.ok([...geometry.attributes.uv.array].every(value => value >= -1e-6 && value <= 1 + 1e-6));
  geometry.dispose();
});
