const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const output = path.resolve('test-results/unified-coordination');
const db = new PrismaClient(), ids = [], nos = [], errors = [];
(async () => {
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  fs.mkdirSync(output, { recursive: true });
  const contexts = [];
  async function login(username) {
    const context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, reducedMotion: 'reduce' }); contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(username + ': ' + error.message));
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' }); await page.getByLabel('账号', { exact: true }).fill(username); await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!'); await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL(url => !url.pathname.endsWith('/login')); return page;
  }
  async function select(page, host, label, option) { await host.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::div[contains(@class,"el-select__wrapper")][1]').click(); await page.getByRole('option', { name: option, exact: true }).click(); }
  async function number(host, label, value) { const field = host.locator('.coord-report-numbers>div').filter({ hasText: label }); await field.getByRole('spinbutton').fill(String(value)); await field.getByRole('spinbutton').press('Tab'); }
  async function confirm(page, name, text) { const box = page.locator('.el-message-box'); await box.waitFor(); if (text) await box.locator('textarea').fill(text); await box.getByRole('button', { name, exact: true }).click(); }
  let province;
  try {
    province = await login('admin');
    const nav = province.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: '协同督办', exact: true });
    assert.equal(await nav.locator('.el-sub-menu__icon-arrow').count(), 0); await nav.click(); await province.waitForURL('**/province/coordination'); await province.getByRole('region', { name: '协同督办事项列表', exact: true }).waitFor();
    assert.equal(await province.getByRole('button', { name: '应急资源', exact: true }).count(), 0);
    await province.screenshot({ path: path.join(output, '01-unified-list.png'), fullPage: true });
    for (const [old, kind] of [['risk-notices', 'RISK_NOTICE'], ['supervision', 'SUPERVISION'], ['collaboration', 'CROSS_CITY'], ['emergency', 'EMERGENCY']]) {
      await province.goto(base + '/province/' + old, { waitUntil: 'domcontentloaded' }); await province.waitForURL(url => url.pathname === '/province/coordination' && url.searchParams.get('kind') === kind);
    }
    await province.goto(base + '/province/coordination', { waitUntil: 'domcontentloaded' }); await province.getByRole('button', { name: '新建事项', exact: true }).click();
    const editor = province.getByRole('dialog', { name: '新建协同事项', exact: true }); await editor.waitFor();
    await select(province, editor, '填报模板', '专项排查');
    const title = '通信异常专项排查验收 ' + Date.now();
    await editor.getByRole('textbox', { name: '事项名称', exact: true }).fill(title); await editor.getByRole('textbox', { name: '办理要求', exact: true }).fill('核查车辆通信、运营许可和问题整改情况，按统一检查清单反馈。');
    await editor.getByRole('combobox', { name: '责任地市选择', exact: true }).locator('xpath=ancestor::div[contains(@class,"el-select__wrapper")][1]').click(); await province.getByRole('option', { name: '济南市', exact: true }).click(); await province.getByRole('option', { name: '青岛市', exact: true }).click(); await editor.getByRole('textbox', { name: '事项名称', exact: true }).click();
    const deadline = editor.getByPlaceholder('选择办理截止时间'); await deadline.fill(new Date(Date.now() + 2 * 86400000).toLocaleString('sv-SE')); await deadline.press('Enter');
    assert.equal(await editor.getByRole('combobox', { name: '保障资源', exact: true }).count(), 0);
    await province.screenshot({ path: path.join(output, '02-inspection-editor.png'), fullPage: true });
    const saving = province.waitForResponse(response => response.url().endsWith('/api/oversight/matters') && response.request().method() === 'POST'); await editor.getByRole('button', { name: '保存草稿', exact: true }).click();
    const response = await saving, body = await response.json(); assert.equal(response.status(), 201, body.message); const matter = body.data; ids.push(matter.id); nos.push(matter.businessNo);
    const detail = province.getByRole('dialog', { name: '协同事项详情', exact: true }); await detail.getByRole('heading', { name: title, exact: true }).waitFor(); assert.equal(await province.getByRole('dialog', { name: '新建协同事项', exact: true }).count(), 0);
    await detail.getByRole('button', { name: '确认派发', exact: true }).click(); await confirm(province, '确认派发'); await detail.getByText('等待地市反馈，或在上方逐市复核。', { exact: true }).waitFor();
    const workspaces = await province.evaluate(async () => { const { api } = await import('/src/api.ts'); return (await api('/oversight/options')).workspaces; });
    const ja = matter.assignments.find(row => row.workspaceId === workspaces.find(city => city.cityCode === '370100').id), qa = matter.assignments.find(row => row.workspaceId === workspaces.find(city => city.cityCode === '370200').id);
    const jinan = await login('jinan_admin'); await jinan.goto(base + '/oversight/city-tasks?assignmentId=' + ja.id, { waitUntil: 'domcontentloaded' });
    const cityDetail = jinan.getByRole('dialog', { name: '省级事项办理', exact: true }); await cityDetail.getByRole('button', { name: '确认响应', exact: true }).click(); await cityDetail.getByRole('button', { name: '提交省级复核', exact: true }).waitFor();
    await number(cityDetail, '排查企业数', 2); await number(cityDetail, '排查车辆数', 10); await number(cityDetail, '问题车辆数', 2); await number(cityDetail, '已整改车辆数', 1);
    for (let index = 1; index <= 4; index++) await select(jinan, cityDetail, '检查结果' + index, index === 4 ? '发现问题' : '正常');
    await cityDetail.getByRole('textbox', { name: '检查说明4', exact: true }).fill('两辆车需要整改，已完成一辆。'); await cityDetail.getByRole('textbox', { name: '办理反馈', exact: true }).fill('已完成通信等专项检查，发现的车辆问题继续整改。');
    await jinan.reload({ waitUntil: 'domcontentloaded' }); await cityDetail.getByText('已恢复当前浏览器中未提交的反馈内容', { exact: true }).waitFor(); assert.equal(await cityDetail.getByRole('textbox', { name: '办理反馈', exact: true }).inputValue(), '已完成通信等专项检查，发现的车辆问题继续整改。');
    await jinan.screenshot({ path: path.join(output, '03-city-report.png'), fullPage: true }); await cityDetail.getByRole('button', { name: '提交省级复核', exact: true }).click(); await cityDetail.getByText('反馈已提交，等待省级复核。', { exact: true }).waitFor();
    await province.goto(base + '/province/coordination?matterId=' + matter.id, { waitUntil: 'domcontentloaded' }); await detail.getByText('专项排查进展', { exact: true }).waitFor();
    const assignment = detail.locator('.coord-assignment').filter({ has: province.getByText('济南市', { exact: true }) }); await assignment.getByRole('button', { name: '退回补充', exact: true }).click(); await confirm(province, '确认', '请补充剩余车辆整改结果'); await detail.getByText('暂无已提交的排查反馈，地市办理后将汇总显示。', { exact: true }).waitFor();
    await jinan.reload({ waitUntil: 'domcontentloaded' }); await cityDetail.getByRole('button', { name: '提交省级复核', exact: true }).waitFor(); await number(cityDetail, '已整改车辆数', 2); await cityDetail.getByRole('textbox', { name: '检查说明4', exact: true }).fill('发现问题的两辆车均已完成整改。'); await cityDetail.getByRole('textbox', { name: '办理反馈', exact: true }).fill('已补充核查，发现的问题车辆全部完成整改。'); await cityDetail.getByRole('button', { name: '提交省级复核', exact: true }).click(); await cityDetail.getByText('反馈已提交，等待省级复核。', { exact: true }).waitFor();
    const qingdao = await login('qingdao_admin'); await qingdao.goto(base + '/oversight/city-tasks?assignmentId=' + qa.id, { waitUntil: 'domcontentloaded' }); const qDetail = qingdao.getByRole('dialog', { name: '省级事项办理', exact: true }); await qDetail.getByRole('button', { name: '确认响应', exact: true }).click(); await qDetail.getByRole('button', { name: '提交省级复核', exact: true }).waitFor(); await number(qDetail, '排查企业数', 1); await number(qDetail, '排查车辆数', 8); for (let index = 1; index <= 4; index++) await select(qingdao, qDetail, '检查结果' + index, '正常'); await qDetail.getByRole('textbox', { name: '办理反馈', exact: true }).fill('本市已完成核查，八辆车辆均正常。'); await qDetail.getByRole('button', { name: '提交省级复核', exact: true }).click(); await qDetail.getByText('反馈已提交，等待省级复核。', { exact: true }).waitFor();
    await province.goto(base + '/province/coordination?matterId=' + matter.id, { waitUntil: 'domcontentloaded' }); await detail.getByRole('button', { name: '整体复核办结', exact: true }).waitFor(); assert((await detail.locator('.coord-summary-numbers').innerText()).includes('18 辆')); await province.screenshot({ path: path.join(output, '04-province-summary.png'), fullPage: true }); await detail.getByRole('button', { name: '整体复核办结', exact: true }).click(); await confirm(province, '确认', '各市反馈完整，整改结果复核通过'); await detail.getByText('事项已办结，办理记录保留供查阅。', { exact: true }).waitFor();
    await detail.locator('.el-drawer__close-btn').click();
    for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) { await province.setViewportSize(viewport); await province.getByRole('button', { name: '查询', exact: true }).waitFor(); assert(await province.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)); }
    assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: true, directMenu: true, noEmergencyResources: true, oldLinks: true, uiCreateDispatch: true, structuredCityReport: true, browserDraftRecovery: true, returnAndResubmit: true, summary: true, reviewClose: true, responsive: true, errors }));
  } catch (error) { if (province) { await province.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); console.error((await province.locator('body').innerText()).slice(-1800)); } throw error; }
  finally { await browser.close(); if (ids.length) await db.$transaction([db.workspaceNotice.deleteMany({ where: { OR: nos.map(no => ({ content: { contains: no } })) } }), db.provinceAssignment.deleteMany({ where: { matterId: { in: ids } } }), db.provinceMatter.deleteMany({ where: { id: { in: ids } } })]); await db.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
