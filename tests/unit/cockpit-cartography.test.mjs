import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simplifyRing } from '../../apps/web/src/cockpit/cartography.js';

test('rendering simplification retains closure, corners and original coordinates', () => {
  const ring = [[0,0],[.25,0],[.5,0],[.75,0],[1,0],[1,.5],[1,1],[.5,1],[0,1],[0,.5],[0,0]];
  const original = structuredClone(ring);
  const result = simplifyRing(ring, .01);
  assert.deepEqual(result, [[0,0],[1,0],[1,1],[0,1],[0,0]]);
  assert.deepEqual(ring, original);
});

test('small islands and short rings are never discarded', () => {
  const island = [[120,30],[120.001,30],[120.001,30.001],[120,30]];
  assert.deepEqual(simplifyRing(island), island);
  assert.deepEqual(simplifyRing([]), []);
});

test('even an excessive tolerance cannot collapse a polygon below four vertices', () => {
  const ring = [[0,0],[.25,0],[.5,0],[.75,0],[1,0],[1,.5],[1,1],[.5,1],[0,1],[0,.5],[0,0]];
  assert.ok(simplifyRing(ring, 100).length >= 4);
});
