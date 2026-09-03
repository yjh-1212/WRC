import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
export type LngLat = { longitude: number; latitude: number };

const ROOT = resolve(import.meta.dirname ?? __dirname, '..');
const MAINLAND = 'https://restapi.amap.com';
const PUBLIC_WEB_KEY = '40ffec9172a0dd65b7e224bb252b7e0b';
const PUBLIC_APPNAME = 'amap-map-google-maps-migration';

type AmapJson = Record<string, any>;

function readEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
}

readEnvFile(resolve(ROOT, '.env'));
readEnvFile(resolve(ROOT, 'apps/web/.env.local'));

function credentials() {
  if (process.env.AMAP_WEB_KEY) return { key: process.env.AMAP_WEB_KEY, appname: process.env.AMAP_WEB_APPNAME || 'wurenche-seed' };
  return { key: PUBLIC_WEB_KEY, appname: PUBLIC_APPNAME };
}

export function parseLngLat(value: string): LngLat | null {
  const parts = value.split(',').map(Number);
  if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return { longitude: parts[0], latitude: parts[1] };
}

export function parsePolyline(value?: string | string[]): LngLat[] {
  const raw = Array.isArray(value) ? value.join(';') : value ?? '';
  if (!raw) return [];
  if (raw.includes(';')) {
    return raw.split(';').map((item) => parseLngLat(item)).filter((item): item is LngLat => Boolean(item));
  }
  const nums = raw.split(',').map(Number).filter((item) => Number.isFinite(item));
  const points: LngLat[] = [];
  for (let index = 0; index + 1 < nums.length; index += 2) {
    points.push({ longitude: nums[index], latitude: nums[index + 1] });
  }
  return points;
}

export async function amapGet(path: string, params: Record<string, string | number | undefined>) {
  const { key, appname } = credentials();
  const url = new URL(path.startsWith('http') ? path : `${MAINLAND}${path}`);
  url.searchParams.set('key', key);
  url.searchParams.set('appname', appname);
  url.searchParams.set('output', 'json');
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
  }
  const response = await fetch(url);
  const data = await response.json() as AmapJson;
  if (String(data.status) !== '1') {
    throw new Error(`高德 Web 服务 ${path} 失败：${data.info || data.infocode || response.status}`);
  }
  return data;
}

export async function searchPoi(keywords: string, city = '杭州') {
  const data = await amapGet('/v3/place/text', { keywords, city, citylimit: 'true', offset: 8, page: 1, extensions: 'all' });
  const pois = (data.pois ?? []) as Array<{ id?: string; name?: string; address?: string; location?: string; type?: string }>;
  const poi = pois.find((item) => item.location && !/地铁站|公交站/.test(`${item.name}${item.type}`)) ?? pois.find((item) => item.location);
  if (!poi?.location) throw new Error(`未找到地点：${keywords}`);
  const point = parseLngLat(poi.location);
  if (!point) throw new Error(`地点坐标无效：${keywords}`);
  return { id: String(poi.id), name: String(poi.name), address: String(poi.address || ''), ...point };
}

/** 沿路网按距离抽稀：保留弯道顶点，避免按序号抽掉桥/弯道上的点。 */
export function thinAlongRoad(points: LngLat[], minMeters = 24, maxPoints = 320): LngLat[] {
  if (points.length <= 2) return points.slice();
  const thin = (min: number) => {
    const kept: LngLat[] = [points[0]];
    for (let index = 1; index < points.length - 1; index += 1) {
      const last = kept[kept.length - 1];
      const dx = (points[index].longitude - last.longitude) * 85200;
      const dy = (points[index].latitude - last.latitude) * 111320;
      if (Math.hypot(dx, dy) >= min) kept.push(points[index]);
    }
    kept.push(points[points.length - 1]);
    return kept;
  };
  let min = minMeters;
  let kept = thin(min);
  while (kept.length > maxPoints && min < 90) {
    min += 6;
    kept = thin(min);
  }
  return kept.length > maxPoints ? downsampleTrack(kept, maxPoints) : kept;
}

export function downsampleTrack(points: LngLat[], max = 180): LngLat[] {
  if (points.length <= max) return points.slice();
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

/** 正北为 0、顺时针 0–360。 */
export function headingDegrees(from: LngLat, to: LngLat) {
  const meanLat = ((from.latitude + to.latitude) / 2) * Math.PI / 180;
  const dLng = (to.longitude - from.longitude) * Math.cos(meanLat);
  const dLat = to.latitude - from.latitude;
  return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
}

export async function drivingRoute(origin: LngLat, destination: LngLat, waypoints: LngLat[] = []) {
  const data = await amapGet('/v3/direction/driving', {
    origin: `${origin.longitude},${origin.latitude}`,
    destination: `${destination.longitude},${destination.latitude}`,
    waypoints: waypoints.map((item) => `${item.longitude},${item.latitude}`).join(';') || undefined,
    strategy: 10,
    ferry: 0,
    extensions: 'all',
  });
  const path = data.route?.paths?.[0];
  if (!path) throw new Error('驾车路径规划无结果');
  const steps = (path.steps ?? []) as Array<{ polyline?: string }>;
  const points = steps.flatMap((step) => parsePolyline(step.polyline));
  if (points.length < 2) throw new Error('驾车路径折线为空');
  return { distance: Number(path.distance || 0), duration: Number(path.duration || 0), points };
}

export async function regeoAoi(point: LngLat, keywords?: string) {
  const data = await amapGet('/v3/geocode/regeo', {
    location: `${point.longitude},${point.latitude}`,
    extensions: 'all',
    radius: 800,
    roadlevel: 0,
  });
  const aois = (data.regeocode?.aois ?? []) as Array<{ name?: string; polyline?: string; type?: string }>;
  const ranked = [...aois].sort((a, b) => Number(Boolean(b.polyline)) - Number(Boolean(a.polyline)));
  const match = (keywords ? ranked.find((item) => item.name?.includes(keywords)) : undefined) ?? ranked.find((item) => parsePolyline(item.polyline).length >= 3) ?? ranked[0];
  const polygon = parsePolyline(match?.polyline);
  return {
    address: String(data.regeocode?.formatted_address || ''),
    aoiName: match?.name ?? '',
    polygon: polygon.length >= 3 ? polygon : [],
  };
}
