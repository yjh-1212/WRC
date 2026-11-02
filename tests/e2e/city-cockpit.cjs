// Read-only acceptance: top navigation, provincial-style 2D cockpit and no order data.
const { chromium, request } = require('playwright');
const { expect } = require('playwright/test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const web = process.env.TARGET_URL || 'http://127.0.0.1:5173', base = process.env.API_URL || 'http://127.0.0.1:8080/api';
const out = path.resolve('test-results/city-cockpit');
let http, browser, page, passed = false; const errors = [], checks = [];
async function login(username) { const r = await http.post(base + '/auth/login', { data: { username, password: process.env.TEST_PASSWORD || 'Wrc@2026!' } }); assert.equal(r.status(), 200); return (await r.json()).data; }
async function api(token, endpoint, status = 200) { const r = await http.get(base + endpoint, { headers: { authorization: 'Bearer ' + token } }), body = await r.json(); assert.equal(r.status(), status, endpoint + ' ' + JSON.stringify(body)); return body.data; }
function noOrders(data) { const text = JSON.stringify(data); assert(!/currentOrder|hasOrder|cargoWeight|cargoType|progressPct|etaMinutes|orderNo/.test(text), 'regulator cockpit never exposes order fields'); }
(async () => {
  fs.mkdirSync(out, { recursive: true }); http = await request.newContext();
  try {
    const city = await login('jinan_admin'), other = await login('qingdao_admin'), province = await login('admin');
    const menus = await api(city.accessToken, '/auth/menus'); assert.deepEqual(menus.slice(0, 2).map(row => row.name), ['监管工作台', '驾驶舱']);
    const overview = await api(city.accessToken, '/dashboard/regulator/cockpit?level=city'); noOrders(overview); assert.equal(overview.cityCode, '370100'); assert(overview.vehicles.length > 0); assert(Array.isArray(overview.map.operationRegions));
    const foreign = await api(other.accessToken, '/dashboard/regulator/cockpit?level=city');
    await api(city.accessToken, '/dashboard/regulator/cockpit?level=vehicle&vehicleId=' + foreign.vehicles[0].id, 404);
    const ownId = overview.vehicles[0].id, vehicle = await api(city.accessToken, '/dashboard/regulator/cockpit?level=vehicle&vehicleId=' + ownId); noOrders(vehicle); assert('latestOperation' in vehicle.context);
    const provinceVehicle = await api(province.accessToken, '/dashboard/regulator/province-cockpit/map?cityCode=370100&level=vehicle&vehicleId=' + ownId); noOrders(provinceVehicle);
    checks.push('navigation-order', 'city-scope', 'city-and-province-order-free', 'operation-regions-and-vehicle-telemetry');

    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript(tokens => { sessionStorage.setItem('wrc-access-token', tokens.accessToken); localStorage.setItem('wrc-refresh-token', tokens.refreshToken); }, city);
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(web + '/regulatory/overview', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '无人车类型分布' })).toBeVisible();
    await expect(page.locator('.rwb-toolbar,.rwb-scope,.rwb-cockpit-link')).toHaveCount(0);
    await expect(page.locator('.rwb-period-controls')).toBeVisible();
    await expect(page.locator('.portal-primary').getByRole('menuitem').nth(1)).toHaveText('驾驶舱');
    await page.screenshot({ path: path.join(out, '01-workbench-navigation.png'), fullPage: true });
    await page.goto(web + '/province/cockpit', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(url => !url.pathname.startsWith('/province/'));
    await expect(page.locator('.province-cockpit')).toHaveCount(0);
    await page.locator('.portal-primary').getByRole('menuitem', { name: '驾驶舱', exact: true }).click();
    await page.waitForURL('**/regulatory/cockpit');
    await expect(page.getByRole('heading', { name: '济南市无人车综合监管驾驶舱' })).toBeVisible();
    await page.locator('.pc-native-map[data-map-state="ready"]').waitFor({ timeout: 45000 });
    await expect(page.locator('.pc-native-map')).toHaveAttribute('data-view-mode', '2D');
    await expect(page.locator('.pc-side')).toHaveCount(2);
    await expect(page.locator('.pc-left .pc-panel')).toHaveCount(3); await expect(page.locator('.pc-right .pc-panel')).toHaveCount(3);
    await page.screenshot({ path: path.join(out, '02-city-map.png'), fullPage: true });
    for (const level of ['district', 'enterprise', 'vehicle']) {
      const response = page.waitForResponse(r => { const url = new URL(r.url()); return url.pathname === '/api/dashboard/regulator/cockpit' && url.searchParams.get('level') === level && r.ok(); });
      await page.locator('.city-ranking-list>button').first().click();
      const value = (await (await response).json()).data; assert.equal(value.scope.level, level); noOrders(value);
      await expect(page.locator('.city-cockpit')).toHaveAttribute('data-level', level);
      await expect(page.locator('.pc-native-map')).toHaveAttribute('data-view-mode', '2D');
    }
    await page.locator('.pc-native-map[data-map-state="ready"]').waitFor({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: '运行记录', exact: true })).toBeVisible();
    assert(!/订单|货物|预计到达|有订单/.test(await page.locator('.city-cockpit').innerText()));
    await page.locator('.pc-car-hit').click();
    await expect(page.getByRole('dialog', { name: '无人车信息', exact: true })).toBeVisible();
    const popup = await page.getByRole('dialog', { name: '无人车信息', exact: true }).innerText(); assert(!/订单|货物|预计到达/.test(popup));
    await page.screenshot({ path: path.join(out, '03-vehicle-popup.png'), fullPage: true });
    await page.getByRole('button', { name: '关闭车辆信息', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.city-cockpit')).toHaveAttribute('data-level', 'vehicle');
    await page.getByRole('button', { name: '返回上一级地图', exact: true }).click();
    await expect(page.locator('.city-cockpit')).toHaveAttribute('data-level', 'enterprise');
    for (const viewport of [{ width: 1440, height: 900, name: '04-laptop' }, { width: 390, height: 844, name: '05-mobile' }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { timeout: 5000 }).toBeLessThanOrEqual(viewport.width);
      const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, items: [...document.querySelectorAll('body *')].map(element => ({ tag: element.tagName, class: typeof element.className === 'string' ? element.className : '', right: Math.round(element.getBoundingClientRect().right) })).filter(row => row.right > innerWidth + 1).slice(0, 12) }));
      assert.equal(overflow.scrollWidth > overflow.width, false, viewport.name + ' does not overflow horizontally: ' + JSON.stringify(overflow));
      await expect(page.locator('.pc-native-map')).toHaveAttribute('data-view-mode', '2D');
      await page.screenshot({ path: path.join(out, viewport.name + '.png'), fullPage: false });
    }
    await page.getByRole('button', { name: '返回监管工作台', exact: true }).click();
    await page.waitForURL('**/regulatory/overview');
    await expect(page.getByRole('heading', { name: '运行趋势', exact: true })).toBeVisible();
    checks.push('removed-title-strip', 'retained-date-filter', 'top-level-navigation', '2d-at-every-level', 'district-enterprise-vehicle-drill', 'vehicle-popup', 'url-refresh-and-back', 'responsive-map');
    assert.deepEqual(errors, []); passed = true; console.log(JSON.stringify({ passed, checks, errors, artifacts: out }));
  } catch (error) { if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); throw error; }
  finally { fs.writeFileSync(path.join(out, 'acceptance.json'), JSON.stringify({ passed, checks, errors }, null, 2)); await browser?.close(); await http?.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
