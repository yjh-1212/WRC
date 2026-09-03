const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'phase7');
fs.mkdirSync(artifactDir, { recursive: true });

async function login(page, username) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill('Wrc@2026!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(username.startsWith('ent_') ? '**/enterprise/overview' : '**/regulatory/overview');
}

async function assertPage(page, route, heading, options = {}) {
  const startedAt = Date.now();
  await page.goto(`${baseURL}${route}`);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  if (options.map) {
    const map = page.locator('[data-map-state]');
    await map.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-map-state]')?.getAttribute('data-map-state') !== 'loading', null, { timeout: 30000 });
    if (await map.getAttribute('data-map-state') !== 'ready') throw new Error(`${route} 地图未就绪`);
  }
  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    unnamedButtons: [...document.querySelectorAll('button')].filter((button) => button.getClientRects().length && !(button.innerText || button.getAttribute('aria-label') || button.getAttribute('title'))).length,
    title: document.title,
  }));
  if (metrics.overflow > 1) throw new Error(`${route} 页面级横向溢出 ${metrics.overflow}px`);
  if (metrics.unnamedButtons) throw new Error(`${route} 存在 ${metrics.unnamedButtons} 个无名称按钮`);
  if (!metrics.title.includes(heading)) throw new Error(`${route} 文档标题未同步页面标题: ${metrics.title}`);
  return Date.now() - startedAt;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await desktop.newPage();
    page.on('pageerror', (error) => errors.push(`desktop:${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !['favicon', 'INVALID_USER_DOMAIN', 'Unimplemented type: 3'].some((item) => message.text().includes(item))) {
        errors.push(`console:${message.text()}`);
      }
    });
    await login(page, 'admin');

    await page.keyboard.press('Tab');
    const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (activeText !== '跳到主要内容') throw new Error(`首个键盘焦点不是跳转链接: ${activeText}`);
    await page.keyboard.press('Enter');
    if (await page.evaluate(() => document.activeElement?.id) !== 'main-content') throw new Error('跳转链接未把焦点移到主要内容');

    const timings = {};
    for (const [route, heading, map] of [
      ['/regulatory/overview', '监管总览', false],
      ['/system/users', '用户管理', false],
      ['/admission/onboarding', '企业入驻', false],
      ['/operations/realtime', '实时运行', true],
      ['/safety/alerts', '告警中心', false],
      ['/analytics/safety', '安全态势', true],
    ]) timings[route] = await assertPage(page, route, heading, { map });
    if (timings['/operations/realtime'] > 20000 || timings['/analytics/safety'] > 20000) throw new Error(`地图首个可用时间超限: ${JSON.stringify(timings)}`);

    for (let index = 0; index < 3; index++) {
      await assertPage(page, '/operations/realtime', '实时运行', { map: true });
      await assertPage(page, '/regulatory/overview', '监管总览');
    }
    await page.goto(`${baseURL}/operations/realtime`);
    await page.locator('[data-map-state="ready"]').waitFor({ timeout: 30000 });
    if (await page.locator('.operations-map').count() !== 1) throw new Error('重复导航后出现重复地图实例容器');
    await page.screenshot({ path: path.join(artifactDir, 'desktop-regulatory.png'), fullPage: true });
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const enterprise = await mobile.newPage();
    enterprise.on('pageerror', (error) => errors.push(`mobile:${error.message}`));
    await login(enterprise, 'ent_user');
    await assertPage(enterprise, '/enterprise/overview', '企业运营工作台');
    await assertPage(enterprise, '/enterprise/vehicles/archives', '车辆档案');
    await assertPage(enterprise, '/enterprise/profile/safety', '企业安全画像');
    if (await enterprise.getByText('系统管理', { exact: true }).count()) throw new Error('企业普通用户出现系统管理菜单');
    await enterprise.getByRole('button', { name: '切换侧边栏' }).click();
    if (await enterprise.locator('.sidebar.collapsed').count()) throw new Error('移动端侧边栏未展开');
    await enterprise.keyboard.press('Escape');
    if (!(await enterprise.locator('.sidebar').getAttribute('class')).includes('collapsed')) throw new Error('移动端侧边栏不支持 Escape 关闭');
    await enterprise.screenshot({ path: path.join(artifactDir, 'mobile-enterprise.png'), fullPage: true });
    await mobile.close();

    if (errors.length) throw new Error(`浏览器错误: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, timings, keyboardBypass: true, responsiveRoutes: 3, screenshots: artifactDir }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
