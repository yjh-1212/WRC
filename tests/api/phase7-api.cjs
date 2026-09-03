const assert = require('node:assert/strict');

const baseURL = process.env.API_URL || 'http://127.0.0.1:8080/api';
const password = process.env.SEED_PASSWORD || 'Wrc@2026!';

async function request(path, { token, method = 'GET', body, status = 200, requestId } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (requestId) headers['x-request-id'] = requestId;
  const response = await fetch(`${baseURL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const envelope = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${response.status} ${JSON.stringify(envelope)}`);
  assert.equal(envelope.code, status < 400 ? 0 : status, `${method} ${path}: envelope code`);
  assert.ok(envelope.requestId, `${method} ${path}: missing requestId`);
  return { response, envelope, data: envelope.data };
}

async function login(username) {
  const { data } = await request('/auth/login', { method: 'POST', body: { username, password } });
  assert.ok(data.accessToken && data.refreshToken && data.expiresIn > 0, `${username}: token payload incomplete`);
  return data;
}

function flattenMenus(menus) {
  return menus.flatMap((item) => [item, ...flattenMenus(item.children || [])]);
}

(async () => {
  const healthId = 'phase7-health-probe';
  const health = await request('/health', { requestId: healthId });
  assert.equal(health.data.status, 'ok');
  assert.equal(health.data.database, 'up');
  assert.equal(health.response.headers.get('x-request-id'), healthId);
  assert.equal(health.envelope.requestId, healthId);

  await request('/auth/me', { status: 401 });
  await request('/auth/me', { token: 'invalid.jwt.token', status: 401 });
  await request('/auth/login', { method: 'POST', status: 400, body: { username: 'validation_probe', password, unexpected: true } });

  const usernames = ['admin', 'reg_admin', 'reg_user', 'approver', 'ent_admin', 'ent_user'];
  const sessions = Object.fromEntries(await Promise.all(usernames.map(async (username) => [username, await login(username)])));
  const contexts = {};
  for (const username of usernames) {
    const token = sessions[username].accessToken;
    const [{ data: me }, { data: menus }] = await Promise.all([request('/auth/me', { token }), request('/auth/menus', { token })]);
    assert.equal(me.username, username);
    assert.ok(me.roles.length && me.permissions.length, `${username}: empty RBAC context`);
    const paths = flattenMenus(menus).map((item) => item.path);
    assert.equal(new Set(paths).size, paths.length, `${username}: duplicate menu paths`);
    assert.ok(paths.includes(me.portal === 'ENTERPRISE' ? '/enterprise/overview' : '/regulatory/overview'));
    assert.equal(paths.some((path) => path.startsWith('/system/')), username === 'admin' || username === 'reg_admin' || username === 'reg_user');
    assert.equal(paths.includes('/enterprise/accounts'), username === 'ent_admin');
    contexts[username] = { me, paths };
  }

  const token = (username) => sessions[username].accessToken;
  await request('/system/users?page=1&pageSize=20', { token: token('admin') });
  await request('/operations/realtime?page=1&pageSize=20', { token: token('reg_user') });
  await request('/admission/tasks?page=1&pageSize=20', { token: token('approver') });
  await request('/system/users?page=1&pageSize=20', { token: token('ent_admin') });
  await request('/archives/vehicles?page=1&pageSize=20', { token: token('ent_user') });

  await request('/regulatory/overview', { token: token('ent_user'), status: 403 });
  await request('/system/users?page=1&pageSize=20', { token: token('ent_user'), status: 403 });
  await request('/system/logs/audit?page=1&pageSize=20', { token: token('reg_user'), status: 403 });
  await request('/system/users?page=1&pageSize=20', { token: token('approver'), status: 403 });
  await request('/analytics/operations', { token: token('ent_admin'), status: 403 });
  await request('/operations/telemetry', { token: token('ent_user'), method: 'POST', body: {}, status: 403 });

  const adminVehicles = (await request('/archives/vehicles?page=1&pageSize=50', { token: token('admin') })).data;
  const enterpriseVehicles = (await request('/archives/vehicles?page=1&pageSize=50', { token: token('ent_user') })).data;
  const ownEnterpriseId = contexts.ent_user.me.enterpriseId;
  assert.ok(adminVehicles.total > enterpriseVehicles.total && enterpriseVehicles.total > 0, 'enterprise vehicle scope should be narrower than city scope');
  assert.ok(enterpriseVehicles.items.every((item) => item.enterpriseId === ownEnterpriseId), 'enterprise vehicle scope leaked another enterprise');
  const foreignVehicle = adminVehicles.items.find((item) => item.enterpriseId !== ownEnterpriseId);
  assert.ok(foreignVehicle, 'foreign vehicle fixture missing');
  await request(`/archives/vehicles/${foreignVehicle.id}`, { token: token('ent_user'), status: 404 });

  const districtVehicles = (await request('/archives/vehicles?page=1&pageSize=50', { token: token('reg_user') })).data;
  assert.ok(districtVehicles.items.every((item) => item.organizationId === contexts.reg_user.me.organizationId), 'district organization scope leaked data');
  const enterpriseUsers = (await request('/system/users?page=1&pageSize=50', { token: token('ent_admin') })).data;
  assert.ok(enterpriseUsers.items.every((item) => item.enterpriseId === ownEnterpriseId), 'enterprise user scope leaked another enterprise');

  const applications = (await request('/admission/applications?page=1&pageSize=50', { token: token('admin') })).data.items;
  const approved = applications.find((item) => item.status === 'APPROVED');
  assert.ok(approved, 'approved admission fixture missing');
  const approvedDetail = (await request(`/admission/applications/${approved.id}`, { token: token('admin') })).data;
  assert.ok(approvedDetail.approvalHistories?.length >= 2 && approvedDetail.result, 'admission approval closed-loop evidence incomplete');

  const emergencyTasks = (await request('/safety/emergency-tasks?page=1&pageSize=50', { token: token('admin') })).data.items;
  const closedTask = emergencyTasks.find((item) => item.status === 'CLOSED');
  assert.ok(closedTask, 'closed emergency task fixture missing');
  const closedTaskDetail = (await request(`/safety/emergency-tasks/${closedTask.id}`, { token: token('admin') })).data;
  assert.ok(
    closedTaskDetail.logs?.length >= 1
      && closedTaskDetail.respondedAt
      && closedTaskDetail.feedback
      && closedTaskDetail.evaluationScore
      && closedTaskDetail.closedAt,
    'emergency response closed-loop evidence incomplete',
  );

  const refreshSession = await login('ent_user');
  const rotated = (await request('/auth/refresh', { method: 'POST', body: { refreshToken: refreshSession.refreshToken } })).data;
  await request('/auth/refresh', { method: 'POST', body: { refreshToken: refreshSession.refreshToken }, status: 401 });
  await request('/auth/logout', { token: rotated.accessToken, method: 'POST', body: { refreshToken: rotated.refreshToken } });
  await request('/auth/refresh', { method: 'POST', body: { refreshToken: rotated.refreshToken }, status: 401 });

  console.log(JSON.stringify({
    ok: true,
    rolesVerified: usernames.length,
    permissionDenialsVerified: 6,
    cityVehicles: adminVehicles.total,
    enterpriseVehicles: enterpriseVehicles.total,
    districtVehicles: districtVehicles.total,
    closedLoops: ['admission', 'emergency'],
    requestTracing: true,
    refreshRotation: true,
  }, null, 2));
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
