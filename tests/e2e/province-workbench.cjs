const { chromium, request } = require('playwright');
const { expect } = require('playwright/test');
const { PrismaClient } = require('@prisma/client');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const apiBase = process.env.API_URL || 'http://127.0.0.1:8080/api';
const password = process.env.TEST_PASSWORD;
if (!password) throw new Error('Set TEST_PASSWORD to the existing local acceptance password.');
const output = path.resolve('test-results/province-workbench'); fs.mkdirSync(output, { recursive: true });
const prisma = new PrismaClient(), checks = [], errors = [];
let browser, http, page;
const day = date => new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 10);
async function call(endpoint, token, expected = 200) {
  const response = await http.get(apiBase + endpoint, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json(); assert.equal(response.status(), expected, `${endpoint}: ${body.message}`); return body.data;
}
async function login(username) {
  const response = await http.post(apiBase + '/auth/login', { data: { username, password } });
  assert.equal(response.status(), 200); return (await response.json()).data.accessToken;
}
async function ready() { await expect(page.locator('.wb-grid')).toBeVisible(); await expect(page.locator('.wb-grid > .el-loading-mask')).toHaveCount(0); }
async function home(month) { await page.goto(`${base}/province/overview${month ? '?month=' + month : ''}`); await ready(); }
async function shot(name) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); }
(async () => {
  http = await request.newContext();
  const token = await login('admin'), cityToken = await login('jinan_admin');
  const data = await call('/province/workbench', token), month = data.month;
  await call('/province/workbench', cityToken, 403);
  await call('/province/workbench?month=2026-13', token, 400);
  await call('/province/workbench?month=1999-12', token, 400);
  const cities = await prisma.cityWorkspace.findMany({ where: { cityCode: { startsWith: '37' }, status: { in: ['ACTIVE', 'SUSPENDED', 'EXPIRED'] } } });
  const cityIds = cities.map(row => row.id);
  assert.equal(data.cities.length, cities.length);
  const organizations = await prisma.organization.findMany({ where: { OR: [{ workspaceId: { in: cityIds } }, { id: { in: cities.map(row => row.organizationId) } }] } });
  const orgIds = [...new Set([...organizations.map(row => row.id), ...cities.map(row => row.organizationId)])];
  const monthly = { gte: new Date(data.from + 'T00:00:00+08:00'), lte: new Date(data.to + 'T23:59:59.999+08:00') };
  const [matters, fleet, alerts] = await Promise.all([
    prisma.provinceMatter.findMany({ where: { createdAt: monthly, assignments: { some: { workspaceId: { in: cityIds } } } } }),
    prisma.vehicle.findMany({ where: { organizationId: { in: orgIds }, deletedAt: null } }),
    prisma.safetyAlert.findMany({ where: { organizationId: { in: orgIds }, occurredAt: monthly } }),
  ]);
  assert.equal(data.matters.total, matters.length);
  assert.equal(data.matters.states.reduce((sum, row) => sum + row.value, 0), matters.length);
  for (const state of data.matters.states) assert.equal(state.value, matters.filter(row => row.status === state.status).length);
  assert.equal(data.fleet.total, fleet.length);
  assert.equal(data.fleet.online, fleet.filter(row => row.onlineStatus === 'ONLINE').length);
  assert.equal(data.fleet.states.reduce((sum, row) => sum + row.value, 0), fleet.length);
  assert.equal(data.cities.reduce((sum, row) => sum + row.vehicles, 0), fleet.length);
  assert.equal(data.safety.total, alerts.length);
  assert.equal(data.safety.closed, alerts.filter(row => row.status === 'CLOSED').length);
  assert.equal(data.safety.closed + data.safety.pending + data.safety.processing, alerts.length);
  assert.equal(data.safety.types.reduce((sum, row) => sum + row.value, 0), alerts.length);
  for (const row of data.calendar.days) for (const type of ['dispatch', 'feedback', 'review', 'due']) assert.equal(row[type], data.calendar.events.filter(event => day(event.at) === row.date && event.type === type).length);
  for (const state of data.matters.states) {
    const list = await call(`/oversight/matters?createdMonth=${month}&status=${state.status}`, token);
    assert.equal(list.total, state.value);
  }
  for (const [status, value] of [['ALL', data.safety.total], ['HANDLING', data.safety.processing], ['CLOSED', data.safety.closed]]) {
    const list = await call(`/province/alerts?from=${data.from}&to=${data.to}&alertStatus=${status}`, token);
    assert.equal(list.total, value);
  }
  checks.push('真实数据库对照：月份、地市辖区、事项状态、车辆分组、告警及日历；城市身份与无效月份被拒绝');
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1120 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(15000); page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/login'); await page.getByLabel('账号', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL('**/province/overview'); await ready();
  await expect(page.locator('.wb-panel')).toHaveCount(10);
  await expect(page.locator('.wb-page-toolbar')).toHaveCount(0);
  await expect(page.locator('.wb-total strong')).toHaveText(String(data.matters.total));
  await page.locator('.analytics-chart canvas').first().waitFor(); await page.locator('.el-message').waitFor({ state: 'hidden' }); await shot('01-desktop-1600');
  const fill = await page.locator('.wb-matters').evaluate(panel => {
    const box = panel.getBoundingClientRect(), tiles = panel.querySelector('.wb-status-layout').getBoundingClientRect(), note = panel.querySelector('.wb-tile-note').getBoundingClientRect();
    return { bottomGap: box.bottom - note.bottom, cardsHeight: tiles.height, height: box.height };
  });
  assert(fill.bottomGap < 25 && fill.cardsHeight > fill.height * .6, 'Matter cards must fill the available panel height');
  for (const [index, color] of [[0, 'green'], [1, 'purple']]) {
    const painted = await page.locator('.wb-sparks canvas').nth(index).evaluate((canvas, color) => {
      const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height); let left = canvas.width, right = -1;
      const columns = new Set();
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4, [r, g, b, a] = image.data.slice(i, i + 4);
        const match = color === 'green' ? g > r + 30 && g > b + 10 : b > g + 25 && b > r + 20;
        if (a > 25 && match) { left = Math.min(left, x); right = Math.max(right, x); columns.add(x); }
      }
      return { span: Math.max(0, right - left), width: canvas.width, middleColumns: [...columns].filter(x => x >= canvas.width * .3 && x <= canvas.width * .7).length };
    }, color);
    assert(painted.span > painted.width * .6, `${color} trend must span the chart instead of collapsing into a small edge line`);
    assert(painted.middleColumns > painted.width * .3, `${color} trend must paint across the middle, not only show isolated endpoint dots`);
  }
  checks.push('协同卡片铺满可用高度，绿紫两个真实趋势区域均展开可见');
  await page.locator('.wb-tile-PENDING_REVIEW').click();
  await page.waitForURL(url => url.pathname === '/province/coordination' && url.searchParams.get('status') === 'PENDING_REVIEW' && url.searchParams.get('createdMonth') === month);
  await expect(page.getByText('创建月份：' + month, { exact: false })).toBeVisible();
  await expect(page.locator('.pm-pagination>span')).toContainText(`共 ${data.matters.states.find(row => row.status === 'PENDING_REVIEW').value} 条事项`);
  await page.reload(); await expect(page.getByText('创建月份：' + month, { exact: false })).toBeVisible();
  await home(month);
  await page.locator('.wb-safety-states button').nth(1).click();
  await page.waitForURL(url => url.searchParams.get('alertStatus') === 'HANDLING' && url.searchParams.get('from') === data.from);
  await expect(page.getByText(`发生日期：${data.from} 至 ${data.to}`, { exact: false })).toBeVisible();
  await expect(page.locator('.pm-pagination>span')).toContainText(`共 ${data.safety.processing} 条告警`);
  await home(month);
  await page.locator('.wb-city-list>button').first().click();
  await page.waitForURL(url => url.pathname === '/province/monitoring' && url.searchParams.get('workspaceId') === data.cities[0].id);
  await home(month);
  await page.getByRole('button', { name: '查看运行分析', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/province/analysis' && url.searchParams.get('from') === data.from);
  await expect(page.locator('.analysis-metric-band')).toBeVisible();
  checks.push('事项、告警分组、地市车辆与运行分析跳转；月份筛选刷新后保留，详情列表数字与首页一致');
  await home(month);
  const event = data.calendar.events[0];
  if (event) {
    const labels = { dispatch: '派发', feedback: '反馈', review: '复核', due: '到期' };
    await page.getByRole('button', { name: new RegExp(`^${day(event.at)}${labels[event.type]}\\d+条$`) }).click();
    await expect(page.locator('.wb-event-drawer')).toBeVisible();
    await expect(page.locator('.wb-calendar-detail h3').filter({ hasText: event.title }).first()).toBeVisible();
    await shot('02-calendar-detail');
    await page.locator('.wb-calendar-detail').filter({ hasText: event.title }).first().getByRole('button', { name: '查看事项', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('matterId') === event.matterId);
    checks.push('日历数量来自实际流程记录，点击记录可打开对应事项');
  }
  await home(month); await page.getByRole('button', { name: '上个月', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('month') !== month); await ready();
  await page.reload(); await ready();
  await page.getByRole('button', { name: '下个月', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('month') === month); await ready();
  await home('2100-01');
  await expect(page.locator('.wb-total strong')).toHaveText('0');
  await expect(page.locator('.wb-safety .wb-ring-center strong')).toHaveText('—');
  await expect(page.locator('.wb-operations')).toContainText('所选月份暂无运行记录');
  await expect(page.locator('.wb-day-events button')).toHaveCount(0);
  checks.push('月历前后切换和刷新恢复；无数据月份显示真实空态，零分母不显示虚构百分比');
  await home(month);
  for (const width of [1920, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1200 : 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await shot('03-width-' + width);
  }
  if (event) {
    await page.getByRole('button', { name: `${day(event.at)}监管记录`, exact: true }).click();
    await expect(page.locator('.wb-event-drawer')).toBeVisible();
    const bounds = await page.locator('.wb-event-drawer').boundingBox();
    assert(bounds.width > 250 && bounds.width <= 390 && bounds.x >= 0, 'Mobile calendar drawer must fit the viewport');
    await shot('03-mobile-calendar');
    await page.keyboard.press('Escape'); await expect(page.locator('.wb-event-drawer')).toBeHidden();
  }
  checks.push('1600/1920桌面布局及1024/390响应式：十个业务模块，无页面横向溢出');
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.route('**/api/province/workbench?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '验收模拟：服务暂不可用' }) }));
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: '全省工作台暂时无法加载' })).toBeVisible();
  await expect(page.locator('.wb-grid')).toHaveCount(0); await shot('04-error');
  await page.unroute('**/api/province/workbench?*');
  await page.getByRole('button', { name: '重试', exact: true }).click(); await ready();
  checks.push('读取失败显示错误和重试，恢复后重新读取真实数据');
  assert.deepEqual(errors, [], 'Browser page errors');
  fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify({ passed: true, month, source: { matters: data.matters.total, fleet: data.fleet.total, alerts: data.safety.total, calendarEvents: data.calendar.events.length }, checks }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, output }, null, 2));
})().catch(async error => { console.error(error); if (page) await shot('failure').catch(() => {}); process.exitCode = 1; }).finally(async () => { await browser?.close(); await http?.dispose(); await prisma.$disconnect(); });
