const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const path = require('node:path');
const fs = require('node:fs');

const baseURL = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const password = process.env.TEST_PASSWORD;
if (!password) throw new Error('Set TEST_PASSWORD to the existing local account password before running.');
const provinceUsername = process.env.TEST_PROVINCE_USERNAME || 'admin';
const cityUsername = process.env.TEST_CITY_USERNAME || 'jinan_admin';
const artifactDir = path.resolve('test-results/navigation/province');
fs.mkdirSync(artifactDir, { recursive: true });

async function login(page, username, destination) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`**${destination}`);
}

async function browserGet(page, url) {
  return page.evaluate(async (endpoint) => {
    const token = sessionStorage.getItem('wrc-access-token');
    const response = await fetch(`/api${endpoint}`, { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `Request failed: ${response.status}`);
    return body.data;
  }, url);
}

async function ready(page) {
  await page.locator('.province-page .el-loading-mask').waitFor({ state: 'hidden', timeout: 15000 });
  if (await page.locator('.province-error').count()) throw new Error(await page.locator('.province-error').innerText());
}

async function expectSuccessfulResponse(responsePromise, name) {
  const response = await responsePromise;
  const body = await response.json();
  if (!response.ok()) throw new Error(`${name}: ${body.message}`);
  return body.data;
}

(async () => {
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const prisma = new PrismaClient();
  const checks = [];
  const errors = [];
  let createdId = '';
  let businessNo = '';
  try {
    const provinceContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
    const cityContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await provinceContext.newPage();
    const cityPage = await cityContext.newPage();
    page.on('pageerror', (error) => errors.push(`province: ${error.message}`));
    cityPage.on('pageerror', (error) => errors.push(`city: ${error.message}`));
    await login(page, provinceUsername, '/province/overview');

    const pages = [
      ['overview', '全省工作台', '/province/overview'],
      ['monitoring', '运行监测', '/province/monitoring'],
      ['vehicles', '车辆监管档案', '/province/vehicles'],
      ['accidents', '事故回溯', '/province/accidents'],
      ['notices', '协同督办', '/province/risk-notices'],
      ['supervision', '协同督办', '/province/supervision'],
      ['collaboration', '协同督办', '/province/collaboration'],
      ['emergency', '协同督办', '/province/emergency'],
      ['directory', '数据接入与共享', '/province/directory'],
    ];
    for (const [name, heading, route] of pages) {
      await page.goto(`${baseURL}${route}`);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      await ready(page);
      await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
      checks.push({ name: `page:${name}`, route, passed: true });
    }

    const options = await browserGet(page, '/oversight/options');
    const qingdao = options.workspaces.find((city) => city.cityCode === '370200');
    if (!qingdao) throw new Error('Qingdao workspace is required for city-filter verification.');
    const filtered = await browserGet(page, `/archives/vehicles?workspaceId=${encodeURIComponent(qingdao.id)}&pageSize=20`);
    await page.goto(`${baseURL}/province/search?type=VEHICLE&workspaceId=${encodeURIComponent(qingdao.id)}`);
    await page.getByRole('heading', { name: '车辆监管档案', exact: true }).waitFor();
    await ready(page);
    await page.getByText(`共 ${filtered.total} 辆车辆`, { exact: true }).waitFor();
    checks.push({ name: 'server-side-city-filter', total: filtered.total, passed: true });
    await page.getByRole('button', { name: '查看档案', exact: true }).first().click();
    await page.getByRole('dialog', { name: '车辆监管档案', exact: true }).waitFor();
    await page.locator('.pm-drawer .el-loading-mask').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(artifactDir, 'vehicle-detail.png') });
    checks.push({ name: 'vehicle-detail-drawer', passed: true });

    const fixtureLists = [
      ['ENTERPRISE', '', '/archives/enterprises?pageSize=1', '企业档案'],
      ['VEHICLE', '', '/archives/vehicles?pageSize=1', '车辆监管档案'],
      ['LICENSE', '', '/admission/licenses?pageSize=1', '通行许可'],
      ['INCIDENT', 'ACCIDENT', '/safety/accidents?pageSize=1', '事故回溯'],
    ];
    for (const [type, eventType, endpoint, heading] of fixtureLists) {
      const fixture = (await browserGet(page, endpoint)).items[0];
      if (!fixture) throw new Error(`No ${type} fixture is available.`);
      const query = new URLSearchParams({ type, entityId: fixture.id, ...(eventType ? { eventType } : {}) });
      await page.goto(`${baseURL}/province/search?${query}`);
      if (type === 'VEHICLE') await page.getByRole('dialog', { name: heading, exact: true }).waitFor();
      else await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      if (type === 'INCIDENT') await page.locator('.pm-case-identity h2').waitFor();
      else await page.locator(`${type === 'VEHICLE' ? '.pm-drawer' : '.province-drawer'} .el-loading-mask`).waitFor({ state: 'hidden' });
      if (await page.locator('.province-error').count()) throw new Error(`Legacy ${type} detail failed.`);
      checks.push({ name: `legacy-object-detail:${type}`, passed: true });
    }

    await page.goto(`${baseURL}/province/supervision`);
    await page.getByRole('heading', { name: '协同督办', exact: true }).waitFor();
    await ready(page);
    await page.getByRole('button', { name: '新建事项', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const title = `济南城区配送通行条件核查 ${Date.now().toString().slice(-6)}`;
    await dialog.getByLabel('事项名称', { exact: true }).fill(title);
    await dialog.getByLabel('办理要求', { exact: true }).fill('核对辖区配送车辆许可条件，汇总道路通行和运行保障情况。');
    await dialog.getByLabel('责任地市选择', { exact: true }).click();
    await page.getByRole('option', { name: '济南市', exact: true }).click();
    await dialog.getByLabel('事项名称', { exact: true }).click();
    const saved = page.waitForResponse((response) => response.url().endsWith('/api/oversight/matters') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
    const matter = await expectSuccessfulResponse(saved, 'Save draft');
    createdId = matter.id; businessNo = matter.businessNo;
    await page.getByText('事项草稿已保存，可在详情中确认派发', { exact: true }).waitFor();
    checks.push({ name: 'create-matter-draft', passed: true });

    await page.goto(`${baseURL}/province/supervision?matterId=${createdId}`);
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    await page.getByRole('button', { name: '确认派发', exact: true }).click();
    const dispatch = page.waitForResponse((response) => response.url().endsWith(`/matters/${createdId}/actions`) && response.request().method() === 'POST');
    await page.locator('.el-message-box').getByRole('button', { name: '确认派发', exact: true }).click();
    await expectSuccessfulResponse(dispatch, 'Dispatch');
    await page.getByText('事项已派发', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifactDir, 'matter-dispatched.png') });
    checks.push({ name: 'province-dispatch', passed: true });

    await login(cityPage, cityUsername, '/regulatory/overview');
    const assignment = (await browserGet(cityPage, '/oversight/city-tasks?pageSize=100')).items.find((row) => row.matter.id === createdId);
    if (!assignment) throw new Error('Dispatched assignment is missing from the city workbench.');
    await cityPage.goto(`${baseURL}/oversight/city-tasks?assignmentId=${assignment.id}`);
    const responded = cityPage.waitForResponse((response) => response.url().endsWith(`/city-tasks/${assignment.id}/actions`) && response.request().method() === 'POST');
    await cityPage.getByRole('button', { name: '确认响应', exact: true }).click();
    await expectSuccessfulResponse(responded, 'City response');
    await cityPage.getByLabel('办理反馈', { exact: true }).waitFor();
    checks.push({ name: 'city-respond', passed: true });
    await cityPage.getByLabel('办理反馈', { exact: true }).fill('已核对本市车辆许可条件和运行记录，通行范围一致，相关保障人员保持在岗。');
    await cityPage.getByLabel('证据及材料说明', { exact: true }).fill('依据车辆档案、通行许可和运行台账完成核查。');
    const submitted = cityPage.waitForResponse((response) => response.url().endsWith(`/city-tasks/${assignment.id}/actions`) && response.request().method() === 'POST');
    await cityPage.getByRole('button', { name: '提交省级复核', exact: true }).click();
    await expectSuccessfulResponse(submitted, 'City submission');
    await cityPage.getByText('办理反馈已提交省级复核', { exact: true }).waitFor();
    await cityPage.screenshot({ path: path.join(artifactDir, 'city-submitted.png') });
    checks.push({ name: 'city-submit-feedback', passed: true });

    await page.goto(`${baseURL}/province/supervision?matterId=${createdId}`);
    await page.getByRole('button', { name: '复核办结', exact: true }).click();
    await page.locator('.el-message-box textarea').fill('本市反馈内容及核查依据完整，省级复核通过，事项办结。');
    const closed = page.waitForResponse((response) => response.url().endsWith(`/matters/${createdId}/actions`) && response.request().method() === 'POST');
    await page.locator('.el-message-box').getByRole('button', { name: '确认', exact: true }).click();
    await expectSuccessfulResponse(closed, 'Province review');
    await page.getByText('复核结果已保存', { exact: true }).waitFor();
    if ((await browserGet(page, `/oversight/matters/${createdId}`)).status !== 'CLOSED') throw new Error('Reviewed matter did not persist as CLOSED.');
    await page.screenshot({ path: path.join(artifactDir, 'matter-closed.png') });
    checks.push({ name: 'province-review-close', passed: true });
    if (errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(path.join(artifactDir, 'checks.json'), JSON.stringify({ pages: pages.length, checks, errors }, null, 2));
    console.log(JSON.stringify({ pages: pages.length, interactions: checks.length - pages.length, checks: checks.length, artifactDir }));
  } finally {
    await browser.close();
    if (createdId) await prisma.$transaction([
      prisma.workspaceNotice.deleteMany({ where: { content: { contains: businessNo } } }),
      prisma.provinceAssignment.deleteMany({ where: { matterId: createdId } }),
      prisma.provinceMatter.deleteMany({ where: { id: createdId } }),
    ]);
    await prisma.$disconnect();
  }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
