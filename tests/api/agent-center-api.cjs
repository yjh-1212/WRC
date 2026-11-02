// All requests stay local. This suite never requests model generation or sends business facts externally.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../../data/regulatory.db').replace(/\\/g, '/')}`;
const { PrismaClient } = require('@prisma/client');
const { PrismaService } = require('../../apps/api/dist/prisma/prisma.service');
const { workspaceContext } = require('../../apps/api/dist/prisma/workspace-context');
const { AgentFactsService } = require('../../apps/api/dist/agents/facts.service');
const db = new PrismaClient(), scoped = new PrismaService(), facts = new AgentFactsService(scoped);
const base = process.env.API_URL || 'http://127.0.0.1:8080/api';
const fixtures = [], stamp = `agent-test-${Date.now()}`;
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
async function request(url, token, method = 'GET', data) {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const body = await response.json(); return { status: response.status, data: body.data };
}
async function ok(url, token, method, data) { const r = await request(url, token, method, data); assert(r.status >= 200 && r.status < 300, `${method || 'GET'} ${url}: ${r.status}`); checks++; return r.data; }
function scopeKey(user) { return createHash('sha256').update(JSON.stringify({ userId: user.id, workspaceId: user.workspaceId, enterpriseId: user.enterpriseId, level: user.accountLevel, organizations: [...(user.scopeOrganizationIds ?? [])].sort(), permissions: [...user.permissions].sort(), modules: [...(user.workspace?.modules ?? [])].sort(), authVersion: user.authVersion })).digest('hex'); }
async function readFacts(user, code, question) {
  return workspaceContext.run({ userId: user.id, accountLevel: user.accountLevel, workspaceId: user.workspaceId ?? null, organizationIds: user.scopeOrganizationIds ?? [], organizationId: user.organizationId, enterpriseId: user.enterpriseId, permissions: user.permissions, cityCode: user.workspace?.cityCode }, () => facts.read(user, code, question));
}
(async () => {
  check((await request('/agents/catalog')).status, 401, 'Authentication is required');
  const users = [];
  for (const username of ['admin', 'jinan_admin', 'qingdao_admin', 'jinan_ent_admin']) {
    const token = (await ok('/auth/login', null, 'POST', { username, password: process.env.TEST_PASSWORD || 'Wrc@2026!' })).accessToken;
    const me = await ok('/auth/me', token), catalog = await ok('/agents/catalog', token);
    assert(catalog.agents.some(a => a.code === 'GUIDE')); checks++;
    assert(!JSON.stringify(catalog).match(/DEEPSEEK_API_KEY|apiKey|Bearer/)); checks++;
    const conversation = await ok('/agents/conversations', token, 'POST', { agentCode: 'GUIDE', pagePath: '/test' }); fixtures.push(conversation.id);
    check(conversation.userId, me.id); check(conversation.workspaceId, me.workspaceId ?? null); check(conversation.enterpriseId, me.enterpriseId);
    await db.agentTurn.create({ data: { conversationId: conversation.id, requestKey: stamp, question: stamp, answer: '仅本地合成历史记录', status: 'COMPLETED', scopeKey: scopeKey(me), sourcesJson: '[]', factsJson: '{}' } });
    const detail = await ok(`/agents/conversations/${conversation.id}`, token); check(detail.turns[0].answer, '仅本地合成历史记录'); check(detail.turns[0].status, 'COMPLETED');
    users.push({ token, me, conversation });
    const general = await ok('/agents/conversations', token, 'POST', { agentCode: 'GENERAL', pagePath: '/province/overview' }); fixtures.push(general.id);
    check(general.agentCode, 'GENERAL'); check(general.userId, me.id);
    const generalHistory = await ok('/agents/conversations?pageSize=40', token); assert(generalHistory.items.some(row => row.id === general.id)); checks++;
    const generalFacts = await readFacts(me, 'GENERAL', '查询离线车辆和风险告警');
    check(generalFacts.scope, catalog.scope); assert(generalFacts.data.GUIDE); checks++;
    const where = me.accountLevel === 'PROVINCE' ? {} : { organizationId: { in: me.scopeOrganizationIds ?? [] }, ...(me.enterpriseId ? { enterpriseId: me.enterpriseId } : {}) };
    for (const agent of catalog.agents) {
      const data = await readFacts(me, agent.code, '汇总当前授权数据'); assert(data.scope && data.measuredAt); checks++;
      if (agent.code === 'VEHICLE') { check(data.data.total, await db.vehicle.count({ where: { ...where, deletedAt: null } })); assert(data.sources.length <= 12); checks++; }
      if (agent.code === 'SAFETY') check(data.data.total, await db.safetyAlert.count({ where: { ...where, status: { not: 'CLOSED' } } }));
      if (agent.code === 'ADMISSION') check(data.data.total, await db.admissionApplication.count({ where }));
      if (agent.code === 'ANALYTICS') check(data.data.totals._count.id, await db.operationRecord.count({ where }));
    }
  }
  for (const owner of users) for (const other of users.filter(u => u !== owner)) {
    check((await request(`/agents/conversations/${owner.conversation.id}`, other.token)).status, 404, 'Foreign history must not be readable');
    check((await request(`/agents/conversations/${owner.conversation.id}`, other.token, 'DELETE')).status, 404, 'Foreign history must not be deletable');
    const history = await ok('/agents/conversations?pageSize=40', other.token); assert(!history.items.some(i => i.id === owner.conversation.id)); checks++;
  }
  check((await request('/agents/conversations?pageSize=999', users[0].token)).status, 400);
  check((await request('/agents/conversations', users[0].token, 'POST', { agentCode: 'UNKNOWN' })).status, 400);
  const operations = (await ok('/auth/login', null, 'POST', { username: 'ops_admin', password: process.env.TEST_PASSWORD || 'Wrc@2026!' })).accessToken;
  check((await request('/agents/conversations', operations, 'POST', { agentCode: 'GUIDE' })).status, 403);
  check((await request('/agents/conversations', operations, 'POST', { agentCode: 'GENERAL' })).status, 403);
  await db.agentTurn.updateMany({ where: { conversationId: users[0].conversation.id }, data: { scopeKey: 'old-scope' } });
  check((await ok(`/agents/conversations/${users[0].conversation.id}`, users[0].token)).turns[0].status, 'REDACTED');
  for (const item of users) { await ok(`/agents/conversations/${item.conversation.id}`, item.token, 'DELETE'); check(await db.agentTurn.count({ where: { conversationId: item.conversation.id } }), 0); }
  console.log(JSON.stringify({ checks, roles: users.length, externalModelCalls: 0, fixturesCleaned: true }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await db.agentConversation.deleteMany({ where: { id: { in: fixtures } } }); await scoped.$disconnect(); await db.$disconnect(); });
