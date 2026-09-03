const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'phase1');
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
  try {
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const admin = await adminContext.newPage();
    await login(admin, 'admin');
    await admin.getByRole('heading', { name: '监管总览' }).waitFor();
    await admin.getByText('监管视域').waitFor();
    await admin.getByText('系统管理').click();
    await admin.getByText('用户管理').click();
    await admin.waitForURL('**/system/users');
    await admin.getByRole('heading', { name: '用户管理' }).waitFor();
    await admin.screenshot({ path: path.join(artifactDir, 'admin-users-desktop.png'), fullPage: true });

    const username = `pw_user_${Date.now()}`;
    await admin.getByRole('button', { name: '新增用户' }).click();
    const dialog = admin.getByRole('dialog', { name: '新增用户' });
    await dialog.locator('input').nth(0).fill(username);
    await dialog.locator('input').nth(1).fill('Playwright 验收用户');
    await dialog.locator('.el-select').nth(1).click();
    await admin.getByRole('option', { name: '监管工作人员' }).click();
    await admin.keyboard.press('Escape');
    const [createResponse] = await Promise.all([
      admin.waitForResponse((response) => response.url().includes('/api/system/users') && response.request().method() === 'POST'),
      dialog.getByRole('button', { name: '创建用户' }).click(),
    ]);
    if (!createResponse.ok()) throw new Error(`创建用户失败 ${createResponse.status()}: ${await createResponse.text()}`);
    await admin.getByPlaceholder('搜索账号或姓名').fill(username);
    await admin.getByText(username).waitFor();

    const enterpriseContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const enterprise = await enterpriseContext.newPage();
    await login(enterprise, 'ent_admin');
    await enterprise.getByRole('heading', { name: '企业首页' }).waitFor();
    if (await enterprise.getByText('系统管理', { exact: true }).count()) throw new Error('企业菜单不应包含系统管理');
    await enterprise.goto(`${baseURL}/system/users`);
    await enterprise.waitForURL('**/enterprise/overview');
    const apiStatus = await enterprise.evaluate(async () => (await fetch('/api/regulatory/overview', { headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } })).status);
    if (apiStatus !== 403) throw new Error(`企业账号访问监管 API 应为 403，实际 ${apiStatus}`);
    await enterprise.screenshot({ path: path.join(artifactDir, 'enterprise-mobile.png'), fullPage: true });

    await admin.getByRole('button', { name: '退出登录' }).click();
    await admin.waitForURL('**/login');

    console.log(JSON.stringify({ ok: true, createdUser: username, enterpriseRegulatoryApi: apiStatus, screenshots: artifactDir }, null, 2));
    await adminContext.close(); await enterpriseContext.close();
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
