import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const regions = await prisma.operationRegion.findMany({
    select: { id: true, name: true, organizationId: true, enterpriseId: true, polygonJson: true, status: true },
  });
  console.log(`共 ${regions.length} 条运行区域`);
  for (const r of regions) {
    const polygon = r.polygonJson ? JSON.parse(r.polygonJson) : null;
    console.log(`- ${r.name} | status:${r.status} | 顶点数:${polygon?.length ?? 0} | org:${r.organizationId?.slice(0,8)} | ent:${r.enterpriseId?.slice(0,8) ?? '无'}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
