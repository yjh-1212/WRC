/**
 * 修正企业的监管归属：
 * - 西湖无人配送有限公司 → 西湖区交通运输局
 * - 钱塘末端物流科技有限公司 → 西湖区交通运输局（暂无钱塘区，归入西湖区）
 * - 杭城智运科技有限公司 → 余杭区交通运输局（同样挂在市级）
 * 同时将这些企业下的车辆监管归属一并更新。
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const cityOrg = await prisma.organization.findFirst({ where: { parentId: null }, select: { id: true, name: true } });
  if (!cityOrg) return;

  // 找区级组织
  const districts = await prisma.organization.findMany({
    where: { parentId: cityOrg.id },
    select: { id: true, name: true },
  });
  console.log('区级组织:', districts.map(d => d.name).join(', '));

  const getDistrict = (name: string) => districts.find(d => d.name.includes(name))?.id;
  const xihuid = getDistrict('西湖');
  const yuhangg = getDistrict('余杭');

  if (!xihuid || !yuhangg) { console.log('未找到西湖区或余杭区'); return; }

  // 企业修正映射
  const fixes: Array<{ nameContains: string; targetOrgId: string; targetOrgName: string }> = [
    { nameContains: '西湖无人配送', targetOrgId: xihuid, targetOrgName: '西湖区' },
    { nameContains: '钱塘末端物流', targetOrgId: xihuid, targetOrgName: '西湖区（钱塘区兜底）' },
    { nameContains: '杭城智运', targetOrgId: yuhangg, targetOrgName: '余杭区' },
  ];

  for (const fix of fixes) {
    const ents = await prisma.enterprise.findMany({
      where: { name: { contains: fix.nameContains }, organizationId: cityOrg.id },
      select: { id: true, name: true },
    });
    for (const ent of ents) {
      await prisma.enterprise.update({ where: { id: ent.id }, data: { organizationId: fix.targetOrgId } });
      // 同步更新该企业下的车辆监管归属
      const updated = await prisma.vehicle.updateMany({
        where: { enterpriseId: ent.id },
        data: { organizationId: fix.targetOrgId },
      });
      console.log(`企业 [${ent.name}] 迁移到 ${fix.targetOrgName}，车辆同步更新 ${updated.count} 辆`);
    }
  }

  // 验证
  const remaining = await prisma.vehicle.count({ where: { organizationId: cityOrg.id } });
  const entRemaining = await prisma.enterprise.count({ where: { organizationId: cityOrg.id } });
  console.log(`\n修复后：市级直属车辆 ${remaining} 辆，市级直属企业 ${entRemaining} 个`);

  await prisma.$disconnect();
}
main().catch(console.error);
