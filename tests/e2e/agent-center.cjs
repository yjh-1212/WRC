// Model requests are intercepted with synthetic SSE fixtures. No business data leaves localhost.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../../data/regulatory.db').replace(/\\/g, '/')}`;
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), fixtures = [], artifacts = path.resolve(__dirname, '../../test-results/agent-center');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const question = `合成测试：如何开通地市平台？${Date.now()}`;
function scopeKey(user) { return createHash('sha256').update(JSON.stringify({ userId: user.id, workspaceId: user.workspaceId, enterpriseId: user.enterpriseId, level: user.accountLevel, organizations: [...(user.scopeOrganizationIds ?? [])].sort(), permissions: [...user.permissions].sort(), modules: [...(user.workspace?.modules ?? [])].sort(), authVersion: user.authVersion })).digest('hex'); }
const sse = events => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const errors = []; let heldRelease;
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/login'); await page.getByLabel('账号', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!'); await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL('**/province/overview');
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: 'AI智能体', exact: true }).click(); await page.waitForURL('**/agents**'); await page.getByRole('heading', { name: '让无人车监管，更清晰' }).waitFor();
    await page.locator('.el-message').waitFor({ state: 'hidden' }); await page.locator('.agent-hero img').evaluate(img => img.decode());
    assert.equal(await page.locator('.agent-cards>button').count(), 6); await page.screenshot({ path: path.join(artifacts, 'home-desktop.png') });
    const user = await page.evaluate(async () => (await (await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${sessionStorage.getItem('wrc-access-token')}` } })).json()).data);
    let calls = 0, requestKey;
    await page.route('**/api/agents/conversations/*/messages/stream', async route => {
      const input = route.request().postDataJSON(), id = route.request().url().split('/conversations/')[1].split('/')[0];
      if (!fixtures.includes(id)) fixtures.push(id); calls++;
      if (calls === 1) { requestKey = input.requestKey; return route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'error', message: '合成测试：模型暂不可用' }]) }); }
      if (calls === 2) {
        assert.equal(input.requestKey, requestKey, 'Retry keeps the same idempotency key');
        const turn = await db.agentTurn.create({ data: { conversationId: id, requestKey, question: input.question, answer: '合成测试回答：地市线下申请，省级在线直接开通。', status: 'COMPLETED', sourcesJson: '[]', factsJson: '{}', scopeKey: scopeKey(user) } });
        await db.agentConversation.update({ where: { id }, data: { title: input.question.slice(0, 60), updatedAt: new Date() } });
        return route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'delta', text: turn.answer }, { type: 'result', turn: { ...turn, sources: [] } }]) });
      }
      await new Promise(resolve => heldRelease = resolve);
      await route.abort().catch(() => undefined);
    });
    await page.getByRole('button', { name: /平台办事指引.*解释平台/ }).click(); await page.getByRole('heading', { name: '平台办事指引', exact: true }).waitFor();
    await page.getByLabel('向AI助手提问').fill(question); await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByText('合成测试：模型暂不可用', { exact: true }).waitFor(); await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByText('合成测试回答：地市线下申请，省级在线直接开通。', { exact: true }).waitFor();
    assert.equal(await page.locator('.agent-turn').count(), 1); await page.waitForURL('**/agents?conversation=**');
    await page.reload(); await page.getByText('合成测试回答：地市线下申请，省级在线直接开通。', { exact: true }).waitFor();
    await page.getByLabel('搜索历史对话').fill(question.slice(0, 15)); await page.locator('.agent-history-link').filter({ hasText: '合成测试' }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'conversation-desktop.png') });
    await page.getByLabel('向AI助手提问').fill('合成测试停止生成'); const stopping = page.waitForRequest('**/messages/stream'); await page.getByRole('button', { name: '发送', exact: true }).click(); await stopping;
    await page.getByRole('button', { name: '停止生成', exact: true }).click(); heldRelease?.(); heldRelease = undefined;
    await page.getByText('已停止生成，可以重试。', { exact: true }).waitFor();
    await page.getByLabel('向AI助手提问').fill('合成测试离开页面'); const pending = page.waitForRequest('**/messages/stream'); await page.getByRole('button', { name: '发送', exact: true }).click(); await pending;
    await page.getByRole('button', { name: '返回业务系统', exact: true }).click(); await page.waitForURL('**/province/overview'); heldRelease?.(); heldRelease = undefined;
    await page.getByRole('button', { name: '打开AI助手' }).waitFor(); assert(!page.url().includes('/agents'), 'Cancel completion cannot navigate back into agents');
    await page.getByRole('button', { name: '打开AI助手' }).click(); await page.locator('.assistant-drawer').waitFor(); assert(!page.url().includes('/agents'), 'Floating assistant stays on the current business page');
    await page.keyboard.press('Escape');
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: 'AI智能体', exact: true }).click(); await page.getByRole('heading', { name: '让无人车监管，更清晰' }).waitFor(); await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifacts, 'home-mobile.png') }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: '打开智能体导航' }).click(); await page.getByRole('button', { name: '智能体广场' }).click(); await page.getByRole('heading', { name: '选择您的业务智能体' }).waitFor();
    assert.deepEqual(errors, []); console.log(JSON.stringify({ retry: true, historyReload: true, stop: true, leaveWhileGenerating: true, mobileOverflow: false, externalModelCalls: 0, errors }));
  } finally { heldRelease?.(); await browser.close(); await db.agentConversation.deleteMany({ where: { id: { in: fixtures } } }); await db.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
