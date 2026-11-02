const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const base = process.env.API_URL || 'http://127.0.0.1:8080/api';
const prisma = new PrismaClient();
(async () => {
  try {
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.TEST_USER || 'admin', password: process.env.TEST_PASSWORD || 'Wrc@2026!' }) });
    assert.equal(response.status, 200);
    const token = (await response.json()).data.accessToken;
    async function get(url) { const r = await fetch(base + url, { headers: { Authorization: 'Bearer ' + token } }); assert.equal(r.status, 200); return (await r.json()).data; }
    const snapshots = await prisma.cockpitRegionSnapshot.findMany({ where: { sourceType: 'DEMO', sourceName: '演示数据 · 数字地球初始化' } });
    assert.ok(snapshots.length);
    for (const row of snapshots) {
      const byType = Object.values(JSON.parse(row.vehicleMetricsJson));
      for (const key of ['registeredVehicles', 'onlineVehicles', 'runningVehicles', 'operatingEnterprises', 'riskEvents', 'majorEvents', 'unresolvedMajor', 'mileageToday']) {
        const total = byType.reduce((sum, metrics) => sum + metrics[key], 0);
        assert.ok(Math.abs(total - row[key]) < .01, `${row.regionId}: ${key} partition mismatch`);
      }
      for (const metrics of byType) assert.ok(metrics.runningVehicles <= metrics.onlineVehicles && metrics.onlineVehicles <= metrics.registeredVehicles);
    }
    for (const type of ['ALL', 'DELIVERY', 'SANITATION', 'PATROL', 'RETAIL', 'SHUTTLE']) {
      const [national, province, city, drill] = await Promise.all([
        get(`/dashboard/regulator/cockpit/scene?level=national&regionCode=100000&vehicleType=${type}`),
        get(`/dashboard/regulator/cockpit/scene?level=province&regionCode=330000&vehicleType=${type}`),
        get(`/dashboard/regulator/cockpit/scene?level=city&regionCode=330100&vehicleType=${type}`),
        get(`/dashboard/regulator/cockpit?level=city&mapMode=situation&vehicleType=${type}`),
      ]);
      assert.equal(national.regions.find(r => r.code === '330000').summary.registeredVehicles, province.summary.registeredVehicles);
      assert.equal(province.regions.find(r => r.code === '330100').summary.registeredVehicles, city.summary.registeredVehicles);
      assert.equal(city.summary.registeredVehicles, drill.summary.registered);
      assert.equal(province.regions.find(r => r.code === '330100').reportedAt, city.source.reportedAt);
      assert.ok(national.regions.every(r => Object.hasOwn(r, 'reportedAt')));
      assert.ok(drill.map.items.every(r => Object.hasOwn(r, 'heartbeatAt')));
      assert.equal(city.summary.unresolvedMajor, drill.riskSnapshot.alertHigh);
      assert.equal(national.summary.registeredVehicles, Object.values(national.vehicleTypes).reduce((a, b) => a + b, 0));
      assert.equal(national.map, undefined);
      assert.equal(province.map, undefined);
      assert.ok(national.trend.every(p => p.runningVehicles === null || Number.isFinite(p.runningVehicles)));
      if (type !== 'ALL') assert.ok(city.map.vehicles.every(v => v.vehicleType === type));
    }
    console.log(JSON.stringify({ passed: true, demoSnapshots: snapshots.length, vehicleTypes: 6, checks: ['stored type partitions', 'national-province-city totals', 'scope filters', 'pending risks', 'aggregate payloads'] }));
  } finally { await prisma.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
