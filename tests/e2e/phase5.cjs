const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'phase5');
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
async function apiScope(page, endpoint) {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } });
    const body = await response.json();
    return { status: response.status, total: body.data?.total, enterpriseIds: [...new Set((body.data?.items || []).map((item) => item.enterpriseId))] };
  }, endpoint);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  try {
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const admin = await adminContext.newPage();
    admin.on('pageerror', error => pageErrors.push(`admin:${error.message}`));
    await login(admin, 'admin');

    await admin.goto(`${baseURL}/safety/alerts`);
    await admin.getByRole('heading', { name: '告警中心' }).waitFor();
    await admin.locator('.el-table__body tr').first().waitFor();
    if (await admin.locator('.safety-metrics > button').count() !== 5) throw new Error('告警中心状态指标不完整');
    await admin.locator('.table-link').first().click();
    await admin.getByRole('heading', { name: '告警处置详情' }).waitFor();
    await admin.keyboard.press('Escape');
    await admin.screenshot({ path: path.join(artifactDir, 'alert-center.png'), fullPage: true });

    await admin.goto(`${baseURL}/safety/fences`);
    await admin.getByRole('heading', { name: '电子围栏' }).waitFor();
    await waitForMap(admin);
    if (await admin.locator('.fence-rail > button').count() !== 3) throw new Error('电子围栏数量不是3');
    await admin.screenshot({ path: path.join(artifactDir, 'electronic-fences.png'), fullPage: true });

    for (const [url, heading] of [['/safety/accidents', '事故管理'], ['/safety/violations', '违规管理'], ['/safety/offline', '离线监管'], ['/safety/emergency', '应急处置']]) {
      await admin.goto(`${baseURL}${url}`);
      await admin.getByRole('heading', { name: heading }).waitFor();
      await admin.locator('.el-table__body tr').first().waitFor();
    }
    await admin.locator('.table-link').first().click();
    await admin.getByRole('heading', { name: '应急处置任务' }).waitFor();
    await admin.getByText('全过程处置日志', { exact: true }).waitFor();
    await admin.screenshot({ path: path.join(artifactDir, 'emergency-task.png'), fullPage: true });

    const enterpriseContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const enterprise = await enterpriseContext.newPage();
    enterprise.on('pageerror', error => pageErrors.push(`enterprise:${error.message}`));
    await login(enterprise, 'ent_admin');
    await enterprise.goto(`${baseURL}/enterprise/safety/alerts`);
    await enterprise.getByRole('heading', { name: '我的告警' }).waitFor();
    await enterprise.locator('.el-table__body tr').first().waitFor();
    const alertScope = await apiScope(enterprise, '/api/safety/alerts');
    const violationScope = await apiScope(enterprise, '/api/safety/violations');
    if (alertScope.status !== 200 || alertScope.enterpriseIds.length !== 1) throw new Error(`企业告警数据越权: ${JSON.stringify(alertScope)}`);
    if (violationScope.status !== 200 || violationScope.enterpriseIds.length !== 1) throw new Error(`企业违规数据越权: ${JSON.stringify(violationScope)}`);
    const menuText = await enterprise.locator('.sidebar').innerText();
    if (menuText.includes('电子围栏') || menuText.includes('离线监管')) throw new Error('企业端出现监管专属安全菜单');
    await enterprise.goto(`${baseURL}/enterprise/safety/rectifications`);
    await enterprise.getByRole('heading', { name: '整改反馈' }).waitFor();
    const overflow = await enterprise.evaluate(() => ({ page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], offenders: [...document.querySelectorAll('body *')].map(element => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right })).filter(item => item.right > document.documentElement.clientWidth + 1 || item.width > document.documentElement.clientWidth + 1).slice(0, 12) }));
    if (overflow.page[0] > overflow.page[1]) throw new Error(`企业端安全页面窄屏出现页面级横向滚动: ${JSON.stringify(overflow)}`);
    await enterprise.screenshot({ path: path.join(artifactDir, 'enterprise-rectifications-mobile.png'), fullPage: true });

    if (pageErrors.length) throw new Error(`浏览器脚本错误: ${pageErrors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, fences: 3, alertScope, violationScope, screenshots: artifactDir }, null, 2));
    await enterpriseContext.close(); await adminContext.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
