/**
 * 用高德驾车路径把订单轨迹、车辆位置落到真实路网。
 */
import { PrismaClient } from '@prisma/client';
import { downsampleTrack, drivingRoute, searchPoi, type LngLat } from './amap-web';

const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAIR_CACHE = new Map<string, { start: LngLat & { name: string; address: string }; end: LngLat & { name: string; address: string }; points: LngLat[] }>();

async function resolvePair(startName: string, endName: string) {
  const key = `${startName}|${endName}`;
  const hit = PAIR_CACHE.get(key);
  if (hit) return hit;
  const start = await searchPoi(startName, '杭州');
  await sleep(220);
  const end = await searchPoi(endName, '杭州');
  await sleep(220);
  const route = await drivingRoute(start, end);
  await sleep(220);
  const packed = { start, end, points: downsampleTrack(route.points, 180) };
  PAIR_CACHE.set(key, packed);
  return packed;
}

async function main() {
  const orders = await prisma.$queryRaw<Array<{
    id: string; vehicleId: string; startName: string; endName: string; progressPct: number; businessNo: string;
  }>>`
    SELECT id, vehicleId, startName, endName, progressPct, businessNo
    FROM DeliveryOrder WHERE status IN ('DISPATCHED', 'IN_TRANSIT')
  `;
  console.log(`待修复订单 ${orders.length} 条`);

  let ok = 0;
  for (const order of orders) {
    try {
      const pair = await resolvePair(order.startName, order.endName);
      const progress = Math.min(0.92, Math.max(0.08, (order.progressPct || 30) / 100));
      const idx = Math.min(pair.points.length - 1, Math.floor(progress * (pair.points.length - 1)));
      const here = pair.points[idx];

      await prisma.$executeRaw`
        UPDATE DeliveryOrder
        SET startLng = ${pair.start.longitude}, startLat = ${pair.start.latitude},
            startAddress = ${pair.start.address || order.startName},
            endLng = ${pair.end.longitude}, endLat = ${pair.end.latitude},
            endAddress = ${pair.end.address || order.endName}
        WHERE id = ${order.id}
      `;

      const record = await prisma.operationRecord.findFirst({
        where: { vehicleId: order.vehicleId, status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
      if (record) {
        await prisma.vehicleTrackPoint.deleteMany({ where: { operationRecordId: record.id } });
        const startedAt = new Date(Date.now() - 26 * 60_000);
        await prisma.vehicleTrackPoint.createMany({
          data: pair.points.map((point, sequence) => ({
            operationRecordId: record.id,
            vehicleId: order.vehicleId,
            sequence: sequence + 1,
            longitude: point.longitude,
            latitude: point.latitude,
            speed: 10 + (sequence % 8),
            battery: Math.max(25, 88 - Math.floor(sequence / 8)),
            heading: 0,
            autonomousState: 'AUTO',
            pointType: sequence === 0 ? 'START' : sequence === pair.points.length - 1 ? 'END' : 'NORMAL',
            recordedAt: new Date(startedAt.getTime() + sequence * 18_000),
          })),
        });
      }

      await prisma.vehicleRealtimeStatus.update({
        where: { vehicleId: order.vehicleId },
        data: {
          longitude: here.longitude,
          latitude: here.latitude,
          drivingState: 'RUNNING',
          speed: 12,
        },
      });
      await prisma.vehicle.update({
        where: { id: order.vehicleId },
        data: { onlineStatus: 'ONLINE' },
      });
      ok += 1;
      console.log(`✓ ${order.businessNo} ${order.startName} → ${order.endName} 点数 ${pair.points.length}`);
    } catch (error) {
      console.log(`× ${order.businessNo}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 无订单车辆：落到已有真实路网轨迹点上
  const idle = await prisma.vehicle.findMany({
    where: { deletedAt: null, id: { notIn: orders.map((o) => o.vehicleId) } },
    include: { realtimeStatus: true },
  });
  const pool = [...PAIR_CACHE.values()].flatMap((item) => item.points);
  if (pool.length) {
    for (const [index, vehicle] of idle.entries()) {
      if (!vehicle.realtimeStatus) continue;
      const point = pool[index % pool.length];
      await prisma.vehicleRealtimeStatus.update({
        where: { vehicleId: vehicle.id },
        data: { longitude: point.longitude, latitude: point.latitude },
      });
    }
    console.log(`无订单车辆 ${idle.length} 辆已落到真实路网点`);
  }

  console.log(`完成：真实订单轨迹 ${ok}/${orders.length}`);
  await prisma.$disconnect();
}
main().catch((error) => { console.error(error); process.exit(1); });
