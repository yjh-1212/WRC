const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const endpoint = '/api/dashboard/regulator/province-cockpit/appearance';
const artifacts = path.resolve(__dirname, '../../test-results/province-appearance');
let original, ownedRevision = -1, requestPage, token;
async function req(method = 'GET', body, suffix = '') { const response = await requestPage.request.fetch(base + endpoint + suffix, { method, headers: { Authorization: `Bearer ${token}` }, ...(body ? { data: body } : {}) }); const data = await response.json(); assert(response.ok(), `Appearance ${method} failed: ${data.message}`); return data.data; }
async function css(page, variable) { return page.locator('.province-cockpit').evaluate((element, variable) => getComputedStyle(element).getPropertyValue(variable).trim(), variable); }
async function waitCss(page, variable, value) { await page.waitForFunction(({ variable, value }) => getComputedStyle(document.querySelector('.province-cockpit')).getPropertyValue(variable).trim() === value, { variable, value }, { timeout: 15000 }); }
async function color(page, value) { await page.getByLabel('主题色颜色值', { exact: true }).fill(value); await page.getByLabel('主题色颜色值', { exact: true }).press('Tab'); }
async function panels(page, color, transparency) {
  const colorInput = page.getByLabel('左右面板颜色值', { exact: true }), opacityInput = page.getByLabel('左右面板透明度（%）数值', { exact: true });
  await colorInput.fill(color); await colorInput.press('Tab'); await opacityInput.fill(String(transparency)); await opacityInput.press('Tab');
}
async function panelPaint(page, color, opacity) {
  await waitCss(page, '--pc-panel', color); await waitCss(page, '--pc-panel-opacity', String(opacity));
  const rgb = `rgb(${color.slice(1).match(/../g).map(part => parseInt(part, 16)).join(', ')})`;
  await page.waitForFunction(({ rgb, opacity }) => [...document.querySelectorAll('.pc-frame-outline')].length === 6 && [...document.querySelectorAll('.pc-frame-outline')].every(element => getComputedStyle(element).fill === rgb && getComputedStyle(element).fillOpacity === String(opacity)), { rgb, opacity }, { timeout: 15000 });
  const paint = await page.locator('.pc-frame-outline').evaluateAll(elements => elements.map(element => ({ fill: getComputedStyle(element).fill, opacity: getComputedStyle(element).fillOpacity })));
  assert.deepEqual(paint, Array.from({ length: 6 }, () => ({ fill: rgb, opacity: String(opacity) })), 'All six panels must use the shared color and opacity');
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' }); const errors = [];
  try {
    async function open() { const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' }); const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(base + '/login'); await page.getByLabel('账号', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!'); await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL('**/province/overview'); await page.evaluate(async () => { const { loadAMap } = await import('/src/amap.ts'); const AMap = await loadAMap(), Native = AMap.Map; AMap.Map = new Proxy(Native, { construct(target, args) { const map = Reflect.construct(target, args); window.__nativeMap = map; return map; } }); }); await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('menuitem', { name: '驾驶舱', exact: true }).click(); await page.locator('.pc-side').first().waitFor(); await page.locator('.pc-map[data-map-state="ready"]').waitFor({ timeout: 30000 }); return page; }
    const first = await open(), second = await open(); requestPage = first; token = await first.evaluate(() => sessionStorage.getItem('wrc-access-token')); original = await req(); ownedRevision = original.revision;
    await first.bringToFront(); await first.getByRole('button', { name: '大屏风格设置', exact: true }).click(); const dialog = first.getByRole('dialog', { name: '大屏风格设置' }); await dialog.waitFor();
    await panels(first, '#254b68', 60); await panelPaint(first, '#254b68', .4); await panelPaint(second, original.style.panel, original.style.panelOpacity);
    await dialog.getByRole('button', { name: '取消', exact: true }).click(); await panelPaint(first, original.style.panel, original.style.panelOpacity);
    await first.getByRole('button', { name: '大屏风格设置', exact: true }).click(); await color(first, '#3c91c9'); await panels(first, '#12304b', 45);
    for (const [label, value] of [['地图俯仰角（度）数值', '35'], ['地图旋转角（度）数值', '15'], ['区域拉伸厚度（米）数值', '18000'], ['建筑高度倍率数值', '1.8']]) { const input = first.getByLabel(label, { exact: true }); await input.fill(value); await input.press('Tab'); }
    assert.equal(await css(second, '--pc-blue'), original.style.primary); await dialog.getByRole('button', { name: '保存风格', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); ownedRevision = (await req()).revision;
    await second.bringToFront(); await second.waitForFunction(() => Math.abs(window.__nativeMap.getPitch() - 35) < .1 && Math.abs(window.__nativeMap.getRotation() - 15) < .1 && document.querySelector('.pc-administrative-layer')?.dataset.depth === '18000', null, { timeout: 15000 });
    await second.bringToFront(); await waitCss(second, '--pc-blue', '#3c91c9'); await panelPaint(second, '#12304b', .55); await second.reload(); await second.locator('.pc-side').first().waitFor(); await waitCss(second, '--pc-blue', '#3c91c9'); await panelPaint(second, '#12304b', .55);
    await first.bringToFront(); await first.getByRole('button', { name: '大屏风格设置', exact: true }).click(); const presetName = `外观验收${Date.now().toString(36)}`; await first.getByLabel('新预设名称', { exact: true }).fill(presetName); await dialog.getByRole('button', { name: '另存预设', exact: true }).click(); await dialog.getByRole('status').filter({ hasText: '预设已保存' }).waitFor(); ownedRevision = (await req()).revision;
    await first.getByRole('combobox', { name: '选择风格预设' }).press('ArrowDown'); await first.getByRole('option', { name: presetName, exact: true }).click(); await first.getByRole('button', { name: '删除所选预设' }).click(); await first.getByRole('button', { name: '删除', exact: true }).click(); await dialog.getByRole('status').filter({ hasText: '预设已删除' }).waitFor(); ownedRevision = (await req()).revision;
    await dialog.getByRole('button', { name: '恢复默认', exact: true }).click(); await waitCss(first, '--pc-panel-opacity', '0'); await color(first, '#778899');
    const outside = await req('PUT', { expectedRevision: ownedRevision, style: { ...original.style, primary: '#876543' } }); ownedRevision = outside.revision;
    await dialog.getByRole('button', { name: '保存风格', exact: true }).click(); await dialog.getByRole('status').filter({ hasText: '其他浏览器已更新风格' }).waitFor(); await waitCss(first, '--pc-blue', '#778899');
    await first.screenshot({ path: path.join(artifacts, 'settings.png') }); await dialog.getByRole('button', { name: '取消', exact: true }).click(); await waitCss(first, '--pc-blue', '#876543');
    const restored = await req('PUT', { expectedRevision: ownedRevision, style: original.style }); ownedRevision = restored.revision;
    await first.reload(); await first.locator('.pc-side').first().waitFor(); await first.locator('.pc-map[data-map-state="ready"]').waitFor({ timeout: 30000 }); await waitCss(first, '--pc-panel-opacity', String(original.style.panelOpacity)); assert.equal(await first.locator('.pc-kpis').count(), 0); assert.equal(await first.locator('.amap-logo:visible,.amap-copyright:visible').count(), 0);
    await first.screenshot({ path: path.join(artifacts, 'cockpit.png') }); await first.getByRole('button', { name: '大屏风格设置', exact: true }).click(); await first.getByLabel('主题色颜色值', { exact: true }).waitFor(); await first.screenshot({ path: path.join(artifacts, 'settings-default.png') });
    assert.deepEqual(errors, []); console.log(JSON.stringify({ previewOnly: true, cancelRestores: true, sharedPanelColorAndOpacity: true, allSixPanelsPainted: true, sharedSave: true, reloadPersistence: true, customPreset: true, presetDelete: true, conflictKeepsDraft: true, transparentPanels: true, statsRemoved: true, brandingHidden: true, errors }));
  } finally {
    if (original && requestPage && !requestPage.isClosed()) { const current = await req(); if (current.revision === ownedRevision && JSON.stringify(current.style) !== JSON.stringify(original.style)) await req('PUT', { expectedRevision: ownedRevision, style: original.style }); const leftovers = current.presets.filter(p => !original.presets.some(old => old.id === p.id) && p.name.startsWith('外观验收')); for (const preset of leftovers) { const latest = await req(); await req('DELETE', { expectedRevision: latest.revision }, '/presets/' + preset.id); } }
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
