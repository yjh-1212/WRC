const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// This suite uses the running application's own API/proxy. No API fixtures,
// request interception, generated counts, or seeded changes are used here.
const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifacts = path.resolve('test-results', 'three-cockpit-migration');
const timeout = 45_000;

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1', channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  const failures = [];
  const requests = new Set();
  const scenes = new Map();
  const cityResponses = [];
  const responseJobs = [];
  const visitedModes = {};

  page.on('request', request => requests.add(request.url()));
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(message.text());
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/dashboard/regulator/cockpit')) return;
    if (!response.ok()) {
      failures.push(`${response.status()} ${url.pathname}${url.search}`);
      return;
    }
    responseJobs.push(response.json().then(body => {
      if (url.pathname.endsWith('/scene')) {
        scenes.set(`${url.searchParams.get('level')}:${url.searchParams.get('vehicleType')}`, body.data);
      } else cityResponses.push(body.data);
    }).catch(error => failures.push(`Invalid cockpit response: ${error.message}`)));
  });

  const root = page.locator('main.three-level-cockpit');
  const map = page.locator('.geo-map-shell');
  async function ready(level) {
    await page.locator(`main.three-level-cockpit[data-level="${level}"]`).waitFor();
    await page.locator(`.geo-map-shell[data-ready="true"][data-level="${level}"]`).waitFor();
    const expectedEngine = level === 'city' ? 'amap' : 'three';
    assert.equal(await map.getAttribute('data-engine'), expectedEngine, `${level}: expected ${expectedEngine} renderer`);
    await page.locator('.cockpit-request-state[role="status"]').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.geo-map-state.is-warning').count(), 0, `${level}: map resource error`);
    assert.equal(await page.locator('[class*="cesium-"]').count(), 0, `${level}: old renderer DOM remains`);
    const surface = level === 'city'
      ? page.locator('.geo-map-host .amap-maps, .geo-map-host.amap-container, .geo-map-host .amap-container').first()
      : page.locator('.geo-map-host canvas');
    await surface.waitFor();
    const bounds = await surface.boundingBox();
    assert.ok(bounds && bounds.width >= 800 && bounds.height >= 500, `${level}: map surface has no usable size`);
  }
  async function screenshot(name) {
    await page.screenshot({ path: path.join(artifacts, `${name}.png`) });
  }
  async function checkModes(level) {
    const tabs = page.getByRole('tablist', { name: '场景主题' }).getByRole('tab');
    const names = await tabs.allTextContents();
    assert.deepEqual(names.map(name => name.trim()), ['综合态势', '区域对比', '风险监管', '车辆结构', '数据质量'], `${level}: regulatory modes do not match the product spec`);
    visitedModes[level] = [];
    for (const name of names) {
      const tab = page.getByRole('tab', { name: name.trim(), exact: true });
      await tab.click();
      await page.waitForFunction(label => {
        const tabs = [...document.querySelectorAll('[role="tab"]')];
        return tabs.some(tab => tab.textContent.trim() === label && tab.getAttribute('aria-selected') === 'true');
      }, name.trim());
      await ready(level);
      assert.equal(await map.getAttribute('data-mode'), await root.getAttribute('data-tab'), `${name}: map and dashboard modes disagree`);
      visitedModes[level].push({ label: name.trim(), mode: await root.getAttribute('data-tab') });
    }
    await tabs.first().click();
    await ready(level);
  }
  async function checkCityModes() {
    const tabs = page.getByRole('tablist', { name: '地图视图' }).getByRole('tab');
    const names = (await tabs.allTextContents()).map(name => name.trim());
    assert.deepEqual(names, ['综合态势', '企业分布', '运行区域'], 'City map navigation differs from the v0.3 city workflow');
    visitedModes.city = [];
    for (const name of names) {
      await page.getByRole('tab', { name, exact: true }).click();
      await ready('city');
      assert.equal(await page.getByRole('tab', { name, exact: true }).getAttribute('aria-selected'), 'true');
      visitedModes.city.push({ label: name });
    }
    await page.getByRole('tab', { name: '综合态势', exact: true }).click();
    await ready('city');
  }
  async function selectRegion(name) {
    const row = page.locator('.cockpit-ranking-list button').filter({ hasText: name });
    await row.first().click();
    assert.ok((await row.first().getAttribute('class') || '').includes('selected'), `${name}: selection not reflected in ranking`);
    assert.ok(await map.getAttribute('data-selected'), `${name}: selection not reflected on map`);
    assert.equal(await page.locator('.cockpit-selection-card').count(), 0, `${name}: national/provincial detail card is visible`);
  }
  async function fetchObserved(level, vehicleType) {
    await Promise.all(responseJobs);
    const scene = scenes.get(`${level}:${vehicleType}`);
    assert.ok(scene, `No real ${level}/${vehicleType} scene response was observed`);
    assert.equal(scene.scene.level, level);
    assert.equal(scene.scene.vehicleType, vehicleType);
    return scene;
  }

  try {
    await page.goto(`${baseURL}/login`);
    await page.getByRole('textbox', { name: '账号' }).fill(process.env.TEST_USER || 'admin');
    await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL('**/regulatory/overview');
    await page.goto(`${baseURL}/regulatory/cockpit`);
    await ready('national');
    const all = await fetchObserved('national', 'ALL');
    assert.ok(all.regions.length >= 30, 'National API did not return the expected province coverage');
    assert.ok(all.summary.registeredVehicles > 0, 'National scene has no source data');
    await checkModes('national');
    await page.getByRole('button', { name: '浙江省区域', exact: true }).hover();
    await page.getByRole('tooltip').filter({ hasText: '浙江省' }).waitFor();
    await page.getByRole('button', { name: '浙江省区域', exact: true }).click();
    assert.equal(await page.locator('.cockpit-selection-card').count(), 0, 'Map click opened the removed detail card');
    assert.equal(await map.getAttribute('data-selected'), '', 'National map single click selected a region');
    await screenshot('national-1920');

    // Store a non-default filter and mode, then check they survive both drill-up steps.
    const filteredResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/cockpit/scene') && url.searchParams.get('level') === 'national'
        && url.searchParams.get('vehicleType') === 'SANITATION' && response.ok();
    });
    await Promise.all([filteredResponse, page.getByLabel('车辆类型', { exact: true }).selectOption('SANITATION')]);
    await ready('national');
    const national = await fetchObserved('national', 'SANITATION');
    assert.ok(national.summary.registeredVehicles < all.summary.registeredVehicles, 'Vehicle filter did not change the real national aggregate');
    await page.getByRole('tab').nth(1).click();
    const nationalMode = await root.getAttribute('data-tab');
    await selectRegion('浙江省');
    await page.getByRole('button', { name: '浙江省区域', exact: true }).dblclick();
    await ready('province');
    const province = await fetchObserved('province', 'SANITATION');
    assert.equal(national.regions.find(row => row.code === '330000')?.summary?.registeredVehicles,
      province.summary.registeredVehicles, 'National and provincial totals disagree');
    await checkModes('province');
    await screenshot('province-1920');
    const provinceMode = await root.getAttribute('data-tab');
    await selectRegion('杭州市');
    await page.getByRole('button', { name: '杭州市区域', exact: true }).dblclick();
    await ready('city');
    const city = await fetchObserved('city', 'SANITATION');
    assert.equal(province.regions.find(row => row.code === '330100')?.summary?.registeredVehicles,
      city.summary.registeredVehicles, 'Provincial and city totals disagree');
    assert.ok(city.map.vehicles.every(vehicle => vehicle.vehicleType === 'SANITATION'), 'City map contains vehicles outside the selected type');
    await checkCityModes();
    await screenshot('city-1920');
    assert.ok(cityResponses.length > 0, 'City detail API was not used');
    assert.ok((await page.locator('.cockpit-data-footer').innerText()).includes(city.source.name), 'City source attribution is missing');

    await page.getByRole('button', { name: '返回上一层', exact: true }).click();
    await ready('province');
    assert.equal(await root.getAttribute('data-tab'), provinceMode, 'Province mode was not restored');
    assert.equal(await page.getByLabel('车辆类型', { exact: true }).inputValue(), 'SANITATION');
    assert.equal(await page.locator('.cockpit-selection-card').count(), 0, 'Provincial detail card returned');
    await page.getByRole('button', { name: '返回上一层', exact: true }).click();
    await ready('national');
    assert.equal(await root.getAttribute('data-tab'), nationalMode, 'National mode was not restored');
    assert.equal(await page.getByLabel('车辆类型', { exact: true }).inputValue(), 'SANITATION');
    assert.equal(await page.locator('.cockpit-selection-card').count(), 0, 'National detail card returned');
    for (const [width, height] of [[2560, 1440], [3840, 2160]]) {
      await page.setViewportSize({ width, height });
      await ready('national');
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      assert.ok(overflow.x <= 1 && overflow.y <= 1, `${width}x${height}: viewport overflow ${JSON.stringify(overflow)}`);
      await screenshot(`national-${width}`);
    }
    await Promise.all(responseJobs);
    const legacyRequests = [...requests].filter(url => /cesium|Cesium|\/Workers\//.test(url));
    assert.deepEqual(legacyRequests, [], 'Cesium resources are still being requested');
    assert.ok([...requests].some(url => url.includes('/map/threemap/')), 'Reference project map resources were not requested');
    assert.deepEqual(failures, [], 'Browser errors occurred');
    console.log(JSON.stringify({ ok: true, visitedModes, observedScenes: [...scenes.keys()], screenshots: artifacts }));
  } catch (error) {
    await screenshot('failure');
    console.error(JSON.stringify({ failures, url: page.url(), body: (await page.locator('body').innerText()).slice(0, 8000) }));
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
