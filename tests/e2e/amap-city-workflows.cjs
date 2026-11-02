const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Real API data and normal dashboard controls. No response interception or seeds.
const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifacts = path.resolve('test-results', 'amap-city-workflows');

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1', channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const failures = [];
  const mapRequestFailures = [];
  const apiCalls = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    failures.push(message.text());
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/dashboard/regulator/cockpit')) return;
    apiCalls.push(`${url.pathname}${url.search}`);
    if (!response.ok()) failures.push(`${response.status()} ${url.pathname}${url.search}`);
  });
  page.on('requestfailed', request => {
    if (/amap\.com|autonavi\.com/.test(request.url()) && !/ABORTED/i.test(request.failure()?.errorText ?? '')) mapRequestFailures.push(`${request.failure()?.errorText} ${request.url()}`);
  });

  const map = page.locator('.geo-map-shell');
  async function ready(level) {
    await page.locator(`main.three-level-cockpit[data-level="${level}"]`).waitFor();
    await page.locator(`.geo-map-shell[data-level="${level}"][data-ready="true"]`).waitFor();
    await page.locator('.cockpit-request-state[role="status"]').waitFor({ state: 'hidden' });
    assert.equal(await map.getAttribute('data-engine'), level === 'city' ? 'amap' : 'three');
    assert.equal(await page.locator('.three-map-loading.error').count(), 0, `${level}: map failed`);
    if (level === 'city') await amapSurface().waitFor({ state: 'visible' });
  }
  async function screenshot(name) {
    await page.screenshot({ path: path.join(artifacts, `${name}.png`) });
  }
  async function enterRegion(name, nextLevel) {
    await page.getByRole('button', { name: `${name}区域`, exact: true }).dblclick();
    await ready(nextLevel);
  }
  function amapSurface() { return page.locator('.geo-map-host.amap-container, .geo-map-host .amap-container, .geo-map-host .amap-maps').first(); }
  function selectedMarker(vehicleId) { return page.locator(`button.amap-city-marker.is-selected[data-map-kind="vehicles"][data-map-id=${JSON.stringify(vehicleId)}]`).first(); }
  async function waitUntil(check, message, timeout = 20_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await check()) return;
      await page.waitForTimeout(100);
    }
    throw new Error(message);
  }
  async function seek(index) {
    await page.getByRole('slider', { name: '轨迹回放进度' }).evaluate((input, value) => {
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, index);
    await waitUntil(async () => Number(await page.getByRole('slider', { name: '轨迹回放进度' }).inputValue()) === index, `Replay did not seek to ${index}`);
  }

  try {
    await page.goto(`${baseURL}/login`);
    await page.getByRole('textbox', { name: '账号' }).fill(process.env.TEST_USER || 'admin');
    await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!');
    const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.ok());
    await page.getByRole('button', { name: '登录', exact: true }).click();
    const accessToken = (await (await loginResponse).json()).data.accessToken;
    assert.ok(accessToken, 'Real login did not return an access token');
    await page.waitForURL('**/regulatory/overview');
    const apiGet = async query => {
      const response = await context.request.get(`${baseURL}/api/dashboard/regulator/cockpit?${new URLSearchParams(query)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      assert.ok(response.ok(), `Read-only cockpit API failed: ${response.status()}`);
      return (await response.json()).data;
    };

    await page.goto(`${baseURL}/regulatory/cockpit`);
    await ready('national');
    await enterRegion('浙江省', 'province');
    await enterRegion('杭州市', 'city');
    const cityOverview = await apiGet({ level: 'city', mapMode: 'situation', vehicleType: 'ALL' });
    assert.equal((await page.locator('.city-summary-grid > div').first().locator('strong').innerText()).trim(), cityOverview.summary.registered.toLocaleString('zh-CN'), 'City vehicle count differs from the database API');
    assert.deepEqual((await page.getByRole('tablist', { name: '地图视图' }).getByRole('tab').allTextContents()).map(text => text.trim()), ['综合态势', '企业分布', '运行区域']);
    const districtMarkers = page.locator('.geo-map-host .amap-city-marker[data-map-kind="districts"]');
    await districtMarkers.first().waitFor();
    assert.equal(await page.locator('.geo-map-host .amap-city-marker[data-map-kind="vehicles"]').count(), 0, 'City scope mixes individual vehicles with districts');
    await screenshot('city-overview');

    await page.getByRole('tab', { name: '企业分布', exact: true }).click();
    await ready('city');
    await page.locator('.geo-map-host .amap-city-marker[data-map-kind="enterprises"]').first().waitFor();
    await page.getByRole('tab', { name: '运行区域', exact: true }).click();
    await ready('city');
    assert.equal(await page.getByRole('tab', { name: '运行区域', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: '综合态势', exact: true }).click();
    await ready('city');
    await districtMarkers.first().waitFor();

    const districtId = await districtMarkers.first().getAttribute('data-map-id');
    await districtMarkers.first().dblclick();
    await ready('city');
    const enterpriseMarkers = page.locator('.geo-map-host .amap-city-marker[data-map-kind="enterprises"]');
    await enterpriseMarkers.first().waitFor();
    assert.equal(await page.locator('.geo-map-host .amap-city-marker[data-map-kind="vehicles"]').count(), 0, 'District scope mixes individual vehicles with enterprises');
    await screenshot('district-enterprises');

    const enterpriseId = await enterpriseMarkers.first().getAttribute('data-map-id');
    await enterpriseMarkers.first().dblclick();
    await ready('city');
    await page.locator('.geo-map-host .amap-city-marker[data-map-kind="vehicles"]').first().waitFor();
    const fleet = await apiGet({ level: 'enterprise', organizationId: districtId, enterpriseId, mapMode: 'situation', vehicleType: 'ALL' });
    assert.equal(fleet.map.kind, 'vehicles');
    assert.ok(fleet.map.items.length > 0, 'Company scope has no real vehicle data');

    let candidate;
    for (const row of fleet.distribution.items) {
      const vehicle = fleet.map.items.find(item => item.id === row.id);
      if (!vehicle) continue;
      const detail = await apiGet({ level: 'vehicle', organizationId: districtId, enterpriseId, vehicleId: vehicle.id, mapMode: 'vehicles', vehicleType: 'ALL' });
      if (detail.map.track.length > 2) { candidate = { vehicle, detail }; break; }
    }
    assert.ok(candidate, 'No company vehicle shown in the ranking has an existing historical track');
    const { vehicle, detail } = candidate;
    const track = detail.map.track;
    assert.ok(detail.context.historyTrack, 'Historical route metadata was not returned by the database API');
    assert.ok(detail.context.historyTrack.startName && detail.context.historyTrack.endName, 'Historical route endpoints are missing');
    await page.locator('.city-ranking-list button').filter({ hasText: vehicle.businessNo }).first().click();
    await ready('city');
    await page.locator('.geo-map-shell[data-model-state="ready"]').waitFor({ timeout: 20000 });
    await page.locator('.city-facts').filter({ hasText: detail.context.historyTrack.startName }).waitFor();
    assert.ok(apiCalls.some(url => url.includes('level=vehicle')), 'Vehicle scope did not request individual vehicle data');
    await screenshot('vehicle-3d-model');
    assert.ok(track.every(point => Number.isFinite(point.longitude) && Number.isFinite(point.latitude)), 'Track has invalid geographic coordinates');
    assert.ok(track.every(point => typeof point.recordedAt === 'string' && Number.isFinite(Date.parse(point.recordedAt))), 'Real API track recordedAt is missing or invalid');
    for (let index = 1; index < track.length; index++) assert.ok(Date.parse(track[index].recordedAt) >= Date.parse(track[index - 1].recordedAt), 'Historical track timestamps are not ordered');

    await page.locator('.cockpit-selection-card').filter({ hasText: vehicle.businessNo }).waitFor();
    assert.equal(await map.getAttribute('data-selected'), vehicle.id, 'Vehicle list selection did not reach the map');
    await selectedMarker(vehicle.id).waitFor({ state: 'visible' });

    await page.getByRole('button', { name: '业务图层', exact: true }).click();
    const areas = page.getByLabel('运营区域与围栏', { exact: true });
    await areas.uncheck();
    assert.equal(await areas.isChecked(), false, 'Area switch did not change');
    assert.equal(await amapSurface().isVisible(), true, 'Area switch incorrectly hid the AMap surface');
    assert.equal(await map.getAttribute('data-selected'), vehicle.id, 'Area switch discarded vehicle selection');
    await selectedMarker(vehicle.id).waitFor({ state: 'visible' });
    await areas.check();
    await page.getByRole('button', { name: '业务图层', exact: true }).click();
    await screenshot('city-vehicle-selected');

    await page.locator('.three-replay').waitFor();
    // Selection prefetch may satisfy drill-down from the application cache.
    const actualDetail = await apiGet({ level: 'vehicle', mapMode: 'vehicles', vehicleType: 'ALL', vehicleId: vehicle.id });
    assert.equal(actualDetail.scope.vehicle.id, vehicle.id);
    assert.deepEqual(actualDetail.map.track, track, 'UI drill does not use the same actual API track');
    const slider = page.getByRole('slider', { name: '轨迹回放进度' });
    assert.equal(Number(await slider.getAttribute('max')), track.length - 1, 'Replay timeline length disagrees with API');
    assert.deepEqual(await page.getByLabel('回放倍速', { exact: true }).locator('option').evaluateAll(options => options.map(option => Number(option.value))), [1, 2, 4, 16, 64]);

    await page.getByRole('button', { name: '跟随选中车辆', exact: true }).click();
    await page.locator('.three-follow').waitFor();
    assert.ok((await page.locator('.three-follow').innerText()).includes('车辆跟随中'), 'Follow state was not displayed');
    await selectedMarker(vehicle.id).waitFor({ state: 'visible' });
    await screenshot('vehicle-follow');

    const seekIndex = Math.floor(track.length / 2);
    await seek(seekIndex);
    const displayedTime = await page.evaluate(value => new Date(value).toLocaleString('zh-CN', { hour12: false }), track[seekIndex].recordedAt);
    assert.equal((await page.locator('.three-replay time').innerText()).trim(), displayedTime, 'Replay time does not use real recordedAt');
    assert.equal(Number(await slider.inputValue()), seekIndex);
    await screenshot('vehicle-replay-seek');

    // Use a track segment with a real positive interval, not an assumed cadence.
    const startIndex = track.findIndex((point, index) => index < track.length - 1 && Date.parse(track[index + 1].recordedAt) - Date.parse(point.recordedAt) > 1500);
    assert.ok(startIndex >= 0, 'Track has no positive timestamp interval for playback verification');
    const interval = Date.parse(track[startIndex + 1].recordedAt) - Date.parse(track[startIndex].recordedAt);
    await seek(startIndex);
    await page.getByLabel('回放倍速', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: '轨迹回放', exact: true }).click();
    await page.getByRole('button', { name: '暂停回放', exact: true }).waitFor();
    await page.waitForTimeout(350);
    assert.equal(Number(await slider.inputValue()), startIndex, '1× playback skipped a timestamp interval prematurely');
    await page.getByRole('button', { name: '暂停回放', exact: true }).click();
    assert.equal(Number(await slider.inputValue()), startIndex, 'Pause changed the timeline index');

    await page.getByLabel('回放倍速', { exact: true }).selectOption('64');
    await page.getByRole('button', { name: '轨迹回放', exact: true }).click();
    await waitUntil(async () => Number(await slider.inputValue()) > startIndex, '64× playback did not advance using recordedAt', Math.max(8000, interval / 64 + 5000));
    if (await page.getByRole('button', { name: '暂停回放', exact: true }).isVisible()) await page.getByRole('button', { name: '暂停回放', exact: true }).click();
    const pausedIndex = Number(await slider.inputValue());
    await page.waitForTimeout(250);
    assert.equal(Number(await slider.inputValue()), pausedIndex, 'Paused replay continued advancing');

    await page.getByRole('button', { name: '结束回放', exact: true }).click();
    assert.equal(Number(await slider.inputValue()), 0, 'Exit replay did not reset UI progress');
    assert.equal(await page.getByRole('button', { name: '结束回放', exact: true }).count(), 0);
    await page.getByRole('button', { name: '退出跟随', exact: true }).click();
    await page.locator('.three-follow').waitFor({ state: 'hidden' });
    assert.equal(await amapSurface().isVisible(), true, 'Exiting follow removed the map');
    await screenshot('vehicle-workflow-complete');

    assert.equal(await map.getAttribute('data-engine'), 'amap');
    await selectedMarker(vehicle.id).waitFor({ state: 'visible' });
    assert.equal(await page.locator('[class*="cesium-"]').count(), 0, 'Legacy renderer DOM remains');
    assert.deepEqual(failures, [], 'Browser application errors occurred');
    console.log(JSON.stringify({ ok: true, engine: 'amap', vehicle: vehicle.businessNo, fleetCount: cityOverview.summary.registered, companyVehicles: fleet.map.items.length, trackPoints: track.length, firstTimestamp: track[0].recordedAt, lastTimestamp: track.at(-1).recordedAt, replayPausedIndex: pausedIndex, areaTogglePreservedVehicleSelection: true, mapRequestFailures, notices: await page.locator('.three-map-notice').allTextContents(), observedApiCalls: apiCalls.length, screenshots: artifacts }));
  } catch (error) {
    await screenshot('failure').catch(() => {});
    console.error(JSON.stringify({ failures, mapRequestFailures: mapRequestFailures.slice(0, 3), url: page.url(), body: (await page.locator('body').innerText().catch(() => '')).slice(0, 6000) }));
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
