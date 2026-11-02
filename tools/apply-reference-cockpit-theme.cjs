const fs = require('node:fs');
const path = require('node:path');
const base = process.env.API_URL || 'http://127.0.0.1:8080/api';
async function call(endpoint, token, method = 'GET', data) {
  const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const body = await response.json(); if (!response.ok) throw new Error(`${endpoint}: ${response.status} ${body.message}`); return body.data;
}
(async () => {
  if (!process.env.TEST_PASSWORD) throw new Error('Set TEST_PASSWORD for the existing local administrator');
  const login = await call('/auth/login', null, 'POST', { username: 'admin', password: process.env.TEST_PASSWORD });
  const endpoint = '/dashboard/regulator/province-cockpit/appearance', original = await call(endpoint, login.accessToken);
  const backup = path.resolve('tmp/province-appearance-before-relief-20261030.json');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify({ revision: original.revision, style: original.style }, null, 2));
  const values = { background: '#070f22', backgroundEnd: '#0e203d', panel: '#070f22', text: '#dce8fb', muted: '#8ca4c5', primary: '#6597ff', accent: '#efb85a', border: '#6e96de', fontFamily: 'hei', chartPalette: 'blue', mapSideColor: '#9db4e8', mapEdge: '#81a9ef', labels: true, cityMarkers: true, boundaries: true, map3d: true, mapPitch: 42, mapRotation: -10, mapZoomOffset: 0, pulse: true, mapFlow: true, mapSweep: true, mapHalo: true };
  if (Object.entries(values).every(([key, value]) => original.style[key] === value)) return console.log('Reference theme already applied');
  const updated = await call(endpoint, login.accessToken, 'PUT', { expectedRevision: original.revision, style: { ...original.style, ...values } });
  console.log(JSON.stringify({ saved: true, revision: updated.revision, background: updated.style.background, backgroundEnd: updated.style.backgroundEnd }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
