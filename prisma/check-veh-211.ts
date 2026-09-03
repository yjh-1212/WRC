import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const v = await prisma.vehicle.findFirst({
    where: { businessNo: 'VEH-2026-211' },
    include: {
      realtimeStatus: true,
      operationRecords: { orderBy: { startedAt: 'desc' }, take: 3, include: { _count: { select: { trackPoints: true } } } },
    },
  });
  console.log(JSON.stringify({
    id: v?.id, driving: v?.realtimeStatus?.drivingState, lng: v?.realtimeStatus?.longitude, lat: v?.realtimeStatus?.latitude,
    records: v?.operationRecords.map(r => ({ no: r.businessNo, status: r.status, pts: r._count.trackPoints })),
  }, null, 2));
  const orders = await prisma.$queryRaw`SELECT businessNo, status FROM DeliveryOrder WHERE vehicleId = ${v?.id ?? ''}`;
  console.log('orders', orders);
  const runningCount = await prisma.vehicleRealtimeStatus.count({ where: { drivingState: 'RUNNING' } });
  const orderCount = await prisma.$queryRaw`SELECT COUNT(*) as c FROM DeliveryOrder WHERE status IN ('DISPATCHED','IN_TRANSIT')`;
  console.log('RUNNING vehicles', runningCount, 'in-transit orders', orderCount);
  await prisma.$disconnect();
}
main().catch(console.error);
