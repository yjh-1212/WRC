import AMapLoader from '@amap/amap-jsapi-loader';

const ALL_PLUGINS = ['AMap.Scale', 'AMap.ToolBar', 'AMap.MarkerCluster', 'AMap.HeatMap', 'AMap.MoveAnimation', 'AMap.MouseTool', 'AMap.GraspRoad'];

let loading: Promise<any> | null = null;

function applySecurity() {
  (window as any)._AMapSecurityConfig = import.meta.env.VITE_AMAP_SERVICE_HOST
    ? { serviceHost: import.meta.env.VITE_AMAP_SERVICE_HOST }
    : { securityJsCode: import.meta.env.VITE_AMAP_SECURITY_JS_CODE };
}

export function isAmapConfigured() {
  return Boolean(import.meta.env.VITE_AMAP_KEY && (import.meta.env.VITE_AMAP_SECURITY_JS_CODE || import.meta.env.VITE_AMAP_SERVICE_HOST));
}

function pluginReady(AMap: any, name: string) {
  return typeof AMap?.[name.replace(/^AMap\./, '')] === 'function';
}

function ensurePlugins(AMap: any, plugins: string[]) {
  const missing = plugins.filter((name) => !pluginReady(AMap, name));
  if (!missing.length) return Promise.resolve(AMap);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('高德地图插件加载超时')), 12000);
    AMap.plugin(missing, () => {
      window.clearTimeout(timer);
      resolve(AMap);
    });
  });
}

/** 监管端、企业端所有地图页共用同一份 SDK，必须带齐聚合/热力/围栏/纠偏插件。 */
export function loadAMap(_lite = false) {
  if (!isAmapConfigured()) return Promise.reject(new Error('地图配置缺失，请在本地环境变量中配置高德 Web 端 Key 与安全密钥。'));
  applySecurity();
  if (!loading) {
    loading = AMapLoader.load({
      key: import.meta.env.VITE_AMAP_KEY,
      version: '2.0',
      plugins: ALL_PLUGINS,
    }).then((AMap) => {
      AMap.getConfig().appname = 'amap-jsapi-skill';
      return ensurePlugins(AMap, ALL_PLUGINS);
    }).catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading.then((AMap) => ensurePlugins(AMap, ALL_PLUGINS));
}

export function preloadAMap() {
  if (!isAmapConfigured()) return;
  void loadAMap().catch(() => {});
}
