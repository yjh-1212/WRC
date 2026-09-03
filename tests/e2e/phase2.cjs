const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'phase2');
fs.mkdirSync(artifactDir, { recursive: true });

async function login(page, username) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill('Wrc@2026!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(username.startsWith('ent_') ? '**/enterprise/overview' : '**/regulatory/overview');
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const browserErrors = [];
  try {
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const admin = await adminContext.newPage();
    admin.on('pageerror', (error) => browserErrors.push(error.message));
    await login(admin, 'admin');
    await admin.getByText('监管档案', { exact: true }).click();
    await admin.getByText('厂商管理', { exact: true }).click();
    await admin.waitForURL('**/archives/manufacturers');
    await admin.getByRole('heading', { name: '厂商管理' }).waitFor();

    const stamp = Date.now();
    const businessNo = `MFR-PW-${stamp}`;
    const manufacturerName = `Playwright 验收厂商 ${stamp}`;
    await admin.getByRole('button', { name: '新增厂商' }).click();
    const createDialog = admin.getByRole('dialog', { name: '新增厂商' });
    const inputs = createDialog.locator('input');
    await inputs.nth(0).fill(businessNo);
    await inputs.nth(1).fill('验收厂商');
    await inputs.nth(2).fill(manufacturerName);
    await inputs.nth(4).fill('自动化验收员');
    const [createResponse] = await Promise.all([
      admin.waitForResponse((response) => response.url().endsWith('/api/archives/manufacturers') && response.request().method() === 'POST'),
      createDialog.getByRole('button', { name: '保存厂商' }).click(),
    ]);
    if (!createResponse.ok()) throw new Error(`新增厂商失败 ${createResponse.status()}: ${await createResponse.text()}`);
    const created = (await createResponse.json()).data;
    await admin.getByLabel('搜索厂商').fill(businessNo);
    await admin.getByText(manufacturerName).waitFor();
    await admin.reload();
    await admin.getByLabel('搜索厂商').fill(businessNo);
    await admin.getByText(manufacturerName).waitFor();
    await admin.screenshot({ path: path.join(artifactDir, 'manufacturer-persisted-desktop.png'), fullPage: true });

    await admin.goto(`${baseURL}/archives/vehicles`);
    await admin.getByRole('heading', { name: '车辆档案' }).waitFor();
    await admin.getByText('ARC-2026-027', { exact: true }).click();
    await admin.locator('.archive-drawer-title h2').waitFor();
    await admin.getByRole('tab', { name: /牌照信息/ }).click();
    await admin.locator('.el-drawer').getByText('浙杭无配027', { exact: true }).waitFor();
    await admin.screenshot({ path: path.join(artifactDir, 'vehicle-archive-drawer.png') });
    await admin.goto(`${baseURL}/archives/models`);
    await admin.getByRole('heading', { name: '车型管理' }).waitFor();
    await admin.getByText('X3 标准型', { exact: true }).waitFor();
    await admin.goto(`${baseURL}/archives/vehicle-management`);
    await admin.getByRole('heading', { name: '车辆管理' }).waitFor();
    await admin.getByText('无人配送车 030', { exact: true }).waitFor();
    const foreignVehicleId = await admin.evaluate(async () => {
      const response = await fetch('/api/archives/vehicles?page=1&pageSize=100', { headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } });
      return (await response.json()).data.items.find((item) => item.enterprise.name === '西湖无人配送有限公司').id;
    });

    const enterpriseContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const enterprise = await enterpriseContext.newPage();
    enterprise.on('pageerror', (error) => browserErrors.push(error.message));
    await login(enterprise, 'ent_admin');
    await enterprise.getByText('车辆管理', { exact: true }).click();
    await enterprise.getByText('我的车辆', { exact: true }).click();
    await enterprise.waitForURL('**/enterprise/vehicles/list');
    await enterprise.getByRole('heading', { name: '我的车辆' }).waitFor();
    const enterpriseScope = await enterprise.evaluate(async (foreignId) => {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` };
      const own = await fetch('/api/archives/vehicles?page=1&pageSize=100', { headers });
      const blocked = await fetch(`/api/archives/vehicles/${foreignId}`, { headers });
      return { total: (await own.json()).data.total, blockedStatus: blocked.status };
    }, foreignVehicleId);
    if (enterpriseScope.total !== 10) throw new Error(`企业车辆数据范围应为 10，实际 ${enterpriseScope.total}`);
    if (enterpriseScope.blockedStatus !== 404) throw new Error(`跨企业车辆详情应返回 404，实际 ${enterpriseScope.blockedStatus}`);

    await enterprise.goto(`${baseURL}/enterprise/profile/qualifications`);
    await enterprise.getByRole('heading', { name: '企业资质' }).waitFor();
    await enterprise.getByText('道路运输经营许可', { exact: true }).waitFor();
    await enterprise.getByText('企业档案', { exact: true }).click();
    await enterprise.getByText('企业信息', { exact: true }).click();
    await enterprise.waitForURL('**/enterprise/profile/info');
    await enterprise.getByRole('heading', { name: '企业信息' }).waitFor();
    await enterprise.setViewportSize({ width: 390, height: 844 });
    await enterprise.waitForFunction(() => document.querySelector('.sidebar')?.getBoundingClientRect().width <= 65);
    const toast = enterprise.locator('.el-message');
    if (await toast.count()) await toast.first().waitFor({ state: 'hidden' });
    const mobileOverflow = await enterprise.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (mobileOverflow) {
      const overflowElements = await enterprise.evaluate(() => [...document.querySelectorAll('*')].map((element) => ({ tag: element.tagName, className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).filter((item) => item.right > document.documentElement.clientWidth + 1 || item.left < -1).slice(0, 12));
      throw new Error(`企业信息移动端出现横向滚动: ${JSON.stringify(overflowElements)}`);
    }
    await enterprise.screenshot({ path: path.join(artifactDir, 'enterprise-profile-mobile.png'), fullPage: true });

    await admin.evaluate(async (id) => {
      await fetch(`/api/archives/manufacturers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } });
    }, created.id);
    if (browserErrors.length) throw new Error(`浏览器脚本错误: ${browserErrors.join(' | ')}`);

    console.log(JSON.stringify({ ok: true, manufacturerPersisted: true, enterpriseVehicleTotal: enterpriseScope.total, crossEnterpriseStatus: enterpriseScope.blockedStatus, screenshots: artifactDir }, null, 2));
    await adminContext.close(); await enterpriseContext.close();
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
