import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { buildPlanarBackdrop } from '../../apps/web/src/three-map/PlanarBackdrop.js';
import { createProvinceTexture } from '../../apps/web/src/three-map/ProvinceTexture.js';
import { createProjection, disposeGroup } from '../../apps/web/src/three-map/geography.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { RepeatWrapping, SRGBColorSpace } = requireWeb('three');
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const feature = (name, ring) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Polygon', coordinates: [ring] } });
const chinaExtent = feature('中国', [[73, 18], [135, 18], [135, 54], [73, 54], [73, 18]]);

test('province material is deterministic, opaque, low-contrast grayscale without external assets', () => {
  const first = createProvinceTexture(128), second = createProvinceTexture(128);
  try {
    assert.equal(first.isDataTexture, true);
    assert.deepEqual(first.image.data, second.image.data);
    assert.equal(first.image.width, 128);
    assert.equal(first.image.height, 128);
    assert.equal(first.image.data.length, 128 * 128 * 4);
    assert.equal(first.colorSpace, SRGBColorSpace);
    assert.equal(first.wrapS, RepeatWrapping);
    assert.equal(first.wrapT, RepeatWrapping);
    assert.equal(first.generateMipmaps, true);
    let minimum = 255, maximum = 0;
    for (let i = 0; i < first.image.data.length; i += 4) {
      const [r, g, b, a] = first.image.data.subarray(i, i + 4);
      assert.equal(r, g);
      assert.equal(g, b);
      assert.equal(a, 255);
      minimum = Math.min(minimum, r); maximum = Math.max(maximum, r);
    }
    assert.ok(maximum - minimum >= 5 && maximum - minimum < 35, `Unexpected decoration contrast: ${minimum}–${maximum}`);
  } finally { first.dispose(); second.dispose(); }
});

test('default province texture has no strong edge seam when repeated', () => {
  const texture = createProvinceTexture();
  try {
    const { data, width, height } = texture.image;
    const differences = [];
    for (let x = 0; x < width; x++) differences.push(Math.abs(data[x * 4] - data[((height - 1) * width + x) * 4]));
    for (let y = 0; y < height; y++) differences.push(Math.abs(data[y * width * 4] - data[(y * width + width - 1) * 4]));
    const mean = differences.reduce((sum, value) => sum + value, 0) / differences.length;
    // Adjacent wrap samples differ slightly; a seam should not introduce a dark band.
    assert.ok(mean < 4, `Average wrap discontinuity is too large: ${mean}`);
    assert.ok(Math.max(...differences) < 20, 'Texture wrap contains a high-contrast seam');
  } finally { texture.dispose(); }
});

test('planar context clips fills without inventing borders on the clipping rectangle', () => {
  const projection = createProjection([chinaExtent]);
  const world = { type: 'FeatureCollection', features: [feature('周边地区', [[50, 10], [160, 10], [160, 60], [50, 60], [50, 10]])] };
  const original = structuredClone(world);
  const group = buildPlanarBackdrop(world, projection, { stars: false });
  try {
    assert.equal(group.name, 'planar-world-context');
    assert.deepEqual(world, original);
    const extent = group.userData.geographicExtent;
    close(extent.west, 58); close(extent.east, 150);
    close(extent.south, 3); close(extent.north, 69);
    const boundary = group.getObjectByName('planar-context-borders').geometry.attributes.position;
    assert.ok(boundary.count > 0);
    for (let i = 0; i < boundary.count; i += 2) {
      const a = projection.unproject(boundary.getX(i), boundary.getZ(i));
      const b = projection.unproject(boundary.getX(i + 1), boundary.getZ(i + 1));
      close(a[1], b[1]);
      assert.ok(Math.abs(a[1] - 10) < 1e-5 || Math.abs(a[1] - 60) < 1e-5, 'A synthetic clipping edge was drawn as a country border');
    }
    assert.equal(group.getObjectByName('starfield').visible, false);
    const hits = [];
    group.traverse(object => {
      if (!object.geometry) return;
      assert.notEqual(object.geometry.type, 'SphereGeometry');
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getZ(i)));
        assert.ok(positions.getY(i) < 0 && positions.getY(i) >= -2, 'Geographic backdrop is not a flat layer below the map');
      }
      object.raycast(null, hits);
    });
    assert.deepEqual(hits, [], 'Background geometry should not intercept region selection');
  } finally { disposeGroup(group); }
});

test('a date-line island cannot form an artificial polygon across the China map', () => {
  const projection = createProjection([chinaExtent]);
  const world = { type: 'FeatureCollection', features: [feature('跨日界线岛屿', [[175, 20], [-175, 20], [-175, 30], [175, 30], [175, 20]])] };
  const group = buildPlanarBackdrop(world, projection);
  try {
    assert.equal(group.getObjectByName('planar-land'), undefined);
    assert.equal(group.getObjectByName('planar-context-borders').geometry.attributes.position.count, 0);
  } finally { disposeGroup(group); }
});

test('the supplied world asset stays finite and inside the shared projected context extent', async () => {
  const load = async name => JSON.parse(await readFile(new URL(`../../apps/web/public/map/threemap/geojson/${name}.json`, import.meta.url), 'utf8'));
  const [national, world] = await Promise.all([load('100000'), load('world')]);
  const projection = createProjection(national.features);
  const group = buildPlanarBackdrop(world, projection);
  try {
    const extent = group.userData.geographicExtent;
    assert.ok(group.getObjectByName('planar-land').geometry.attributes.position.count > 0);
    group.traverse(object => {
      if (!object.geometry) return;
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const [lng, lat] = projection.unproject(positions.getX(i), positions.getZ(i));
        assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
        assert.ok(lng >= extent.west - 1e-4 && lng <= extent.east + 1e-4);
        assert.ok(lat >= extent.south - 1e-4 && lat <= extent.north + 1e-4);
      }
    });
  } finally { disposeGroup(group); }
});
