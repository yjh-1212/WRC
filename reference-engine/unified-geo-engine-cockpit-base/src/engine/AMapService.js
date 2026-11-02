import { gcj02ToWgs84, wgs84ToGcj02 } from './CoordinateService.js';

let loaderPromise = null;
const REQUIRED_PLUGINS = ['AMap.Driving', 'AMap.DistrictSearch'];

function ensureCredentials() {
  const key = import.meta.env.VITE_AMAP_KEY?.trim();
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE?.trim();
  if (!key) throw new Error('未配置 VITE_AMAP_KEY');
  if (!securityJsCode) throw new Error('未配置 VITE_AMAP_SECURITY_CODE');
  return { key, securityJsCode };
}

function ensurePlugins(AMap) {
  return new Promise((resolve, reject) => {
    if (!AMap?.plugin) {
      reject(new Error('高德 JS API 未提供插件加载能力'));
      return;
    }
    AMap.plugin(REQUIRED_PLUGINS, () => {
      if (!AMap.Driving || !AMap.DistrictSearch) {
        reject(new Error('高德插件加载不完整（Driving / DistrictSearch）'));
        return;
      }
      resolve(AMap);
    });
  });
}

export function loadAMapJsApi() {
  if (window.AMap) return ensurePlugins(window.AMap);
  if (loaderPromise) return loaderPromise;

  const { key, securityJsCode } = ensureCredentials();
  window._AMapSecurityConfig = { securityJsCode };

  loaderPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('高德 JS API 加载超时'));
    }, 15000);

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.onload = async () => {
      window.clearTimeout(timeout);
      if (!window.AMap) {
        reject(new Error('高德 JS API 未返回 AMap 对象'));
        return;
      }
      try {
        resolve(await ensurePlugins(window.AMap));
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('高德 JS API 脚本加载失败'));
    };
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    document.head.append(script);
  });

  return loaderPromise;
}

function flattenRoutePath(route) {
  const points = [];
  for (const step of route.steps ?? []) {
    for (const point of step.path ?? []) {
      const lng = Number(point.lng ?? point.getLng?.());
      const lat = Number(point.lat ?? point.getLat?.());
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const previous = points.at(-1);
      if (!previous || Math.abs(previous[0] - lng) > 1e-8 || Math.abs(previous[1] - lat) > 1e-8) {
        points.push([lng, lat]);
      }
    }
  }
  return points;
}

function lngLatToPair(point) {
  const lng = Number(point?.lng ?? point?.getLng?.());
  const lat = Number(point?.lat ?? point?.getLat?.());
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function closeRing(points) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points.at(-1);
  if (Math.abs(first[0] - last[0]) > 1e-10 || Math.abs(first[1] - last[1]) > 1e-10) {
    return [...points, first];
  }
  return points;
}

/**
 * Query an administrative boundary from AMap DistrictSearch.
 * AMap returns mainland-China coordinates in GCJ-02; this adapter converts
 * every boundary vertex back to WGS84 before handing it to Cesium.
 */
export async function fetchDistrictBoundary({ adcode, level } = {}) {
  if (!adcode) throw new TypeError('fetchDistrictBoundary requires an adcode');
  const AMap = await loadAMapJsApi();
  const districtSearch = new AMap.DistrictSearch({
    level: level === 'country' ? 'country' : level === 'province' ? 'province' : 'city',
    subdistrict: 0,
    extensions: 'all',
  });

  const result = await new Promise((resolve, reject) => {
    districtSearch.search(String(adcode), (status, response) => {
      if (status === 'complete' && response?.districtList?.length) {
        resolve(response.districtList[0]);
        return;
      }
      reject(new Error(response?.info || `高德行政区查询失败：${status}`));
    });
  });

  const boundaries = Array.isArray(result.boundaries) ? result.boundaries : [];
  const rings = boundaries
    .map((boundary) => boundary
      .map(lngLatToPair)
      .filter(Boolean)
      .map(([lng, lat]) => gcj02ToWgs84(lng, lat)))
    .map(closeRing)
    .filter((ring) => ring.length >= 4);

  if (!rings.length) throw new Error(`高德未返回 ${result.name || adcode} 的有效边界`);

  return {
    name: result.name || String(adcode),
    adcode: String(result.adcode || adcode),
    level: result.level || level,
    rings,
    source: 'AMap DistrictSearch',
  };
}

export async function planDrivingRoute({ start, end, policy } = {}) {
  if (!Array.isArray(start) || !Array.isArray(end)) {
    throw new TypeError('planDrivingRoute requires start/end WGS84 coordinates');
  }

  const AMap = await loadAMapJsApi();
  const startGcj = wgs84ToGcj02(start[0], start[1]);
  const endGcj = wgs84ToGcj02(end[0], end[1]);
  const driving = new AMap.Driving({
    policy: policy ?? AMap.DrivingPolicy.LEAST_TIME,
    ferry: 1,
  });

  const result = await new Promise((resolve, reject) => {
    driving.search(
      new AMap.LngLat(startGcj[0], startGcj[1]),
      new AMap.LngLat(endGcj[0], endGcj[1]),
      (status, response) => {
        if (status === 'complete' && response?.routes?.length) resolve(response);
        else reject(new Error(response?.info || `高德路径规划失败：${status}`));
      },
    );
  });

  const route = result.routes[0];
  const gcjPath = flattenRoutePath(route);
  if (gcjPath.length < 2) throw new Error('高德返回的路线没有有效轨迹点');

  return {
    coordinates: gcjPath.map(([lng, lat]) => gcj02ToWgs84(lng, lat)),
    distanceMeters: Number(route.distance) || 0,
    durationSeconds: Number(route.time) || 0,
    tolls: Number(route.tolls) || 0,
    tollDistanceMeters: Number(route.tolls_distance) || 0,
    steps: route.steps?.map((step) => ({
      instruction: step.instruction,
      road: step.road,
      distanceMeters: Number(step.distance) || 0,
      durationSeconds: Number(step.time) || 0,
    })) ?? [],
    source: 'AMap Driving',
  };
}
