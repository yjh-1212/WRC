import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import { api } from '../api';
import { ElMessage } from 'element-plus';
export type CockpitAppearance = Record<string, string | number | boolean>;
export interface AppearanceField { key: string; label: string; group: string; kind: 'color' | 'range' | 'toggle' | 'select'; default: string | number | boolean; min?: number; max?: number; step?: number; display?: { scale: number; invert?: boolean }; options?: Array<{ value: string; label: string }> }
export interface AppearancePreset { id: string; name: string; style: CockpitAppearance }
interface AppearanceState { revision: number; updatedAt: string; style: CockpitAppearance; presets: AppearancePreset[]; fields: AppearanceField[]; builtins: AppearancePreset[]; canEdit: boolean }
const endpoint = '/dashboard/regulator/province-cockpit/appearance';
const palettes: Record<string, string[]> = { blue: ['#6597ff', '#7eb6ff', '#9bafff', '#efb85a', '#91a9e8', '#627fa6'], ocean: ['#6597ff', '#49c9d1', '#a694ed', '#efb85a', '#4dd3c2', '#8298b5'], amber: ['#d5b36b', '#df916d', '#9bb17b', '#9a8cba', '#72a3b5', '#8298b5'] };
export function appearancePalette(style?: CockpitAppearance) { return style?.chartPalette === 'mono' ? [String(style.primary), String(style.primary), String(style.primary), String(style.primary), String(style.primary), String(style.primary)] : palettes[String(style?.chartPalette)] ?? palettes.ocean; }
export function appearanceVariables(style?: CockpitAppearance) {
  if (!style) return {};
  const variables: Record<string, string> = {};
  for (const [key, name] of Object.entries({ background: 'bg', backgroundEnd: 'bg-end', primary: 'blue', accent: 'amber', text: 'text', muted: 'muted', panel: 'panel', border: 'frame-color', panelOpacity: 'panel-opacity', borderOpacity: 'frame-opacity', frameWidth: 'frame-width', mapBrightness: 'map-brightness', mapSaturation: 'map-saturation' })) variables[`--pc-${name}`] = String(style[key]);
  variables['--pc-side'] = `${style.panelWidth}vw`; variables['--pc-panel-gap'] = `${style.gap}px`;
  variables['--pc-font-size'] = `${style.fontSize}px`; variables['--pc-title-size'] = `${style.titleSize}px`; variables['--pc-metric-size'] = `${style.metricSize}px`;
  variables['--pc-family'] = style.fontFamily === 'song' ? '"Noto Serif SC","SimSun",serif' : '"Microsoft YaHei UI","Microsoft YaHei",sans-serif';
  variables['--pc-label-size'] = `${style.labelSize}px`; variables['--pc-label-color'] = String(style.labelColor);
  variables['--pc-map-hue'] = `${Number(style.mapHue ?? 170)}deg`;
  variables['--pc-map-tone'] = style.mapTone === 'blue' ? 'grayscale(1) sepia(1)' : 'brightness(1)';
  variables['--pc-cyan'] = appearancePalette(style)[1]; variables['--pc-green'] = appearancePalette(style)[4];
  variables['--pc-chart-stroke'] = `${Number(style.chartWidth) * 4}px`; variables['--pc-meter-height'] = `${Number(style.chartWidth) * 2}px`;
  variables['--pc-panel-shadow'] = `drop-shadow(0 8px 18px rgba(0,0,0,${style.shadow}))`;
  variables['--pc-chart-grid'] = style.chartGrid ? 'repeating-linear-gradient(to top,transparent 0,transparent 23px,#91b2d51a 23px,#91b2d51a 24px)' : 'none';
  return variables;
}
export function useProvinceAppearance() {
  const saved = ref<CockpitAppearance>(), draft = ref<CockpitAppearance>(), fields = ref<AppearanceField[]>([]), builtins = ref<AppearancePreset[]>([]), presets = ref<AppearancePreset[]>([]);
  const opened = ref(false), ready = ref(false), loading = ref(false), busy = ref(false), canEdit = ref(false), feedback = ref(''), syncError = ref('');
  const current = computed(() => draft.value ?? saved.value);
  let revision = -1, editRevision = -1, disposed = false, active = true, inFlight: Promise<void> | undefined, timer: ReturnType<typeof setInterval>;
  function apply(state: AppearanceState) {
    if (disposed || state.revision < revision) return;
    if (!ready.value || state.revision !== revision || fields.value.length !== state.fields.length) { saved.value = state.style; presets.value = state.presets; }
    fields.value = state.fields; builtins.value = state.builtins; canEdit.value = state.canEdit; revision = state.revision; ready.value = true; syncError.value = '';
  }
  async function refresh() {
    if (inFlight) return inFlight;
    loading.value = true;
    inFlight = api<AppearanceState>(endpoint).then(apply).catch(reason => { if (!disposed) syncError.value = reason instanceof Error ? reason.message : '共享风格读取失败，请重试'; }).finally(() => { loading.value = false; inFlight = undefined; });
    return inFlight;
  }
  async function begin() { opened.value = true; feedback.value = ''; if (!ready.value) await refresh(); if (ready.value && !draft.value) { draft.value = { ...saved.value! }; editRevision = revision; } }
  function cancel() { if (busy.value) return; draft.value = undefined; opened.value = false; feedback.value = ''; }
  async function write(method: string, url: string, body: Record<string, unknown>, message: string) {
    if (busy.value || !ready.value || !canEdit.value) return false;
    busy.value = true; feedback.value = '正在保存…';
    try { const state = await api<AppearanceState>(url, { method, body: JSON.stringify(body) }); apply(state); editRevision = revision; feedback.value = message; return true; }
    catch (reason) { feedback.value = reason instanceof Error ? reason.message : '保存失败，请重试'; await refresh(); editRevision = revision; return false; }
    finally { busy.value = false; }
  }
  async function save() { if (!draft.value) return; if (await write('PUT', endpoint, { style: draft.value, expectedRevision: editRevision }, '风格已保存，其他浏览器将自动同步')) { draft.value = undefined; opened.value = false; ElMessage.success('风格已保存，其他浏览器将自动同步'); } }
  async function savePreset(name: string) { if (draft.value) await write('POST', `${endpoint}/presets`, { name: name.trim(), style: draft.value, expectedRevision: revision }, '预设已保存'); }
  async function deletePreset(id: string) { await write('DELETE', `${endpoint}/presets/${encodeURIComponent(id)}`, { expectedRevision: revision }, '预设已删除，当前风格保持不变'); }
  function change(style: CockpitAppearance) { draft.value = style; feedback.value = ''; }
  function resume() { if (active && !document.hidden && !busy.value) void refresh(); }
  onActivated(() => { active = true; resume(); });
  onDeactivated(() => { active = false; cancel(); });
  onMounted(() => { void refresh(); timer = setInterval(resume, 5000); window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume); });
  onBeforeUnmount(() => { disposed = true; clearInterval(timer); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); });
  return { current, draft, fields, builtins, presets, opened, ready, loading, busy, canEdit, feedback, syncError, begin, cancel, refresh, save, savePreset, deletePreset, change };
}
