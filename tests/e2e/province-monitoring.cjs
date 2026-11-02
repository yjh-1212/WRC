const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173', artifacts = path.resolve('test-results/province-monitoring');
(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, reducedMotion: 'reduce' }), errors = []; page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' }); await page.getByLabel('账号', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!'); await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL('**/province/overview');
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: '全省监测', exact: true }).click();
    const menu = page.locator('.el-popper.portal-navigation-dropdown:visible');
    async function openMonitoringPage(name) { await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: '全省监测', exact: true }).click(); await menu.getByRole('menuitem', { name, exact: true }).click(); }
    for (const name of ['运行监测', '车辆监管档案', '事故回溯']) await menu.getByRole('menuitem', { name, exact: true }).waitFor();
    assert.equal(await menu.getByRole('menuitem').count(), 3); await page.keyboard.press('Escape');
    await page.goto(base + '/province/monitoring', { waitUntil: 'domcontentloaded' }); await page.getByRole('region', { name: '车辆运行列表', exact: true }).locator('tbody tr').first().waitFor(); await page.locator('.pm-map-canvas[data-state="ready"][data-rendered="true"]').waitFor();
    assert.equal(await page.getByRole('navigation', { name: '全省监测功能', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(artifacts, '01-monitoring.png'), fullPage: true });
    await page.getByRole('textbox', { name: '车辆编号', exact: true }).fill('NO-SUCH-VEHICLE-TEST'); await page.getByRole('button', { name: '查询', exact: true }).click(); await page.getByText('暂无数据', { exact: true }).waitFor(); await page.getByRole('button', { name: '重置', exact: true }).click(); await page.getByRole('region', { name: '车辆运行列表', exact: true }).locator('tbody tr').first().waitFor();
    await page.getByRole('button', { name: '全部告警', exact: true }).click(); await page.getByText('全部告警 · 包含未关联车辆的记录', { exact: true }).waitFor(); await page.getByRole('button', { name: '返回车辆监测', exact: true }).click();
    await openMonitoringPage('车辆监管档案'); await page.getByRole('button', { name: '查看档案', exact: true }).first().waitFor();
    const fixture = await page.evaluate(async () => { const { api } = await import('/src/api.ts'); const rows = await api('/province/vehicles?q=VEH-2026-004'); return rows.items[0]; }); assert(fixture);
    await page.goto(base + '/province/vehicles?vehicleId=' + fixture.id, { waitUntil: 'domcontentloaded' }); const drawer = page.getByRole('dialog', { name: '车辆监管档案', exact: true }); await drawer.waitFor(); await drawer.getByRole('heading', { name: new RegExp(fixture.businessNo) }).waitFor(); await drawer.getByRole('button', { name: '运行轨迹', exact: true }).click(); await drawer.locator('.pm-record-picker>button').first().waitFor(); await drawer.locator('.pm-map-canvas[data-state="ready"][data-rendered="true"]').waitFor();
    await page.screenshot({ path: path.join(artifacts, '02-vehicle-track.png'), fullPage: true });
    await drawer.getByRole('button', { name: '档案总览', exact: true }).click(); await drawer.getByText('车辆身份与监管信息', { exact: true }).waitFor(); await page.screenshot({ path: path.join(artifacts, '02-vehicle-dossier.png'), fullPage: true });
    await drawer.locator('.el-drawer__close-btn').click();
    await openMonitoringPage('事故回溯'); await page.locator('.pm-case-list>button').first().waitFor(); await page.locator('.pm-case-identity h2').waitFor(); await page.locator('.pm-video-empty').waitFor(); await page.locator('.pm-case-main .pm-map-canvas[data-state="ready"]').waitFor();
    await page.screenshot({ path: path.join(artifacts, '03-accident-review.png'), fullPage: true });
    await Promise.all([page.waitForResponse(r => r.url().includes('windowMinutes=15') && r.ok()), page.getByText('前后15分钟', { exact: true }).click()]);
    await page.getByRole('button', { name: '车辆档案 →', exact: true }).click(); await page.waitForURL('**/province/vehicles?**'); await page.getByRole('dialog', { name: '车辆监管档案', exact: true }).waitFor(); await page.getByRole('dialog', { name: '车辆监管档案', exact: true }).getByRole('button', { name: '事故与视频', exact: true }).waitFor();
    await page.goto(base + '/province/risks', { waitUntil: 'domcontentloaded' }); await page.waitForURL('**/province/monitoring?**view=alerts**');
    await page.goto(base + '/province/search?type=VEHICLE&entityId=' + fixture.id, { waitUntil: 'domcontentloaded' }); await page.waitForURL('**/province/vehicles?**'); await page.getByRole('dialog', { name: '车辆监管档案', exact: true }).waitFor();
    await page.getByRole('dialog', { name: '车辆监管档案', exact: true }).locator('.el-drawer__close-btn').click();
    let failOnce = true;
    await page.route('**/api/province/vehicles?*', route => { if (!failOnce) return route.continue(); failOnce = false; return route.fulfill({ status: 503, contentType: 'application/json', json: { message: '测试：档案服务暂不可用' } }); });
    await page.goto(base + '/province/vehicles', { waitUntil: 'domcontentloaded' }); await page.getByRole('alert').filter({ hasText: '测试：档案服务暂不可用' }).waitFor(); await page.getByRole('button', { name: '重试', exact: true }).click(); await page.getByRole('button', { name: '查看档案', exact: true }).first().waitFor(); await page.unroute('**/api/province/vehicles?*');
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const name of ['运行监测', '车辆监管档案', '事故回溯']) {
        await openMonitoringPage(name);
        assert.equal(await page.getByRole('navigation', { name: '全省监测功能', exact: true }).count(), 0);
        await page.getByRole('button', { name: '查询', exact: true }).waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${name} overflows at ${width}px`);
      }
    }
    assert.deepEqual(errors, []); console.log(JSON.stringify({ threePages: true, topNavigation: true, archiveDeepLink: true, realTrack: true, missingVideoState: true, oldLinksRedirect: true, retry: true, responsive: [1280,390], errors }));
  } catch (error) { await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }); console.error(await page.locator('body').innerText().then(t => t.slice(-1600))); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });


