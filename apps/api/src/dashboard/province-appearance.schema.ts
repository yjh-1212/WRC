export type AppearanceStyle = Record<string, string | number | boolean>;
type Field = { key: string; label: string; group: string; kind: 'color' | 'range' | 'toggle' | 'select'; default: string | number | boolean; min?: number; max?: number; step?: number; display?: { scale: number; invert?: boolean }; options?: Array<{ value: string; label: string }> };
const color = (group: string, key: string, label: string, value: string): Field => ({ group, key, label, kind: 'color', default: value });
const range = (group: string, key: string, label: string, value: number, min: number, max: number, step = 1): Field => ({ group, key, label, kind: 'range', default: value, min, max, step });
const toggle = (group: string, key: string, label: string, value: boolean): Field => ({ group, key, label, kind: 'toggle', default: value });
const select = (group: string, key: string, label: string, value: string, options: string[][]): Field => ({ group, key, label, kind: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
export const APPEARANCE_FIELDS: Field[] = [
  color('整体主题与背景', 'background', '背景主色', '#070f22'), color('整体主题与背景', 'backgroundEnd', '背景渐变色', '#0e203d'), color('整体主题与背景', 'primary', '主题色', '#6597ff'), color('整体主题与背景', 'accent', '强调色', '#efb85a'),
  color('文字与指标', 'text', '正文颜色', '#dce8fb'), color('文字与指标', 'muted', '辅助文字颜色', '#8ca4c5'), range('文字与指标', 'fontSize', '正文字号', 12, 11, 17), range('文字与指标', 'titleSize', '面板标题字号', 17, 14, 24), range('文字与指标', 'metricSize', '指标数字字号', 30, 24, 44), select('文字与指标', 'fontFamily', '字体风格', 'hei', [['hei', '现代黑体'], ['song', '典雅宋体']]),
  color('左右面板', 'panel', '左右面板颜色', '#070f22'), { ...range('左右面板', 'panelOpacity', '左右面板透明度（%）', 0, 0, 1, .05), display: { scale: 100, invert: true } }, color('面板与布局', 'border', '面板边框颜色', '#6e96de'), range('面板与布局', 'borderOpacity', '边框不透明度', .65, 0, 1, .05), range('面板与布局', 'frameWidth', '边框线宽', 1, .5, 3, .5), range('面板与布局', 'panelWidth', '单侧面板宽度（%）', 21.5, 18, 28, .5), range('面板与布局', 'gap', '面板间距', 16, 8, 28), range('面板与布局', 'shadow', '面板阴影强度', 0, 0, .5, .05), toggle('面板与布局', 'showFrame', '显示切角边框', true),
  select('图表风格', 'chartPalette', '图表配色', 'blue', [['blue', '深蓝监管'], ['ocean', '蓝青监管'], ['amber', '暖金研判'], ['mono', '单色渐变']]), range('图表风格', 'chartWidth', '图表线宽', 2, 1, 4, .5), toggle('图表风格', 'chartGrid', '显示图表网格', false),
  select('地图外观', 'mapTone', '地图色调', 'blue', [['blue', '统一深蓝'], ['native', '原始底图']]), select('地图外观', 'mapStyle', '高德底图风格', 'blue', [['blue', '交能深蓝'], ['dark', '深色夜景'], ['normal', '标准地图']]), color('地图外观', 'mapColor', '已开通区域颜色', '#37629b'), range('地图外观', 'mapOpacity', '已开通区域不透明度', .12, 0, .6, .02), color('地图外观', 'mapEdge', '行政区边界颜色', '#507db6'), range('地图外观', 'mapEdgeWidth', '行政区边界粗细', .8, .5, 3, .1), range('地图外观', 'mapBrightness', '底图亮度', .75, .5, 1.5, .05), range('地图外观', 'mapSaturation', '底图饱和度', 4, 0, 5, .05), range('地图外观', 'mapHue', '底图色相（度）', 170, -180, 180), toggle('地图外观', 'showRoads', '显示道路', true), toggle('地图外观', 'boundaries', '显示行政区域', true),
  toggle('地图标注', 'labels', '显示地市名称', true), range('地图标注', 'labelSize', '地市标注字号', 11, 10, 16), color('地图标注', 'labelColor', '地市名称颜色', '#c1d8f5'), toggle('地图标注', 'cityMarkers', '显示地市标记', true), toggle('地图标注', 'riskMarkers', '显示高风险标记', true),
  toggle('三维地图', 'map3d', '启用三维视图', true), range('三维地图', 'mapPitch', '地图俯仰角（度）', 42, 0, 65), range('三维地图', 'mapRotation', '地图旋转角（度）', -10, -180, 180), range('三维地图', 'mapZoomOffset', '总览缩放偏移', 0, -1, 1, .1), range('三维地图', 'mapRegionHeight', '区域拉伸厚度（米）', 12000, 0, 30000, 500), color('三维地图', 'mapSideColor', '区域侧面颜色', '#183e70'), toggle('三维地图', 'mapBuildings', '显示三维建筑', true), range('三维地图', 'mapBuildingHeight', '建筑高度倍率', 1, .1, 5, .1),
  toggle('动效与刷新', 'pulse', '选中节点呼吸效果', true), toggle('动效与刷新', 'mapFlow', '省域边界流光', true), toggle('动效与刷新', 'mapSweep', '省域底座扫描', true), toggle('动效与刷新', 'mapHalo', '显示省域底座光环', true), range('动效与刷新', 'refreshSeconds', '自动刷新间隔（秒）', 30, 10, 120, 5),
];
export const APPEARANCE_DEFAULTS = Object.fromEntries(APPEARANCE_FIELDS.map(field => [field.key, field.default])) as AppearanceStyle;
export const APPEARANCE_PRESETS = [
  { id: 'blue', name: '深蓝监管', style: { ...APPEARANCE_DEFAULTS } },
  { id: 'ocean', name: '深海青', style: { ...APPEARANCE_DEFAULTS, primary: '#48b9cf', background: '#061a25', backgroundEnd: '#123447', border: '#64b9d5', chartPalette: 'ocean', mapTone: 'native', mapBrightness: 1.16, mapSaturation: .8, mapHue: 15, mapColor: '#23657b' } },
  { id: 'amber', name: '暖金研判', style: { ...APPEARANCE_DEFAULTS, primary: '#cba562', accent: '#ef9b5c', background: '#171b27', backgroundEnd: '#303447', border: '#ac9776', chartPalette: 'amber', mapTone: 'native', mapBrightness: 1.16, mapSaturation: .8, mapHue: 15 } },
  { id: 'quiet', name: '静谧夜景', style: { ...APPEARANCE_DEFAULTS, background: '#060f1b', backgroundEnd: '#0e1b30', primary: '#8097bf', borderOpacity: .4, chartPalette: 'mono', mapStyle: 'dark', mapTone: 'native', mapBrightness: 1.08, mapSaturation: .35, mapHue: 0 } },
];
export function cleanAppearance(input: unknown): AppearanceStyle {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('风格参数格式不正确');
  const values = input as Record<string, unknown>, output = { ...APPEARANCE_DEFAULTS };
  if (Object.keys(values).some(key => !Object.hasOwn(APPEARANCE_DEFAULTS, key))) throw new Error('包含未知风格参数');
  for (const field of APPEARANCE_FIELDS) {
    const value = values[field.key]; if (value === undefined) continue;
    const valid = field.kind === 'color' ? typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
      : field.kind === 'range' ? typeof value === 'number' && Number.isFinite(value) && value >= field.min! && value <= field.max!
      : field.kind === 'toggle' ? typeof value === 'boolean'
      : field.options!.some(option => option.value === value);
    if (!valid) throw new Error(`${field.label}格式或取值不正确`);
    output[field.key] = value as string | number | boolean;
  }
  return output;
}
