const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const base = process.env.TARGET_URL || 'http://127.0.0.1:5173';
// A local video fixture is injected into this browser session only; production records stay untouched.
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.PW_HEADLESS === 'true', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(30000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
    const fixture = path.resolve(process.env.EVIDENCE_TEST_VIDEO || 'tmp/province-evidence-fixture.mp4');
    if (!fs.existsSync(fixture)) throw new Error('Set EVIDENCE_TEST_VIDEO to a local MP4 acceptance fixture');
    const extension = 'mp4', movie = fs.readFileSync(fixture);
    await page.route('**/__evidence_test__/*', route => {
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), movie.length - 1) : movie.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${movie.length}` } : {}) }, body: movie.subarray(start, end + 1) });
    });
    await page.getByLabel('账号', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill(process.env.TEST_PASSWORD || 'Wrc@2026!'); await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL('**/province/overview');
    await page.route('**/api/province/accidents/*', async route => {
      const response = await route.fetch(), envelope = await response.json();
      if (envelope.data?.occurredAt) { const at = Date.parse(envelope.data.occurredAt); envelope.data.videos = [-1000, 5000].map((offset, i) => ({ id: `test-clip-${i}`, name: '自动化测试录像', channel: 'FRONT', url: `${base}/__evidence_test__/clip-${i}.${extension}`, startedAt: new Date(at + offset).toISOString(), endedAt: new Date(at + offset + 3000).toISOString(), state: 'AVAILABLE', source: '仅当前测试会话' })); envelope.data.videoState = 'CONNECTED'; }
      await route.fulfill({ response, json: envelope });
    });
    await page.goto(base + '/province/accidents', { waitUntil: 'domcontentloaded' });
    await page.locator('video[aria-label="事故录像"]').waitFor();
    await page.waitForFunction(() => { const video = document.querySelector('video'); return video?.readyState >= 1 && video.currentTime > .6; });
    assert(Math.abs(await page.locator('video').evaluate(v => v.currentTime) - 1) < .65);
    const seek = value => page.getByRole('slider', { name: '回放时间', exact: true }).evaluate((input, number) => { input.value = String(number); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await page.locator('video').evaluate(v => { v.currentTime = .2; });
    await page.waitForFunction(() => Number(document.querySelector('.pm-timeline input').value) < 49.95);
    await seek(50.9667); // the next clip starts five seconds after the incident.
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v?.src.includes('clip-1.') && v.readyState >= 1 && v.currentTime > .5; });
    await page.getByRole('button', { name: '后视', exact: true }).click(); await page.getByText('该通道尚未接入录像', { exact: true }).waitFor();
    await page.getByRole('button', { name: '前视', exact: true }).click(); await seek(50.6); await page.getByText('当前时间没有录像覆盖，可拖动时间线查看其他时段', { exact: true }).waitFor();
    await seek(50); await page.locator('video').waitFor();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && !v.paused; });
    await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.waitForFunction(() => document.querySelector('video')?.paused);
    fs.mkdirSync(path.resolve('test-results/province-monitoring'), { recursive: true }); await page.screenshot({ path: path.resolve('test-results/province-monitoring/04-evidence-video-test.png'), fullPage: true });
    assert.deepEqual(errors, []); console.log(JSON.stringify({ nativeVideo: true, format: extension, absoluteTimeSync: true, nativeSeekSync: true, clipSwitch: true, missingChannel: true, coverageGap: true, timelinePlayback: true, errors }));
  } catch (error) { console.error(await page.locator('video').evaluateAll(rows => rows.map(v => ({ src: v.src, code: v.error?.code, error: v.error?.message, ready: v.readyState, time: v.currentTime, duration: v.duration })))); console.error(await page.locator('body').innerText().then(t => t.slice(-1400))); throw error; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
