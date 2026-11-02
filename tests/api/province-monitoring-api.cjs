const assert = require('node:assert/strict');
const base = process.env.API_URL || 'http://127.0.0.1:8080/api';
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
async function login(username) { const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: process.env.TEST_PASSWORD || 'Wrc@2026!' }) }); assert(r.ok); return (await r.json()).data.accessToken; }
async function get(token, path, query = {}) { const response = await fetch(base + path + '?' + new URLSearchParams(query), { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const body = await response.json(); return { status: response.status, data: body.data, message: body.message }; }
(async () => {
  equal((await get(null, '/province/monitoring')).status, 401);
  const token = await login('admin'), options = await get(token, '/province/monitoring/options'); equal(options.status, 200); assert(options.data.workspaces.length >= 3); checks++;
  const monitoring = await get(token, '/province/monitoring'); equal(monitoring.status, 200); assert(monitoring.data.total > 20); checks++; equal(monitoring.data.items.length, 20); equal(monitoring.data.counts.ALL, monitoring.data.total); equal(monitoring.data.mapPoints.length, monitoring.data.total); assert(monitoring.data.mapPoints.every(row => row.cityCode.startsWith('37'))); checks++;
  for (const bucket of ['RUNNING', 'OFFLINE', 'ALERT']) { const data = await get(token, '/province/monitoring', { bucket }); equal(data.status, 200); equal(data.data.total, monitoring.data.counts[bucket]); if (bucket === 'ALERT') assert(data.data.items.every(row => row.riskCount > 0)); if (bucket === 'RUNNING') assert(data.data.items.every(row => row.onlineStatus === 'ONLINE' && row.realtimeStatus.drivingState === 'RUNNING')); checks++; }
  const city = options.data.workspaces[0], filtered = await get(token, '/province/monitoring', { workspaceId: city.id }); equal(filtered.status, 200); assert(filtered.data.items.every(row => row.workspaceId === city.id)); checks++; assert(filtered.data.mapPoints.every(row => row.workspaceId === city.id)); checks++;
  const row = filtered.data.items[0], outside = monitoring.data.mapPoints.find(row => row.workspaceId !== city.id); assert(row && outside);
  const byVin = await get(token, '/province/vehicles', { q: row.vin }); equal(byVin.status, 200); equal(byVin.data.total, 1); equal(byVin.data.items[0].id, row.id);
  const dossier = await get(token, '/province/vehicles/' + row.id, { workspaceId: city.id }); equal(dossier.status, 200); equal(dossier.data.vehicle.id, row.id); assert(dossier.data.access.tracks); checks++;
  equal((await get(token, '/province/vehicles/' + outside.id, { workspaceId: city.id })).status, 404);
  equal((await get(token, '/province/monitoring', { workspaceId: 'not-a-city' })).status, 403);
  equal((await get(token, '/province/vehicles/' + row.id + '/tracks')).status, 400);
  equal((await get(token, '/province/vehicles/' + row.id + '/tracks', { recordId: 'not-a-record' })).status, 404);
  const records = await get(token, '/province/vehicles/' + row.id + '/records'); equal(records.status, 200);
  if (records.data.items.length) { const record = records.data.items[0], track = await get(token, '/province/vehicles/' + row.id + '/tracks', { recordId: record.id }); equal(track.status, 200); assert(track.data.points.every(point => point.vehicleId === row.id && point.operationRecordId === record.id)); checks++; }
  equal((await get(token, '/province/accidents', { from: '2026-10-29', to: '2026-10-01' })).status, 400);
  equal((await get(token, '/province/monitoring', { bucket: 'INVENTED' })).status, 400);
  const accidents = await get(token, '/province/accidents'); equal(accidents.status, 200);
  if (accidents.data.items.length) {
    const accident = accidents.data.items[0], detail = await get(token, '/province/accidents/' + accident.id, { windowMinutes: '5' }); equal(detail.status, 200); equal(detail.data.vehicleId, accident.vehicleId); equal(Date.parse(detail.data.window.to) - Date.parse(detail.data.window.from), 600000); assert(detail.data.track.every(p => p.vehicleId === accident.vehicleId && Date.parse(p.recordedAt) >= Date.parse(detail.data.window.from) && Date.parse(p.recordedAt) <= Date.parse(detail.data.window.to))); checks++;
    equal((await get(token, '/province/accidents/' + accident.id, { vehicleId: 'wrong-vehicle' })).status, 404);
    equal((await get(token, '/province/accidents/' + accident.id, { windowMinutes: '999' })).status, 400);
  }
  const missing = await get(token, '/province/accidents', { videoState: 'MISSING' }); equal(missing.status, 200); assert(missing.data.items.every(row => row.videoCount === 0)); checks++;
  const available = await get(token, '/province/accidents', { videoState: 'AVAILABLE' }); equal(available.status, 200); assert(available.data.items.every(row => row.videoCount > 0)); checks++;
  const alerts = await get(token, '/province/alerts'); equal(alerts.status, 200); if (alerts.data.items[0]) equal((await get(token, '/province/alerts/' + alerts.data.items[0].id)).status, 200);
  for (const username of ['jinan_admin', 'jinan_ent_admin', 'ops_admin']) { const limited = await login(username); for (const path of ['/province/monitoring/options', '/province/monitoring', '/province/vehicles', '/province/vehicles/' + row.id, '/province/accidents', '/province/alerts']) equal((await get(limited, path)).status, 403); }
  const cityToken = await login('jinan_admin'); const foreign = monitoring.data.mapPoints.find(row => row.cityCode !== '370100'); equal((await get(cityToken, '/archives/vehicles/' + foreign.id)).status, 404);
  console.log(JSON.stringify({ checks, provinceVehicles: monitoring.data.total, accidents: accidents.data.total, scopedSearch: true, serverBuckets: true, evidenceWindow: true, cityIsolation: true, readOnly: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
