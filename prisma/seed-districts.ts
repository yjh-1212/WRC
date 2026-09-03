/**
 * 追加杭州市各区数据种子
 * 不清空现有数据，只新增区级 Organization + 企业 + 车辆 + 实时状态
 * 运行：npx ts-node prisma/seed-districts.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 杭州各区中心坐标（GCJ-02）及车辆数量配置
const DISTRICTS = [
  { code: 'XHJT', name: '西湖区',  lng: 120.029, lat: 30.260, vehicleCount: 68, onlineRate: 0.85 },
  { code: 'SCJT', name: '上城区',  lng: 120.163, lat: 30.240, vehicleCount: 43, onlineRate: 0.88 },
  { code: 'GSJT', name: '拱墅区',  lng: 120.120, lat: 30.330, vehicleCount: 39, onlineRate: 0.82 },
  { code: 'BHJT', name: '滨江区',  lng: 120.211, lat: 30.207, vehicleCount: 71, onlineRate: 0.94 },
  { code: 'XSJT', name: '萧山区',  lng: 120.265, lat: 30.188, vehicleCount: 97, onlineRate: 0.90 },
];

// 每个区 2~3 家企业
const ENTERPRISE_TEMPLATES = [
  [
    { bizSuffix: 'A', namePrefix: '西湖绿道配送科技', legalRep: '吴仁达', contact: '苏洁', phone: '13800002001', addr: '杭州市西湖区转塘街道之江路', vehicleSlice: [0, 35] },
    { bizSuffix: 'B', namePrefix: '云栖末端智运',     legalRep: '方晓峰', contact: '林薇', phone: '13800002002', addr: '杭州市西湖区云栖小镇', vehicleSlice: [35, 68] },
  ],
  [
    { bizSuffix: 'A', namePrefix: '上城数字配送',     legalRep: '郑海涛', contact: '陈莉', phone: '13800003001', addr: '杭州市上城区钱江新城', vehicleSlice: [0, 43] },
  ],
  [
    { bizSuffix: 'A', namePrefix: '拱墅运河无人物流', legalRep: '周宇轩', contact: '张敏', phone: '13800004001', addr: '杭州市拱墅区运河天地', vehicleSlice: [0, 20] },
    { bizSuffix: 'B', namePrefix: '半山科创末端运营', legalRep: '赵凯',   contact: '李颖', phone: '13800004002', addr: '杭州市拱墅区半山工业区', vehicleSlice: [20, 39] },
  ],
  [
    { bizSuffix: 'A', namePrefix: '滨江高新配送科技', legalRep: '刘建军', contact: '孙磊', phone: '13800005001', addr: '杭州市滨江区江南大道', vehicleSlice: [0, 40] },
    { bizSuffix: 'B', namePrefix: '网易园区无人运营', legalRep: '何晴',   contact: '王芳', phone: '13800005002', addr: '杭州市滨江区网易全球研究院', vehicleSlice: [40, 71] },
  ],
  [
    { bizSuffix: 'A', namePrefix: '萧山机场末端物流', legalRep: '徐浩然', contact: '黄丽', phone: '13800006001', addr: '杭州市萧山区市心北路', vehicleSlice: [0, 50] },
    { bizSuffix: 'B', namePrefix: '萧山新城无人速递', legalRep: '陆婷',   contact: '周雯', phone: '13800006002', addr: '杭州市萧山区钱江世纪城', vehicleSlice: [50, 97] },
  ],
];

// 车辆型号固定用 MOD-001 ~ MOD-008 循环
const MODEL_CODES = ['MOD-001','MOD-002','MOD-003','MOD-004','MOD-005','MOD-006','MOD-007','MOD-008'];

/** 在坐标附近随机偏移（±radius 度） */
function scatter(lng: number, lat: number, radius = 0.04): { longitude: number; latitude: number } {
  return {
    longitude: lng + (Math.random() - 0.5) * 2 * radius,
    latitude:  lat + (Math.random() - 0.5) * 2 * radius,
  };
}

async function main() {
  // 找到市级组织
  const city = await prisma.organization.findFirst({ where: { parentId: null } });
  if (!city) throw new Error('未找到市级组织，请先运行主 seed');

  // 查已有车辆最大序号
  const lastVehicle = await prisma.vehicle.findFirst({ orderBy: { businessNo: 'desc' } });
  let vehicleSeq = lastVehicle
    ? parseInt(lastVehicle.businessNo.replace('VEH-2026-', ''), 10)
    : 0;

  // 查已有企业最大序号
  const lastEnterprise = await prisma.enterprise.findFirst({ orderBy: { businessNo: 'desc' } });
  let enterpriseSeq = lastEnterprise
    ? parseInt(lastEnterprise.businessNo.replace('ENT-2026-', ''), 10)
    : 0;

  // 查所有车型
  const allModels = await prisma.vehicleModel.findMany({ orderBy: { businessNo: 'asc' } });
  if (allModels.length === 0) throw new Error('未找到车型数据，请先运行主 seed');

  const now = new Date();

  for (let dIdx = 0; dIdx < DISTRICTS.length; dIdx++) {
    const district = DISTRICTS[dIdx];
    const entTemplates = ENTERPRISE_TEMPLATES[dIdx];

    // 检查区组织是否已存在
    let org = await prisma.organization.findFirst({ where: { code: district.code } });
    if (!org) {
      org = await prisma.organization.create({
        data: { code: district.code, name: `${district.name}交通运输局`, parentId: city.id },
      });
      console.log(`✓ 创建组织: ${org.name}`);
    } else {
      console.log(`- 组织已存在: ${org.name}`);
    }

    // 为该区创建企业和车辆
    for (const tmpl of entTemplates) {
      enterpriseSeq++;
      const entBizNo = `ENT-2026-${String(enterpriseSeq).padStart(3, '0')}`;

      // 检查企业是否已存在
      let enterprise = await prisma.enterprise.findFirst({ where: { businessNo: entBizNo } });
      if (!enterprise) {
        enterprise = await prisma.enterprise.create({
          data: {
            businessNo: entBizNo,
            name: `${tmpl.namePrefix}有限公司`,
            creditCode: `91330100DEMO${String(enterpriseSeq).padStart(6, '0')}`,
            legalRepresentative: tmpl.legalRep,
            contactName: tmpl.contact,
            contactPhone: tmpl.phone,
            registeredAddress: tmpl.addr,
            organizationId: org.id,
          },
        });
        console.log(`  ✓ 企业: ${enterprise.name}`);
      }

      const [sliceStart, sliceEnd] = tmpl.vehicleSlice;
      const count = sliceEnd - sliceStart;

      for (let vIdx = 0; vIdx < count; vIdx++) {
        vehicleSeq++;
        const serial = String(vehicleSeq).padStart(3, '0');
        const bizNo = `VEH-2026-${serial}`;

        // 避免重复
        const exists = await prisma.vehicle.findFirst({ where: { businessNo: bizNo } });
        if (exists) { console.log(`  - 车辆已存在: ${bizNo}`); continue; }

        const model = allModels[vehicleSeq % allModels.length];
        const isOnline = Math.random() < district.onlineRate;
        const drivingStateRaw = isOnline
          ? (vIdx % 3 === 0 ? 'RUNNING' : vIdx % 3 === 1 ? 'IDLE' : 'PARKED')
          : 'OFFLINE';
        const pos = scatter(district.lng, district.lat, 0.06);

        const vehicle = await prisma.vehicle.create({
          data: {
            businessNo: bizNo,
            vin: `LWRCD2026${String(vehicleSeq).padStart(8, '0')}`,
            deviceNo: `DEV-HZ-${serial}`,
            name: `无人配送车 ${serial}`,
            modelId: model.id,
            enterpriseId: enterprise.id,
            organizationId: org.id,
            color: vIdx % 3 === 0 ? '科技蓝' : vIdx % 3 === 1 ? '云杉白' : '岩石灰',
            manufactureDate: new Date(2025, vIdx % 12, 2 + (vIdx % 20)),
            serviceStartDate: new Date(2026, vIdx % 8, 5 + (vIdx % 18)),
            status: 'ACTIVE',
            onlineStatus: isOnline ? 'ONLINE' : 'OFFLINE',
          },
        });

        await prisma.vehicleArchive.create({
          data: {
            archiveNo: `ARC-2026-${serial}`,
            vehicleId: vehicle.id,
            registeredAt: new Date(2026, vIdx % 8, 5 + (vIdx % 18)),
            lifecycleStatus: 'IN_SERVICE',
          },
        });

        const battery = 20 + (vehicleSeq * 7) % 78;
        await prisma.vehicleRealtimeStatus.create({
          data: {
            vehicleId: vehicle.id,
            longitude: pos.longitude,
            latitude: pos.latitude,
            speed: drivingStateRaw === 'RUNNING' ? 6 + (vehicleSeq % 12) : 0,
            heading: (vehicleSeq * 37) % 360,
            battery,
            drivingState: drivingStateRaw,
            autonomousState: !isOnline ? 'STANDBY' : vIdx % 9 === 0 ? 'REMOTE_TAKEOVER' : 'AUTO',
            signalStrength: isOnline ? 65 + (vehicleSeq % 33) : 0,
            mileageToday: isOnline ? 8.5 + vehicleSeq * 1.3 : 0,
            locationTime: new Date(now.getTime() - (isOnline ? vIdx % 8 : 60 + vIdx) * 60_000),
            heartbeatAt: new Date(now.getTime() - (isOnline ? vIdx % 8 : 60 + vIdx) * 60_000),
          },
        });
      }
    }
  }

  console.log('\n✅ 区级数据补充完成');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
