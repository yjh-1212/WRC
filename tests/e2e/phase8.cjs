const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'phase8');
fs.mkdirSync(artifactDir, { recursive: true });
const ignoreConsole = ['favicon', 'INVALID_USER_DOMAIN', 'Unimplemented type: 3'];

async function login(page, username) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill('Wrc@2026!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(username.startsWith('ent_') ? '**/enterprise/overview' : '**/regulatory/overview');
}

async function waitDashboard(page, heading) {
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  await page.locator('.dashboard-metric strong').first().waitFor({ timeout: 20000 });
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
    await login(page, 'admin');
    await waitDashboard(page, '监管总览');
    if (await page.getByRole('heading', { name: '企业运营工作台', exact: true }).count()) throw new Error('监管端出现企业运营工作台标题');
    if (await page.getByText('高风险企业 TOP5').count()) throw new Error('监管端仍在展示独立高风险企业 TOP5');
    if (await page.getByRole('heading', { name: '我的监管待办', exact: true }).count() === 0) throw new Error('监管端缺少我的监管待办');
    if (await page.getByRole('heading', { name: '今日监管态势', exact: true }).count() === 0) throw new Error('监管端缺少今日监管态势');
    if (await page.getByRole('heading', { name: '重点监管对象', exact: true }).count() === 0) throw new Error('监管端缺少重点监管对象');
    await page.getByRole('button', { name: '刷新监管总览' }).click();
    await page.locator('.dashboard-metric strong').first().waitFor();
    const regulatorOnline = (await page.locator('.dashboard-metrics button').nth(1).locator('strong').innerText()).replace(/,/g, '');
    if (!/^\d+$/.test(regulatorOnline)) throw new Error(`监管在线指标不是数字: ${regulatorOnline}`);
    await page.getByRole('button', { name: '查看全部' }).click();
    await page.waitForURL('**/safety/alerts');
    await page.getByRole('heading', { name: '告警中心', exact: true }).waitFor();
    await page.goto(`${baseURL}/regulatory/overview`);
    await waitDashboard(page, '监管总览');
    const map = page.locator('#regulatory-dashboard-map [data-map-state]');
    await map.waitFor();
    await page.waitForFunction(() => document.querySelector('#regulatory-dashboard-map [data-map-state]')?.getAttribute('data-map-state') !== 'loading', null, { timeout: 30000 });
    const mapState = await map.getAttribute('data-map-state');
    if (!['ready', 'error'].includes(mapState || '')) throw new Error(`监管地图状态异常: ${mapState}`);
    if (mapState === 'ready') {
      await page.locator('.dashboard-alert-table button, .dashboard-empty').first().waitFor({ timeout: 15000 });
      const alarmRow = page.locator('.dashboard-alert-table button').first();
      if (await alarmRow.count()) {
        await alarmRow.click();
        await page.locator('.dashboard-selected-vehicle, .operation-map-info').first().waitFor({ timeout: 10000 });
      } else {
        const group = page.locator('.operation-cluster, .operation-group').first();
        if (await group.count()) {
          await group.click({ force: true });
          await page.locator('.operation-marker').first().waitFor({ timeout: 8000 }).catch(() => {});
        }
        const marker = page.locator('.operation-marker').first();
        if (await marker.count()) {
          await marker.click({ force: true });
          await page.locator('.operation-map-info, .dashboard-selected-vehicle').first().waitFor({ timeout: 10000 });
        }
      }
    }
    const overflow1920 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow1920 > 1) throw new Error(`1920 宽度出现横向滚动 ${overflow1920}px`);
    await page.screenshot({ path: path.join(artifactDir, 'regulator-1920.png'), fullPage: true });
    await desktop.close();

    const laptop1440 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page1440 = await laptop1440.newPage();
    attachErrors(page1440, errors, 'laptop1440');
    await login(page1440, 'admin');
    await waitDashboard(page1440, '监管总览');
    await page1440.getByRole('heading', { name: '我的监管待办', exact: true }).waitFor();
    await page1440.locator('#regulatory-dashboard-map [data-map-state]').waitFor();
    const overflow1440 = await page1440.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow1440 > 1) throw new Error(`1440 宽度出现横向滚动 ${overflow1440}px`);
    await page1440.screenshot({ path: path.join(artifactDir, 'regulator-1440.png'), fullPage: true });
    await laptop1440.close();

    const laptop = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    const laptopPage = await laptop.newPage();
    attachErrors(laptopPage, errors, 'laptop');
    await login(laptopPage, 'admin');
    await waitDashboard(laptopPage, '监管总览');
    await laptopPage.locator('#regulatory-dashboard-map [data-map-state]').waitFor();
    await laptopPage.waitForFunction(() => document.querySelector('#regulatory-dashboard-map [data-map-state]')?.getAttribute('data-map-state') !== 'loading', null, { timeout: 30000 });
    const overflow1366 = await laptopPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow1366 > 1) throw new Error(`1366 宽度出现横向滚动 ${overflow1366}px`);
    await laptopPage.screenshot({ path: path.join(artifactDir, 'regulator-1366.png'), fullPage: true });
    await laptop.close();

    const enterpriseCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const enterprisePage = await enterpriseCtx.newPage();
    attachErrors(enterprisePage, errors, 'enterprise');
    await login(enterprisePage, 'ent_admin');
    await waitDashboard(enterprisePage, '企业运营工作台');
    if (await enterprisePage.getByRole('heading', { name: '监管总览', exact: true }).count()) throw new Error('企业端出现监管总览标题');
    if (await enterprisePage.getByText('高风险企业 TOP5').count()) throw new Error('企业端出现全市高风险企业排行');
    const company = await enterprisePage.locator('.enterprise-brief strong').first().innerText();
    if (!company.includes('杭城智运')) throw new Error(`企业端未展示本企业名称: ${company}`);
    await enterprisePage.getByRole('button', { name: '刷新企业运营工作台' }).click();
    await enterprisePage.locator('.dashboard-metric strong').first().waitFor();
    if (await enterprisePage.getByText('西湖无人配送').count()) throw new Error('企业端看到其他企业名称');
    const taskButton = enterprisePage.locator('.dashboard-task-list button').first();
    if (await taskButton.count()) {
      await Promise.all([
        enterprisePage.waitForURL((url) => !url.pathname.endsWith('/enterprise/overview'), { timeout: 8000 }),
        taskButton.click(),
      ]);
    }
    await enterprisePage.goto(`${baseURL}/enterprise/overview`);
    await waitDashboard(enterprisePage, '企业运营工作台');
    const enterpriseMap = enterprisePage.locator('#enterprise-dashboard-map [data-map-state]');
    await enterpriseMap.waitFor();
    await enterprisePage.waitForFunction(() => document.querySelector('#enterprise-dashboard-map [data-map-state]')?.getAttribute('data-map-state') !== 'loading', null, { timeout: 30000 });
    const enterpriseMapState = await enterpriseMap.getAttribute('data-map-state');
    if (!['ready', 'error'].includes(enterpriseMapState || '')) throw new Error(`企业地图状态异常: ${enterpriseMapState}`);
    await enterprisePage.screenshot({ path: path.join(artifactDir, 'enterprise-1440.png'), fullPage: true });
    await enterpriseCtx.close();

    const failCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const failPage = await failCtx.newPage();
    await failPage.route('**/api/dashboard/regulator/summary', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 500, message: 'simulated dashboard failure', data: null }) });
    });
    await login(failPage, 'admin');
    await failPage.getByText('监管总览暂时无法加载').waitFor({ timeout: 15000 });
    await failPage.getByRole('button', { name: '重新加载' }).waitFor();
    await failPage.screenshot({ path: path.join(artifactDir, 'regulator-error.png'), fullPage: true });
    await failCtx.close();

    if (errors.length) throw new Error(`浏览器错误: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, artifacts: artifactDir, regulatorOnline }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
