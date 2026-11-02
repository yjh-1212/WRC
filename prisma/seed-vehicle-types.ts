import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const samples = [
  { businessNo: 'VEH-2026-348', vehicleType: 'SANITATION', operationScene: 'ROAD_SANITATION', name: '无人环卫车 348', upperEquipment: '滚刷与负压清扫装置' },
  { businessNo: 'VEH-2026-347', vehicleType: 'SANITATION', operationScene: 'ROAD_SANITATION', name: '无人环卫车 347', upperEquipment: '高压冲洗装置' },
  { businessNo: 'VEH-2026-346', vehicleType: 'SANITATION', operationScene: 'PARK_SANITATION', name: '无人环卫车 346', upperEquipment: '垃圾收集箱' },
  { businessNo: 'VEH-2026-345', vehicleType: 'SANITATION', operationScene: 'ROAD_SANITATION', name: '无人环卫车 345', upperEquipment: '滚刷与喷雾抑尘装置' },
  { businessNo: 'VEH-2026-344', vehicleType: 'PATROL', operationScene: 'PARK_PATROL', name: '无人巡逻车 344', upperEquipment: '全景摄像与喊话装置' },
  { businessNo: 'VEH-2026-343', vehicleType: 'PATROL', operationScene: 'ROAD_PATROL', name: '无人巡逻车 343', upperEquipment: '事件识别摄像机' },
  { businessNo: 'VEH-2026-342', vehicleType: 'PATROL', operationScene: 'PARK_PATROL', name: '无人巡逻车 342', upperEquipment: '热成像巡检装置' },
  { businessNo: 'VEH-2026-341', vehicleType: 'RETAIL', operationScene: 'MOBILE_RETAIL', name: '无人零售车 341', upperEquipment: '恒温零售货柜' },
  { businessNo: 'VEH-2026-340', vehicleType: 'RETAIL', operationScene: 'MOBILE_RETAIL', name: '无人零售车 340', upperEquipment: '智能零售货柜' },
  { businessNo: 'VEH-2026-339', vehicleType: 'RETAIL', operationScene: 'PARK_RETAIL', name: '无人零售车 339', upperEquipment: '冷藏零售货柜' },
  { businessNo: 'VEH-2026-338', vehicleType: 'SHUTTLE', operationScene: 'PARK_SHUTTLE', name: '无人接驳车 338', upperEquipment: '六座乘员舱' },
  { businessNo: 'VEH-2026-337', vehicleType: 'SHUTTLE', operationScene: 'SCENIC_SHUTTLE', name: '无人接驳车 337', upperEquipment: '景区八座乘员舱' },
  { businessNo: 'VEH-2026-336', vehicleType: 'SHUTTLE', operationScene: 'PARK_SHUTTLE', name: '无人接驳车 336', upperEquipment: '无障碍乘员舱' },
] as const;

async function main() {
  for (const sample of samples) {
    await prisma.vehicle.updateMany({
      where: { businessNo: sample.businessNo, deletedAt: null },
      data: sample,
    });
  }
  const totals = await prisma.vehicle.groupBy({
    by: ['vehicleType'],
    where: { deletedAt: null },
    _count: { _all: true },
    orderBy: { vehicleType: 'asc' },
  });
  console.log('车辆类型样例数据已更新：', totals.map((item) => `${item.vehicleType}=${item._count._all}`).join('，'));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
