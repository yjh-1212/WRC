const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'system-catalog');
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
  try {
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const admin = await adminContext.newPage();
    await login(admin, 'admin');
    await admin.getByText('系统管理').click();
    await admin.getByText('角色管理').click();
    await admin.waitForURL('**/system/roles');
    await admin.getByRole('heading', { name: '角色管理', exact: true }).waitFor();
    const enterpriseRow = admin.locator('.el-table__row', { hasText: 'ENTERPRISE_ADMIN' });
    await enterpriseRow.getByRole('button', { name: '授权' }).waitFor();
    if (await enterpriseRow.getByRole('button', { name: '授权' }).isDisabled()) throw new Error('超级管理员不能给企业角色授权');
    await admin.getByRole('button', { name: '新增角色' }).click();
    const roleDialog = admin.getByRole('dialog', { name: '新增角色' });
    const roleCode = `PW_ROLE_${Date.now()}`;
    await roleDialog.locator('input').nth(0).fill(roleCode);
    await roleDialog.locator('input').nth(1).fill('Playwright 巡查员');
    const [createRole] = await Promise.all([
      admin.waitForResponse((response) => response.url().includes('/api/system/roles') && response.request().method() === 'POST'),
      roleDialog.getByRole('button', { name: '创建角色' }).click(),
    ]);
    if (!createRole.ok()) throw new Error(`创建角色失败 ${createRole.status()}: ${await createRole.text()}`);
    await admin.getByPlaceholder('搜索角色名称或编码').fill(roleCode);
    await admin.getByText(roleCode).waitFor();
    await admin.screenshot({ path: path.join(artifactDir, 'admin-roles.png'), fullPage: true });

    await admin.getByText('组织机构').click();
    await admin.waitForURL('**/system/organizations');
    await admin.getByRole('heading', { name: '组织机构', exact: true }).waitFor();
    await admin.getByRole('button', { name: '新增机构' }).click();
    const orgDialog = admin.getByRole('dialog', { name: '新增机构' });
    const orgCode = `PW${Date.now().toString().slice(-8)}`;
    await orgDialog.locator('input').nth(0).fill(orgCode);
    await orgDialog.locator('input').nth(1).fill('Playwright 交通分局');
    const [createOrg] = await Promise.all([
      admin.waitForResponse((response) => response.url().includes('/api/system/organizations') && response.request().method() === 'POST'),
      orgDialog.getByRole('button', { name: '创建机构' }).click(),
    ]);
    if (!createOrg.ok()) throw new Error(`创建机构失败 ${createOrg.status()}: ${await createOrg.text()}`);
    await admin.getByPlaceholder('搜索机构名称或编码').fill(orgCode);
    await admin.getByText(orgCode).waitFor();
    await admin.screenshot({ path: path.join(artifactDir, 'admin-organizations.png'), fullPage: true });
    await adminContext.close();

    const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const staff = await staffContext.newPage();
    await login(staff, 'reg_admin');
    await staff.getByText('系统管理').click();
    await staff.getByText('角色管理').click();
    await staff.waitForURL('**/system/roles');
    if (await staff.getByRole('button', { name: '新增角色' }).count()) throw new Error('监管管理员不应看到新增角色');
    const readonlyRow = staff.locator('.el-table__row', { hasText: 'ENTERPRISE_ADMIN' });
    if (!(await readonlyRow.getByRole('button', { name: '授权' }).isDisabled())) throw new Error('监管管理员仍可给企业角色授权');
    await staff.getByText('组织机构').click();
    await staff.waitForURL('**/system/organizations');
    if (await staff.getByRole('button', { name: '新增机构' }).count()) throw new Error('监管管理员不应看到新增机构');
    await staff.screenshot({ path: path.join(artifactDir, 'reg-admin-readonly.png'), fullPage: true });
    await staffContext.close();

    console.log(JSON.stringify({ ok: true, roleCode, orgCode, screenshots: artifactDir }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
