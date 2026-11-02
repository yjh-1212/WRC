const assert = require('node:assert/strict');
const base = process.env.API_URL || 'http://127.0.0.1:8080/api';
const endpoint = '/dashboard/regulator/province-cockpit/appearance';
let token, original, ownedRevision = -1, fixtureId, checks = 0;
async function req(path, method = 'GET', body, auth = token) { const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const data = await response.json(); return { status: response.status, data: data.data }; }
function equal(a, b) { assert.deepEqual(a, b); checks++; }
async function login(username) { return (await req('/auth/login', 'POST', { username, password: process.env.TEST_PASSWORD || 'Wrc@2026!' }, null)).data.accessToken; }
(async () => {
  equal((await req(endpoint, 'GET', undefined, null)).status, 401); token = await login('admin'); original = (await req(endpoint)).data;
  assert(original.fields.length >= 35); checks++; equal(original.canEdit, true);
  for (const style of [{ primary: 'url(https://untrusted)' }, { panelOpacity: 2 }, { labels: 'false' }, { mapStyle: 'bad' }, { surprise: true }]) { equal((await req(endpoint, 'PUT', { expectedRevision: original.revision, style })).status, 400); equal((await req(endpoint)).data.revision, original.revision); }
  equal((await req(endpoint, 'PUT', { expectedRevision: '0', style: {} })).status, 400);
  const nextStyle = { ...original.style, primary: '#4477aa' };
  const saved = await req(endpoint, 'PUT', { expectedRevision: original.revision, style: nextStyle }); equal(saved.status, 200); ownedRevision = saved.data.revision; equal(saved.data.style.primary, '#4477aa'); equal(ownedRevision, original.revision + 1);
  equal((await req(endpoint, 'PUT', { expectedRevision: original.revision, style: original.style })).status, 409);
  const preset = await req(endpoint + '/presets', 'POST', { expectedRevision: ownedRevision, name: `测试预设${Date.now()}`, style: { ...nextStyle, panelOpacity: .5 } }); equal(preset.status, 201); ownedRevision = preset.data.revision; fixtureId = preset.data.presets.find(p => !original.presets.some(old => old.id === p.id)).id; equal(preset.data.style.panelOpacity, original.style.panelOpacity);
  const parallel = await Promise.all([req(endpoint, 'PUT', { expectedRevision: ownedRevision, style: { ...nextStyle, primary: '#335577' } }), req(endpoint, 'PUT', { expectedRevision: ownedRevision, style: { ...nextStyle, primary: '#446688' } })]); equal(parallel.map(r => r.status).sort(), [200, 409]); ownedRevision = parallel.find(r => r.status === 200).data.revision;
  for (const name of ['jinan_admin', 'jinan_ent_admin', 'ops_admin']) { const auth = await login(name); equal((await req(endpoint, 'GET', undefined, auth)).status, 403); equal((await req(endpoint, 'PUT', { expectedRevision: ownedRevision, style: original.style }, auth)).status, 403); }
  console.log(JSON.stringify({ checks, schemaFields: original.fields.length, atomicConflict: true, roleIsolation: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (!original) return;
  const current = (await req(endpoint)).data;
  if (current.revision !== ownedRevision) { console.error('Shared style changed outside this test; no automatic restore performed.'); return; }
  if (fixtureId) { const result = await req(endpoint + '/presets/' + fixtureId, 'DELETE', { expectedRevision: ownedRevision }); assert.equal(result.status, 200); ownedRevision = result.data.revision; }
  const restored = await req(endpoint, 'PUT', { expectedRevision: ownedRevision, style: original.style }); assert.equal(restored.status, 200); console.log('Original appearance restored; test preset removed.');
});
