import { PrismaService } from '../prisma/prisma.service';
/** Callers must first resolve the vehicle inside their authorized scope. */
export async function currentVehicleTrack(prisma: PrismaService, vehicleId: string) {
  const record = await prisma.operationRecord.findFirst({
    where: { vehicleId, endedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED', 'CANCELED'] } }, orderBy: { startedAt: 'desc' },
    select: { id: true, startedAt: true, startAddress: true, endAddress: true, trackPoints: { orderBy: { sequence: 'desc' }, take: 1000, select: { longitude: true, latitude: true, speed: true, heading: true, recordedAt: true } } },
  });
  return record ? { track: [...record.trackPoints].reverse(), trip: { id: record.id, startedAt: record.startedAt, startName: record.startAddress ?? '当前行程起点', endName: record.endAddress ?? '当前行程终点' } } : { track: [], trip: null };
}
