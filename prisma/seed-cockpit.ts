import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type RegionSeed = {
  code: string;
  name: string;
  level: 'COUNTRY' | 'PROVINCE' | 'CITY';
  parentCode?: string;
  longitude: number;
  latitude: number;
  registered: number;
  enterprises: number;
  risks: number;
};

const provinceRows: Array<[string, string, number, number, number, number, number]> = [
  ['110000', '北京市', 116.4074, 39.9042, 2860, 41, 12], ['120000', '天津市', 117.2009, 39.0842, 1460, 28, 7],
  ['130000', '河北省', 114.5149, 38.0428, 3180, 59, 15], ['140000', '山西省', 112.5492, 37.857, 1120, 25, 6],
  ['150000', '内蒙古自治区', 111.7492, 40.8426, 920, 21, 5], ['210000', '辽宁省', 123.4315, 41.8057, 1750, 36, 8],
  ['220000', '吉林省', 125.3235, 43.8171, 760, 18, 4], ['230000', '黑龙江省', 126.5349, 45.8038, 810, 20, 5],
  ['310000', '上海市', 121.4737, 31.2304, 4280, 67, 19], ['320000', '江苏省', 118.7969, 32.0603, 5380, 92, 23],
  ['330000', '浙江省', 120.1551, 30.2741, 4860, 86, 18], ['340000', '安徽省', 117.2272, 31.8206, 2380, 48, 11],
  ['350000', '福建省', 119.2965, 26.0745, 2260, 43, 10], ['360000', '江西省', 115.8582, 28.6829, 1580, 34, 8],
  ['370000', '山东省', 117.1205, 36.6512, 4620, 83, 21], ['410000', '河南省', 113.6254, 34.7466, 3520, 68, 17],
  ['420000', '湖北省', 114.3054, 30.5931, 2840, 54, 13], ['430000', '湖南省', 112.9388, 28.2282, 2410, 48, 12],
  ['440000', '广东省', 113.2644, 23.1291, 6820, 121, 29], ['450000', '广西壮族自治区', 108.3669, 22.817, 1510, 32, 8],
  ['460000', '海南省', 110.3312, 20.031, 620, 16, 3], ['500000', '重庆市', 106.5516, 29.563, 2160, 39, 9],
  ['510000', '四川省', 104.0665, 30.5723, 3880, 72, 16], ['520000', '贵州省', 106.6302, 26.6477, 1080, 23, 6],
  ['530000', '云南省', 102.8329, 24.8801, 1260, 27, 7], ['540000', '西藏自治区', 91.1172, 29.6469, 180, 6, 1],
  ['610000', '陕西省', 108.9398, 34.3416, 2080, 41, 10], ['620000', '甘肃省', 103.8343, 36.0611, 720, 17, 4],
  ['630000', '青海省', 101.7782, 36.6171, 260, 8, 1], ['640000', '宁夏回族自治区', 106.2309, 38.4872, 360, 10, 2],
  ['650000', '新疆维吾尔自治区', 87.6168, 43.8256, 680, 16, 4], ['710000', '台湾省', 121.5091, 25.0443, 0, 0, 0],
  ['810000', '香港特别行政区', 114.1694, 22.3193, 0, 0, 0], ['820000', '澳门特别行政区', 113.5439, 22.1987, 0, 0, 0],
];
const provinces: RegionSeed[] = provinceRows.map(([code, name, longitude, latitude, registered, enterprises, risks]) => ({ code, name, level: 'PROVINCE', parentCode: '100000', longitude, latitude, registered, enterprises, risks }));

const zhejiangCityRows: Array<[string, string, number, number, number, number, number]> = [
  ['330100', '杭州市', 120.1551, 30.2741, 60, 8, 5], ['330200', '宁波市', 121.5503, 29.8746, 680, 15, 4],
  ['330300', '温州市', 120.6994, 27.9949, 420, 11, 3], ['330400', '嘉兴市', 120.7555, 30.7461, 510, 12, 3],
  ['330500', '湖州市', 120.0868, 30.8943, 340, 9, 2], ['330600', '绍兴市', 120.5821, 30.0511, 470, 10, 3],
  ['330700', '金华市', 119.6474, 29.0791, 560, 13, 4], ['330800', '衢州市', 118.8595, 28.9701, 240, 7, 2],
  ['330900', '舟山市', 122.2072, 29.9853, 190, 6, 1], ['331000', '台州市', 121.4208, 28.6564, 620, 14, 4],
  ['331100', '丽水市', 119.9229, 28.4676, 310, 7, 2],
];
const zhejiangCities: RegionSeed[] = zhejiangCityRows.map(([code, name, longitude, latitude, registered, enterprises, risks]) => ({ code, name, level: 'CITY', parentCode: '330000', longitude, latitude, registered, enterprises, risks }));

const regions: RegionSeed[] = [
  { code: '100000', name: '中华人民共和国', level: 'COUNTRY', longitude: 104.1954, latitude: 35.8617, registered: 0, enterprises: 0, risks: 0 },
  ...provinces,
  ...zhejiangCities,
];

function atStartOfDay(offset: number) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value;
}

function vehicleMix(total: number) {
  const delivery = Math.round(total * 0.51);
  const sanitation = Math.round(total * 0.21);
  const patrol = Math.round(total * 0.11);
  const retail = Math.round(total * 0.09);
  return { delivery, sanitation, patrol, retail, shuttle: Math.max(0, total - delivery - sanitation - patrol - retail) };
}

async function main() {
  const reportedAt = new Date();
  for (const [index, item] of regions.entries()) {
    const region = await prisma.cockpitRegion.upsert({
      where: { code: item.code },
      update: { name: item.name, level: item.level, parentCode: item.parentCode, longitude: item.longitude, latitude: item.latitude, status: 'ACTIVE', sortOrder: index, sourceName: '民政部行政区划代码目录', reportedAt },
      create: { code: item.code, name: item.name, level: item.level, parentCode: item.parentCode, longitude: item.longitude, latitude: item.latitude, cameraHeight: item.level === 'COUNTRY' ? 8_500_000 : item.level === 'PROVINCE' ? 1_350_000 : 165_000, status: 'ACTIVE', sortOrder: index, sourceName: '民政部行政区划代码目录', reportedAt },
    });
    if (item.level === 'COUNTRY') continue;
    for (let offset = -6; offset <= 0; offset += 1) {
      const capturedAt = atStartOfDay(offset);
      const factor = 1 + offset * 0.0025;
      const registered = Math.max(0, Math.round(item.registered * factor));
      const onlineRate = 0.82 + ((index + offset + 14) % 8) / 100;
      const online = Math.round(registered * onlineRate);
      const running = Math.round(online * (0.56 + (index % 5) / 100));
      const mix = vehicleMix(registered);
      await prisma.cockpitRegionSnapshot.upsert({
        where: { regionId_capturedAt: { regionId: region.id, capturedAt } },
        update: {
          registeredVehicles: registered, onlineVehicles: online, runningVehicles: running, operatingEnterprises: item.enterprises,
          mileageToday: Math.round(running * 42.6 * 10) / 10, riskEvents: Math.max(0, item.risks + ((index + offset) % 3)),
          majorEvents: item.risks > 12 ? 2 : item.risks > 5 ? 1 : 0, unresolvedMajor: item.risks > 18 ? 1 : 0,
          dataQualityRate: Math.min(99.8, 94.2 + (index % 11) * 0.4), deliveryVehicles: mix.delivery,
          sanitationVehicles: mix.sanitation, patrolVehicles: mix.patrol, retailVehicles: mix.retail, shuttleVehicles: mix.shuttle,
          sourceName: '区域监管报送数据库', sourceType: 'REGULATORY_REPORT', reportedAt,
        },
        create: {
          regionId: region.id, capturedAt, registeredVehicles: registered, onlineVehicles: online, runningVehicles: running,
          operatingEnterprises: item.enterprises, mileageToday: Math.round(running * 42.6 * 10) / 10,
          riskEvents: Math.max(0, item.risks + ((index + offset) % 3)), majorEvents: item.risks > 12 ? 2 : item.risks > 5 ? 1 : 0,
          unresolvedMajor: item.risks > 18 ? 1 : 0, dataQualityRate: Math.min(99.8, 94.2 + (index % 11) * 0.4),
          deliveryVehicles: mix.delivery, sanitationVehicles: mix.sanitation, patrolVehicles: mix.patrol, retailVehicles: mix.retail,
          shuttleVehicles: mix.shuttle, sourceName: '区域监管报送数据库', sourceType: 'REGULATORY_REPORT', reportedAt,
        },
      });
    }
  }

  const hangzhou = await prisma.cockpitRegion.findUniqueOrThrow({ where: { code: '330100' } });
  const roadRights = [
    { businessNo: 'LQ-HZ-2026-001', name: '未来科技城无人配送示范线', roadName: '文一西路—景兴路—余杭塘路', rightType: 'DELIVERY', speedLimit: 30, geometry: [[119.9871, 30.2862], [119.9986, 30.2878], [120.0112, 30.2827], [120.0227, 30.2786]] },
    { businessNo: 'LQ-HZ-2026-002', name: '滨江物联网产业园运行线', roadName: '阡陌路—江南大道—聚才路', rightType: 'MIXED', speedLimit: 25, geometry: [[120.2042, 30.1875], [120.2116, 30.1902], [120.2197, 30.1851], [120.2258, 30.1792]] },
    { businessNo: 'LQ-HZ-2026-003', name: '钱塘医药港接驳线', roadName: '海达南路—金沙大道—银沙路', rightType: 'SHUTTLE', speedLimit: 30, geometry: [[120.3318, 30.3035], [120.3426, 30.3071], [120.3539, 30.3115], [120.3654, 30.3078]] },
  ];
  for (const road of roadRights) {
    await prisma.cockpitRoadRight.upsert({
      where: { businessNo: road.businessNo },
      update: { name: road.name, roadName: road.roadName, rightType: road.rightType, geometryJson: JSON.stringify(road.geometry), speedLimit: road.speedLimit, status: 'ACTIVE', sourceDocument: '杭州市功能型无人车道路测试与商业示范批复台账' },
      create: { businessNo: road.businessNo, regionId: hangzhou.id, name: road.name, roadName: road.roadName, rightType: road.rightType, geometryType: 'LINE', geometryJson: JSON.stringify(road.geometry), validFrom: new Date('2026-01-01T00:00:00+08:00'), validTo: new Date('2027-12-31T23:59:59+08:00'), status: 'ACTIVE', speedLimit: road.speedLimit, sourceDocument: '杭州市功能型无人车道路测试与商业示范批复台账' },
    });
  }
  console.log(`三级驾驶舱数据已写入：${regions.length} 个区划，${roadRights.length} 条路权。`);
}

main().finally(() => prisma.$disconnect());
