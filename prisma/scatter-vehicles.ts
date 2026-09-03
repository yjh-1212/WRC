/**
 * 把车辆从少数几条路径上打散到杭州各区真实 POI / 路网点。
 */
import { PrismaClient } from '@prisma/client';
import { amapGet, drivingRoute, parseLngLat, type LngLat } from './amap-web';

const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QUERIES = [
  ['未来科技城', '余杭'], ['良渚街道', '余杭'], ['闲林街道', '余杭'],
  ['西溪湿地', '西湖'], ['黄龙体育中心', '西湖'], ['转塘街道', '西湖'],
  ['钱江新城', '上城'], ['湖滨银泰', '上城'], ['望江门', '上城'],
  ['拱宸桥', '拱墅'], ['大关街道', '拱墅'], ['半山国家森林公园', '拱墅'],
  ['网易大厦', '滨江'], ['西兴街道', '滨江'], ['滨康路', '滨江'],
  ['湘湖', '萧山'], ['萧山国际机场', '萧山'], ['市心中路', '萧山'],
];

function distM(a: LngLat, b: LngLat) {
  const dx = (a.longitude - b.longitude) * 85200;
  const dy = (a.latitude - b.latitude) * 111320;
  return Math.hypot(dx, dy);
}

async function searchMany(keywords: string, city: string) {
  const data = await amapGet('/v3/place/text', { keywords, city, citylimit: 'true', offset: 25, page: 1 });
  const pois = (data.pois ?? []) as Array<{ name?: string; address?: string; location?: string; type?: string }>;
  return pois.flatMap((poi) => {
    if (!poi.location || /地铁站|公交站|出入口/.test(`${poi.name}${poi.type}`)) return [];
    const point = parseLngLat(poi.location);
    if (!point) return [];
    return [{ name: String(poi.name || keywords), address: String(poi.address || ''), ...point }];
  });
}

function thin(points: LngLat[], minMeters: number) {
  const kept: LngLat[] = [];
  for (const point of points) {
    if (kept.every((item) => distM(item, point) >= minMeters)) kept.push(point);
  }
  return kept;
}

async function main() {
  const pool: Array<LngLat & { name: string; address: string }> = [];
  for (const [keywords, city] of QUERIES) {
    try {
      const found = await searchMany(keywords, city);
      pool.push(...found);
      console.log(`POI ${city}/${keywords}: ${found.length}`);
    } catch (error) {
      console.log(`跳过 ${keywords}: ${error instanceof Error ? error.message : error}`);
    }
    await sleep(180);
  }

  const spots = thin(pool, 220);
  console.log(`可用分散点 ${spots.length}`);
  if (spots.length < 40) throw new Error('真实 POI 太少，无法打散');

  const vehicles = await prisma.vehicle.findMany({
    where: { deletedAt: null },
    include: { realtimeStatus: true },
    orderBy: { businessNo: 'asc' },
  });
  const orders = await prisma.$queryRaw<Array<{ id: string; vehicleId: string }>>`
    SELECT id, vehicleId FROM DeliveryOrder WHERE status IN ('DISPATCHED', 'IN_TRANSIT')
  `;
  const orderIds = new Set(orders.map((item) => item.vehicleId));

  // 无订单车辆：一车一个 POI
  const idle = vehicles.filter((v) => !orderIds.has(v.id) && v.realtimeStatus);
  for (const [index, vehicle] of idle.entries()) {
    const spot = spots[index % spots.length];
    await prisma.vehicleRealtimeStatus.update({
      where: { vehicleId: vehicle.id },
      data: { longitude: spot.longitude, latitude: spot.latitude },
    });
  }
  console.log(`未在运车辆 ${idle.length} 已分散到真实 POI`);

  // 有订单车辆：每单走不同起终点，避免挤在同一条路上
  const running = vehicles.filter((v) => orderIds.has(v.id) && v.realtimeStatus);
  for (const [index, vehicle] of running.entries()) {
    const start = spots[(index * 9) % spots.length];
    const end = spots[(index * 9 + 96) % spots.length];
    if (distM(start, end) < 800) continue;
    try {
      const route = await drivingRoute(start, end);
      await sleep(220);
      const points = thin(route.points, 40);
      if (points.length < 8) continue;
      const here = points[Math.floor(points.length * 0.35)];
      await prisma.vehicleRealtimeStatus.update({
        where: { vehicleId: vehicle.id },
        data: { longitude: here.longitude, latitude: here.latitude, drivingState: 'RUNNING' },
      });
      const order = orders.find((item) => item.vehicleId === vehicle.id);
      if (order) {
        await prisma.$executeRaw`
          UPDATE DeliveryOrder
          SET startName = ${start.name}, startAddress = ${start.address || start.name},
              startLng = ${start.longitude}, startLat = ${start.latitude},
              endName = ${end.name}, endAddress = ${end.address || end.name},
              endLng = ${end.longitude}, endLat = ${end.latitude}
          WHERE id = ${order.id}
        `;
      }
      const record = await prisma.operationRecord.findFirst({
        where: { vehicleId: vehicle.id, status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
      if (record) {
        await prisma.vehicleTrackPoint.deleteMany({ where: { operationRecordId: record.id } });
        const startedAt = new Date(Date.now() - 20 * 60_000);
        await prisma.vehicleTrackPoint.createMany({
          data: points.map((point, sequence) => ({
            operationRecordId: record.id,
            vehicleId: vehicle.id,
            sequence: sequence + 1,
            longitude: point.longitude,
            latitude: point.latitude,
            speed: 10 + (sequence % 8),
            battery: Math.max(22, 86 - Math.floor(sequence / 8)),
            heading: 0,
            autonomousState: 'AUTO',
            pointType: sequence === 0 ? 'START' : 'NORMAL',
            recordedAt: new Date(startedAt.getTime() + sequence * 16_000),
          })),
        });
      }
      console.log(`在运 ${vehicle.businessNo}: ${start.name} → ${end.name}`);
    } catch (error) {
      console.log(`路线失败 ${vehicle.businessNo}: ${error instanceof Error ? error.message : error}`);
    }
  }

  await prisma.$disconnect();
}
main().catch((error) => { console.error(error); process.exit(1); });
