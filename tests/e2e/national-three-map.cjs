const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const apiPort = process.env.API_PORT;
const artifactDir = path.resolve('test-results', 'national-three-map');

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  const resources = new Set();
  if (apiPort) await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    url.port = apiPort;
    await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.url().includes('/map/threemap/')) {
      resources.add(new URL(response.url()).pathname);
      if (!response.ok()) errors.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.goto(`${baseURL}/login`);
    await page.getByRole('textbox', { name: '账号' }).fill('admin');
    await page.getByLabel('密码', { exact: true }).fill('Wrc@2026!');
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForURL('**/regulatory/overview');
    await page.goto(`${baseURL}/regulatory/cockpit`);
    await page.locator('.geo-map-shell[data-ready="true"]').waitFor({ timeout: 30000 });
    for (const required of ['100000.json', '100000_bound.json', 'china_tintable_hc.png']) {
      if (![...resources].some((resource) => resource.endsWith(required))) throw new Error(`全国地图未加载本地资源：${required}`);
    }

    for (const [label, mode] of [['区域对比', 'ranking'], ['风险监管', 'risks'], ['车辆结构', 'vehicles'], ['数据质量', 'quality'], ['综合态势', 'overview']]) {
      await page.getByRole('tab', { name: label }).click();
      await page.locator(`main.three-level-cockpit[data-tab="${mode}"]`).waitFor();
      if (await page.locator('.geo-map-state.is-warning').count()) throw new Error(`${mode} 模式出现地图资源警告`);
    }
    await page.getByRole('button', { name: '浙江省区域' }).hover();
    await page.getByRole('tooltip').waitFor();
    await page.screenshot({ path: path.join(artifactDir, 'national-1920.png') });

    for (const [width, height] of [[2560, 1440], [3840, 2160]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      if (overflow.x > 1 || overflow.y > 1) throw new Error(`${width}x${height} 页面溢出：${JSON.stringify(overflow)}`);
      await page.screenshot({ path: path.join(artifactDir, `national-${width}.png`) });
      if (width === 3840) await page.screenshot({ path: path.join(artifactDir, 'national-3840-center.png'), clip: { x: 960, y: 540, width: 1920, height: 1080 } });
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator('.cockpit-ranking-list button').filter({ hasText: '浙江省' }).click();
    await page.getByRole('button', { name: /进入省级驾驶舱/ }).click();
    await page.getByText('省级监管', { exact: true }).waitFor({ timeout: 30000 });
    await page.locator('.geo-map-shell[data-ready="true"]').waitFor({ timeout: 30000 });
    if (await page.locator('.three-level-cockpit').getAttribute('data-level') !== 'province') throw new Error('浙江省下钻未进入省级');
    await page.screenshot({ path: path.join(artifactDir, 'province-drill.png') });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`全国纹理地图验收通过；本地资源 ${resources.size} 个；截图：${artifactDir}`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
