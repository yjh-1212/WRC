/**
 * 为所有运行中车辆补高德驾车路网轨迹与在途订单。
 * 折线只保留驾车 API 返回的路网点，避免直线插值穿建筑/水面。
 */
import { PrismaClient } from '@prisma/client';
import { amapGet, drivingRoute, headingDegrees, parseLngLat, thinAlongRoad, type LngLat } from './amap-web';

const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CARGO = ['快递包裹', '生鲜冷链', '办公文件', '医药耗材', '电商仓配'];
const QUERIES: Array<[string, string]> = [
  ['未来科技城', '余杭'], ['良渚街道', '余杭'], ['闲林街道', '余杭'],
  ['西溪湿地', '西湖'], ['黄龙体育中心', '西湖'], ['转塘街道', '西湖'],
  ['钱江新城', '上城'], ['湖滨银泰', '上城'], ['望江门', '上城'],
  ['拱宸桥', '拱墅'], ['大关街道', '拱墅'], ['半山公园', '拱墅'],
  ['网易大厦', '滨江'], ['西兴街道', '滨江'], ['滨康路', '滨江'],
  ['湘湖', '萧山'], ['萧山国际机场', '萧山'], ['市心中路', '萧山'],
];

type Spot = LngLat & { name: string; address: string; city: string };

function distM(a: LngLat, b: LngLat) {
  const dx = (a.longitude - b.longitude) * 85200;
  const dy = (a.latitude - b.latitude) * 111320;
  return Math.hypot(dx, dy);
}

function id() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function cityOf(orgName: string) {
  if (orgName.includes('余杭')) return '余杭';
  if (orgName.includes('西湖')) return '西湖';
  if (orgName.includes('上城')) return '上城';
  if (orgName.includes('拱墅')) return '拱墅';
  if (orgName.includes('滨江')) return '滨江';
  if (orgName.includes('萧山')) return '萧山';
  if (orgName.includes('临平')) return '临平';
  if (orgName.includes('钱塘')) return '钱塘';
  return '杭州';
}

async function searchMany(keywords: string, city: string): Promise<Spot[]> {
  const data = await amapGet('/v3/place/text', { keywords, city, citylimit: 'true', offset: 20, page: 1 });
  const pois = (data.pois ?? []) as Array<{ name?: string; address?: string; location?: string; type?: string }>;
  return pois.flatMap((poi) => {
    if (!poi.location || /地铁站|公交站|出入口|停车场|湿地|湘湖|观鸟|沙滩|码头/.test(`${poi.name}${poi.type}`)) return [];
    const point = parseLngLat(poi.location);
    if (!point) return [];
    return [{ name: String(poi.name || keywords), address: String(poi.address || ''), city, ...point }];
  });
}

function pickDest(origin: LngLat, spots: Spot[], preferCity: string, salt: number) {
  const same = spots.filter((item) => item.city === preferCity);
  const pool = same.length >= 6 ? same : spots;
  const ranked = pool
    .map((item) => ({ item, d: distM(origin, item) }))
    .filter((row) => row.d >= 250 && row.d <= 18000)
    .sort((a, b) => a.d - b.d);
  if (ranked.length) return ranked[salt % ranked.length].item;
  return pool.find((item) => distM(origin, item) >= 200) ?? pool[salt % pool.length];
}

function withHeadings(points: LngLat[]) {
  return points.map((point, index) => {
    const next = points[Math.min(points.length - 1, index + 1)];
    const prev = points[Math.max(0, index - 1)];
    return { ...point, heading: headingDegrees(index === points.length - 1 ? prev : point, next) };
  });
}

async function main() {
  const pool: Spot[] = [];
  for (const [keywords, city] of QUERIES) {
    try {
      pool.push(...await searchMany(keywords, city));
      console.log(`POI ${city}/${keywords}: ${pool.length}`);
    } catch (error) {
      console.log(`跳过 ${keywords}: ${error instanceof Error ? error.message : error}`);
    }
    await sleep(160);
  }
  if (pool.length < 30) throw new Error('真实 POI 太少，无法规划运行轨迹');

  const vehicles = await prisma.vehicle.findMany({
    where: { deletedAt: null },
    include: { realtimeStatus: true, organization: { select: { name: true } } },
    orderBy: { businessNo: 'asc' },
  });
  const orders = await prisma.$queryRaw<Array<{
    id: string; vehicleId: string; businessNo: string; startName: string; endName: string; progressPct: number;
  }>>`
    SELECT id, vehicleId, businessNo, startName, endName, progressPct
    FROM DeliveryOrder WHERE status IN ('DISPATCHED', 'IN_TRANSIT')
  `;
  const orderByVehicle = new Map(orders.map((item) => [item.vehicleId, item]));
  const only = new Set(process.argv.slice(2).filter((item) => item.startsWith('VEH-')));
  const targets = vehicles.filter((vehicle) => {
    if (only.size && !only.has(vehicle.businessNo)) return false;
    return vehicle.realtimeStatus?.drivingState === 'RUNNING' || orderByVehicle.has(vehicle.id);
  });
  console.log(`待铺路网轨迹 ${targets.length} 辆`);

  let ok = 0;
  let fail = 0;
  for (const [index, vehicle] of targets.entries()) {
    const status = vehicle.realtimeStatus;
    if (!status) continue;
    let origin: LngLat = { longitude: status.longitude, latitude: status.latitude };
    const preferCity = cityOf(vehicle.organization.name);
    const sameCity = pool.filter((item) => item.city === preferCity);
    const nearestSame = sameCity.length
      ? sameCity.reduce((best, item) => (distM(origin, item) < distM(origin, best) ? item : best))
      : null;
    if (nearestSame && distM(origin, nearestSame) > 3500) {
      origin = { longitude: nearestSame.longitude, latitude: nearestSame.latitude };
    }
    let route: { distance: number; duration: number; points: LngLat[] } | null = null;
    let dest: Spot | null = null;
    for (let attempt = 0; attempt < 8 && !route; attempt += 1) {
      const candidate = pickDest(origin, pool, preferCity, index * 5 + attempt * 13);
      if (!candidate || distM(origin, candidate) < 400) continue;
      try {
        const planned = await drivingRoute(origin, candidate);
        if (planned.points.length >= 8 && planned.distance <= 20000) {
          route = planned;
          dest = candidate;
        }
      } catch (error) {
        console.log(`路线失败 ${vehicle.businessNo} → ${candidate.name}: ${error instanceof Error ? error.message : error}`);
      }
      await sleep(180);
    }
    if (!route || !dest || route.points.length < 8) {
      fail += 1;
      continue;
    }

    const points = withHeadings(thinAlongRoad(route.points, 22, 320));
    const progress = Math.min(0.82, Math.max(0.12, ((orderByVehicle.get(vehicle.id)?.progressPct || 30) + index * 3) % 80 / 100));
    const hereIdx = Math.min(points.length - 2, Math.max(1, Math.floor(progress * (points.length - 1))));
    const here = points[hereIdx];
    const start = points[0];
    const end = points[points.length - 1];
    const now = new Date();
    const startedAt = new Date(now.getTime() - Math.round(route.duration * 0.35) * 1000);
    const existing = orderByVehicle.get(vehicle.id);
    const businessNo = existing?.businessNo ?? `ORD-${vehicle.businessNo}`;
    const startName = `${preferCity}发运点`;
    const endName = dest.name;
    const startAddress = `当前位置（${vehicle.businessNo}）`;
    const endAddress = dest.address || dest.name;

    if (existing) {
      await prisma.$executeRaw`
        UPDATE DeliveryOrder
        SET startName = ${startName}, startAddress = ${startAddress},
            startLng = ${start.longitude}, startLat = ${start.latitude},
            endName = ${endName}, endAddress = ${endAddress},
            endLng = ${end.longitude}, endLat = ${end.latitude},
            progressPct = ${Math.round(progress * 100)},
            etaMinutes = ${Math.max(6, Math.round(route.duration * (1 - progress) / 60))},
            updatedAt = ${now}
        WHERE id = ${existing.id}
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO DeliveryOrder (
          id, businessNo, vehicleId, enterpriseId, organizationId, status, cargoType, cargoWeight,
          startName, startAddress, startLng, startLat, endName, endAddress, endLng, endLat,
          progressPct, etaMinutes, dispatchedAt, startedAt, createdAt, updatedAt
        ) VALUES (
          ${id()}, ${businessNo}, ${vehicle.id}, ${vehicle.enterpriseId}, ${vehicle.organizationId},
          'IN_TRANSIT', ${CARGO[index % CARGO.length]}, ${18 + (index % 9) * 4.5},
          ${startName}, ${startAddress}, ${start.longitude}, ${start.latitude},
          ${endName}, ${endAddress}, ${end.longitude}, ${end.latitude},
          ${Math.round(progress * 100)}, ${Math.max(6, Math.round(route.duration * (1 - progress) / 60))},
          ${new Date(startedAt.getTime() - 8 * 60_000)}, ${startedAt}, ${now}, ${now}
        )
      `;
    }

    let record = await prisma.operationRecord.findFirst({
      where: { vehicleId: vehicle.id, status: 'RUNNING' },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (!record) {
      record = await prisma.operationRecord.create({
        data: {
          businessNo: `RUN-${vehicle.businessNo}-${Date.now().toString(36)}`,
          vehicleId: vehicle.id,
          enterpriseId: vehicle.enterpriseId,
          organizationId: vehicle.organizationId,
          startedAt,
          startAddress,
          endAddress,
          mileage: Number((route.distance / 1000).toFixed(2)),
          durationMinutes: Math.max(8, Math.round(route.duration / 60)),
          avgSpeed: 16,
          maxSpeed: 28,
          energyUsed: 2.4,
          status: 'RUNNING',
          autonomousMiles: Number((route.distance / 1000).toFixed(2)),
        },
        select: { id: true },
      });
    } else {
      await prisma.operationRecord.update({
        where: { id: record.id },
        data: { startAddress, endAddress, mileage: Number((route.distance / 1000).toFixed(2)), startedAt },
      });
    }

    await prisma.vehicleTrackPoint.deleteMany({ where: { operationRecordId: record.id } });
    await prisma.vehicleTrackPoint.createMany({
      data: points.map((point, sequence) => ({
        operationRecordId: record.id,
        vehicleId: vehicle.id,
        sequence: sequence + 1,
        longitude: point.longitude,
        latitude: point.latitude,
        speed: 9 + (sequence % 10),
        battery: Math.max(22, (status.battery ?? 80) - Math.floor(sequence / 10)),
        heading: point.heading,
        autonomousState: 'AUTO',
        pointType: sequence === 0 ? 'START' : sequence === points.length - 1 ? 'END' : 'NORMAL',
        recordedAt: new Date(startedAt.getTime() + sequence * 12_000),
      })),
    });

    await prisma.vehicleRealtimeStatus.update({
      where: { vehicleId: vehicle.id },
      data: {
        longitude: here.longitude,
        latitude: here.latitude,
        heading: here.heading,
        drivingState: 'RUNNING',
        speed: 12 + (index % 8),
        locationTime: now,
        heartbeatAt: now,
      },
    });
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { onlineStatus: 'ONLINE' },
    });
    ok += 1;
    console.log(`✓ ${vehicle.businessNo} ${startName} → ${endName} 点数 ${points.length} 航向 ${here.heading.toFixed(0)}`);
  }

  console.log(`完成：路网轨迹 ${ok}/${targets.length}，失败 ${fail}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  void prisma.$disconnect();
  process.exit(1);
});
