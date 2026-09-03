const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'enterprise-accounts');
fs.mkdirSync(artifactDir, { recursive: true });

async function login(page, username) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill('Wrc@2026!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(username.startsWith('ent_') ? '**/enterprise/overview' : '**/regulatory/overview');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`page:${error.message}`));
    await login(page, 'ent_admin');
    await page.locator('.sidebar').getByText('账号管理', { exact: true }).click();
    await page.waitForURL('**/enterprise/accounts');
    await page.getByRole('heading', { name: '账号管理', exact: true }).waitFor();
    await page.getByText('ent_user').waitFor();
    await page.getByPlaceholder('搜索账号、姓名、邮箱或手机').fill('ent_user');
    await page.getByText('ent_user').waitFor();
    if (await page.getByText('监管端').count()) throw new Error('企业账号页出现监管端门户字段');
    if (await page.getByText('当前属于后续开发阶段').count()) throw new Error('账号管理仍是占位页');

    const username = `pw_acct_${Date.now()}`;
    await page.getByRole('button', { name: '新增账号' }).click();
    const createDialog = page.getByRole('dialog', { name: '新增账号' });
    await createDialog.locator('input').nth(0).fill(username);
    await createDialog.locator('input').nth(1).fill('Playwright 企业账号');
    const [createResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/system/users') && response.request().method() === 'POST'),
      createDialog.getByRole('button', { name: '创建账号' }).click(),
    ]);
    if (!createResponse.ok()) throw new Error(`创建账号失败 ${createResponse.status()}: ${await createResponse.text()}`);
    await page.getByPlaceholder('搜索账号、姓名、邮箱或手机').fill(username);
    await page.getByText(username).waitFor();

    const createdRow = page.locator('.el-table__row', { hasText: username });
    await createdRow.getByRole('button', { name: '账号操作' }).click();
    await page.getByRole('menuitem', { name: '停用账号' }).click();
    await page.getByText('已停用 1 个账号').waitFor();
    await createdRow.getByRole('button', { name: '账号操作' }).click();
    await page.getByRole('menuitem', { name: '启用账号' }).click();
    await page.getByText('已启用 1 个账号').waitFor();
    await createdRow.getByRole('button', { name: '账号操作' }).click();
    await page.getByRole('menuitem', { name: '重置密码' }).click();
    const resetDialog = page.getByRole('dialog', { name: '重置密码' });
    await resetDialog.locator('input[type="password"]').fill('Wrc@Reset1!');
    const [resetResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/password') && response.request().method() === 'PATCH'),
      resetDialog.getByRole('button', { name: '确认重置' }).click(),
    ]);
    if (!resetResponse.ok()) throw new Error(`重置密码失败 ${resetResponse.status()}: ${await resetResponse.text()}`);

    const selfRow = page.locator('.el-table__row', { hasText: '当前登录' });
    await page.getByPlaceholder('搜索账号、姓名、邮箱或手机').fill('ent_admin');
    await page.locator('.el-table__row', { hasText: '当前登录' }).waitFor();
    await selfRow.getByRole('button', { name: '账号操作' }).click();
    const disableSelf = page.getByRole('menuitem', { name: '不能停用自己' });
    if (!(await disableSelf.getAttribute('aria-disabled')) && !(await disableSelf.getAttribute('class') || '').includes('is-disabled')) {
      throw new Error('当前登录账号仍可停用');
    }
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(artifactDir, 'enterprise-admin-desktop.png'), fullPage: true });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`账号管理出现横向溢出 ${overflow}px`);
    await context.close();

    const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const staff = await staffContext.newPage();
    await login(staff, 'ent_user');
    if (await staff.locator('.sidebar').getByText('账号管理', { exact: true }).count()) throw new Error('企业普通用户菜单出现账号管理');
    await staff.goto(`${baseURL}/enterprise/accounts`);
    await staff.waitForURL('**/enterprise/overview');
    await staff.screenshot({ path: path.join(artifactDir, 'enterprise-user-blocked.png'), fullPage: true });
    await staffContext.close();

    if (errors.length) throw new Error(`浏览器错误: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, createdUser: username, screenshots: artifactDir }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
