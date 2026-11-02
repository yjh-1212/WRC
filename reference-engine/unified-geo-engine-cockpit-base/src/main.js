import 'cesium/Build/Cesium/Widgets/widgets.css';
import './ui/styles.css';
import { GeoEngine } from './engine/GeoEngine.js';
import { CHINA_REGION } from './config/regions.js';

const statusEl = document.querySelector('#engineStatus');
const cameraEl = document.querySelector('#cameraHeight');
const coordEl = document.querySelector('#cursorCoord');
const basemapEl = document.querySelector('#basemapSelect');
const orbitBtn = document.querySelector('#orbitBtn');

const notify = (message, tone = 'info') => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
};

const engine = new GeoEngine({
  container: document.querySelector('#cesiumContainer'),
  creditContainer: document.querySelector('#creditContainer'),
  notify,
});

await engine.setBasemap('amap-tech');
await engine.navigateTo(CHINA_REGION, { duration: 0 });
notify('ENGINE READY');

engine.onCameraStatus(({ height }) => {
  if (cameraEl) cameraEl.textContent = `H ${Math.round(height).toLocaleString()} m`;
});

engine.onCursorPosition(({ lng, lat }) => {
  if (coordEl) coordEl.textContent = `${lng.toFixed(4)}, ${lat.toFixed(4)}`;
});

basemapEl?.addEventListener('change', async (event) => {
  await engine.setBasemap(event.target.value);
});

document.querySelector('#overviewBtn')?.addEventListener('click', () => engine.navigator.overview());
document.querySelector('#topDownBtn')?.addEventListener('click', () => engine.navigator.topDown());
document.querySelector('#northBtn')?.addEventListener('click', () => engine.navigator.resetNorth());
document.querySelector('#modeBtn')?.addEventListener('click', () => engine.navigator.toggleSceneMode());
document.querySelector('#followBtn')?.addEventListener('click', () => {
  if (!engine.trackSelected()) notify('请先选择一个可跟随对象', 'warn');
});
orbitBtn?.addEventListener('click', () => {
  const active = engine.navigator.toggleOrbit();
  orbitBtn.classList.toggle('active', active);
});

document.querySelectorAll('[data-camera]').forEach((button) => {
  button.addEventListener('click', () => engine.navigator.nudge(button.dataset.camera));
});

document.querySelectorAll('[data-layer]').forEach((input) => {
  input.addEventListener('change', () => engine.setLayerVisible(input.dataset.layer, input.checked));
});

window.geoEngine = engine;
window.addEventListener('beforeunload', () => engine.destroy(), { once: true });
