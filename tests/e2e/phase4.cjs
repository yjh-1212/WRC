const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'phase4');
fs.mkdirSync(artifactDir, { recursive: true });

async function login(page, username) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill('Wrc@2026!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(username.startsWith('ent_') ? '**/enterprise/overview' : '**/regulatory/overview');
}
async function waitForMap(page) {
  const map = page.locator('[data-map-state]');
  await map.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-map-state]')?.getAttribute('data-map-state') !== 'loading', null, { timeout: 30000 });
  const state = await map.getAttribute('data-map-state');
  if (state !== 'ready') throw new Error(`高德地图未就绪: ${await map.innerText()}`);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const errors = [];
  const externalMapAuth = [];
  try {
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const admin = await adminContext.newPage();
    admin.on('pageerror', error => error.message === 'Unimplemented type: 3' ? externalMapAuth.push(`admin:${error.message}`) : errors.push(`admin:${error.message}`));
    admin.on('console', message => { if (message.type() === 'error' && message.text().includes('INVALID_USER_DOMAIN')) externalMapAuth.push(`admin:${message.text()}`); });
    await login(admin, 'admin');

    await admin.goto(`${baseURL}/operations/realtime`);
    await admin.getByRole('heading', { name: '实时运行' }).waitFor();
    await admin.locator('.vehicle-list-item').first().waitFor();
    const realtimeCount = await admin.locator('.vehicle-list-item').count();
    if (realtimeCount !== 30) throw new Error(`监管端实时车辆应为30，实际${realtimeCount}`);
    await waitForMap(admin);
    const targetVehicle = admin.locator('.vehicle-list-item').nth(2);
    const targetText = await targetVehicle.innerText();
    await targetVehicle.click();
    await admin.locator('.vehicle-list-item.active').filter({ hasText: targetText.split('\n')[0] }).waitFor();
    await admin.screenshot({ path: path.join(artifactDir, 'realtime-desktop.png'), fullPage: true });

    await admin.goto(`${baseURL}/operations/distribution`);
    await admin.getByRole('heading', { name: '车辆分布' }).waitFor();
    await waitForMap(admin);
    await admin.getByText('热力', { exact: true }).click();
    await admin.screenshot({ path: path.join(artifactDir, 'distribution-heatmap.png'), fullPage: true });
    await admin.getByText('聚合', { exact: true }).click();

    await admin.goto(`${baseURL}/operations/trajectories`);
    await admin.getByRole('heading', { name: '车辆轨迹' }).waitFor();
    await admin.getByText('32', { exact: true }).first().waitFor();
    await waitForMap(admin);
    await admin.getByRole('button', { name: '开始回放' }).click();
    await admin.getByRole('button', { name: '暂停' }).waitFor();
    await admin.screenshot({ path: path.join(artifactDir, 'trajectory-replay.png'), fullPage: true });

    await admin.goto(`${baseURL}/operations/records`);
    await admin.getByRole('heading', { name: '运行记录' }).waitFor();
    await admin.locator('.table-link').first().click();
    await admin.getByRole('heading', { name: '运行记录详情' }).waitFor();
    await waitForMap(admin);
    await admin.screenshot({ path: path.join(artifactDir, 'record-detail.png'), fullPage: true });
    await admin.keyboard.press('Escape');

    await admin.goto(`${baseURL}/operations/monitor`);
    await admin.getByRole('heading', { name: '在线监测' }).waitFor();
    await admin.waitForFunction(() => document.querySelectorAll('.trend-chart > div').length === 7);
    await admin.getByText('在线车辆明细', { exact: true }).click();
    await admin.locator('.el-table__body tr').first().waitFor();

    await admin.goto(`${baseURL}/operations/regions`);
    await admin.getByRole('heading', { name: '运行区域' }).waitFor();
    await waitForMap(admin);
    if (await admin.locator('.region-rail > button').count() !== 4) throw new Error('运行区域数量不是4');
    await admin.screenshot({ path: path.join(artifactDir, 'operation-regions.png'), fullPage: true });

    const enterpriseContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const enterprise = await enterpriseContext.newPage();
    enterprise.on('pageerror', error => error.message === 'Unimplemented type: 3' ? externalMapAuth.push(`enterprise:${error.message}`) : errors.push(`enterprise:${error.message}`));
    enterprise.on('console', message => { if (message.type() === 'error' && message.text().includes('INVALID_USER_DOMAIN')) externalMapAuth.push(`enterprise:${message.text()}`); });
    await login(enterprise, 'ent_admin');
    await enterprise.goto(`${baseURL}/enterprise/operations/realtime`);
    await enterprise.getByRole('heading', { name: '实时车辆' }).waitFor();
    await enterprise.locator('.vehicle-list-item').first().waitFor();
    const enterpriseCount = await enterprise.locator('.vehicle-list-item').count();
    if (enterpriseCount !== 10) throw new Error(`企业端实时车辆应为10，实际${enterpriseCount}`);
    await waitForMap(enterprise);
    const scope = await enterprise.evaluate(async () => {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` };
      const response = await fetch('/api/operations/realtime', { headers });
      const body = await response.json();
      return { total: body.data.total, enterpriseIds: [...new Set(body.data.items.map(item => item.enterpriseId))] };
    });
    if (scope.total !== 10 || scope.enterpriseIds.length !== 1) throw new Error(`企业数据越权: ${JSON.stringify(scope)}`);
    const menuText = await enterprise.locator('.sidebar').innerText();
    if (menuText.includes('车辆分布') || menuText.includes('运行区域')) throw new Error('企业端出现监管专属菜单');
    const overflow = await enterprise.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (overflow) throw new Error('企业实时车辆窄屏出现页面级横向滚动');
    await enterprise.screenshot({ path: path.join(artifactDir, 'enterprise-realtime-mobile.png'), fullPage: true });

    if (errors.length) throw new Error(`浏览器脚本错误: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, realtimeCount, enterpriseCount, scope, externalMapAuthIssue: externalMapAuth.length > 0, screenshots: artifactDir }, null, 2));
    await adminContext.close(); await enterpriseContext.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
