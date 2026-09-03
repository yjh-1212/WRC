/**
 * 为各区补充 ACTIVE 运行区域，每区 1-2 个
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 各区中心坐标 + 偏移量生成矩形多边形
function makePolygon(lng: number, lat: number, dLng: number, dLat: number) {
  return JSON.stringify([
    { longitude: lng - dLng, latitude: lat - dLat },
    { longitude: lng + dLng, latitude: lat - dLat },
    { longitude: lng + dLng, latitude: lat + dLat },
    { longitude: lng - dLng, latitude: lat + dLat },
    { longitude: lng - dLng, latitude: lat - dLat }, // 闭合
  ]);
}

async function main() {
  // 取各区运输局
  const orgs = await prisma.organization.findMany({
    where: { parentId: { not: null } },
    select: { id: true, name: true },
  });
  // 取各区企业
  const enterprises = await prisma.enterprise.findMany({
    select: { id: true, name: true, organizationId: true },
  });

  const regionDefs: Array<{ orgName: string; name: string; lng: number; lat: number; dLng: number; dLat: number }> = [
    { orgName: '余杭区', name: '未来科技城核心运营区', lng: 120.027, lat: 30.421, dLng: 0.025, dLat: 0.015 },
    { orgName: '余杭区', name: '良渚新城末端配送区',    lng: 120.090, lat: 30.402, dLng: 0.018, dLat: 0.012 },
    { orgName: '西湖区', name: '西溪湿地园区配送区',    lng: 120.058, lat: 30.270, dLng: 0.020, dLat: 0.012 },
    { orgName: '西湖区', name: '紫金港科技城运营区',    lng: 120.082, lat: 30.295, dLng: 0.015, dLat: 0.010 },
    { orgName: '上城区', name: '钱江新城商务配送区',    lng: 120.200, lat: 30.238, dLng: 0.018, dLat: 0.012 },
    { orgName: '拱墅区', name: '运河新城末端运营区',    lng: 120.108, lat: 30.362, dLng: 0.020, dLat: 0.012 },
    { orgName: '滨江区', name: '高新技术园区配送区',    lng: 120.207, lat: 30.195, dLng: 0.022, dLat: 0.010 },
    { orgName: '滨江区', name: '网易互联网产业园区',    lng: 120.178, lat: 30.188, dLng: 0.015, dLat: 0.009 },
    { orgName: '萧山区', name: '萧山经济技术开发区运营区', lng: 120.318, lat: 30.178, dLng: 0.028, dLat: 0.015 },
    { orgName: '萧山区', name: '机场新城末端配送区',    lng: 120.417, lat: 30.231, dLng: 0.020, dLat: 0.012 },
  ];

  let count = 0;
  for (const def of regionDefs) {
    const org = orgs.find(o => o.name.includes(def.orgName));
    if (!org) { console.log(`未找到组织: ${def.orgName}`); continue; }
    const ent = enterprises.find(e => e.organizationId === org.id);

    // 检查是否已存在同名区域
    const existing = await prisma.operationRegion.findFirst({ where: { name: def.name } });
    if (existing) { console.log(`已存在跳过: ${def.name}`); continue; }

    await prisma.operationRegion.create({
      data: {
        businessNo: `REG-${Date.now()}-${count}`,
        name: def.name,
        organizationId: org.id,
        enterpriseId: ent?.id ?? null,
        polygonJson: makePolygon(def.lng, def.lat, def.dLng, def.dLat),
        regionType: 'DELIVERY',
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        validFrom: new Date('2026-01-01'),
        ruleDescription: `${def.orgName} ${def.name}`,
      },
    });
    count++;
    console.log(`已创建: ${def.name} (${def.orgName})`);
  }
  console.log(`\n共新增 ${count} 条运行区域`);
  await prisma.$disconnect();
}
main().catch(console.error);
