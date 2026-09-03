/**
 * 为运行中的车辆补配送订单 + 起终点轨迹（不删除已有数据）
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CARGO = ['快递包裹', '生鲜冷链', '办公文件', '医药耗材', '电商仓配'];
const STARTS = [
  { name: '海创园配送站', address: '杭州市余杭区海创园' },
  { name: '云栖小镇仓', address: '杭州市西湖区云栖小镇' },
  { name: '钱江新城网点', address: '杭州市上城区钱江新城' },
  { name: '滨江高新仓', address: '杭州市滨江区江南大道' },
  { name: '萧山机场转运站', address: '杭州市萧山区机场路' },
];
const ENDS = [
  { name: '梦想小镇驿站', address: '杭州市余杭区梦想小镇' },
  { name: '西溪湿地园区', address: '杭州市西湖区西溪湿地' },
  { name: '城西科创点', address: '杭州市西湖区紫金港' },
  { name: '网易园区收货点', address: '杭州市滨江区网商路' },
  { name: '萧山开发区客户点', address: '杭州市萧山区经济技术开发区' },
];

function makeTrack(lng: number, lat: number, steps = 36) {
  const points: Array<{ longitude: number; latitude: number }> = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    points.push({
      longitude: lng + t * 0.0068 + Math.sin(t * Math.PI * 2) * 0.00035,
      latitude: lat + t * 0.0024 + Math.cos(t * Math.PI * 1.5) * 0.00022,
    });
  }
  return points;
}

function id() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function main() {
  const vehicles = await prisma.vehicle.findMany({
    where: { deletedAt: null },
    include: { realtimeStatus: true },
    take: 80,
  });
  const running = vehicles.filter((v) => v.realtimeStatus?.drivingState === 'RUNNING');
  const targets = running.length ? running : vehicles.filter((v) => v.onlineStatus === 'ONLINE').slice(0, 12);
  let created = 0;

  for (const [index, vehicle] of targets.entries()) {
    const exist = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM DeliveryOrder WHERE vehicleId = ${vehicle.id} AND status IN ('DISPATCHED', 'IN_TRANSIT') LIMIT 1
    `;
    if (exist.length) continue;

    const lng = vehicle.realtimeStatus?.longitude ?? 120.15;
    const lat = vehicle.realtimeStatus?.latitude ?? 30.28;
    const track = makeTrack(lng, lat);
    const start = STARTS[index % STARTS.length];
    const end = ENDS[index % ENDS.length];
    const startPt = track[0];
    const endPt = track[track.length - 1];
    const now = new Date();
    const startedAt = new Date(now.getTime() - 26 * 60_000);
    const dispatchedAt = new Date(startedAt.getTime() - 8 * 60_000);
    const businessNo = `ORD-2026-${String(index + 1).padStart(4, '0')}-${vehicle.businessNo.slice(-3)}`;

    await prisma.$executeRaw`
      INSERT INTO DeliveryOrder (
        id, businessNo, vehicleId, enterpriseId, organizationId, status, cargoType, cargoWeight,
        startName, startAddress, startLng, startLat, endName, endAddress, endLng, endLat,
        progressPct, etaMinutes, dispatchedAt, startedAt, createdAt, updatedAt
      ) VALUES (
        ${id()}, ${businessNo}, ${vehicle.id}, ${vehicle.enterpriseId}, ${vehicle.organizationId},
        'IN_TRANSIT', ${CARGO[index % CARGO.length]}, ${18 + (index % 9) * 4.5},
        ${start.name}, ${start.address}, ${startPt.longitude}, ${startPt.latitude},
        ${end.name}, ${end.address}, ${endPt.longitude}, ${endPt.latitude},
        ${28 + (index * 7) % 52}, ${12 + (index % 18)},
        ${dispatchedAt}, ${startedAt}, ${now}, ${now}
      )
    `;

    const record = await prisma.operationRecord.create({
      data: {
        businessNo: `RUN-ORD-${Date.now()}-${index}`,
        vehicleId: vehicle.id,
        enterpriseId: vehicle.enterpriseId,
        organizationId: vehicle.organizationId,
        startedAt,
        startAddress: start.address,
        endAddress: end.address,
        mileage: 3.2 + (index % 6) * 0.4,
        durationMinutes: 26,
        avgSpeed: 14,
        maxSpeed: 22,
        energyUsed: 2.1,
        status: 'RUNNING',
        autonomousMiles: 3.0,
      },
    });
    await prisma.vehicleTrackPoint.createMany({
      data: track.map((point, sequence) => ({
        operationRecordId: record.id,
        vehicleId: vehicle.id,
        sequence: sequence + 1,
        longitude: point.longitude,
        latitude: point.latitude,
        speed: 8 + (sequence % 9),
        battery: Math.max(20, (vehicle.realtimeStatus?.battery ?? 70) - Math.floor(sequence / 6)),
        heading: 90,
        autonomousState: 'AUTO',
        pointType: sequence === 0 ? 'START' : sequence === track.length - 1 ? 'END' : 'NORMAL',
        recordedAt: new Date(startedAt.getTime() + sequence * 40_000),
      })),
    });
    created += 1;
  }

  console.log(`已为 ${created} 辆车创建配送订单与轨迹`);
  await prisma.$disconnect();
}
main().catch((error) => { console.error(error); process.exit(1); });
