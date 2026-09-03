import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const [alerts, violations, offline] = await Promise.all([
    prisma.safetyAlert.count(),
    prisma.violation.count(),
    prisma.offlineEvent.count(),
  ]);
  console.log('SafetyAlert:', alerts, '| Violation:', violations, '| OfflineEvent:', offline);

  // 按企业聚合告警数
  const alertsByEnt = await prisma.safetyAlert.groupBy({
    by: ['enterpriseId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5,
  });
  const entIds = alertsByEnt.map(r => r.enterpriseId).filter(Boolean) as string[];
  const ents = await prisma.enterprise.findMany({ where: { id: { in: entIds } }, select: { id: true, name: true } });
  const entMap = Object.fromEntries(ents.map(e => [e.id, e.name]));
  console.log('\n按企业告警 TOP5:');
  for (const r of alertsByEnt) {
    console.log(' ', entMap[r.enterpriseId ?? ''] ?? r.enterpriseId, ':', r._count.id, '条');
  }

  // 按车辆聚合违规
  const violByVeh = await prisma.violation.groupBy({
    by: ['vehicleId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5,
  });
  console.log('\n按车辆违规 TOP5:', violByVeh.map(r => `${r.vehicleId?.slice(0,8)}: ${r._count.id}`).join(', '));

  await prisma.$disconnect();
}
main().catch(console.error);
