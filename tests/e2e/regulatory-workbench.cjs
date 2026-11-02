// Read-only API/data and visible-browser acceptance for the municipal workbench.
const { chromium, request } = require('playwright');
const { expect } = require('playwright/test');
const { PrismaClient } = require('@prisma/client');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.DATABASE_URL = 'file:' + path.resolve('data/regulatory.db').replace(/\\/g, '/');
const db = new PrismaClient();
const apiBase = process.env.API_URL || 'http://127.0.0.1:8080/api';
const web = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const out = path.resolve('test-results/regulatory-workbench');
const day = date => new Date(date.getTime() + 28800000).toISOString().slice(0, 10);
const sum = rows => rows.reduce((total, row) => total + row.value, 0);
let http, browser, page, passed = false;
const errors = [], checks = [];

async function login(username) {
  const response = await http.post(apiBase + '/auth/login', { data: { username, password: process.env.TEST_PASSWORD || 'Wrc@2026!' } });
  assert.equal(response.status(), 200); return (await response.json()).data;
}
async function get(token, suffix = '', status = 200) {
  const response = await http.get(apiBase + '/dashboard/regulator/workbench' + suffix, { headers: { authorization: 'Bearer ' + token } });
  const body = await response.json(); assert.equal(response.status(), status, JSON.stringify(body)); return body.data;
}
(async () => {
  fs.mkdirSync(out, { recursive: true }); http = await request.newContext();
  try {
    const tokens = await login('jinan_admin'), foreign = await login('qingdao_admin'), enterprise = await login('ent_admin');
    const current = await get(tokens.accessToken);
    const actor = (await (await http.get(apiBase + '/auth/me', { headers: { authorization: 'Bearer ' + tokens.accessToken } })).json()).data;
    const ids = actor.scopeOrganizationIds;
    assert(ids?.length, 'verified organization scope is available');
    const vehicles = await db.vehicle.findMany({ where: { organizationId: { in: ids }, deletedAt: null }, include: { realtimeStatus: true, model: { include: { manufacturer: true } } } });
    assert.equal(current.fleet.total, vehicles.length);
    assert.equal(current.fleet.online, vehicles.filter(row => row.onlineStatus === 'ONLINE').length);
    assert.equal(current.fleet.running, vehicles.filter(row => row.onlineStatus === 'ONLINE' && row.realtimeStatus?.drivingState === 'RUNNING').length);
    for (const rows of [current.vehicleTypes, current.manufacturers, current.districts]) assert.equal(sum(rows), vehicles.length);
    assert.equal(current.fleet.running + current.fleet.idle + current.fleet.offline, vehicles.length);
    assert.equal(current.safety.pending + current.safety.processing + current.safety.closed, current.safety.total);
    assert.equal(sum(current.safety.types), current.safety.total);
    assert.equal(current.enterprises.reduce((s, row) => s + row.vehicles, 0), vehicles.length);
    const manufacturer = new Map(); for (const row of vehicles) manufacturer.set(row.model.manufacturer.id, (manufacturer.get(row.model.manufacturer.id) || 0) + 1);
    for (const row of current.manufacturers) assert.equal(row.value, manufacturer.get(row.key));
    const from = current.period.from, to = current.period.to;
    const records = await db.operationRecord.findMany({ where: { organizationId: { in: ids }, startedAt: { gte: new Date(from + 'T00:00:00+08:00'), lt: new Date(new Date(to + 'T00:00:00+08:00').getTime() + 86400000) } } });
    assert.equal(current.operations.trips, records.length);
    assert.equal(current.operations.trend.length, current.period.days);
    for (const point of current.operations.trend) assert.equal(point.trips, records.filter(row => day(row.startedAt) === point.date).length);
    const bad = records.some(row => !Number.isFinite(row.mileage) || row.mileage < 0 || row.mileage >= 1000000000);
    assert.equal(current.operations.mileage, bad ? null : Math.round((records.reduce((s, row) => s + row.mileage, 0) + Number.EPSILON) * 10) / 10);
    const queueResponse = await http.get(apiBase + '/safety/workspace/events?from=' + from + '&to=' + to + '&pageSize=1', { headers: { authorization: 'Bearer ' + tokens.accessToken } });
    assert.equal(queueResponse.status(), 200); assert.equal(current.safety.total, (await queueResponse.json()).data.total, 'safety queue and workbench agree');
    const other = await get(foreign.accessToken); assert.equal(other.scopeName, '青岛市'); assert(other.enterprises.every(row => !current.enterprises.some(own => own.id === row.id)));
    await get(enterprise.accessToken, '', 403);
    await get(tokens.accessToken, '?from=2026-02-30&to=2026-03-01', 400);
    await get(tokens.accessToken, '?from=2020-01-01&to=2026-10-31', 400);
    const empty = await get(tokens.accessToken, '?from=2020-01-01&to=2020-01-07');
    assert.equal(empty.operations.trips, 0); assert.equal(empty.operations.trend.length, 7); assert(empty.operations.trend.every(row => row.trips === 0 && row.mileage === 0));
    assert.equal(empty.fleet.total, current.fleet.total, 'current vehicle snapshot is independent of historical reporting period');
    checks.push('city-scope', 'enterprise-denied', 'fleet-types-manufacturers-districts-reconcile', 'daily-series-and-source-mileage', 'deduplicated-safety-queue', 'dates-validation', 'empty-period');

    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
    await context.addInitScript(value => { sessionStorage.setItem('wrc-access-token', value.accessToken); localStorage.setItem('wrc-refresh-token', value.refreshToken); }, tokens);
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(web + '/regulatory/overview', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '无人车类型分布', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '车辆厂商分布', exact: true })).toBeVisible();
    await expect(page.locator('.rwb-panel')).toHaveCount(8);
    await expect(page.locator('.reg-strip,.dashboard-metrics,.reg-task-center')).toHaveCount(0);
    await expect(page.locator('.rwb-trend canvas')).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const desktop = await page.locator('.rwb-grid').boundingBox();
    assert(desktop.y + desktop.height <= 1080, 'desktop statistics fit in one viewport');
    const enterpriseVisibility = await page.locator('.rwb-enterprise-table').evaluate(root => {
      const boundary = root.getBoundingClientRect(), rows = [...root.querySelectorAll('tr.el-table__row')];
      return rows.every(row => row.getBoundingClientRect().bottom <= boundary.bottom + 1);
    });
    assert(enterpriseVisibility, 'all four enterprise rows are fully visible on desktop');
    await page.screenshot({ path: path.join(out, '01-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: '运行次数', exact: true }).click();
    await expect(page.locator('.rwb-trend-summary')).toContainText('累计运行');
    await page.getByRole('button', { name: '近7日', exact: true }).click();
    await expect(page.getByRole('button', { name: '近7日', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.rwb-panel')).toHaveCount(8);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: '近7日', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.rwb-panel')).toHaveCount(8);
    await page.locator('.rwb-enterprise-name').first().click();
    await expect(page.getByRole('heading', { name: '企业详情', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /关闭.*对话框|close this dialog/i }).last().click();
    await page.getByRole('button', { name: '打开AI助手', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    // Navigate to each reminder and confirm that its filter survives the link.
    for (const item of [{ text: '事件待核查', target: '/safety/events', key: 'queue=PENDING' }, { text: '整改待复核', target: '/safety/emergency', key: 'status=PENDING_REVIEW' }, { text: '许可临期', target: '/admission/licenses', key: 'status=EXPIRING' }]) {
      await page.goto(web + '/regulatory/overview', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '待办提醒', exact: true })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(item.text) }).click();
      await page.waitForURL(url => url.pathname === item.target && url.search.includes(item.key));
    }
    await page.goto(web + '/regulatory/overview?from=2020-01-01&to=2020-01-07', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('所选日期暂无运行记录', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(out, '04-empty-period.png'), fullPage: true });
    await page.route('**/api/dashboard/regulator/workbench?*', route => route.fulfill({ status: 500, json: { message: '验收加载失败' } }));
    await page.getByRole('button', { name: '本月', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('监管统计加载失败');
    await expect(page.locator('.rwb-grid')).toHaveCount(0);
    await page.unroute('**/api/dashboard/regulator/workbench?*');
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(page.locator('.rwb-panel')).toHaveCount(8);
    for (const viewport of [{ width: 1440, height: 900, name: '02-laptop' }, { width: 390, height: 844, name: '03-mobile' }]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { name: '无人车类型分布', exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, viewport.name + ' has no horizontal page overflow');
      assert(await page.locator('.rwb-manufacturer-rows').evaluate(root => [...root.children].every(row => row.getBoundingClientRect().bottom <= root.getBoundingClientRect().bottom + 1)), 'all current manufacturers remain visible');
      await page.screenshot({ path: path.join(out, viewport.name + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []); checks.push('desktop-chart-rendering', 'metric-and-period-switch', 'url-refresh', 'enterprise-drawer', 'generic-assistant', 'reminder-deep-links', 'error-retry', 'responsive');
    passed = true; console.log(JSON.stringify({ passed, checks, desktop, vehicles: current.fleet.total, manufacturers: current.manufacturers.length, types: current.vehicleTypes.length, errors, artifacts: out }));
  } catch (error) { if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); throw error; }
  finally { fs.writeFileSync(path.join(out, 'acceptance.json'), JSON.stringify({ passed, checks, errors }, null, 2)); await browser?.close(); await http?.dispose(); await db.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
