import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupVisiblePoints } from '../../apps/web/src/cockpit/semantic-points.ts';

test('screen clusters preserve every visible source identity without inventing counts', () => {
  const points = [{ id: 'a', longitude: 120, latitude: 30 }, { id: 'b', longitude: 120.1, latitude: 30.1 }, { id: 'c', longitude: 121, latitude: 31 }, { id: 'hidden', longitude: 122, latitude: 32 }];
  const project = p => p.id === 'hidden' ? null : ({ x: p.id === 'c' ? 250 : 20, y: 30, visible: true });
  const groups = groupVisiblePoints(points, project, 100);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.flatMap(g => g.members.map(p => p.id)).sort(), ['a', 'b', 'c']);
  assert.equal(groups[0].longitude, 120.05);
  assert.equal(points.length, 4);
});

test('closer zoom splits clusters and offscreen vehicles are not counted in badges', () => {
  const points = [{ id: 'a', longitude: 120, latitude: 30 }, { id: 'b', longitude: 120.1, latitude: 30.1 }, { id: 'c', longitude: 121, latitude: 31 }];
  const project = p => ({ x: p.id === 'a' ? 20 : 70, y: 20, visible: p.id !== 'c' });
  assert.equal(groupVisiblePoints(points, project, 100).length, 1);
  assert.equal(groupVisiblePoints(points, project, 30).length, 2);
  assert.deepEqual(groupVisiblePoints([], project, 30), []);
});
