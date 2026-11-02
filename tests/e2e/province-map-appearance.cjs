const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const appearancePath = '/api/dashboard/regulator/province-cockpit/appearance';
const artifacts = path.resolve(__dirname, '../../test-results/province-map-appearance');
(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('账号', { exact: true }).fill('admin');
    await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL('**/province/overview', { waitUntil: 'domcontentloaded' });

    // Hold shared configuration until business data arrives. Observe the real SDK
    // constructor and setMapStyle rather than substituting a fake map.
    async function coldStart(override) {
      let release, seen;
      const gate = new Promise(resolve => { release = resolve; });
      const received = new Promise(resolve => { seen = resolve; });
      const handler = async route => {
        const response = await route.fetch(), body = await response.json();
        if (override) body.data.style = { ...body.data.style, ...override };
        seen(body.data.style); await gate;
        await route.fulfill({ response, json: body });
      };
      await page.route('**' + appearancePath, handler);
      const business = page.waitForResponse(response => new URL(response.url()).pathname === '/api/dashboard/regulator/province-cockpit' && response.ok());
      await page.goto(base + '/province/cockpit?cityCode=370100', { waitUntil: 'domcontentloaded' });
      const style = await received; await business;
      assert.equal(await page.locator('.pc-map,.pc-side').count(), 0, 'Do not draw default colors before shared settings arrive');
      await page.getByText('正在读取共享风格与监管数据…', { exact: true }).waitFor();
      await page.evaluate(async () => {
        const { loadAMap } = await import('/src/amap.ts');
        const AMap = await loadAMap(['AMap.Scale']);
        window.__nativeStyleCalls = { initial: [], updates: [] };
        const NativeMap = AMap.Map;
        AMap.Map = new Proxy(NativeMap, {
          construct(target, args) {
            window.__nativeStyleCalls.initial.push(args[1].mapStyle);
            const map = Reflect.construct(target, args), setStyle = map.setMapStyle.bind(map);
            map.setMapStyle = value => { window.__nativeStyleCalls.updates.push(value); return setStyle(value); };
            return map;
          },
        });
      });
      release();
      await page.locator('.pc-map[data-map-state="ready"]').waitFor({ timeout: 30000 });
      await page.locator('.pc-side').first().waitFor();
      assert.deepEqual(await page.evaluate(() => window.__nativeStyleCalls), { initial: ['amap://styles/blue'], updates: [] });
      return { handler, style };
    }
    const dark = await coldStart({ mapStyle: 'dark' });
    await page.unroute('**' + appearancePath, dark.handler);
    // A full navigation resets SDK instrumentation and checks the persisted palette.
    await page.goto(base + '/province/overview', { waitUntil: 'domcontentloaded' });
    const blue = await coldStart();
    assert(['blue', 'dark', 'normal'].includes(blue.style.mapStyle));
    const filter = await page.locator('.pc-map .amap-layer').first().evaluate(element => getComputedStyle(element).filter);
    assert.equal(filter, 'none', 'Native blue map labels and streets must remain unfiltered');
    await page.waitForResponse(response => new URL(response.url()).pathname === appearancePath && response.ok(), { timeout: 12000 });
    assert.deepEqual(await page.evaluate(() => window.__nativeStyleCalls), { initial: ['amap://styles/blue'], updates: [] });
    await page.screenshot({ path: path.join(artifacts, 'reference-palette.png') });
    await page.unroute('**' + appearancePath, blue.handler);

    let failing = true;
    await page.route('**' + appearancePath, route => failing ? route.fulfill({ status: 503, json: { code: 503, message: '合成测试：共享风格读取失败' } }) : route.continue());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '重试共享风格', exact: true }).waitFor();
    assert.equal(await page.locator('.pc-map').count(), 0, 'Failed reads must not flash a fallback theme');
    failing = false;
    await page.getByRole('button', { name: '重试共享风格', exact: true }).click();
    await page.locator('.pc-map[data-map-state="ready"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.pc-native-map.amap-container').count(), 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ waitsForSharedStyle: true, honorsNonDefaultInitialStyle: true, nativeInitialPalette: true, noRedundantStyleSwitch: true, stableAfterSync: true, sharedStyleFailureRecovery: true, filter, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
