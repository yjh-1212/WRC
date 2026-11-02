const assert = require('node:assert/strict');
const path = require('node:path');
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../../data/regulatory.db').replace(/\\/g, '/')}`;
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), base = process.env.API_URL || 'http://127.0.0.1:8080/api';
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
async function request(url, token, method = 'GET', data) { const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined }); const body = await response.json(); return { status: response.status, data: body.data }; }
async function login(username) { const result = await request('/auth/login', null, 'POST', { username, password: process.env.TEST_PASSWORD || 'Wrc@2026!' }); equal(result.status, 200); return result.data.accessToken; }
const endpoint = '/dashboard/regulator/province-cockpit';
(async () => {
  equal((await request(endpoint)).status, 401);
  const province = await login('admin');
  const menus = (await request('/auth/menus', province)).data; equal(menus.slice(0, 2).map(menu => menu.name), ['全省工作台', '驾驶舱']);
  const result = await request(endpoint, province); equal(result.status, 200); const data = result.data;
  equal(data.cities.length, 16); equal(data.scope.name, '山东省');
  equal(data.summary.registered, data.cities.reduce((sum, city) => sum + city.registered, 0));
  equal(data.summary.online + data.summary.offline, data.summary.registered);
  equal(data.usage.reduce((sum, row) => sum + row.count, 0), data.summary.registered);
  equal(data.risks.levels.reduce((sum, row) => sum + row.count, 0), data.risks.total);
  equal(data.collaboration.open + data.collaboration.closed, data.collaboration.total);
  const workspaces = await db.cityWorkspace.findMany({ select: { id: true, organizationId: true } });
  const orgs = await db.organization.findMany({ where: { workspaceId: { in: workspaces.map(row => row.id) } }, select: { id: true } });
  const ids = [...new Set([...orgs.map(row => row.id), ...workspaces.map(row => row.organizationId)])];
  equal(data.summary.registered, await db.vehicle.count({ where: { deletedAt: null, organizationId: { in: ids } } }));
  for (const city of data.cities.filter(city => city.connected)) {
    const scoped = (await request(`${endpoint}?cityCode=${city.code}`, province)).data;
    equal(scoped.scope.cityCode, city.code); equal(scoped.summary.registered, city.registered); equal(scoped.summary.online, city.online); equal(scoped.summary.enterprises, city.enterprises);
    equal(scoped.risks.total, city.openRisks); equal(scoped.risks.high, city.highRisks); assert(scoped.risks.items.every(item => item.cityCode === city.code)); checks++;
  }
  const unopened = data.cities.find(city => !city.connected);
  if (unopened) { const empty = (await request(`${endpoint}?cityCode=${unopened.code}`, province)).data; equal(empty.scope.connected, false); equal(empty.summary.registered, 0); equal(empty.collaboration.total, 0); }
  equal((await request(`${endpoint}?cityCode=379999`, province)).status, 400); equal((await request(`${endpoint}?cityCode=110100`, province)).status, 400);
  for (const username of ['jinan_admin', 'jinan_ent_admin', 'ops_admin']) { const token = await login(username); equal((await request(endpoint, token)).status, 403); const menu = await request('/auth/menus', token); assert(!menu.data.some(item => item.path === '/province/cockpit')); checks++; }
  console.log(JSON.stringify({ checks, cityCount: data.cities.length, connected: data.coverage.connected, realDatabaseTotals: true, mutations: 0 }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
