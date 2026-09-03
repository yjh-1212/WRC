const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'phase6');
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
  if (await map.getAttribute('data-map-state') !== 'ready') throw new Error(`高德地图未就绪: ${await map.innerText()}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`admin:${error.message}`));
    await login(page, 'admin');

    await page.goto(`${baseURL}/analytics/operations`);
    await page.getByRole('heading', { name: '运行分析' }).waitFor();
    await page.locator('.phase6-metric').first().waitFor();
    if (await page.locator('.phase6-metric').count() !== 6) throw new Error('运行分析指标不完整');
    if (await page.locator('.analytics-chart canvas').count() < 2) throw new Error('运行分析 ECharts 未渲染');
    await page.screenshot({ path: path.join(artifactDir, 'operations-analysis.png'), fullPage: true });

    await page.goto(`${baseURL}/analytics/safety`);
    await page.getByRole('heading', { name: '安全态势' }).waitFor();
    await waitForMap(page);
    if (await page.locator('.risk-ranking li').count() < 1) throw new Error('企业风险排行为空');
    await page.screenshot({ path: path.join(artifactDir, 'safety-situation.png'), fullPage: true });

    await page.goto(`${baseURL}/analytics/accidents`);
    await page.getByRole('heading', { name: '事故回溯' }).waitFor();
    await page.locator('.accident-list > button').first().waitFor();
    await page.getByText('时空轨迹复现', { exact: true }).waitFor();
    await waitForMap(page);

    await page.goto(`${baseURL}/analytics/evaluations`);
    await page.getByRole('heading', { name: '企业评价' }).waitFor();
    await page.locator('.el-table__body tr').first().waitFor();
    if (await page.locator('.el-table__body tr').count() < 2) throw new Error('企业评价任务或结果为空');

    await page.goto(`${baseURL}/analytics/profiles`);
    await page.getByRole('heading', { name: '企业安全画像' }).waitFor();
    await page.locator('.profile-grid > button').first().waitFor();
    if (await page.locator('.profile-grid > button').count() !== 2) throw new Error('企业画像数量异常');

    await page.goto(`${baseURL}/analytics/reports`);
    await page.getByRole('heading', { name: '监管报表' }).waitFor();
    await page.locator('.el-table__body tr').first().waitFor();
    await page.getByRole('button', { name: '查看', exact: true }).first().click();
    await page.getByRole('heading', { name: '监管报表预览' }).waitFor();
    await page.screenshot({ path: path.join(artifactDir, 'regulatory-report.png'), fullPage: true });
    await context.close();

    const entContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ent = await entContext.newPage();
    ent.on('pageerror', error => errors.push(`enterprise:${error.message}`));
    await login(ent, 'ent_admin');
    await ent.goto(`${baseURL}/enterprise/evaluations/current`);
    await ent.getByRole('heading', { name: '本期评价' }).waitFor();
    await ent.locator('.evaluation-card').first().waitFor();
    if (!(await ent.locator('.evaluation-card').first().innerText()).includes('2026 年 8 月')) throw new Error('本期评价未按评价周期倒序展示');
    const scope = await ent.evaluate(async () => {
      const response = await fetch('/api/analytics/evaluations?page=1&pageSize=50', { headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } });
      const body = await response.json();
      return { status: response.status, total: body.data?.total, enterpriseIds: [...new Set((body.data?.items || []).map(x => x.enterpriseId))] };
    });
    if (scope.status !== 200 || scope.enterpriseIds.length !== 1) throw new Error(`企业评价数据越权: ${JSON.stringify(scope)}`);
    await ent.goto(`${baseURL}/enterprise/profile/safety`);
    await ent.getByRole('heading', { name: '企业安全画像' }).waitFor();
    await ent.locator('.profile-hero').waitFor();
    const overflow = await ent.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    if (overflow.scroll > overflow.client) throw new Error(`企业画像窄屏出现页面级横向滚动: ${JSON.stringify(overflow)}`);
    await ent.screenshot({ path: path.join(artifactDir, 'enterprise-profile-mobile.png'), fullPage: true });
    await entContext.close();

    if (errors.length) throw new Error(`浏览器脚本错误: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, scope, screenshots: artifactDir }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
