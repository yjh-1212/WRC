import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const orgs = await p.organization.findMany({ include: { _count: { select: { vehicles: true, enterprises: true } } }, orderBy: { createdAt: 'asc' } });
  orgs.forEach(o => console.log(o.name, '\t车辆:', o._count.vehicles, '\t企业:', o._count.enterprises));
  const total = await p.vehicle.count();
  console.log('\n总车辆数:', total);
}
main().finally(() => p.$disconnect());
