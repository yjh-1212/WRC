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
  return { response, envelope, data: envelope.data };
}

async function login(username, pass = password) {
  const { data } = await request('/auth/login', { method: 'POST', body: { username, password: pass } });
  return data;
}

(async () => {
  const admin = await login('ent_admin');
  const staff = await login('ent_user');
  const me = (await request('/auth/me', { token: admin.accessToken })).data;
  const options = (await request('/system/users/options', { token: admin.accessToken })).data;
  assert.ok(options.roles.every((role) => role.portal === 'ENTERPRISE'), 'enterprise options leaked regulatory roles');
  const userRole = options.roles.find((role) => role.code === 'ENTERPRISE_USER');
  const adminRole = options.roles.find((role) => role.code === 'ENTERPRISE_ADMIN');
  assert.ok(userRole && adminRole, 'enterprise assignable roles missing');

  const listed = (await request('/system/users?page=1&pageSize=50&sort=displayName&order=asc', { token: admin.accessToken })).data;
  assert.ok(listed.items.every((item) => item.enterpriseId === me.enterpriseId), 'enterprise account scope leaked');
  assert.ok(listed.items.some((item) => item.username === 'ent_user'), 'seed enterprise user missing');

  await request('/system/users/options', { token: staff.accessToken, status: 403 });
  await request('/system/users?page=1&pageSize=20', { token: staff.accessToken, status: 403 });

  await request('/system/users', {
    token: admin.accessToken, method: 'POST', status: 403,
    body: { username: `acct_bad_${Date.now()}`, password, displayName: '越权账号', portal: 'REGULATORY', roleIds: [userRole.id] },
  });

  const username = `acct_${Date.now()}`;
  const created = (await request('/system/users', {
    token: admin.accessToken, method: 'POST', status: 201,
    body: { username, password, displayName: '验收账号', email: `${username}@example.com`, phone: '13800000001', portal: 'ENTERPRISE', roleIds: [userRole.id] },
  })).data;
  assert.equal(created.username, username);

  await request(`/system/users/${created.id}`, {
    token: admin.accessToken, method: 'PATCH',
    body: { displayName: '验收账号已改', phone: '13800000002', roleIds: [userRole.id] },
  });

  const nextPassword = 'Wrc@Reset1!';
  await request(`/system/users/${created.id}/password`, { token: admin.accessToken, method: 'PATCH', body: { password: nextPassword } });
  await login(username, nextPassword);

  await request(`/system/users/${created.id}/status`, { token: admin.accessToken, method: 'PATCH', body: { status: 'INACTIVE' } });
  await request('/auth/login', { method: 'POST', status: 401, body: { username, password: nextPassword } });
  await request(`/system/users/${created.id}/status`, { token: admin.accessToken, method: 'PATCH', body: { status: 'ACTIVE' } });
  await login(username, nextPassword);

  await request(`/system/users/${me.id}/status`, { token: admin.accessToken, method: 'PATCH', status: 400, body: { status: 'INACTIVE' } });
  await request(`/system/users/${created.id}/password`, { token: staff.accessToken, method: 'PATCH', status: 403, body: { password: nextPassword } });

  const searched = (await request(`/system/users?q=${username}&page=1&pageSize=20`, { token: admin.accessToken })).data;
  assert.equal(searched.items[0]?.username, username);
  console.log(JSON.stringify({ ok: true, createdUser: username, enterpriseId: me.enterpriseId }, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
