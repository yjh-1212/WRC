// Real local authentication/conversations; synthetic model streams never call an external service.
const { chromium } = require('playwright');
const { expect } = require('playwright/test');
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const password = process.env.TEST_PASSWORD;
if (!password) throw new Error('Set TEST_PASSWORD to the existing local acceptance password.');
process.env.DATABASE_URL = `file:${path.resolve('data/regulatory.db').replace(/\\/g, '/')}`;
const db = new PrismaClient(), fixtures = [], checks = [], errors = [];
const output = path.resolve('test-results/general-assistant'); fs.mkdirSync(output, { recursive: true });
const sse = events => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
const scopeKey = user => createHash('sha256').update(JSON.stringify({ userId: user.id, workspaceId: user.workspaceId, enterpriseId: user.enterpriseId, level: user.accountLevel, organizations: [...(user.scopeOrganizationIds ?? [])].sort(), permissions: [...user.permissions].sort(), modules: [...(user.workspace?.modules ?? [])].sort(), authVersion: user.authVersion })).digest('hex');
let browser, page, release;
const shot = name => page.screenshot({ path: path.join(output, name + '.png'), fullPage: false });
async function open() {
  await page.getByRole('button', { name: '打开AI助手', exact: true }).click(); await expect(page.locator('.assistant-drawer')).toBeVisible();
  await expect.poll(async () => { const rect = await page.locator('.assistant-drawer').boundingBox(); const viewport = page.viewportSize(); return !!rect && rect.x >= 0 && rect.x + rect.width <= viewport.width + 1; }).toBe(true);
}
async function close() { await page.locator('.assistant-drawer').getByRole('button', { name: '关闭此对话框', exact: true }).click(); await expect(page.locator('.assistant-drawer')).toBeHidden(); }
async function login(username) {
  if (page.url().startsWith(base)) await page.evaluate(() => { sessionStorage.removeItem('wrc-access-token'); localStorage.removeItem('wrc-refresh-token'); });
  await page.goto(base + '/login'); await page.getByLabel('账号', { exact: true }).fill(username); await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.locator('.el-message').waitFor({ state: 'hidden' });
}
(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1120 }, reducedMotion: 'reduce' }); context.setDefaultTimeout(15000);
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await login('admin'); await page.locator('.wb-status-layout').waitFor();
  const sourcePage = page.url(); await open(); assert.equal(page.url(), sourcePage);
  await expect(page.getByRole('heading', { name: '你好，我是 AI 助手', exact: true })).toBeVisible();
  await expect(page.locator('.assistant-drawer .agent-cards')).toHaveCount(0);
  const bounds = await page.locator('.assistant-drawer').boundingBox(); assert(bounds.x > 1000 && bounds.width > 400 && bounds.x + bounds.width <= 1601);
  await page.getByLabel('向通用AI助手提问').fill('保留这条通用助手草稿'); await shot('01-general-welcome'); await close();
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: '协同督办', exact: true }).click();
  await page.waitForURL('**/province/coordination'); await open(); await expect(page.getByLabel('向通用AI助手提问')).toHaveValue('保留这条通用助手草稿');
  await page.reload(); await open(); await expect(page.getByLabel('向通用AI助手提问')).toHaveValue('保留这条通用助手草稿');
  checks.push('右侧直接打开通用对话，保留业务页面；无需选择智能体，草稿跨页面及刷新恢复');
  const user = await page.evaluate(async () => (await (await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } })).json()).data);
  const catalog = await page.evaluate(async () => (await (await fetch('/api/agents/catalog', { headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } })).json()).data);
  assert.equal(catalog.general.code, 'GENERAL');
  let calls = 0, requestKey, conversationId;
  await page.route('**/api/agents/conversations/*/messages/stream', async route => {
    const input = route.request().postDataJSON(), id = route.request().url().split('/conversations/')[1].split('/')[0];
    if (!fixtures.includes(id)) fixtures.push(id); conversationId = id; calls++;
    const row = await db.agentConversation.findUnique({ where: { id } }); assert.equal(row.agentCode, 'GENERAL');
    if (calls === 1) { requestKey = input.requestKey; return route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'error', message: '合成验收：回答服务暂不可用' }]) }); }
    if (calls === 2) {
      assert.equal(requestKey, input.requestKey);
      const turn = await db.agentTurn.create({ data: { conversationId: id, question: input.question, requestKey, answer: '合成验收回答：可在车辆监管档案中查询当前授权车辆。', status: 'COMPLETED', sourcesJson: '[]', factsJson: '{}', scopeKey: scopeKey(user) } });
      return route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'status', message: '正在整理回答' }, { type: 'delta', text: turn.answer }, { type: 'result', turn: { ...turn, sources: [] } }]) });
    }
    await new Promise(resolve => release = resolve); await route.abort().catch(() => undefined);
  });
  await page.getByLabel('向通用AI助手提问').fill('合成验收：如何查询车辆档案？'); await page.getByRole('button', { name: '发送给AI助手', exact: true }).click();
  await expect(page.getByText('合成验收：回答服务暂不可用', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重试回答', exact: true }).click();
  await expect(page.locator('.assistant-answer')).toHaveText('合成验收回答：可在车辆监管档案中查询当前授权车辆。');
  await expect(page.locator('.assistant-turn')).toHaveCount(1); await shot('02-general-answer');
  await close(); await page.goto(base + '/province/reports'); await open(); await expect(page.locator('.assistant-answer')).toContainText('合成验收回答');
  await page.reload(); await open(); await expect(page.locator('.assistant-answer')).toContainText('合成验收回答');
  checks.push('真实GENERAL会话、流式回答、失败后同请求重试；关闭、跨页及刷新后保留同一对话');
  await page.getByLabel('向通用AI助手提问').fill('合成验收：停止生成');
  const sending = page.waitForRequest('**/messages/stream'); await page.getByRole('button', { name: '发送给AI助手', exact: true }).click(); await sending;
  await page.getByRole('button', { name: '停止生成', exact: true }).click(); release?.(); release = undefined;
  await expect(page.getByText('已停止生成，可以重试。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新建通用对话', exact: true }).click(); await expect(page.locator('.assistant-turn')).toHaveCount(0);
  await close(); await page.unroute('**/api/agents/conversations/*/messages/stream');
  const response = await page.evaluate(async id => (await fetch(`/api/agents/conversations/${id}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } })).status, conversationId); assert.equal(response, 200);
  for (const destination of ['/province/analysis', '/province/vehicles', '/province/workspaces', '/agents', '/province/cockpit']) {
    await page.goto(base + destination); const before = page.url(); await open(); assert.equal(page.url(), before); await close();
  }
  checks.push('停止生成、新对话正常；分析、档案、城市管理、智能体中心及驾驶舱均能原页打开通用助手');
  await page.goto(base + '/province/overview'); await page.setViewportSize({ width: 390, height: 844 }); await open();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const mobile = await page.locator('.assistant-drawer').boundingBox(); assert(mobile.x >= 0 && mobile.width <= 390 && mobile.height <= 845);
  await expect(page.getByLabel('向通用AI助手提问')).toBeVisible(); await shot('03-mobile'); await page.keyboard.press('Escape'); await expect(page.locator('.assistant-drawer')).toBeHidden();
  checks.push('390宽度对话面板和输入区完整可见，无页面横向溢出；Esc关闭');
  await open(); await page.getByLabel('向通用AI助手提问').fill('仅省级账号可见的草稿'); await close();
  for (const username of ['jinan_admin', 'jinan_ent_admin']) {
    await login(username); await open(); await expect(page.locator('.assistant-turn')).toHaveCount(0); await expect(page.getByLabel('向通用AI助手提问')).toHaveValue(''); await close();
  }
  checks.push('市级与企业页面均可打开，切换账号不泄漏上一个账号的草稿和对话');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify({ passed: true, checks, errors, modelConfigured: catalog.modelReady, externalModelCalls: 0 }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, modelConfigured: catalog.modelReady, externalModelCalls: 0, output }, null, 2));
})().catch(async error => { console.error(error); if (page) await shot('failure').catch(() => {}); process.exitCode = 1; }).finally(async () => { release?.(); await browser?.close(); await db.agentConversation.deleteMany({ where: { id: { in: fixtures } } }); await db.$disconnect(); });
