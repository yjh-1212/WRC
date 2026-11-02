const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../../data/regulatory.db').replace(/\\/g, '/')}`;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const base = process.env.API_URL || 'http://127.0.0.1:8080/api';
const password = process.env.TEST_PASSWORD;
if (!password) throw new Error('Set TEST_PASSWORD for local acceptance accounts');
const run = `navigation-${Date.now()}`;
const ids = { matters: [], resources: [], notices: [], users: [], roles: [], workflows: [], manufacturers: [] };
let period;
let assertions = 0;
const checks = [];
function check(value, message) { assert(value, message); assertions++; }
async function request(url, token, method = 'GET', data) {
  const response = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const body = await response.json(); return { status: response.status, ...body };
}
async function ok(url, token, method, data) { const result = await request(url, token, method, data); check(result.status >= 200 && result.status < 300, `${method || 'GET'} ${url}: ${result.status} ${JSON.stringify(result.message)}`); return result.data; }
async function deny(url, token, method, data, statuses = [400, 403, 404, 409]) { const result = await request(url, token, method, data); check(statuses.includes(result.status), `${url} expected denied, received ${result.status}`); return result; }
async function login(username) { return (await ok('/auth/login', null, 'POST', { username, password })).accessToken; }
const flatten = (rows) => rows.flatMap(row => row.children?.length ? flatten(row.children) : [row]);
const jinanId = 'workspace-sd-370100', qingdaoId = 'workspace-sd-370200';
async function createMatter(token, kind, workspaceIds, resourceIds = []) {
  const row = await ok('/oversight/matters', token, 'POST', { kind, title: `${run}协同核验`, description: '核验事项派发、属地反馈与省级复核的完整业务流程。', level: 'MEDIUM', workspaceIds, resourceIds, ...(kind === 'CROSS_CITY' ? { leadWorkspaceId: workspaceIds[0] } : {}) });
  ids.matters.push(row.id); return row;
}
async function cleanup() {
  const matters = await prisma.provinceMatter.findMany({ where: { id: { in: ids.matters } }, select: { businessNo: true } });
  const assignments = await prisma.provinceAssignment.findMany({ where: { matterId: { in: ids.matters } }, select: { id: true } });
  const evaluations = period ? await prisma.provinceDutyEvaluation.findMany({ where: { period }, select: { id: true } }) : [];
  for (const row of matters) await prisma.workspaceNotice.deleteMany({ where: { content: { contains: row.businessNo } } });
  await prisma.provinceAssignment.deleteMany({ where: { matterId: { in: ids.matters } } });
  await prisma.provinceMatter.deleteMany({ where: { id: { in: ids.matters } } });
  await prisma.provinceResource.deleteMany({ where: { id: { in: ids.resources } } });
  await prisma.processNodeDefinition.deleteMany({ where: { processDefinitionId: { in: ids.workflows } } });
  await prisma.processDefinition.deleteMany({ where: { id: { in: ids.workflows } } });
  await prisma.manufacturer.deleteMany({ where: { id: { in: ids.manufacturers } } });
  if (period) {
    await prisma.provinceDutyEvaluation.deleteMany({ where: { period } });
    await prisma.workspaceNotice.deleteMany({ where: { title: '地市履责评价已发布', content: `${period}履责评价已发布，请查看评价结论和指标口径` } });
  }
  await prisma.auditLog.deleteMany({ where: { OR: [{ objectId: { in: [...ids.matters, ...ids.resources, ...ids.workflows, ...ids.manufacturers, ...assignments.map(r=>r.id), ...evaluations.map(r=>r.id), ...(period ? [period] : [])] } }, { userId: { in: ids.users } }] } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.loginLog.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: ids.roles } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
}
(async () => {
  const province = await login('admin'), jinan = await login('jinan_admin'), qingdao = await login('qingdao_admin');
  const enterprise = await login('jinan_ent_admin'), operations = await login('ops_admin');
  const provinceMenus = await ok('/auth/menus', province), cityMenus = await ok('/auth/menus', jinan), enterpriseMenus = await ok('/auth/menus', enterprise);
  check(JSON.stringify(provinceMenus.map(r => r.name)) === JSON.stringify(['全省工作台', '驾驶舱', '地市管理', '全省监测', '协同督办', '统计分析', '平台管理']), 'province menu order');
  check(JSON.stringify(cityMenus.map(r => r.name)) === JSON.stringify(['监管工作台', '主体管理', '准入与许可', '运行监管', '安全监管', '分析评价', '管理设置']), 'city menu order');
  check(JSON.stringify(enterpriseMenus.map(r => r.name)) === JSON.stringify(['运营工作台', '基础资料', '申请与许可', '运行监测', '安全管理', '企业评价', '企业设置']), 'enterprise menu order');
  for (const menus of [provinceMenus, cityMenus, enterpriseMenus]) check(flatten(menus).every(r => !/详情|轨迹|历史记录|运行记录|事故回溯/.test(r.name)), 'no contextual details in sidebar');
  check(flatten(provinceMenus).every(r => !r.path.startsWith('/enterprise')), 'province has regulatory portal only');
  const cityVehicles = await ok('/archives/vehicles?pageSize=100', jinan);
  const selected = await ok(`/archives/vehicles?workspaceId=${jinanId}&pageSize=100`, province);
  check(selected.total === cityVehicles.total && selected.total > 0, 'province selected city includes its districts');
  check(selected.items.every(r => cityVehicles.items.some(v => v.id === r.id)), 'selected city list matches scope');
  await deny(`/archives/vehicles?workspaceId=${qingdaoId}`, jinan, 'GET', undefined, [403]);
  await deny('/archives/manufacturers',jinan,'POST',{businessNo:run,name:'共享目录职责核验'},[403]);
  const manufacturer=await ok('/archives/manufacturers',province,'POST',{businessNo:run,name:'共享目录职责核验'});ids.manufacturers.push(manufacturer.id);
  check((await ok(`/archives/manufacturers?q=${run}`,qingdao)).items.some(r=>r.id===manufacturer.id),'province shared reference directory available to each city');
  const licenses = await ok('/admission/licenses?pageSize=100', jinan);
  check(licenses.items.length > 0, 'city licenses available');
  const exactLicense = await ok(`/admission/licenses?id=${licenses.items[0].id}`, province);
  check(exactLicense.total === 1 && exactLicense.items[0].id === licenses.items[0].id, 'legacy license deep-link resolves exact object');
  check((await ok(`/admission/licenses?id=${licenses.items[0].id}`, qingdao)).total === 0, 'license id filter preserves city isolation');
  const workflows = await ok('/admission/workflows', jinan);
  const sharedWorkflow = workflows.find(r=>!r.workspaceId);
  if(sharedWorkflow) await deny(`/admission/workflows/${sharedWorkflow.id}`, jinan, 'PATCH', {status:'INACTIVE'}, [403]);
  const workflowPayload = {code:run,name:'济南审批节点配置核验',applicationType:'ROAD_TEST',version:1,nodes:[{nodeCode:'REVIEW',name:'属地审核',orderNo:1,approvalRoleCode:'CITY_ADMIN_370100',timeLimitHours:24}]};
  const workflow = await ok('/admission/workflows', jinan, 'POST', workflowPayload); ids.workflows.push(workflow.id);
  check(workflow.workspaceId===jinanId, 'new workflow belongs to city');
  await deny('/admission/workflows', jinan, 'POST', workflowPayload, [400]);
  const qWorkflow = await ok('/admission/workflows', qingdao, 'POST', {...workflowPayload,nodes:[{...workflowPayload.nodes[0],approvalRoleCode:'CITY_ADMIN_370200'}]}); ids.workflows.push(qWorkflow.id);
  check(qWorkflow.workspaceId===qingdaoId && qWorkflow.code!==workflow.code, 'same business code can be configured independently in each city');
  check(!(await ok('/admission/workflows', qingdao)).some(r=>r.id===workflow.id), 'other city cannot read local workflow');
  await deny('/admission/workflows', jinan, 'POST', {...workflowPayload,code:`${run}-foreign`,nodes:[{...workflowPayload.nodes[0],approvalRoleCode:'CITY_ADMIN_370200'}]}, [400]);
  await deny('/admission/workflows', jinan, 'POST', {...workflowPayload,code:`${run}-reader`,nodes:[{...workflowPayload.nodes[0],approvalRoleCode:'CITY_USER_370100'}]}, [400]);
  await deny(`/admission/workflows/${workflow.id}`, qingdao, 'PATCH', {status:'ACTIVE'}, [404]);
  for (const endpoint of ['/admission/applications', '/safety/violations', '/operations/regions', '/archives/vehicles', '/analytics/evaluation/tasks', '/governance/operators', '/system/enterprises']) await deny(endpoint, province, 'POST', {}, [403]);
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const district = await prisma.organization.findFirstOrThrow({where:{workspaceId:jinanId,parentId:{not:null},code:'370102'}});
  const cityAdminRole = await prisma.role.findUniqueOrThrow({where:{code:'CITY_ADMIN_370100'}});
  const districtAdmin = await prisma.user.create({data:{username:`district_${Date.now()}`,passwordHash:admin.passwordHash,displayName:'市级管理员范围核验',portal:'REGULATORY',accountLevel:'CITY',workspaceId:jinanId,organizationId:district.id,roles:{create:{roleId:cityAdminRole.id}}}});ids.users.push(districtAdmin.id);
  const districtAdminToken=await login(districtAdmin.username);
  check((await ok('/archives/vehicles?pageSize=100',districtAdminToken)).total===cityVehicles.total,'city administrator on district institution retains citywide responsibility');
  await deny('/system/users', province, 'POST', { username: run, displayName: '企业办理人员', password, portal: 'ENTERPRISE', organizationId: admin.organizationId, enterpriseId: cityVehicles.items[0].enterpriseId, roleIds: [] }, [400, 403]);
  checks.push('三端菜单、上下文收纳、省市职责及地市筛选');

  const readPermissions = await prisma.permission.findMany({ where: { code: { in: ['dashboard:view', 'system:organization:read', 'system:user:create', 'system:user:update', 'system:role:update'] } } });
  const role = await prisma.role.create({ data: { code: run, name: '省级查询核验', portal: 'REGULATORY', permissions: { create: readPermissions.map(p => ({ permissionId: p.id })) } } }); ids.roles.push(role.id);
  const readonly = await prisma.user.create({ data: { username: run, passwordHash: admin.passwordHash, displayName: '省级查询核验员', portal: 'REGULATORY', accountLevel: 'PROVINCE', organizationId: admin.organizationId, roles: { create: { roleId: role.id } } } }); ids.users.push(readonly.id);
  const readToken = await login(run);
  const superRole = await prisma.role.findUniqueOrThrow({ where: { code:'SUPER_ADMIN' }, include:{permissions:true} });
  const protectedUser = await prisma.user.create({ data: { username:`protect_${Date.now()}`,passwordHash:admin.passwordHash,displayName:'管理员权限边界核验',portal:'REGULATORY',accountLevel:'PROVINCE',organizationId:admin.organizationId,roles:{create:{roleId:superRole.id}} } }); ids.users.push(protectedUser.id);
  await deny('/system/users',readToken,'POST',{username:`blocked_${Date.now()}`,password,displayName:'权限上限核验',portal:'REGULATORY',organizationId:admin.organizationId,roleIds:[superRole.id]},[403]);
  await deny(`/system/users/${protectedUser.id}`,readToken,'PATCH',{roleIds:[role.id]},[403]);
  await deny(`/system/users/${protectedUser.id}/password`,readToken,'PATCH',{password},[403]);
  await deny(`/system/users/${protectedUser.id}/status`,readToken,'PATCH',{status:'INACTIVE'},[403]);
  await deny(`/system/roles/${role.id}/permissions`,readToken,'PATCH',{permissionIds:superRole.permissions.map(p=>p.permissionId)},[403]);
  await ok('/oversight/overview', readToken);
  for (const token of [enterprise, operations, jinan]) await deny('/oversight/matters', token, 'GET', undefined, [403]);
  await deny('/oversight/matters', readToken, 'POST', { kind: 'SUPERVISION', title: '只读写入核验', description: '不允许只读人员创建监管事项', level: 'LOW', workspaceIds: [jinanId] }, [403]);

  const matter = await createMatter(province, 'CROSS_CITY', [jinanId, qingdaoId]);
  const jTask = matter.assignments.find(r => r.workspaceId === jinanId), qTask = matter.assignments.find(r => r.workspaceId === qingdaoId);
  await deny(`/oversight/city-tasks/${jTask.id}`, jinan, 'GET', undefined, [404]);
  await ok(`/oversight/matters/${matter.id}/actions`, province, 'POST', { action: 'DISPATCH', comment: '下达协同核验任务' });
  await deny(`/oversight/matters/${matter.id}/actions`, province, 'POST', { action: 'CLOSE', comment: '未反馈不能办结' }, [400]);
  await deny(`/oversight/city-tasks/${qTask.id}`, jinan, 'GET', undefined, [404]);
  await deny(`/oversight/city-tasks/${jTask.id}/actions`, province, 'POST', { action: 'RESPOND' }, [403]);
  await deny(`/oversight/city-tasks/${jTask.id}/actions`, jinan, 'POST', { action: 'SUBMIT', feedback: '未响应不能提交' }, [400, 409]);
  for (const [token, task] of [[jinan, jTask], [qingdao, qTask]]) {
    await ok(`/oversight/city-tasks/${task.id}/actions`, token, 'POST', { action: 'RESPOND' });
    await ok(`/oversight/city-tasks/${task.id}/actions`, token, 'POST', { action: 'SUBMIT', feedback: task.id === qTask.id ? `${run}青岛专属反馈` : '济南属地核查完成并形成闭环记录', evidenceNote: '本市车辆与许可关联核查记录' });
    if (task.id === jTask.id) check((await ok(`/oversight/matters/${matter.id}`, province)).status === 'RESPONDING', 'first city cannot finish sibling');
  }
  check((await ok(`/oversight/matters/${matter.id}`, province)).status === 'PENDING_REVIEW', 'all city feedback awaits province review');
  const own = await ok(`/oversight/city-tasks/${jTask.id}`, jinan);
  check(!JSON.stringify(own).includes(`${run}青岛专属反馈`) && !own.matter.assignments && !own.matter.resources && !own.matter.resourceIdsJson, 'city detail sanitizes sibling feedback and resources');
  await ok(`/oversight/matters/${matter.id}/actions`, province, 'POST', { action: 'RETURN', workspaceId: jinanId, comment: '补充整改依据后重新提交' });
  check((await ok(`/oversight/city-tasks/${jTask.id}`, jinan)).status === 'PROCESSING', 'returned feedback can be supplemented');
  await ok(`/oversight/city-tasks/${jTask.id}/actions`, jinan, 'POST', { action: 'SUBMIT', feedback: '已补充许可与整改依据，核查完成' });
  const closed = await ok(`/oversight/matters/${matter.id}/actions`, province, 'POST', { action: 'CLOSE', comment: '两市反馈完整，复核办结' });
  check(closed.status === 'CLOSED' && closed.assignments.every(r => r.status === 'CLOSED'), 'province closes after all feedback');
  check(closed.logs.some(r => r.action === 'RETURN') && closed.logs.some(r => r.action === 'CLOSE'), 'review history preserved');
  checks.push('跨市事项草稿、派发、属地隔离、响应、反馈、退回、办结');

  const resource = await ok('/oversight/resources', province, 'POST', { workspaceId: jinanId, name: `${run}保障组`, kind: 'VEHICLE', status: 'AVAILABLE', capacity: 2 }); ids.resources.push(resource.id);
  await deny('/oversight/matters', province, 'POST', { kind: 'EMERGENCY', title: '跨归属资源核验', description: '承接地市不能调用未关联城市的资源', level: 'HIGH', workspaceIds: [qingdaoId], resourceIds: [resource.id] }, [400]);
  const emergency = await createMatter(province, 'EMERGENCY', [jinanId], [resource.id]);
  await ok(`/oversight/matters/${emergency.id}/actions`, province, 'POST', { action: 'DISPATCH', comment: '组织保障资源核验' });
  check((await prisma.provinceResource.findUnique({ where: { id: resource.id } })).status === 'BUSY', 'dispatch reserves resource');
  await deny(`/oversight/resources/${resource.id}`, province, 'PATCH', { status: 'AVAILABLE' }, [400, 409]);
  const eTask = emergency.assignments[0];
  await ok(`/oversight/city-tasks/${eTask.id}/actions`, jinan, 'POST', { action: 'RESPOND' });
  await ok(`/oversight/city-tasks/${eTask.id}/actions`, jinan, 'POST', { action: 'SUBMIT', feedback: '资源保障条件已核对，任务完成' });
  await ok(`/oversight/matters/${emergency.id}/actions`, province, 'POST', { action: 'CLOSE', comment: '保障核验完成，释放资源' });
  check((await prisma.provinceResource.findUnique({ where: { id: resource.id } })).status === 'AVAILABLE', 'close releases resource');
  checks.push('应急资源归属校验、占用保护及办结释放');

  for (let year = 2000; year < 2020; year++) if (!(await prisma.provinceDutyEvaluation.count({ where: { period: `${year}-01` } }))) { period = `${year}-01`; break; }
  check(!!period, 'unused evaluation period');
  await ok('/oversight/evaluations/generate', province, 'POST', { period });
  const evaluations = await ok(`/oversight/evaluations?period=${period}`, province);
  check(evaluations.items.length >= 3 && evaluations.items.every(r => r.status === 'DRAFT' && r.score >= 0 && r.score <= 100), 'real metric draft evaluations');
  check((await ok(`/oversight/evaluations?period=${period}`, jinan)).total === 0, 'unpublished evaluation hidden');
  const jEvaluation = evaluations.items.find(r => r.workspaceId === jinanId);
  await deny(`/oversight/evaluations/${jEvaluation.id}/publish`, readToken, 'POST', { conclusion: '只读人员无权发布' }, [403]);
  await ok(`/oversight/evaluations/${jEvaluation.id}/publish`, province, 'POST', { conclusion: '已核对指标统计口径，按本期履责情况公布评价。' });
  check((await ok(`/oversight/evaluations?period=${period}`, jinan)).items.every(r => r.workspaceId === jinanId && r.status === 'PUBLISHED'), 'city sees own published evaluation');
  check((await ok(`/oversight/evaluations?period=${period}`, qingdao)).total === 0, 'other city cannot see published sibling');
  await ok('/oversight/evaluations/generate', province, 'POST', { period });
  check((await prisma.provinceDutyEvaluation.findUnique({ where: { id: jEvaluation.id } })).status === 'PUBLISHED', 'regeneration preserves publication');
  const directory = await ok('/oversight/directory', province);
  check(directory.items.length >= 5 && directory.items.every(r => r.fields?.length), 'data directory contains field contracts');
  check(!directory.items.some(r => r.key === 'pilots'), 'deferred pilot workflow not in data directory');
  check(!flatten(provinceMenus).some(r => r.path === '/province/pilots'), 'pilot workflow not in navigation');
  await deny('/oversight/pilots', province, 'GET', undefined, [404]);
  await deny('/oversight/pilots', province, 'POST', {}, [404]);
  check((await ok('/oversight/overview', province)).cities.every(r => !('pilotStage' in r)), 'overview does not expose deferred pilot stages');
  checks.push('履责评价真实计算、发布范围、发布保护、数据目录及试点流程暂缓');
})().then(async () => {
  await cleanup();
  const result = { status: 'PASS', assertions, checks, finishedAt: new Date().toISOString() };
  fs.mkdirSync('test-results/navigation', { recursive: true });
  fs.writeFileSync('test-results/navigation/api-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}).catch(async error => { console.error(error); try { await cleanup(); } catch (failure) { console.error('cleanup:', failure); } process.exitCode = 1; }).finally(() => prisma.$disconnect());
