/**
 * 将"杭州市交通运输局"直接管辖的车辆，重新分配给其所属企业对应的区级运输局。
 * 运输局（Organization）只是监管归属，不"拥有"车辆，车辆归属随企业走。
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 找到杭州市交通运输局
  const cityOrg = await prisma.organization.findFirst({ where: { parentId: null }, select: { id: true, name: true } });
  if (!cityOrg) { console.log('未找到市级组织'); return; }
  console.log('市级组织:', cityOrg.name, cityOrg.id);

  // 找到所有直接归属市级的车辆
  const cityVehicles = await prisma.vehicle.findMany({
    where: { organizationId: cityOrg.id },
    select: { id: true, businessNo: true, enterprise: { select: { id: true, name: true, organizationId: true } } },
  });
  console.log(`市级直属车辆数: ${cityVehicles.length}`);

  if (cityVehicles.length === 0) { console.log('无需修复'); return; }

  // 按企业的 organizationId 重新分配
  let fixed = 0;
  for (const v of cityVehicles) {
    const targetOrgId = v.enterprise.organizationId;
    if (targetOrgId === cityOrg.id) {
      // 企业本身也是市级的，找一个区级组织兜底（余杭区）
      const fallback = await prisma.organization.findFirst({ where: { parentId: cityOrg.id }, select: { id: true, name: true } });
      if (!fallback) continue;
      await prisma.vehicle.update({ where: { id: v.id }, data: { organizationId: fallback.id } });
      console.log(`  ${v.businessNo} -> ${fallback.name}（企业 ${v.enterprise.name} 也归市级，兜底到 ${fallback.name}）`);
    } else {
      await prisma.vehicle.update({ where: { id: v.id }, data: { organizationId: targetOrgId } });
      fixed++;
    }
  }
  console.log(`修复完成，共更新 ${fixed} 辆（未更改企业归属，只修正监管局归属）`);

  // 验证
  const remaining = await prisma.vehicle.count({ where: { organizationId: cityOrg.id } });
  console.log(`修复后市级直属车辆数: ${remaining}`);

  await prisma.$disconnect();
}
main().catch(console.error);
