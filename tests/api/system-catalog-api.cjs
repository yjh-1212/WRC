const assert = require('node:assert/strict');

const baseURL = process.env.API_URL || 'http://127.0.0.1:8080/api';
const password = process.env.SEED_PASSWORD || 'Wrc@2026!';

async function request(path, { token, method = 'GET', body, status = 200 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseURL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const envelope = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${response.status} ${JSON.stringify(envelope)}`);
  return { envelope, data: envelope.data };
}

async function login(username) {
  const { data } = await request('/auth/login', { method: 'POST', body: { username, password } });
  return data.accessToken;
}

(async () => {
  const admin = await login('admin');
  const regAdmin = await login('reg_admin');
  const stamp = Date.now();
  const roleCode = `ROLE_${stamp}`;
  const orgCode = `ORG${String(stamp).slice(-8)}`;

  await request('/system/roles', { token: regAdmin, method: 'POST', status: 403, body: { code: roleCode, name: '越权角色', portal: 'REGULATORY' } });
  await request('/system/organizations', { token: regAdmin, method: 'POST', status: 403, body: { code: orgCode, name: '越权机构' } });

  const createdRole = (await request('/system/roles', {
    token: admin, method: 'POST', status: 201,
    body: { code: roleCode, name: '验收巡查员', portal: 'REGULATORY', description: '超级管理员新增的监管角色' },
  })).data;
  assert.equal(createdRole.code, roleCode);

  const enterpriseRole = (await request('/system/roles', {
    token: admin, method: 'POST', status: 201,
    body: { code: `ENT_${stamp}`, name: '验收企业岗', portal: 'ENTERPRISE' },
  })).data;

  const orgs = (await request('/system/organizations', { token: admin })).data;
  const city = orgs.find((item) => item.parentId == null) ?? orgs[0];
  const createdOrg = (await request('/system/organizations', {
    token: admin, method: 'POST', status: 201,
    body: { code: orgCode, name: '验收交通分局', parentId: city.id },
  })).data;
  assert.equal(createdOrg.code, orgCode);

  const permissions = (await request('/system/permissions', { token: admin })).data;
  const permissionIds = permissions.filter((item) => item.code === 'dashboard:view' || item.code === 'enterprise:access').map((item) => item.id);
  assert.ok(permissionIds.length >= 1, 'assignable permissions missing');

  await request(`/system/roles/${enterpriseRole.id}/permissions`, {
    token: regAdmin, method: 'PATCH', status: 403, body: { permissionIds },
  });
  await request(`/system/roles/${enterpriseRole.id}/permissions`, {
    token: admin, method: 'PATCH', body: { permissionIds },
  });

  const roles = (await request('/system/roles', { token: admin })).data;
  const seededEnterprise = roles.find((item) => item.code === 'ENTERPRISE_ADMIN');
  assert.ok(seededEnterprise, 'seeded enterprise role missing');
  await request(`/system/roles/${seededEnterprise.id}/permissions`, {
    token: regAdmin, method: 'PATCH', status: 403,
    body: { permissionIds: seededEnterprise.permissions.map((item) => item.permission.id) },
  });

  console.log(JSON.stringify({ ok: true, roleCode, orgCode, enterpriseRole: enterpriseRole.code }, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
