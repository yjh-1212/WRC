const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../../data/regulatory.db').replace(/\\/g, '/')}`;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const base = process.env.API_URL || 'http://127.0.0.1:8080/api';
const password = process.env.TEST_PASSWORD || 'Wrc@2026!';
let assertions = 0;
const evidence = [];
async function request(url, token, method = 'GET', data) {
  const response = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const body = await response.json();
  return { status: response.status, data: body.data, message: body.message };
}
async function ok(url, token, method, data) {
  const result = await request(url, token, method, data);
  assert(result.status >= 200 && result.status < 300, `${method || 'GET'} ${url}: ${result.status} ${JSON.stringify(result.message)}`);
  assertions++; return result.data;
}
async function denied(url, token, method, data) {
  const result = await request(url, token, method, data);
  assert([400, 401, 403, 404, 409, 410].includes(result.status), `must deny ${url}; got ${result.status} ${JSON.stringify(result.message)}`);
  assertions++; return result;
}
async function login(username) { return (await ok('/auth/login', null, 'POST', { username, password })).accessToken; }
const allModules = ['ARCHIVES', 'ADMISSION', 'OPERATIONS', 'SAFETY', 'ANALYTICS', 'GOVERNANCE'];
let fixtureId, appId, applicationNo, jinanOriginal;
const temporaryVehicles = [];
const temporaryMaterials = [];
const temporaryNoticeIds = [];
async function cleanup() {
  await prisma.workspaceNotice.deleteMany({ where: { id: { in: temporaryNoticeIds } } });
  if (applicationNo) await prisma.workspaceNotice.deleteMany({ where: { content: { contains: applicationNo } } });
  if (jinanOriginal) await prisma.workspaceNotice.deleteMany({ where: { workspaceId: jinanOriginal.id, content: { in: [
    '核验城市模块授权的接口生效范围', '核验暂停后的历史查询与安全处置保留策略', '完成授权生命周期核验，恢复原城市状态',
  ] } } });
  for (const id of temporaryVehicles) {
    await prisma.vehicleArchive.deleteMany({ where: { vehicleId: id } });
    await prisma.vehicle.deleteMany({ where: { id } });
  }
  for (const file of temporaryMaterials) {
    const target = path.resolve(__dirname, '../../data/saas-materials', file);
    if (path.dirname(target) === path.resolve(__dirname, '../../data/saas-materials') && fs.existsSync(target)) fs.unlinkSync(target);
  }
  if (jinanOriginal) await prisma.cityWorkspace.update({ where: { id: jinanOriginal.id }, data: { modulesJson: jinanOriginal.modulesJson, status: jinanOriginal.status, validUntil: jinanOriginal.validUntil } });
  if (fixtureId) {
    await prisma.auditLog.deleteMany({ where: { module: 'saas', objectId: fixtureId } });
    const users = await prisma.user.findMany({ where: { workspaceId: fixtureId }, select: { id: true } });
    const userIds = users.map((item) => item.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.loginLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { workspaceId: fixtureId } } });
    await prisma.role.deleteMany({ where: { workspaceId: fixtureId } });
    await prisma.processNodeDefinition.deleteMany({ where: { processDefinition: { workspaceId: fixtureId } } });
    await prisma.processDefinition.deleteMany({ where: { workspaceId: fixtureId } });
    await prisma.workspaceInvitation.deleteMany({ where: { workspaceId: fixtureId } });
    await prisma.workspaceNotice.deleteMany({ where: { workspaceId: fixtureId } });
    const orgs = await prisma.organization.findMany({ where: { workspaceId: fixtureId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgs.map((item) => item.id) } } });
    await prisma.organization.updateMany({ where: { workspaceId: fixtureId }, data: { workspaceId: null } });
    await prisma.cityWorkspace.delete({ where: { id: fixtureId } });
    for (const org of orgs.filter((item) => item.code.startsWith('CITY-'))) await prisma.organization.delete({ where: { id: org.id } });
  }
  if (appId) { await prisma.provisionJob.deleteMany({ where: { applicationId: appId } }); await prisma.cityApplication.deleteMany({ where: { id: appId } }); }
}
(async () => {
  const province = await login('admin'), jinan = await login('jinan_admin'), qingdao = await login('qingdao_admin');
  const me = await ok('/auth/me', jinan); assert.equal(me.workspace.cityCode, '370100'); assertions++;
  const qMe = await ok('/auth/me', qingdao);
  jinanOriginal = await prisma.cityWorkspace.findUniqueOrThrow({ where: { id: me.workspaceId } });
  const cityVehicles = await ok('/archives/vehicles?pageSize=100', jinan);
  const otherVehicles = await ok('/archives/vehicles?pageSize=100', qingdao);
  assert(cityVehicles.total > 0 && otherVehicles.total > 0); assertions++;
  const allowedIds = new Set((await prisma.organization.findMany({ where: { workspaceId: me.workspaceId } })).map((row) => row.id));
  assert(cityVehicles.items.every((row) => allowedIds.has(row.organizationId))); assertions++;
  assert(!cityVehicles.items.some((row) => otherVehicles.items.some((other) => other.id === row.id))); assertions++;
  await denied(`/archives/vehicles/${otherVehicles.items[0].id}`, jinan);
  await denied(`/archives/vehicles/${otherVehicles.items[0].id}`, jinan, 'PATCH', { name: '跨域访问校验' });
  await denied(`/archives/vehicles/${cityVehicles.items[0].id}`, jinan, 'PATCH', { enterpriseId: otherVehicles.items[0].enterpriseId });
  await denied('/system/organizations', jinan, 'POST', { code: `BLOCK-${Date.now()}`, name: '业务组织', parentId: qMe.organizationId });
  await denied('/system/users', jinan, 'POST', { username: `blocked_${Date.now()}`, password, displayName: '业务人员', portal: 'REGULATORY', organizationId: qMe.organizationId, roleIds: [qMe.roles[0].id] });
  await denied('/saas/workspaces', jinan);
  await denied('/saas/applications', jinan);
  const ownVehicle = cityVehicles.items[0];
  const createdVehicle = await ok('/archives/vehicles', jinan, 'POST', {
    businessNo: `SD-${Date.now()}`, vin: `SDVIN${Date.now()}`, deviceNo: `SDDEV${Date.now()}`, name: '济南配送车辆', modelId: ownVehicle.modelId, enterpriseId: ownVehicle.enterpriseId,
  });
  temporaryVehicles.push(createdVehicle.id);
  assert(createdVehicle.unifiedCode.startsWith('370100-FV-')); assertions++;
  const createdArchive = await ok(`/archives/vehicles/${createdVehicle.id}`, jinan);
  assert(createdArchive.archive); assertions++;
  for (const endpoint of ['/operations/records', '/safety/alerts', '/safety/accidents', '/safety/violations', '/safety/emergency-tasks', '/admission/applications', '/admission/licenses', '/analytics/evaluations', '/analytics/reports', '/governance/operators', '/system/logs/audit']) {
    const own = await ok(endpoint + '?pageSize=100', jinan);
    const other = await ok(endpoint + '?pageSize=100', qingdao);
    if (own.items) assert(own.items.every((row) => !row.organizationId || allowedIds.has(row.organizationId)), endpoint);
    if (own.items && other.items) assert(!own.items.some((row) => other.items.some((item) => item.id === row.id)), endpoint);
    assertions += 2;
    if (other.items?.length && ['/analytics/reports', '/operations/records', '/admission/applications', '/safety/alerts', '/safety/accidents', '/safety/violations', '/safety/emergency-tasks'].includes(endpoint)) {
      await denied(`${endpoint}/${other.items[0].id}`, jinan);
      if (endpoint === '/analytics/reports') await denied(`${endpoint}/${other.items[0].id}/export`, jinan);
    }
  }
  const department = await login('reg_user'), enterprise = await login('ent_admin'), operations = await login('ops_admin');
  const depMe = await ok('/auth/me', department);
  const depVehicles = await ok('/operations/realtime', department);
  assert(depVehicles.items.every((item) => depMe.scopeOrganizationIds.includes(item.organizationId))); assertions++;
  const entMe = await ok('/auth/me', enterprise);
  const entVehicles = await ok('/operations/realtime', enterprise);
  assert(entVehicles.items.every((item) => item.enterpriseId === entMe.enterpriseId)); assertions++;
  await denied('/operations/realtime', operations);
  await denied('/saas/workspaces', operations);
  evidence.push('省/市/区县/企业/运维范围、跨市详情与关联写入、导出隔离');

  const workspaces = await ok('/saas/workspaces', province);
  const catalog = await ok('/saas/catalog');
  const unopen = catalog.cities.find((city) => !workspaces.items.some((workspace) => workspace.cityCode === city.code));
  assert(unopen, 'must retain a city which can be opened'); assertions++;
  const suffix = Date.now().toString(36);
  const adminUsername = 'city_' + suffix;
  const opening = { cityCode: unopen.code, unitName: unopen.name + '交通运输局', contactName: '李文清', contactPhone: '0531-88001234', adminName: '李文清', adminUsername, password, modules: allModules, vehicleQuota: 1000, validUntil: '2030-12-31T00:00:00Z', offlineReference: '线下授权函 SD-2026-1001' };
  await denied('/saas/applications', null, 'POST', { cityCode: unopen.code, unitName: unopen.name + '交通运输局', contactName: '李文清', contactPhone: '0531-88001234', adminName: '李文清', adminUsername, modules: allModules, expectedVehicles: 100, materialNote: '线下申请由省级直接开通' });
  await denied('/saas/workspaces', null, 'POST', opening);
  await denied('/saas/workspaces', jinan, 'POST', opening);
  await denied('/saas/workspaces', enterprise, 'POST', opening);
  await denied('/saas/workspaces', operations, 'POST', opening);
  await denied('/saas/workspaces', province, 'POST', { ...opening, password: 'weakpass' });
  await denied('/saas/workspaces', province, 'POST', { ...opening, modules: ['INVALID_MODULE'] });
  await denied('/saas/workspaces', province, 'POST', { ...opening, validUntil: '2000-01-01T00:00:00Z' });
  const applicationCount = await prisma.cityApplication.count();
  const opened = await ok('/saas/workspaces', province, 'POST', opening);
  fixtureId = opened.workspace.id;
  assert.equal(opened.workspace.status, 'ACTIVE');
  assert.equal(opened.administrator.status, 'ACTIVE');
  assert.equal(opened.workspace.config.openingSource, 'OFFLINE');
  assert.equal(opened.workspace.quotas.vehicles, 1000);
  assert(!JSON.stringify(opened).includes(password)); assertions += 5;
  assert.equal(await prisma.cityApplication.count(), applicationCount); assertions++;
  const directAudit = await prisma.auditLog.findFirst({ where: { objectId: fixtureId, action: 'DIRECT_OPEN' } });
  assert(directAudit); assert(!directAudit.detail.includes(password)); assertions += 2;
  await denied('/saas/workspaces', province, 'POST', opening);
  const otherCity = catalog.cities.find(city => city.code !== unopen.code && !workspaces.items.some(workspace => workspace.cityCode === city.code));
  assert(otherCity); await denied('/saas/workspaces', province, 'POST', { ...opening, cityCode: otherCity.code });
  assert.equal(await prisma.cityWorkspace.count({ where: { cityCode: otherCity.code } }), 0); assertions++;
  assert.equal(await prisma.workspaceInvitation.count({ where: { workspaceId: fixtureId } }), 0); assertions++;
  let newAdmin = await login(adminUsername);
  const newMe = await ok('/auth/me', newAdmin);
  assert.equal(newMe.workspaceId, fixtureId); assertions++;
  assert.equal((await ok('/operations/realtime', newAdmin)).total, 0); assertions++;
  await denied(`/saas/members/${newMe.id}`, newAdmin, 'PATCH', { status: 'DISABLED' });
  await denied(`/system/users/${newMe.id}/status`, newAdmin, 'PATCH', { status: 'INACTIVE' });
  const member = await ok('/saas/members', newAdmin, 'POST', { username: `member_${suffix}`, displayName: '赵明远', password, roleCode: 'CITY_USER' });
  await ok('/saas/transfer-admin', newAdmin, 'POST', { targetUserId: member.id });
  await denied('/saas/members', newAdmin);
  const successor = await login(`member_${suffix}`);
  const memberList = await ok('/saas/members', successor);
  assert(memberList.items.some((item) => item.id === member.id && item.roles.some((role) => role.code.startsWith('CITY_ADMIN')))); assertions++;
  await ok('/saas/current/confirm-rules', successor, 'POST', {});
  await denied('/saas/change-requests', successor, 'POST', { kind: 'RENEW', materialNote: '申请延续本市平台服务，相关业务运行正常。' });
  await ok(`/saas/members/${newMe.id}`, successor, 'PATCH', { roleCode: 'CITY_ADMIN' });
  const concurrent = await Promise.all([
    request(`/saas/members/${newMe.id}`, successor, 'PATCH', { roleCode: 'CITY_USER' }),
    request(`/saas/members/${member.id}`, successor, 'PATCH', { roleCode: 'CITY_USER' }),
  ]);
  assert(concurrent.some((result) => result.status === 200));
  assert(concurrent.some((result) => [400,401,403].includes(result.status)));
  const remainingAdministrators = await prisma.user.count({ where: { workspaceId: fixtureId, status: 'ACTIVE', roles: { some: { role: { code: { startsWith: 'CITY_ADMIN_' } } } } } });
  assert.equal(remainingAdministrators, 1); assertions += 3;
  evidence.push('线下申请省级直接开通、账号立即登录、模块与流程初始化、重复城市和账号拒绝、无线上申请与激活、管理员保护与交接');

  const approachingExpiry = new Date(Date.now() + 7 * 86400000);
  await prisma.cityWorkspace.update({ where: { id: me.workspaceId }, data: { validUntil: approachingExpiry } });
  const expiryNoticeId = `expiry-${me.workspaceId}-${approachingExpiry.toISOString().slice(0, 10)}`;
  temporaryNoticeIds.push(expiryNoticeId);
  await ok('/saas/current', jinan); await ok('/saas/current', jinan);
  assert.equal(await prisma.workspaceNotice.count({ where: { id: expiryNoticeId } }), 1); assertions++;

  await ok(`/saas/workspaces/${me.workspaceId}`, province, 'PATCH', { modules: allModules.filter((value) => value !== 'ANALYTICS'), reason: '核验城市模块授权的接口生效范围' });
  await denied('/analytics/reports', jinan);
  let freshJinan = await login('jinan_admin');
  await denied('/analytics/reports', freshJinan);
  await ok('/archives/vehicles', freshJinan);
  await ok(`/saas/workspaces/${me.workspaceId}`, province, 'PATCH', { modules: allModules, status: 'SUSPENDED', reason: '核验暂停后的历史查询与安全处置保留策略' });
  freshJinan = await login('jinan_admin');
  await ok('/archives/vehicles', freshJinan);
  await denied('/admission/applications', freshJinan, 'POST', { applicationType: 'ENTERPRISE_ONBOARDING', title: '业务申请' });
  await ok('/saas/current', freshJinan);
  await ok(`/saas/workspaces/${me.workspaceId}`, province, 'PATCH', { status: 'ACTIVE', reason: '完成授权生命周期核验，恢复原城市状态' });
  evidence.push('到期站内提醒去重、模块撤回、旧会话失效、暂停只读与管理恢复');

  const fk = await prisma.$queryRawUnsafe('PRAGMA foreign_key_check'); assert.equal(fk.length, 0); assertions++;
  for (const model of ['enterprise','vehicle','operationRegion','safetyAlert','accident','regulatoryReport']) {
    const rows = await prisma[model].findMany();
    assert(!JSON.stringify(rows).match(/杭州|浙江|模拟|示例|演示|测试数据/), `${model} has old visible regional data`); assertions++;
  }
  const result = { status: 'passed', assertions, evidence, at: new Date().toISOString() };
  fs.mkdirSync(path.resolve(__dirname, '../../test-results/saas'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '../../test-results/saas/api-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  try {
    if (fixtureId) {
      await prisma.provisionJob.deleteMany({ where: { workspaceId: fixtureId } });
      await prisma.cityApplication.deleteMany({ where: { workspaceId: fixtureId, ...(appId ? { id: { not: appId } } : {}) } });
    }
    if (appId) await prisma.applicationMaterial.deleteMany({ where: { applicationId: appId } });
    await cleanup();
  } catch(error) { console.error('Cleanup failed:', error.message); process.exitCode = 1; }
  await prisma.$disconnect();
});
