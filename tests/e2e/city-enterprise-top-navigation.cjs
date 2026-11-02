const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const password = process.env.TEST_PASSWORD;
if (!password) throw new Error('Set TEST_PASSWORD for local acceptance accounts');
const output = path.resolve('test-results/city-enterprise-top-navigation');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const checks = [], pageErrors = [];
  try {
    for (const actor of [
      { username: 'jinan_admin', home: '/regulatory/overview', caption: '济南市监管平台', groups: ['监管工作台','主体管理','准入与许可','运行监管','安全监管','分析评价','管理设置'], group: '主体管理', child: '企业管理', target: '/archives/enterprises' },
      { username: 'jinan_ent_admin', home: '/enterprise/overview', caption: '济南市企业门户', groups: ['运营工作台','基础资料','申请与许可','运行监测','安全管理','企业评价','企业设置'], group: '基础资料', child: '企业资料', target: '/enterprise/profile/info' },
    ]) {
      const context = await browser.newContext({ viewport: { width:1440, height:1000 }, reducedMotion:'reduce' });
      context.setDefaultTimeout(20000);
      const page = await context.newPage();
      page.on('pageerror', error => pageErrors.push(`${actor.username}: ${error.message}`));
      await page.goto(base + '/login');
      await page.getByLabel('账号', { exact:true }).fill(actor.username);
      await page.getByLabel('密码', { exact:true }).fill(password);
      await page.getByRole('button', { name:'登录', exact:true }).click();
      await page.waitForURL(url => url.pathname === actor.home);
      await page.locator('.portal-header').waitFor();
      assert.equal(await page.locator('.sidebar').count(), 0);
      assert.equal(await page.locator('.scope-ribbon').count(), 0);
      assert.equal(await page.locator('.portal-brand img').getAttribute('alt'), '中国数联 China Unidata');
      assert.equal(await page.locator('.portal-brand small').count(), 0);
      assert((await page.locator('.portal-brand').getAttribute('aria-label')).includes(actor.username === 'jinan_admin' ? '济南市工作空间' : '济南市企业门户'));
      assert.equal((await page.locator('#main-content').boundingBox()).x, 0);
      const navigation = page.getByRole('navigation', { name:'主导航', exact:true });
      const expectedGroups = [...actor.groups]; expectedGroups.splice(expectedGroups.length - 1, 0, 'AI智能体');
      assert.deepEqual(await navigation.locator('.el-menu--horizontal > li').allTextContents(), expectedGroups);
      checks.push(`${actor.username}顶部导航、门户身份和全宽内容正确`);
      const token = await page.evaluate(() => sessionStorage.getItem('wrc-access-token'));
      const response = await page.request.get(base + '/api/auth/menus', { headers:{ authorization:`Bearer ${token}` } });
      const menus = (await response.json()).data;
      const popup = page.locator('.el-popper.portal-navigation-dropdown:visible');
      async function waitForMenus(count) {
        await page.waitForFunction(expected => {
          const visible = [...document.querySelectorAll('.el-popper.portal-navigation-dropdown')].filter(element => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && element.getBoundingClientRect().height > 0);
          return visible.length === expected && document.querySelectorAll('.portal-primary .el-sub-menu.is-opened').length === expected;
        }, count);
      }
      for (const menu of menus.filter(item => item.children.length > 1)) {
        await navigation.getByRole('menuitem', { name:menu.name, exact:true }).click();
        await popup.getByRole('menuitem', { name:menu.children[0].name, exact:true }).waitFor();
        await waitForMenus(1);
        assert.deepEqual(await popup.getByRole('menuitem').allTextContents(), menu.children.map(item => item.name));
        assert((await popup.boundingBox()).width < 180);
      }
      await page.locator('.app-breadcrumb').click({ position:{x:4,y:16} });
      await waitForMenus(0);
      checks.push(`${actor.username}连续展开互斥、子菜单权限和紧凑宽度正确`);
      await navigation.getByRole('menuitem', { name:actor.group, exact:true }).click();
      await popup.getByRole('menuitem', { name:actor.child, exact:true }).click();
      await page.waitForURL(url => url.pathname === actor.target);
      await waitForMenus(0);
      await page.reload();
      assert((await navigation.getByRole('menuitem', { name:actor.group, exact:true }).getAttribute('class')).includes('is-active'));
      await navigation.getByRole('menuitem', { name:actor.group, exact:true }).click();
      await popup.getByRole('menuitem', { name:actor.child, exact:true }).waitFor();
      await waitForMenus(1);
      await page.locator('.el-message').waitFor({state:'hidden'});
      await page.screenshot({path:path.join(output, `${actor.username}-dropdown.png`), clip:{x:0,y:0,width:1440,height:420}});
      await page.keyboard.press('Escape');
      await waitForMenus(0);
      checks.push(`${actor.username}选择跳转、刷新高亮和Esc收起正确`);
      for (const width of [1280,1024]) {
        await page.setViewportSize({width,height:900});
        const clipped = await navigation.evaluate(element => {
          const clip = element.getBoundingClientRect();
          return [...element.querySelectorAll('.el-menu--horizontal > li')].filter(item => { const box = item.getBoundingClientRect(); return box.left < clip.left - 1 || box.right > clip.right + 1; }).map(item => item.textContent);
        });
        assert.deepEqual(clipped, [], `${actor.username} ${width} main menu clipped`);
      }
      checks.push(`${actor.username}1280/1024宽度全部一级入口可见`);
      await page.setViewportSize({width:390,height:900});
      const last = menus.filter(menu => menu.children.length > 1).at(-1);
      await navigation.getByRole('menuitem', {name:last.name,exact:true}).click();
      await popup.getByRole('menuitem', {name:last.children[0].name,exact:true}).waitFor();
      const box = await popup.boundingBox();
      assert(box.x >= -1 && box.x + box.width <= 391);
      await page.keyboard.press('Escape');
      await waitForMenus(0);
      await page.setViewportSize({width:1440,height:1000});
      await page.locator('.portal-brand').click();
      await page.waitForURL(url => url.pathname === actor.home);
      if (actor.username === 'jinan_admin') {
        await page.getByRole('button', {name:'监管驾驶舱',exact:true}).click();
        await page.waitForURL('**/regulatory/cockpit');
        await page.locator('.cockpit').waitFor();
        assert.equal(await page.locator('.portal-header').isVisible(), false);
        checks.push('市级驾驶舱入口保留且进入后全屏显示');
      }
      await context.close();
    }
    assert.deepEqual(pageErrors, []);
    const result = {passed:true,checks,pageErrors};
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
