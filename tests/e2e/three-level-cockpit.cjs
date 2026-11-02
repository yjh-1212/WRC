const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'three-level-cockpit');
fs.mkdirSync(artifactDir, { recursive: true });

async function login(page) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号').fill('admin');
  await page.getByLabel('密码').fill('Wrc@2026!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/regulatory/overview');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && /rendering has stopped|DeveloperError/i.test(message.text())) failures.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/dashboard/regulator/cockpit/scene') && response.status() >= 400) failures.push(`scene-api: ${response.status()} ${response.url()}`);
    if (response.url().includes('/api/dashboard/regulator/cockpit?') && response.status() >= 400) failures.push(`city-api: ${response.status()} ${response.url()}`);
  });
  try {
    await login(page);
    await page.getByRole('button', { name: '监管驾驶舱' }).click();
    await page.waitForURL('**/regulatory/cockpit');
    await page.locator('.three-level-cockpit').waitFor();
    await page.getByText('功能型无人车综合监管驾驶舱', { exact: true }).waitFor({ timeout: 20000 });
    if ((await page.locator('.cockpit-title-crest').innerText()).includes('中华人民共和国')) throw new Error('国家级顶栏标题仍包含“中华人民共和国”');
    await page.locator('.geo-map-host canvas').waitFor({ timeout: 30000 });
    if (await page.locator('.cockpit-level-switch').count()) throw new Error('顶部仍残留国家/省/市并排切换');
    for (const name of ['全览当前监管范围', '切换俯视视角', '恢复正北方向', '二维三维切换', '切换底图', '业务图层']) {
      await page.getByRole('button', { name }).waitFor();
    }
    await page.getByRole('button', { name: '业务图层' }).click();
    await page.getByText('行政边界', { exact: true }).waitFor();
    await page.getByRole('button', { name: '业务图层' }).click();
    await page.getByRole('button', { name: '二维三维切换' }).click();
    await page.waitForTimeout(1100);
    await page.getByRole('button', { name: '二维三维切换' }).click();
    await page.waitForTimeout(1100);
    await page.getByRole('button', { name: '全览当前监管范围' }).click();
    await page.waitForTimeout(1300);

    const nationalCount = await page.locator('.cockpit-ranking-list button').count();
    if (nationalCount !== 8) throw new Error(`全国排行数量异常：${nationalCount}`);
    const nationalValue = await page.locator('.cockpit-primary-metrics article').first().locator('strong').innerText();
    if (!/[\d万]/.test(nationalValue)) throw new Error(`全国指标非数字：${nationalValue}`);
    await page.locator('.el-message').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: path.join(artifactDir, 'national-1920.png'), fullPage: true });

    await page.locator('.cockpit-ranking-list button').filter({ hasText: '浙江省' }).click();
    const provinceResponse = page.waitForResponse((response) => response.url().includes('level=province') && response.status() === 200);
    await page.getByRole('button', { name: /进入省级驾驶舱/ }).click();
    await provinceResponse;
    await page.getByText('省级监管', { exact: true }).waitFor();
    const hangzhouRow = page.locator('.cockpit-ranking-list button').filter({ hasText: '杭州市' });
    if (!(await hangzhouRow.innerText()).includes('348')) throw new Error('省级杭州数据未与市级业务库保持一致');
    await hangzhouRow.click();
    const cityResponse = page.waitForResponse((response) => response.url().includes('level=city') && response.status() === 200);
    await page.getByRole('button', { name: /进入市级驾驶舱/ }).click();
    await cityResponse;
    await page.getByText('市级监管', { exact: true }).waitFor();
    await page.getByText('企业运行排行').waitFor();
    await page.locator('.cockpit-map-canvas').waitFor({ timeout: 30000 });
    await page.locator('.cockpit-cluster').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(artifactDir, 'city-overview-1920.png'), fullPage: true });
    await page.locator('.cockpit-cluster').last().click({ force: true });
    await page.locator('.cockpit-city-crumbs button').nth(1).waitFor({ timeout: 20000 });
    await page.locator('.cockpit-cluster').first().waitFor();
    await page.locator('.cockpit-cluster').last().click({ force: true });
    await page.locator('.cockpit-city-crumbs button').nth(2).waitFor({ timeout: 20000 });
    await page.locator('.cockpit-vehicle').first().waitFor({ timeout: 20000 });
    await page.locator('.cockpit-vehicle').first().click({ force: true });
    await page.locator('.cockpit-city-crumbs button').nth(3).waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(artifactDir, 'city-1920.png'), fullPage: true });

    const citySource = await page.locator('.cockpit-data-footer').innerText();
    if (!citySource.includes('监管平台业务数据库')) throw new Error(`城市数据源异常：${citySource}`);
    const vehicleLabels = await page.locator('.cockpit-map-canvas canvas').count();
    if (!vehicleLabels) throw new Error('市级三维地图画布未渲染');

    const sceneResponse = page.waitForResponse((response) => response.url().includes('level=city') && response.url().includes('vehicleType=SANITATION') && response.status() === 200);
    await page.locator('.cockpit-type-filter select').selectOption('SANITATION');
    await sceneResponse;
    await page.getByText('环卫车辆').waitFor();

    await page.getByRole('button', { name: '返回上一层' }).click();
    await page.getByText('浙江省').first().waitFor();
    await page.getByText('省级监管', { exact: true }).waitFor();

    const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - document.documentElement.clientWidth, y: document.documentElement.scrollHeight - document.documentElement.clientHeight }));
    if (overflow.x > 1 || overflow.y > 1) throw new Error(`驾驶舱出现滚动：${JSON.stringify(overflow)}`);
    await page.screenshot({ path: path.join(artifactDir, 'province-1920.png'), fullPage: true });
    if (failures.length) throw new Error(failures.join('\n'));
    console.log(JSON.stringify({ ok: true, nationalCount, nationalValue, citySource, overflow }));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
