import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { circlePolygon, corridorPolygon, type LngLat } from './hangzhou-geo';
import { drivingRoute, regeoAoi, searchPoi } from './amap-web';

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function convexHull(points: LngLat[]): LngLat[] {
  const unique = [...new Map(points.map((item) => [`${item.longitude.toFixed(6)},${item.latitude.toFixed(6)}`, item])).values()];
  unique.sort((a, b) => a.longitude === b.longitude ? a.latitude - b.latitude : a.longitude - b.longitude);
  const cross = (o: LngLat, a: LngLat, b: LngLat) => (a.longitude - o.longitude) * (b.latitude - o.latitude) - (a.latitude - o.latitude) * (b.longitude - o.longitude);
  const lower: LngLat[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: LngLat[] = [];
  for (let index = unique.length - 1; index >= 0; index--) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function padRegion(path: LngLat[], meters = 380) {
  return convexHull(corridorPolygon(path, meters));
}

async function main() {
  console.log('正在用高德 Web 服务查询杭州 POI、沿路轨迹和 AOI 围栏…');
  const haichuang = await searchPoi('杭州海创园'); await sleep(220);
  const mengxiang = await searchPoi('梦想小镇'); await sleep(220);
  const campus = await searchPoi('杭州师范大学仓前校区'); await sleep(220);
  const school = await searchPoi('杭州师范大学附属仓前实验小学'); await sleep(220);
  const yunqi = await searchPoi('云栖小镇'); await sleep(220);
  const yunqiExpo = await searchPoi('云栖小镇国际会展中心'); await sleep(220);
  const heshan = await searchPoi('河山街'); await sleep(220);
  const xiasha = await searchPoi('下沙高教园区'); await sleep(220);
  const jinsha = await searchPoi('金沙湖公园'); await sleep(220);

  const yuhangA = await drivingRoute(haichuang, mengxiang); await sleep(220);
  const yuhangB = await drivingRoute(haichuang, campus); await sleep(220);
  const yuhangC = await drivingRoute(school, mengxiang); await sleep(220);
  const yunqiA = await drivingRoute(yunqiExpo, heshan); await sleep(220);
  const yunqiB = await drivingRoute(heshan, yunqi); await sleep(220);
  const yunqiC = await drivingRoute(yunqi, yunqiExpo); await sleep(220);
  const xiashaA = await drivingRoute(xiasha, jinsha); await sleep(220);
  const xiashaB = await drivingRoute(jinsha, xiasha); await sleep(220);
  const xiashaC = await drivingRoute(xiasha, jinsha, [ { longitude: (xiasha.longitude + jinsha.longitude) / 2, latitude: (xiasha.latitude + jinsha.latitude) / 2 } ]);

  const campusAoi = await regeoAoi(campus, '杭州师范大学'); await sleep(220);
  const schoolAoi = await regeoAoi(school, '小学'); await sleep(220);
  const expoAoi = await regeoAoi(yunqiExpo, '会展');

  const schoolPath = yuhangA.points.filter((_, index) => index % 8 === 0).slice(0, 12);
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'amap-web-service',
    pois: { haichuang, mengxiang, campus, school, yunqi, yunqiExpo, heshan, xiasha, jinsha },
    routes: {
      yuhang: [yuhangA.points, yuhangB.points, yuhangC.points],
      yunqi: [yunqiA.points, yunqiB.points, yunqiC.points],
      xiasha: [xiashaA.points, xiashaB.points, xiashaC.points],
    },
    fences: {
      campusNoEntry: campusAoi.polygon.length >= 3 ? campusAoi.polygon : circlePolygon(campus, 180),
      schoolSpeed: schoolAoi.polygon.length >= 3 ? schoolAoi.polygon : corridorPolygon(schoolPath.length >= 2 ? schoolPath : [school, haichuang], 70),
      yunqiExpo: expoAoi.polygon.length >= 3 ? expoAoi.polygon : circlePolygon(yunqiExpo, 130),
    },
    regions: [
      padRegion(yuhangA.points),
      padRegion(yunqiA.points.concat(yunqiC.points)),
      padRegion(xiashaA.points),
      padRegion([...yuhangA.points, ...yunqiA.points], 900),
    ],
    meta: {
      campusAoi: campusAoi.aoiName || campusAoi.address,
      schoolAoi: schoolAoi.aoiName || schoolAoi.address,
      expoAoi: expoAoi.aoiName || expoAoi.address,
      distances: { yuhang: yuhangA.distance, yunqi: yunqiA.distance, xiasha: xiashaA.distance },
    },
  };

  const file = resolve(import.meta.dirname ?? __dirname, 'hangzhou-geo.generated.json');
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`已写入 ${file}`);
  console.log(`POI：${haichuang.name} / ${mengxiang.name} / ${yunqiExpo.name} / ${jinsha.name}`);
  console.log(`轨迹点数：余杭 ${yuhangA.points.length}，云栖 ${yunqiA.points.length}，下沙 ${xiashaA.points.length}`);
  console.log(`围栏：校园 ${payload.fences.campusNoEntry.length} 点（${campusAoi.aoiName || '圆形回退'}），限速 ${payload.fences.schoolSpeed.length} 点，会展 ${payload.fences.yunqiExpo.length} 点`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
