/**
 * 为重点监管对象面板补充真实告警 + 违规种子数据
 * 安全运行：不删除已有数据，仅追加
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 取所有企业和车辆
  const enterprises = await prisma.enterprise.findMany({ select: { id: true, name: true, organizationId: true }, take: 12 });
  const vehicles = await prisma.vehicle.findMany({
    select: { id: true, businessNo: true, enterpriseId: true, organizationId: true },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });

  if (!enterprises.length || !vehicles.length) { console.log('无企业/车辆数据'); return; }

  // 直接追加，不删除已有数据

  const alertTypes = ['SPEEDING', 'GEOFENCE_EXIT', 'EMERGENCY_STOP', 'OBSTACLE_DETECTED', 'LOW_BATTERY', 'COMMUNICATION_LOSS'];
  const alertLevels = ['HIGH', 'MEDIUM', 'LOW', 'HIGH', 'MEDIUM', 'HIGH'];
  const violTypes = ['SPEEDING', 'ILLEGAL_STOP', 'ROUTE_DEVIATION', 'FATIGUE_DRIVING', 'OVERLOAD'];

  let alertCount = 0;
  let violCount = 0;

  // 每个企业 2-8 条告警
  const alertDist: Record<string, number> = {
    0: 8, 1: 6, 2: 5, 3: 4, 4: 4, 5: 3, 6: 3, 7: 2, 8: 2, 9: 2, 10: 1, 11: 1,
  };

  for (let ei = 0; ei < enterprises.length; ei++) {
    const ent = enterprises[ei];
    const cnt = alertDist[ei] ?? 1;
    const entVehicles = vehicles.filter(v => v.enterpriseId === ent.id);
    if (!entVehicles.length) continue;

    for (let i = 0; i < cnt; i++) {
      const veh = entVehicles[i % entVehicles.length];
      const typeIdx = (ei + i) % alertTypes.length;
      const hoursAgo = Math.floor(Math.random() * 24 * 3);
      await prisma.safetyAlert.create({
        data: {
          businessNo: `ALT-${Date.now()}-${ei}-${i}`,
          vehicleId: veh.id,
          enterpriseId: ent.id,
          organizationId: ent.organizationId,
          alertType: alertTypes[typeIdx],
          source: 'VEHICLE_SYSTEM',
          level: alertLevels[typeIdx],
          title: `${alertTypes[typeIdx]} 告警`,
          status: i < 2 ? 'PENDING_CONFIRMATION' : (i < 4 ? 'PROCESSING' : 'CLOSED'),
          description: `${ent.name} 车辆 ${veh.businessNo} 触发 ${alertTypes[typeIdx]}`,
          occurredAt: new Date(Date.now() - hoursAgo * 3600_000),
        },
      });
      alertCount++;
    }

    // 每个企业 0-3 条违规
    const violCnt = Math.max(0, Math.floor((8 - ei) / 3));
    for (let i = 0; i < violCnt; i++) {
      const veh = entVehicles[i % entVehicles.length];
      await prisma.violation.create({
        data: {
          businessNo: `VIO-${Date.now()}-${ei}-${i}`,
          vehicleId: veh.id,
          enterpriseId: ent.id,
          organizationId: ent.organizationId,
          violationType: violTypes[i % violTypes.length],
          level: i === 0 ? 'HIGH' : 'MEDIUM',
          title: `${violTypes[i % violTypes.length]} 违规`,
          description: `${ent.name} 车辆 ${veh.businessNo} 发生 ${violTypes[i % violTypes.length]} 违规`,
          occurredAt: new Date(Date.now() - (i + 1) * 12 * 3600_000),
          status: 'UNHANDLED',
        },
      });
      violCount++;
    }
  }

  console.log(`补充完成：SafetyAlert ${alertCount} 条，Violation ${violCount} 条`);
  await prisma.$disconnect();
}
main().catch(console.error);
