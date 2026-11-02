const { chromium } = require('playwright');
const { expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const output = path.resolve('test-results/city-2d');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const errors = [], vectorRequests = [], models = [], tiles = [], pendingTiles = new Set();
  const isRoadData = request => new URL(request.url()).hostname.startsWith('jsapi-data') && new URL(request.url()).pathname.includes('/pbf/');
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (isRoadData(request)) { vectorRequests.push(url.pathname); pendingTiles.add(request); }
    if (/\.(glb|gltf)$/.test(url.pathname)) models.push(url.pathname);
  });
  page.on('requestfinished', request => pendingTiles.delete(request));
  page.on('requestfailed', request => pendingTiles.delete(request));
  page.on('response', async response => {
    const url = new URL(response.url());
    const vectorZoom = url.hostname.startsWith('jsapi-data') && url.pathname.includes('/pbf/') ? url.pathname.match(/_(\d+)$/)?.[1] : undefined;
    if (vectorZoom && response.ok()) { await response.finished(); tiles.push({ z: Number(vectorZoom) }); }
  });
  try {
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('账号', { exact: true }).fill('admin');
    await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL('**/province/overview', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const { loadAMap } = await import('/src/amap.ts'); const AMap = await loadAMap(), Native = AMap.Map;
      AMap.Map = new Proxy(Native, { construct(target, args) {
        window.__city2DOptions = args[1]; window.__city2DComplete = 0;
        const map = Reflect.construct(target, args); window.__city2DMap = map;
        map.on('complete', () => window.__city2DComplete++); return map;
      } });
    });
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: '驾驶舱', exact: true }).click();
    const start = Date.now();
    await page.getByRole('button', { name: '查看青岛市监管数据', exact: true }).click();
    await page.locator('.pc-native-map[data-level="city"][data-map-state="ready"]').waitFor({ timeout: 75000 });
    const firstReadyMs = Date.now() - start;
    await page.locator('.pc-native-map[data-basemap-state="ready"]').waitFor({ timeout: 75000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect.poll(() => pendingTiles.size, { timeout: 30000 }).toBe(0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const map = await page.evaluate(() => ({ mode: window.__city2DOptions.viewMode, style: window.__city2DOptions.mapStyle, buildings: window.__city2DOptions.showBuildingBlock, pitch: window.__city2DMap.getPitch(), rotation: window.__city2DMap.getRotation(), zoom: window.__city2DMap.getZoom(), complete: window.__city2DComplete, filter: getComputedStyle(document.querySelector('.pc-native-map .amap-layer')).filter }));
    assert.equal(map.mode, '2D'); assert.equal(map.pitch, 0); assert.equal(map.rotation, 0); assert.equal(map.style, 'amap://styles/blue'); assert.equal(map.buildings, false); assert.equal(map.filter, 'none');
    assert(tiles.length > 0, 'Native road data must finish loading');
    assert(vectorRequests.length > 0, 'Native vector map data must replace recolored raster images'); assert.deepEqual(models, []); assert.deepEqual(errors, []);
    const statusCheck = await page.evaluate(async () => {
      const { api } = await import('/src/api.ts'); const data = await api('/dashboard/regulator/province-cockpit/map?cityCode=370200');
      const key = row => row.onlineStatus === 'OFFLINE' || row.drivingState === 'OFFLINE' ? 'offline' : row.drivingState === 'RUNNING' ? 'running' : row.drivingState === 'PARKED' ? 'parked' : row.drivingState === 'IDLE' ? 'idle' : 'unknown';
      const legend = [...document.querySelectorAll('.pc-vehicle-legend [data-vehicle-state]')].map(el => ({ key: el.dataset.vehicleState, count: Number(el.querySelector('b').textContent) }));
      const markers = window.__city2DMap.getAllOverlays('marker').flatMap(marker => { const el = marker.getContent(); if (!el?.matches?.('.amap-city-marker[data-map-kind="vehicles"]')) return []; const point = marker.getPosition(); return [{ key: el.dataset.vehicleState, color: el.style.getPropertyValue('--marker'), actualPosition: data.vehicles.some(row => key(row) === el.dataset.vehicleState && Math.abs(row.longitude - point.getLng()) < 1e-7 && Math.abs(row.latitude - point.getLat()) < 1e-7) }]; });
      const polygons = window.__city2DMap.getAllOverlays('polygon').map(polygon => polygon.getOptions());
      return { legend, counts: data.vehicles.reduce((counts, row) => { counts[key(row)] = (counts[key(row)] || 0) + 1; return counts; }, {}), markers, hasVisibleOperatingBoundary: polygons.some(polygon => polygon.strokeWeight >= 3 && polygon.fillOpacity === 0) };
    });
    for (const entry of statusCheck.legend) assert.equal(entry.count, statusCheck.counts[entry.key] || 0);
    const stateColors = { running: '#34d399', idle: '#60a5fa', parked: '#fbbf24', offline: '#a8b4c7', unknown: '#c4a5f5' };
    assert(statusCheck.markers.length > 0); for (const marker of statusCheck.markers) { assert.equal(marker.color, stateColors[marker.key]); assert(marker.actualPosition, 'Vehicle and cluster symbols must anchor to an actual in-scope reported position'); }
    assert(statusCheck.hasVisibleOperatingBoundary, 'Operating boundaries remain visible without masking the basemap');
    await page.screenshot({ path: path.join(output, 'qingdao-2d.png') });
    await page.evaluate(() => { window.__city2DZoomed = false; const map = window.__city2DMap; const done = () => { window.__city2DZoomed = true; map.off('zoomend', done); }; map.on('zoomend', done); });
    await page.getByRole('button', { name: '放大地图', exact: true }).click();
    await page.waitForFunction(zoom => window.__city2DZoomed && window.__city2DMap.getZoom() > zoom, map.zoom, { timeout: 30000 });
    await expect.poll(() => pendingTiles.size, { timeout: 30000 }).toBe(0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, 'qingdao-2d-zoom.png') });
    assert.deepEqual(errors, []);
    const result = { passed: true, firstReadyMs, map, tileResponses: tiles.length, vectorRequests, modelRequests: models, statusLegend: statusCheck.legend, statusColoredMarkers: statusCheck.markers.length, clustersOnActualPositions: true, visibleOperatingBoundary: statusCheck.hasVisibleOperatingBoundary, errors };
    fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png') }); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
