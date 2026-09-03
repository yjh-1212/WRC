/** 高德 GCJ-02 坐标。路网、点位与围栏来自 Web 服务生成的 hangzhou-geo.generated.json。 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LngLat = { longitude: number; latitude: number };

type Generated = {
  pois: Record<string, LngLat & { name?: string }>;
  routes: { yuhang: LngLat[][]; yunqi: LngLat[][]; xiasha: LngLat[][] };
  fences: { campusNoEntry: LngLat[]; schoolSpeed: LngLat[]; yunqiExpo: LngLat[] };
  regions: LngLat[][];
};

function toRad(value: number) { return value * Math.PI / 180; }

export function headingBetween(from: LngLat, to: LngLat) {
  const dLng = (to.longitude - from.longitude) * Math.cos(toRad((from.latitude + to.latitude) / 2));
  const dLat = to.latitude - from.latitude;
  return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
}

function metersToLngLat(origin: LngLat, eastMeters: number, northMeters: number): LngLat {
  return {
    longitude: origin.longitude + eastMeters / (111320 * Math.cos(toRad(origin.latitude))),
    latitude: origin.latitude + northMeters / 111320,
  };
}

function segmentLength(a: LngLat, b: LngLat) {
  const dx = (b.longitude - a.longitude) * 111320 * Math.cos(toRad((a.latitude + b.latitude) / 2));
  const dy = (b.latitude - a.latitude) * 111320;
  return Math.hypot(dx, dy);
}

export function densifyPath(path: LngLat[], spacingMeters = 36): LngLat[] {
  if (path.length < 2) return path.slice();
  const points: LngLat[] = [{ ...path[0] }];
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const distance = Math.max(segmentLength(from, to), 1);
    const steps = Math.max(1, Math.round(distance / spacingMeters));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      points.push({
        longitude: from.longitude + (to.longitude - from.longitude) * t,
        latitude: from.latitude + (to.latitude - from.latitude) * t,
      });
    }
  }
  return points;
}

export function samplePath(path: LngLat[], t: number): { point: LngLat; heading: number } {
  const densified = path.length > 8 ? path : densifyPath(path, 30);
  const clamped = Math.min(Math.max(t, 0), 1);
  const index = Math.min(densified.length - 1, Math.round(clamped * (densified.length - 1)));
  const next = densified[Math.min(densified.length - 1, index + 1)];
  const prev = densified[Math.max(0, index - 1)];
  return { point: densified[index], heading: headingBetween(index === densified.length - 1 ? prev : densified[index], next) };
}

export function circlePolygon(center: LngLat, meters: number, sides = 18): LngLat[] {
  return Array.from({ length: sides }, (_, index) => {
    const rad = (index / sides) * Math.PI * 2;
    return metersToLngLat(center, Math.sin(rad) * meters, Math.cos(rad) * meters);
  });
}

export function corridorPolygon(path: LngLat[], meters: number): LngLat[] {
  const densified = densifyPath(path, 45);
  const left: LngLat[] = [];
  const right: LngLat[] = [];
  for (let index = 0; index < densified.length; index++) {
    const prev = densified[Math.max(0, index - 1)];
    const next = densified[Math.min(densified.length - 1, index + 1)];
    const heading = headingBetween(prev, next);
    const origin = densified[index];
    const east = Math.sin(toRad(heading));
    const north = Math.cos(toRad(heading));
    left.push(metersToLngLat(origin, -north * meters, east * meters));
    right.push(metersToLngLat(origin, north * meters, -east * meters));
  }
  return [...left, ...right.reverse()];
}

export function takeTrack(path: LngLat[], count = 56) {
  if (path.length <= count) return path.slice();
  const step = (path.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => path[Math.round(index * step)]);
}

function loadGenerated(): Generated {
  const here = typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url));
  const file = resolve(here, 'hangzhou-geo.generated.json');
  if (!existsSync(file)) throw new Error('缺少 prisma/hangzhou-geo.generated.json，请先运行 npx tsx prisma/fetch-amap-geo.ts');
  return JSON.parse(readFileSync(file, 'utf8')) as Generated;
}

const generated = loadGenerated();

export const pois = {
  haichuangGate: generated.pois.haichuang,
  mengxiangTown: generated.pois.mengxiang,
  yunqiExpo: generated.pois.yunqiExpo,
  heshanJunction: generated.pois.heshan,
  xiashaNorth: generated.pois.xiasha,
  jinshaLake: generated.pois.jinsha,
  schoolGate: generated.pois.school,
  campusGate: generated.pois.campus,
};

export function routeForVehicle(index: number) {
  const packs = [generated.routes.yuhang, generated.routes.yunqi, generated.routes.xiasha];
  const pack = packs[index % 3];
  return pack[Math.floor(index / 3) % pack.length];
}

export const regionPolygons = generated.regions;
export const fencePolygons = generated.fences;
export const defaultRegionDraft = regionPolygons[0].slice(0, 8);
