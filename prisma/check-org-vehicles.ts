import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 找出所有组织直接关联的车辆（organization.vehicles）
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, _count: { select: { vehicles: true } } },
    orderBy: { name: 'asc' },
  });
  console.log('=== 各运输局直接挂载车辆数 ===');
  for (const o of orgs) {
    if (o._count.vehicles > 0) {
      console.log(`${o.name}: ${o._count.vehicles} 辆`);
    }
  }

  // 找出这些车的详情
  const vehicles = await prisma.vehicle.findMany({
    select: { id: true, name: true, businessNo: true, organization: { select: { name: true } }, enterprise: { select: { name: true } } },
    where: { organization: { isNot: null } },
    take: 20,
  });
  console.log('\n=== 车辆详情（前20条）===');
  for (const v of vehicles) {
    console.log(`${v.businessNo} | org: ${v.organization?.name} | enterprise: ${v.enterprise?.name ?? '无'}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
