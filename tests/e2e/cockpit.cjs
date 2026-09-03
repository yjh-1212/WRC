const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'cockpit');
fs.mkdirSync(artifactDir, { recursive: true });
const ignoreConsole = ['favicon', 'INVALID_USER_DOMAIN', 'Unimplemented type: 3', 'THREE', 'WebGL'];

async function login(page, username) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill('Wrc@2026!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(username.startsWith('ent_') ? '**/enterprise/overview' : '**/regulatory/overview');
}

function attachErrors(page, bucket, prefix) {
  page.on('pageerror', (error) => bucket.push(`${prefix}:${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignoreConsole.some((item) => message.text().includes(item))) {
      bucket.push(`${prefix}-console:${message.text()}`);
    }
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await desktop.newPage();
    attachErrors(page, errors, 'desktop');
    const apiCalls = [];
    page.on('response', (response) => {
      if (response.url().includes('/dashboard/regulator/cockpit')) apiCalls.push(response.url());
    });
    await login(page, 'admin');
    await page.getByRole('heading', { name: '监管总览', exact: true }).waitFor();
    const entry = page.getByRole('button', { name: '监管驾驶舱' });
    if (await entry.count() === 0) throw new Error('监管首页缺少监管驾驶舱按钮');
    await entry.click();
    await page.waitForURL('**/regulatory/cockpit');
    await page.getByRole('heading', { name: '监管驾驶舱', exact: true }).waitFor();
    await page.locator('[data-cockpit-kpi] strong').first().waitFor({ timeout: 20000 });
    const registered = (await page.locator('[data-cockpit-kpi]').filter({ hasText: '在册车辆' }).locator('strong').innerText()).replace(/[^\d]/g, '');
    if (!/^\d+$/.test(registered) || Number(registered) <= 0) throw new Error(`在册车辆不是真实数字: ${registered}`);
    await page.waitForFunction(() => document.querySelector('.cockpit-map')?.getAttribute('data-map-state') !== 'loading', null, { timeout: 30000 });
    const mapState = await page.locator('.cockpit-map').getAttribute('data-map-state');
    if (mapState !== 'ready') throw new Error(`驾驶舱地图未正常加载: ${mapState}`);
    if (await page.getByText('综合运行指数').count()) throw new Error('出现虚构综合运行指数');
    if (await page.getByText('健康度').count()) throw new Error('出现虚构健康度');
    await page.reload();
    await page.locator('[data-cockpit-kpi] strong').first().waitFor({ timeout: 20000 });
    const registeredAgain = (await page.locator('[data-cockpit-kpi]').filter({ hasText: '在册车辆' }).locator('strong').innerText()).replace(/[^\d]/g, '');
    if (registeredAgain !== registered) throw new Error(`刷新后在册车辆变化 ${registered} -> ${registeredAgain}`);
    if (!apiCalls.some((url) => url.includes('/dashboard/regulator/cockpit'))) throw new Error('未观察到驾驶舱后端请求');
    await page.locator('.cockpit-rank').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.cockpit-crumbs li').length >= 2);
    await page.locator('.cockpit-rank').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.cockpit-crumbs li').length >= 3);
    await page.locator('.cockpit-rank').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.cockpit-crumbs li').length >= 4);
    await page.waitForFunction(() => !['idle', 'loading'].includes(document.querySelector('.cockpit-map')?.getAttribute('data-model-state') || ''), null, { timeout: 15000 });
    const modelState = await page.locator('.cockpit-map').getAttribute('data-model-state');
    if (modelState !== 'ready') throw new Error(`单车 3D 模型未正常加载: ${modelState}`);
    const overflow1920 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow1920 > 1) throw new Error(`1920 宽度出现横向滚动 ${overflow1920}px`);
    await page.screenshot({ path: path.join(artifactDir, 'cockpit-1920.png') });
    await desktop.close();

    const wide = await browser.newContext({ viewport: { width: 2560, height: 1440 }, reducedMotion: 'reduce' });
    const widePage = await wide.newPage();
    attachErrors(widePage, errors, 'wide');
    await login(widePage, 'admin');
    await widePage.getByRole('button', { name: '监管驾驶舱' }).click();
    await widePage.waitForURL('**/regulatory/cockpit');
    await widePage.locator('[data-cockpit-kpi] strong').first().waitFor({ timeout: 20000 });
    await widePage.waitForFunction(() => document.querySelector('.cockpit-map')?.getAttribute('data-map-state') !== 'loading', null, { timeout: 30000 });
    const wideMapState = await widePage.locator('.cockpit-map').getAttribute('data-map-state');
    if (wideMapState !== 'ready') throw new Error(`2560 驾驶舱地图未正常加载: ${wideMapState}`);
    const overflow2560 = await widePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow2560 > 1) throw new Error(`2560 宽度出现横向滚动 ${overflow2560}px`);
    await widePage.screenshot({ path: path.join(artifactDir, 'cockpit-2560.png') });
    await wide.close();

    const districtCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const districtPage = await districtCtx.newPage();
    attachErrors(districtPage, errors, 'district');
    await login(districtPage, 'reg_user');
    await districtPage.getByRole('button', { name: '监管驾驶舱' }).click();
    await districtPage.waitForURL('**/regulatory/cockpit');
    await districtPage.locator('[data-cockpit-kpi] strong').first().waitFor({ timeout: 20000 });
    const districtCount = Number((await districtPage.locator('[data-cockpit-kpi]').filter({ hasText: '在册车辆' }).locator('strong').innerText()).replace(/[^\d]/g, ''));
    if (!(districtCount > 0 && districtCount < Number(registered))) throw new Error(`区县数据范围未收窄: ${districtCount} vs ${registered}`);
    await districtCtx.close();

    const fallbackCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const fallbackPage = await fallbackCtx.newPage();
    fallbackPage.on('pageerror', (error) => errors.push(`fallback:${error.message}`));
    await fallbackPage.route('**/models/unmanned_delivery_vehicle.obj', (route) => route.abort());
    await login(fallbackPage, 'admin');
    await fallbackPage.getByRole('button', { name: '监管驾驶舱' }).click();
    await fallbackPage.locator('[data-cockpit-kpi] strong').first().waitFor({ timeout: 20000 });
    for (let depth = 2; depth <= 4; depth += 1) {
      await fallbackPage.locator('.cockpit-rank').first().click();
      await fallbackPage.waitForFunction((count) => document.querySelectorAll('.cockpit-crumbs li').length >= count, depth);
    }
    await fallbackPage.waitForFunction(() => document.querySelector('.cockpit-map')?.getAttribute('data-model-state') === 'fallback', null, { timeout: 15000 });
    if (await fallbackPage.locator('.cockpit-map').getAttribute('data-map-state') !== 'ready') throw new Error('3D 模型失败影响了高德地图');
    await fallbackCtx.close();

    const enterpriseCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const enterprisePage = await enterpriseCtx.newPage();
    attachErrors(enterprisePage, errors, 'enterprise');
    await login(enterprisePage, 'ent_admin');
    if (await enterprisePage.getByRole('button', { name: '监管驾驶舱' }).count()) throw new Error('企业端出现监管驾驶舱按钮');
    await enterprisePage.goto(`${baseURL}/regulatory/cockpit`);
    await enterprisePage.waitForURL('**/enterprise/overview');
    await enterpriseCtx.close();

    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ ok: true, registered: Number(registered), districtCount, mapState, apiCalls: apiCalls.length }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
