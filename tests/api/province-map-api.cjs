const assert = require('node:assert/strict');
const base = process.env.API_URL || 'http://127.0.0.1:8080/api';
const endpoint = '/dashboard/regulator/province-cockpit/map';
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
function inside(point, ring) { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.latitude > point.latitude) !== (b.latitude > point.latitude) && point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) hit = !hit; } return hit; }
async function login(username) { const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: process.env.TEST_PASSWORD || 'Wrc@2026!' }) }); assert(response.ok); return (await response.json()).data.accessToken; }
async function get(token, path = endpoint, query = {}) { const response = await fetch(base + path + '?' + new URLSearchParams(query), { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); return { status: response.status, data: result.data }; }
(async () => {
  equal((await get(null)).status, 401);
  const admin = await login('admin'), province = await get(admin); equal(province.status, 200); equal(province.data.level, 'province'); equal(province.data.map.kind, 'cities'); equal(province.data.map.items.length, 16);
  const cities = province.data.map.items.filter(row => row.count > 0); assert(cities.length >= 2); checks++;
  equal(province.data.vehicles.length, province.data.map.items.reduce((sum, row) => sum + row.count, 0));
  let first, outside;
  for (const city of cities) { const result = await get(admin, endpoint, { cityCode: city.code }); equal(result.status, 200); equal(result.data.level, 'city'); equal(result.data.map.kind, 'districts'); equal(result.data.summary.registered, city.count); assert(result.data.vehicles.every(row => row.cityCode === city.code)); checks++; if (!first) first = result.data; else if (!outside) outside = result.data; }
  const district = first.map.items[0], districtResult = await get(admin, endpoint, { cityCode: first.cityCode, level: 'district', organizationId: district.id }); equal(districtResult.status, 200); equal(districtResult.data.level, 'district'); equal(districtResult.data.map.kind, 'enterprises');
  const company = districtResult.data.map.items[0], companyQuery = { cityCode: first.cityCode, level: 'enterprise', organizationId: district.id, enterpriseId: company.id }, companyResult = await get(admin, endpoint, companyQuery); equal(companyResult.status, 200); equal(companyResult.data.map.kind, 'vehicles'); assert(companyResult.data.map.items.length); checks++;
  const vehicle = companyResult.data.vehicles[0], singleQuery = { ...companyQuery, level: 'vehicle', vehicleId: vehicle.id, mapMode: 'vehicles' }, single = await get(admin, endpoint, singleQuery); equal(single.status, 200); equal(single.data.scope.vehicle.id, vehicle.id); equal(single.data.vehicles.length, 1);
  const operatingAreas = single.data.map.operationRegions; assert(operatingAreas.length > 0 && operatingAreas.some(area => inside(single.data.vehicles[0], area.polygon)), 'Vehicle detail must include its assigned operating area'); checks++;
  assert(single.data.map.currentTrack.every(point => operatingAreas.some(area => inside(point, area.polygon))), 'Current track must stay in the assigned operating area'); checks++;
  const telemetry = await get(admin, endpoint + '/vehicles/' + vehicle.id, { cityCode: first.cityCode }); equal(telemetry.status, 200); equal(telemetry.data.vehicle.id, vehicle.id); equal(telemetry.data.vehicle.cityCode, first.cityCode);
  equal((await get(admin, endpoint, { cityCode: '999999' })).status, 400);
  equal((await get(admin, endpoint, { cityCode: first.cityCode, organizationId: outside.map.items[0].id })).status, 403);
  equal((await get(admin, endpoint, { cityCode: first.cityCode, enterpriseId: outside.vehicles[0].enterpriseId })).status, 403);
  equal((await get(admin, endpoint, { cityCode: first.cityCode, vehicleId: outside.vehicles[0].id })).status, 404);
  equal((await get(admin, endpoint + '/vehicles/' + outside.vehicles[0].id, { cityCode: first.cityCode })).status, 404);
  const unopened = province.data.map.items.find(row => !row.connected); assert(unopened); const empty = await get(admin, endpoint, { cityCode: unopened.code }); equal(empty.status, 200); equal(empty.data.connected, false); equal(empty.data.vehicles.length, 0);
  const cityToken = await login('jinan_admin'), cityScope = await get(cityToken, '/dashboard/regulator/cockpit', { level: 'city', mapMode: 'vehicles' }); equal(cityScope.status, 200);
  const jinan = province.data.vehicles.filter(row => row.cityCode === '370100'); equal(cityScope.data.summary.registered, jinan.length); assert(cityScope.data.map.items.every(row => jinan.some(allowed => allowed.id === row.id))); checks++;
  const other = province.data.vehicles.find(row => row.cityCode !== '370100');
  equal((await get(cityToken, '/dashboard/regulator/cockpit', { level: 'vehicle', vehicleId: other.id, mapMode: 'vehicles' })).status, 404);
  equal((await get(cityToken, '/dashboard/regulator/cockpit', { level: 'district', organizationId: other.organizationId })).status, 403);
  equal((await get(cityToken, '/dashboard/regulator/cockpit', { level: 'enterprise', enterpriseId: other.enterpriseId })).status, 403);
  for (const token of [cityToken, await login('jinan_ent_admin'), await login('ops_admin')]) { equal((await get(token)).status, 403); equal((await get(token, endpoint + '/vehicles/' + other.id, { cityCode: other.cityCode })).status, 403); }
  console.log(JSON.stringify({ checks, provinceCities: province.data.map.items.length, vehicles: province.data.vehicles.length, cityDistrictCompanyVehicle: true, telemetry: true, crossCityDenied: true, cityOnlyOwnWorkspace: true, readOnly: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
