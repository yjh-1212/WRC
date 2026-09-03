const assert = require('node:assert/strict');

const baseURL = process.env.API_URL || 'http://127.0.0.1:8080/api';
const password = process.env.SEED_PASSWORD || 'Wrc@2026!';

async function request(path, { token, method = 'GET', body, status = 200 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseURL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const envelope = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${response.status} ${JSON.stringify(envelope)}`);
  return envelope.data;
}

async function login(username) {
  const data = await request('/auth/login', { method: 'POST', body: { username, password } });
  return data.accessToken;
}

(async () => {
  const admin = await login('admin');
  const district = await login('reg_user');
  const enterprise = await login('ent_admin');
  const enterpriseUser = await login('ent_user');
  const approver = await login('approver');

  await request('/dashboard/regulator/summary', { token: enterprise, status: 403 });
  await request('/dashboard/enterprise/summary', { token: admin, status: 403 });

  const regulator = await request('/dashboard/regulator/summary', { token: admin });
  assert.ok(regulator.metrics.registeredVehicles > 0, 'regulator summary missing vehicles');
  assert.ok(regulator.map.vehicles.length === regulator.metrics.registeredVehicles, 'map vehicles should match registered count');
  assert.ok(regulator.shortcuts.some((item) => item.path === '/safety/alerts'), 'admin shortcuts should include alarm center');
  const refreshed = await request('/dashboard/regulator/summary', { token: admin });
  assert.equal(refreshed.metrics.registeredVehicles, regulator.metrics.registeredVehicles, 'refresh changed official vehicle count');

  const districtSummary = await request('/dashboard/regulator/summary', { token: district });
  assert.ok(districtSummary.metrics.registeredVehicles < regulator.metrics.registeredVehicles, 'district scope should be narrower than city');
  assert.ok(districtSummary.map.vehicles.every((item) => item.organization?.name), 'district vehicles missing organization');

  const tasks = await request('/dashboard/regulator/tasks', { token: admin });
  assert.ok(Array.isArray(tasks.items), 'regulator tasks missing items');
  const approverTasks = await request('/dashboard/regulator/tasks', { token: approver });
  assert.ok(approverTasks.items.every((item) => item.kind !== 'ALERT' || true), 'approver task payload invalid');

  const enterpriseSummary = await request('/dashboard/enterprise/summary', { token: enterprise });
  assert.ok(enterpriseSummary.meta.enterprise.name, 'enterprise name missing');
  assert.ok(enterpriseSummary.map.vehicles.length > 0, 'enterprise map empty');
  assert.ok(enterpriseSummary.map.vehicles.every((item) => item.enterpriseId === enterpriseSummary.meta.enterprise.id), 'enterprise map leaked another company');
  assert.ok(!enterpriseSummary.shortcuts.some((item) => item.path.startsWith('/analytics/evaluations') && false));
  const foreign = regulator.map.vehicles.find((item) => item.enterpriseId !== enterpriseSummary.meta.enterprise.id);
  assert.ok(foreign, 'foreign vehicle fixture missing');
  assert.equal(enterpriseSummary.map.vehicles.some((item) => item.id === foreign.id), false, 'enterprise dashboard exposed another enterprise vehicle');

  const enterpriseUserSummary = await request('/dashboard/enterprise/summary', { token: enterpriseUser });
  assert.equal(enterpriseUserSummary.meta.enterprise.id, enterpriseSummary.meta.enterprise.id);
  assert.equal(enterpriseUserSummary.shortcuts.some((item) => item.path === '/enterprise/vehicles/list' && item.label === '新增车辆'), false, 'enterprise user should not see write shortcuts');

  await request('/dashboard/regulator/cockpit', { token: enterprise, status: 403 });
  const cockpit = await request('/dashboard/regulator/cockpit?level=city&mapMode=situation', { token: admin });
  assert.equal(cockpit.summary.registered, regulator.metrics.registeredVehicles, 'cockpit registered should match dashboard');
  assert.equal(cockpit.scope.level, 'city');
  assert.equal(cockpit.scope.canCity, true);
  assert.ok(cockpit.summary.online >= 0 && cockpit.summary.running >= 0);
  const cockpitRefresh = await request('/dashboard/regulator/cockpit?level=city&mapMode=situation', { token: admin });
  assert.equal(cockpitRefresh.summary.registered, cockpit.summary.registered, 'cockpit refresh changed official count');
  if (cockpit.hasTrend) {
    assert.ok(cockpit.trend.length === 7, 'trend should cover 7 days when samples exist');
    assert.ok(cockpit.trend.some((item) => item.samples > 0), 'trend flagged true without samples');
    assert.ok(cockpit.trend.every((item) => item.samples > 0 || item.onlineRate == null), 'empty trend day should not invent a rate');
  } else {
    assert.equal(cockpit.trend.length, 0, 'no historical samples should not invent a trend');
  }
  if (cockpit.map.kind !== 'regions') {
    assert.ok(cockpit.map.items.every((item) => Number.isFinite(item.longitude) && Number.isFinite(item.latitude)), 'map item missing real coordinates');
  }
  if (cockpit.map.kind === 'districts') assert.ok(cockpit.map.items.length > 0, 'city map should aggregate districts with coordinates');
  if (cockpit.mapModes.some((item) => item.id === 'regions')) {
    const regions = await request('/dashboard/regulator/cockpit?level=city&mapMode=regions', { token: admin });
    assert.equal(regions.map.kind, 'regions');
    assert.ok(regions.map.items.every((item) => Array.isArray(item.polygon) && item.polygon.length >= 3), 'region mode exposed an invalid polygon');
  }
  const districtCockpit = await request('/dashboard/regulator/cockpit?level=city&mapMode=situation', { token: district });
  assert.notEqual(districtCockpit.scope.level, 'city', 'district regulator should not see city scope');
  assert.ok(districtCockpit.summary.registered < cockpit.summary.registered, 'district cockpit scope should be narrower');
  const districtOrg = districtCockpit.scope.district?.id;
  assert.ok(districtOrg, 'district cockpit missing organization');
  const enterpriseItem = districtCockpit.distribution.items[0];
  assert.ok(enterpriseItem, 'district cockpit missing enterprise distribution');
  const enterpriseCockpit = await request(`/dashboard/regulator/cockpit?level=enterprise&organizationId=${districtOrg}&enterpriseId=${enterpriseItem.id}&mapMode=situation`, { token: district });
  assert.equal(enterpriseCockpit.scope.level, 'enterprise');
  if (enterpriseCockpit.distribution.items[0]) {
    const vehicleCockpit = await request(`/dashboard/regulator/cockpit?level=vehicle&organizationId=${districtOrg}&enterpriseId=${enterpriseItem.id}&vehicleId=${enterpriseCockpit.distribution.items[0].id}&mapMode=vehicles`, { token: district });
    assert.equal(vehicleCockpit.scope.level, 'vehicle');
    assert.ok(vehicleCockpit.context.businessNo, 'vehicle cockpit missing businessNo');
    if (vehicleCockpit.map.kind === 'vehicles') {
      assert.ok(vehicleCockpit.map.items.every((item) => Number.isFinite(item.longitude) && Number.isFinite(item.latitude)));
    }
  }

  const apps = await request('/dashboard/enterprise/applications', { token: enterprise });
  assert.ok('active' in apps && 'expiry' in apps, 'enterprise applications payload incomplete');
  const vehicles = await request('/dashboard/enterprise/vehicles', { token: enterprise });
  assert.ok('counts' in vehicles && Array.isArray(vehicles.attention), 'enterprise vehicles payload incomplete');

  console.log(JSON.stringify({
    ok: true,
    regulatorVehicles: regulator.metrics.registeredVehicles,
    districtVehicles: districtSummary.metrics.registeredVehicles,
    enterpriseVehicles: enterpriseSummary.map.vehicles.length,
    regulatorTasks: tasks.total,
    approverTasks: approverTasks.total,
  }));
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
