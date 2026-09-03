import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const orgs = await prisma.organization.findMany({
    where: { name: { contains: '验收' } },
    select: { id: true, name: true, parentId: true, _count: { select: { vehicles: true, enterprises: true } } },
  });
  console.log(JSON.stringify(orgs, null, 2));
  await prisma.$disconnect();
}
main().catch(console.error);
