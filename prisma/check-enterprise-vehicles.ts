import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 各企业车辆数
  const enterprises = await prisma.enterprise.findMany({
    select: { id: true, name: true, organizationId: true, _count: { select: { vehicles: true } } },
    orderBy: { name: 'asc' },
  });
  console.log('=== 企业及其车辆数 ===');
  for (const e of enterprises) {
    console.log(`${e.name} (org: ${e.organizationId.slice(0, 8)}): ${e._count.vehicles} 辆`);
  }

  // 没有企业的车辆数（enterpriseId 为空）
  const noEntCount = await prisma.vehicle.count({ where: { enterpriseId: '' } });
  console.log('\n无企业车辆数（enterpriseId 为空串）:', noEntCount);

  // 检查 enterpriseId 是否可以为 null
  const sample = await prisma.vehicle.findFirst({ select: { id: true, enterpriseId: true } });
  console.log('车辆 enterpriseId 示例:', sample?.enterpriseId);

  await prisma.$disconnect();
}
main().catch(console.error);
