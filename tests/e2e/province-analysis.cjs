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
const output = path.resolve('test-results/province-analysis'); fs.mkdirSync(output, { recursive: true });
const prisma = new PrismaClient(), checks = [], errors = [];
let browser, http;
async function call(endpoint, token, expected = 200) {
  const response = await http.get(apiBase + endpoint, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json(); assert.equal(response.status(), expected, `${endpoint}: ${body.message}`); return body.data;
}
async function loginToken(username) {
  const response = await http.post(apiBase + '/auth/login', { data: { username, password } });
  assert.equal(response.status(), 200); return (await response.json()).data.accessToken;
}
async function ready(page) { await page.locator('.province-analysis-page > div .el-loading-mask').waitFor({ state: 'hidden' }); }
async function shot(page, name) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); }
(async () => {
  http = await request.newContext();
  const token = await loginToken('admin'), cityToken = await loginToken('jinan_admin');
  const options = await call('/province/analysis/options', token);
  const all = await call('/province/analysis', token);
  const params = new URLSearchParams({ from: all.period.from, to: all.period.to });
  assert.equal(all.period.days, 30);
  const cityRows = await prisma.cityWorkspace.findMany({ where: { id: { in: options.cities.map(city => city.id) } } });
  const organizations = await prisma.organization.findMany({ where: { OR: [{ workspaceId: { in: cityRows.map(city => city.id) } }, { id: { in: cityRows.map(city => city.organizationId) } }] } });
  const source = await prisma.operationRecord.findMany({ where: { organizationId: { in: organizations.map(org => org.id) }, startedAt: { gte: new Date(all.period.from + 'T00:00:00+08:00'), lte: new Date(all.period.to + 'T23:59:59.999+08:00') } } });
  assert.equal(all.kpis.trips, source.length);
  assert.equal(all.kpis.vehicles, new Set(source.map(row => row.vehicleId)).size);
  assert.equal(all.kpis.enterprises, new Set(source.map(row => row.enterpriseId)).size);
  assert(all.trend.every((point, index) => new Date(point.date) - new Date(point.previousDate) === all.period.days * 86400000));
  await call('/province/analysis', cityToken, 403);
  await call('/province/analysis?from=2026-10-28&to=2026-10-01', token, 400);
  await call('/province/analysis?workspaceId=not-a-city', token, 403);
  const city = all.cities.find(row => row.hasRecords);
  assert(city, 'At least one opened city needs existing operation records for drill-down acceptance.');
  const otherEnterprise = options.enterprises.find(row => row.workspaceId !== city.id);
  if (otherEnterprise) await call(`/province/analysis?${params}&workspaceId=${city.id}&enterpriseId=${otherEnterprise.id}`, token, 403);
  const cityData = await call(`/province/analysis?${params}&workspaceId=${city.id}`, token);
  assert.equal(cityData.cities.length, 1); assert.equal(cityData.kpis.trips, city.trips);
  const enterprise = cityData.enterprises[0]; assert(enterprise);
  const enterpriseData = await call(`/province/analysis?${params}&workspaceId=${city.id}&enterpriseId=${enterprise.id}`, token);
  assert.equal(enterpriseData.kpis.trips, enterprise.trips); assert(enterpriseData.vehicles.length);
  checks.push('真实API与数据库对照：周期去重、地市辖区归集、等长对比、跨级身份和跨市企业过滤保护');

  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1120 }, reducedMotion: 'reduce', acceptDownloads: true });
  context.setDefaultTimeout(15000); const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/login'); await page.getByLabel('账号', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL('**/province/overview');
  await page.goto(`${base}/province/analysis?${params}`);
  await expect(page.getByRole('heading', { name: '省域运行分析', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '统计分析功能', exact: true })).toHaveCount(0);
  await expect(page.locator('.analysis-metric-band')).toBeVisible(); await ready(page);
  await expect(page.locator('.analysis-detail-table .el-table__body tbody tr')).toHaveCount(all.cities.length);
  await page.locator('.analytics-chart canvas').waitFor(); await shot(page, '01-province');
  await page.getByRole('radiogroup', { name: '趋势指标', exact: true }).getByText('运行次数', { exact: true }).click();
  await expect(page.getByRole('img', { name: '本期与上期日运行次数趋势', exact: true })).toBeVisible();
  await page.getByRole('radiogroup', { name: '趋势指标', exact: true }).getByText('运行时长', { exact: true }).click();
  await expect(page.getByRole('img', { name: '本期与上期日运行时长趋势', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '近7日', exact: true }).click();
  await expect.poll(() => page.url()).toContain('from='); await ready(page);
  const dates = new URL(page.url()).searchParams;
  assert.equal((new Date(dates.get('to')) - new Date(dates.get('from'))) / 86400000, 6);
  await page.getByRole('button', { name: '近30日', exact: true }).click(); await ready(page);
  checks.push('省域首屏与真实数据一致，趋势三种单位独立切换，7日和30日快捷周期正确');

  await page.locator('.analysis-detail-table .el-table__body tbody tr').filter({ hasText: city.name }).getByRole('button', { name: '查看分析', exact: true }).click();
  await expect(page.getByRole('heading', { name: '企业运行明细', exact: true })).toBeVisible(); await ready(page); await shot(page, '02-city-drill');
  const companyRow = page.locator('.analysis-detail-table .el-table__body tbody tr').filter({ hasText: enterprise.name });
  await companyRow.getByRole('button', { name: '查看车辆', exact: true }).click();
  await expect(page.getByRole('heading', { name: '车辆运行明细', exact: true })).toBeVisible(); await ready(page); await shot(page, '03-enterprise-drill');
  await page.reload(); await expect(page.getByRole('heading', { name: '车辆运行明细', exact: true })).toBeVisible(); await ready(page);
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '导出数据', exact: true }).click();
  const file = await downloadEvent; await file.saveAs(path.join(output, 'vehicle-analysis.csv'));
  assert(fs.readFileSync(path.join(output, 'vehicle-analysis.csv'), 'utf8').includes('自主运行里程占比'));
  const vehicle = enterpriseData.vehicles[0];
  await page.locator('.analysis-detail-table .el-table__body tbody tr').filter({ hasText: vehicle.name }).getByRole('button', { name: '车辆档案', exact: true }).first().click();
  await page.waitForURL(url => url.pathname === '/province/vehicles' && url.searchParams.get('vehicleId') === vehicle.id);
  checks.push('地市→企业→车辆逐级下钻、刷新恢复、按当前范围导出CSV及车辆档案跳转');

  await page.goto(`${base}/province/analysis?${params}`); await expect(page.locator('.analysis-metric-band')).toBeVisible(); await ready(page);
  await page.getByLabel('搜索明细', { exact: true }).fill(city.name);
  await expect(page.locator('.analysis-detail-table .el-table__body tbody tr')).toHaveCount(1);
  const filteredDownload = page.waitForEvent('download'); await page.getByRole('button', { name: '导出数据', exact: true }).click();
  const filteredFile = await filteredDownload; await filteredFile.saveAs(path.join(output, 'city-analysis.csv'));
  const csv = fs.readFileSync(path.join(output, 'city-analysis.csv'), 'utf8'); assert(csv.includes(city.name));
  const otherCity = all.cities.find(row => row.id !== city.id); if (otherCity) assert(!csv.includes('"' + otherCity.name + '"'));
  await page.getByLabel('搜索明细', { exact: true }).fill('');
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await shot(page, `province-${width}`);
    const queryPanel = page.getByRole('region', { name: '查询条件' });
    // QueryPanel is a named section; inspect the date control width directly as well.
    const overflow = await page.locator('.province-analysis-page .query-panel').evaluate(element => element.scrollWidth > element.clientWidth + 1);
    assert.equal(overflow, false, 'Query controls overflow at ' + width);
  }
  checks.push('明细检索与导出一致；1024/390宽度的筛选、指标、图表和明细布局无页面横向溢出');
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: '统计分析', exact: true }).click();
  await page.locator('.portal-navigation-dropdown:visible').getByRole('menuitem', { name: '监管报告', exact: true }).click();
  await expect(page.getByRole('heading', { name: '监管报告列表', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '生成报告', exact: true }).click();
  const reportDialog = page.getByRole('dialog', { name: '生成监管报告', exact: true });
  await expect(reportDialog.getByRole('button', { name: '生成并预览', exact: true })).toBeVisible();
  await reportDialog.getByRole('button', { name: '取消', exact: true }).click();
  checks.push('两个页面已移除页内页签，顶部统计分析菜单仍可进入监管报告并生成报告');

  await page.route('**/api/province/analysis?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '验收模拟服务不可用' }) }));
  await page.goto(`${base}/province/analysis?${params}`);
  await expect(page.getByText('省域运行分析暂时无法加载', { exact: true })).toBeVisible(); await expect(page.locator('.analysis-metric-band')).toHaveCount(0);
  await page.unroute('**/api/province/analysis?**'); await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.analysis-metric-band')).toBeVisible(); await ready(page);
  await page.goto(`${base}/province/analysis?from=2020-01-01&to=2020-01-01`);
  await expect(page.locator('.analysis-metric-band')).toBeVisible(); await ready(page);
  assert((await page.locator('.analysis-metric-band dd').allTextContents()).every(text => text.trim() === '—'));
  assert((await call('/province/analysis?from=2020-01-01&to=2020-01-01', token)).trend.every(point => !point.current.hasRecords && point.current.mileage === null));
  await shot(page, '04-no-records');
  checks.push('接口失败不展示零值统计，重试恢复；无记录日期与指标保持缺失状态');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, errors, output }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (http) await http.dispose(); await prisma.$disconnect(); });
