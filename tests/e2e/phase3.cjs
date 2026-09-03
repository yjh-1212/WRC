const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'test-results', 'phase3');
fs.mkdirSync(artifactDir, { recursive: true });

async function login(page, username) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill('Wrc@2026!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(username.startsWith('ent_') ? '**/enterprise/overview' : '**/regulatory/overview');
}

async function approve(page, businessNo, comment) {
  await page.goto(`${baseURL}/admission/approvals`);
  await page.getByRole('heading', { name: '许可审批' }).waitFor();
  await page.getByLabel('搜索审批任务').fill(businessNo);
  const row = page.locator('.el-table__body tr').filter({ hasText: businessNo }).first();
  await row.getByRole('button', { name: '处理' }).click();
  const dialog = page.getByRole('dialog', { name: '审批处理' });
  await dialog.locator('textarea').fill(comment);
  await dialog.getByRole('button', { name: '确认处理' }).click();
  const confirm = page.getByRole('dialog', { name: '审批确认' });
  await confirm.getByRole('button', { name: '确认通过' }).click();
  await page.getByText('审批已通过').waitFor();
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const browserErrors = [];
  try {
    const enterpriseContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const enterprise = await enterpriseContext.newPage();
    enterprise.on('pageerror', (error) => browserErrors.push(`enterprise: ${error.message}`));
    await login(enterprise, 'ent_admin');
    await enterprise.getByText('申请与许可', { exact: true }).click();
    await enterprise.getByText('企业入驻', { exact: true }).click();
    await enterprise.waitForURL('**/enterprise/applications/onboarding');
    await enterprise.getByRole('heading', { name: '企业入驻' }).waitFor();
    await enterprise.getByText('无人配送运营主体入驻补正', { exact: true }).click();
    await enterprise.locator('.el-drawer').getByText('退回补正', { exact: true }).first().waitFor();
    await enterprise.screenshot({ path: path.join(artifactDir, 'enterprise-returned-onboarding.png'), fullPage: true });
    await enterprise.keyboard.press('Escape');

    const stamp = Date.now();
    const applicationTitle = `Playwright 入驻验收 ${stamp}`;
    await enterprise.getByRole('button', { name: '新建企业入驻' }).click();
    const createDialog = enterprise.getByRole('dialog', { name: '新建企业入驻' });
    await createDialog.locator('input').nth(0).fill(applicationTitle);
    await createDialog.locator('textarea').nth(0).fill('开展余杭区无人配送末端运营，配置专职安全管理岗位。');
    await createDialog.locator('textarea').nth(1).fill('道路运输经营许可和无人配送运营备案均在有效期内。');
    const [createResponse] = await Promise.all([
      enterprise.waitForResponse((response) => response.url().endsWith('/api/admission/applications') && response.request().method() === 'POST'),
      createDialog.getByRole('button', { name: '保存并提交' }).click(),
    ]);
    if (!createResponse.ok()) throw new Error(`创建入驻申请失败 ${createResponse.status()}: ${await createResponse.text()}`);
    const created = (await createResponse.json()).data;
    const submitConfirm = enterprise.getByRole('dialog', { name: '确认提交' });
    const [submitResponse] = await Promise.all([
      enterprise.waitForResponse((response) => response.url().includes(`/api/admission/applications/${created.id}/submit`) && response.request().method() === 'POST'),
      submitConfirm.getByRole('button', { name: '提交审批' }).click(),
    ]);
    if (!submitResponse.ok()) throw new Error(`提交入驻申请失败 ${submitResponse.status()}: ${await submitResponse.text()}`);
    await enterprise.getByLabel('搜索申请').fill(created.businessNo);
    const createdRow = enterprise.locator('.el-table__body tr').filter({ hasText: created.businessNo });
    await createdRow.getByText('审批中', { exact: true }).waitFor();
    await enterprise.reload();
    await enterprise.getByLabel('搜索申请').fill(created.businessNo);
    await enterprise.locator('.el-table__body tr').filter({ hasText: created.businessNo }).waitFor();

    const scopeResult = await enterprise.evaluate(async () => {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` };
      const own = await fetch('/api/admission/applications?page=1&pageSize=100', { headers });
      const body = await own.json();
      return { total: body.data.total, enterpriseIds: [...new Set(body.data.items.map((item) => item.enterpriseId))] };
    });
    if (scopeResult.enterpriseIds.length !== 1) throw new Error(`企业申请出现跨企业数据: ${JSON.stringify(scopeResult)}`);

    const approverContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const approver = await approverContext.newPage();
    approver.on('pageerror', (error) => browserErrors.push(`approver: ${error.message}`));
    await login(approver, 'approver');
    await approver.getByText('准入与审批', { exact: true }).click();
    await approver.getByText('许可审批', { exact: true }).click();
    await approve(approver, created.businessNo, '材料真实完整，同意进入业务复核。');

    const regContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const regulator = await regContext.newPage();
    regulator.on('pageerror', (error) => browserErrors.push(`regulator: ${error.message}`));
    await login(regulator, 'reg_admin');
    await approve(regulator, created.businessNo, '主体能力和合规条件满足要求，准予入驻。');
    await regulator.screenshot({ path: path.join(artifactDir, 'approval-workbench-after-handle.png'), fullPage: true });

    await enterprise.goto(`${baseURL}/enterprise/applications/mine`);
    await enterprise.getByRole('heading', { name: '我的申请' }).waitFor();
    await enterprise.getByLabel('搜索申请').fill(created.businessNo);
    await enterprise.locator('.el-table__body tr').filter({ hasText: created.businessNo }).getByText('已通过', { exact: true }).waitFor();

    await regulator.goto(`${baseURL}/admission/road-tests`);
    await regulator.getByRole('heading', { name: '路测申请' }).waitFor();
    await regulator.getByLabel('搜索申请').fill('APP-ROAD-2026-001');
    await regulator.getByText('未来科技城末端配送路测申请', { exact: true }).click();
    const issueButton = regulator.getByRole('button', { name: '发放牌照' });
    await issueButton.waitFor({ state: 'visible' });
    await issueButton.scrollIntoViewIfNeeded();
    await issueButton.evaluate((element) => element.click());
    const licenseDialog = regulator.getByRole('dialog', { name: '发放无人配送车牌照' });
    await licenseDialog.waitFor({ state: 'visible' });
    await licenseDialog.locator('input').nth(0).waitFor();
    const [issueResponse] = await Promise.all([
      regulator.waitForResponse((response) => response.url().includes('/api/admission/applications/') && response.url().endsWith('/issue-license') && response.request().method() === 'POST'),
      licenseDialog.getByRole('button', { name: '确认发牌' }).click({ force: true }),
    ]);
    if (!issueResponse.ok()) throw new Error(`发放牌照失败 ${issueResponse.status()}: ${await issueResponse.text()}`);
    const issued = (await issueResponse.json()).data;
    await regulator.goto(`${baseURL}/admission/licenses`);
    await regulator.getByRole('heading', { name: '牌照管理' }).waitFor();
    await regulator.getByLabel('搜索牌照').fill(issued.licenseNo);
    await regulator.getByText(issued.licenseNo, { exact: true }).waitFor();
    await regulator.screenshot({ path: path.join(artifactDir, 'issued-license-persisted.png'), fullPage: true });

    await regulator.goto(`${baseURL}/admission/workflows`);
    await regulator.getByRole('heading', { name: '流程配置' }).waitFor();
    await regulator.getByText('企业入驻标准审批流程', { exact: true }).waitFor();
    await regulator.getByText('路测许可审批流程', { exact: true }).waitFor();
    await regulator.getByText('牌照续期审批流程', { exact: true }).waitFor();

    await enterprise.setViewportSize({ width: 390, height: 844 });
    await enterprise.goto(`${baseURL}/enterprise/applications/mine`);
    await enterprise.getByRole('heading', { name: '我的申请' }).waitFor();
    const overflow = await enterprise.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (overflow) throw new Error('企业申请移动端出现页面级横向滚动');
    await enterprise.screenshot({ path: path.join(artifactDir, 'enterprise-applications-mobile.png'), fullPage: true });

    if (browserErrors.length) throw new Error(`浏览器脚本错误: ${browserErrors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, application: created.businessNo, finalStatus: 'APPROVED', license: issued.licenseNo, enterpriseApplicationTotal: scopeResult.total, screenshots: artifactDir }, null, 2));
    await enterpriseContext.close(); await approverContext.close(); await regContext.close();
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
