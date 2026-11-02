const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const password = process.env.TEST_PASSWORD;
if (!password) throw new Error('Set TEST_PASSWORD for the local acceptance account');
const output = path.resolve('test-results/province-menu-regression');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const checks = [], widths = [], pageErrors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(base + '/login');
    await page.getByLabel('账号', { exact: true }).fill('admin');
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL('**/province/overview');
    await page.locator('.wb-status-layout').waitFor();
    await page.locator('.el-message').waitFor({ state: 'hidden' });
    const navigation = page.getByRole('navigation', { name: '主导航', exact: true });
    assert.equal(await page.locator('.portal-brand img').getAttribute('alt'), '中国数联 China Unidata');
    assert.equal(await page.locator('.portal-brand strong,.portal-brand small').count(), 0);
    assert.equal(await navigation.locator('.el-menu--horizontal>li>.lucide,.el-menu--horizontal>li>.el-sub-menu__title>.lucide').count(), 0);
    for (const width of [1920, 1600, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await page.locator('.portal-header').evaluate(header => {
        const bar = header.getBoundingClientRect(), menu = header.querySelector('.portal-primary>.el-menu').getBoundingClientRect();
        const viewport = header.querySelector('.portal-primary').getBoundingClientRect();
        return { offset: Math.abs((bar.left + bar.width / 2) - (menu.left + menu.width / 2)), visible: menu.left >= viewport.left - 1 && menu.right <= viewport.right + 1 };
      });
      assert(layout.offset < 2 && layout.visible, `Top-level text navigation must be fully visible and centered at ${width}: ${JSON.stringify(layout)}`);
      await page.screenshot({ path: path.join(output, `centered-header-${width}.png`), clip: { x: 0, y: 0, width, height: 180 } });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    checks.push('用户原始标识、纯文字菜单、1920/1600/1440整组居中且完整可见');
    assert.equal(await page.getByRole('menuitem', { name: '试点管理', exact: true }).count(), 0);
    const popup = page.locator('.el-popper.portal-navigation-dropdown:visible');
    async function waitForMenus(count) {
      await page.waitForFunction(expected => {
        const opened = [...document.querySelectorAll('.portal-primary .el-menu--horizontal > .el-sub-menu.is-opened')];
        const visible = [...document.querySelectorAll('.el-popper.portal-navigation-dropdown')].filter(item => getComputedStyle(item).visibility !== 'hidden' && getComputedStyle(item).display !== 'none' && item.getBoundingClientRect().height > 0);
        return opened.length === expected && visible.length === expected;
      }, count);
    }
    const cityEntry = navigation.getByRole('menuitem', { name: '地市管理', exact: true });
    assert.equal(await cityEntry.locator('.el-sub-menu__icon-arrow').count(), 0);
    await cityEntry.click();
    await page.waitForURL('**/province/workspaces');
    await waitForMenus(0);
    assert((await cityEntry.getAttribute('class')).includes('is-active'));
    await page.reload();
    assert((await cityEntry.getAttribute('class')).includes('is-active'));
    await page.goto(base + '/province/overview');
    await page.locator('.wb-status-layout').waitFor();
    checks.push('单个子项的地市管理直接进入城市管理，刷新后高亮正确');
    const coordinationEntry = navigation.getByRole('menuitem', { name: '协同督办', exact: true });
    assert.equal(await coordinationEntry.locator('.el-sub-menu__icon-arrow').count(), 0);
    await coordinationEntry.click(); await page.waitForURL('**/province/coordination'); await waitForMenus(0);
    checks.push('协同督办直接进入统一事项列表');
    const groups = ['全省监测', '统计分析', '平台管理'];
    const firstChild = { '全省监测': '运行监测', '统计分析': '省域运行分析', '平台管理': '组织与人员' };
    for (const order of [groups, [...groups].reverse()]) {
      for (const group of order) {
        await navigation.getByRole('menuitem', { name: group, exact: true }).click();
        await waitForMenus(1);
        await popup.getByRole('menuitem', { name: firstChild[group], exact: true }).waitFor();
        await waitForMenus(1);
        const dimensions = await popup.evaluate(element => {
          const width = element.getBoundingClientRect().width;
          const labels = [...element.querySelectorAll('.el-menu-item > span')];
          return { width, longestLabel: Math.max(...labels.map(label => label.getBoundingClientRect().width)) };
        });
        assert(dimensions.width < 180, `${group} menu is too wide: ${dimensions.width}`);
        assert(dimensions.width <= dimensions.longestLabel + 64, `${group} has excessive empty width`);
        if (order === groups) widths.push({ group, ...dimensions });
        checks.push(`连续切换${group}仅保留一个紧凑下拉`);
      }
      await page.locator('.app-breadcrumb').click({ position: { x: 4, y: 16 } });
      await waitForMenus(0);
      checks.push('点击业务页面空白处收起全部下拉');
    }
    await navigation.getByRole('menuitem', { name: '平台管理', exact: true }).click();
    await waitForMenus(1);
    await page.keyboard.press('Escape');
    await waitForMenus(0);
    checks.push('Esc收起下拉并恢复导航焦点');
    await navigation.getByRole('menuitem', { name: '全省监测', exact: true }).click();
    await waitForMenus(1);
    await popup.getByRole('menuitem', { name: '车辆监管档案', exact: true }).click();
    await page.waitForURL('**/province/vehicles');
    await waitForMenus(0);
    await navigation.getByRole('menuitem', { name: '全省监测', exact: true }).click();
    await waitForMenus(1);
    assert((await popup.getByRole('menuitem', { name: '车辆监管档案', exact: true }).getAttribute('class')).includes('is-active'));
    await page.screenshot({ path: path.join(output, 'compact-single-dropdown.png'), clip: { x: 0, y: 0, width: 1440, height: 380 } });
    await page.keyboard.press('Escape');
    await waitForMenus(0);
    checks.push('选择二级功能后收起并保留父子高亮');
    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await navigation.getByRole('menuitem', { name: '平台管理', exact: true }).click();
      await waitForMenus(1);
      const box = await popup.boundingBox();
      assert(box.x >= -1 && box.x + box.width <= width + 1, 'dropdown extends outside viewport');
      await popup.getByRole('menuitem', { name: '安全审计', exact: true }).click();
      await page.waitForURL('**/system/audit-logs');
      await waitForMenus(0);
      checks.push(`${width}宽度下拉定位、选择和收起正常`);
    }
    await page.goto(base + '/province/pilots');
    await page.waitForURL('**/province/workspaces');
    await page.getByRole('heading', { name: '已开通城市', exact: true }).waitFor();
    checks.push('试点菜单已移除，旧地址转到城市管理');
    await page.goto(base + '/province/evaluations');
    await page.waitForURL('**/province/analysis');
    await navigation.getByRole('menuitem', { name: '统计分析', exact: true }).click();
    await waitForMenus(1);
    assert.deepEqual(await popup.getByRole('menuitem').allTextContents(), ['省域运行分析', '监管报告']);
    checks.push('统计分析仅保留省域运行分析和监管报告，旧评价地址转到省域运行分析');
    assert.deepEqual(pageErrors, []);
    const result = { passed: true, checks, widths, pageErrors };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

