import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const fields = { DELIVERY: 'deliveryVehicles', SANITATION: 'sanitationVehicles', PATROL: 'patrolVehicles', RETAIL: 'retailVehicles', SHUTTLE: 'shuttleVehicles' } as const;

function typeMetrics(prior: any) {
  const types = Object.entries(fields);
  const weights = types.map(([, field]) => prior[field] as number);
  const distribute = (total: number, caps?: number[]) => {
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    const raw = weights.map(w => total * (weightTotal ? w / weightTotal : 1 / weights.length));
    const parts = raw.map((v, i) => Math.min(Math.floor(v), caps?.[i] ?? Infinity));
    let remainder = total - parts.reduce((a, b) => a + b, 0);
    const order = raw.map((v, i) => ({ i, fraction: v - Math.floor(v) })).sort((a, b) => b.fraction - a.fraction);
    while (remainder > 0) {
      let changed = false;
      for (const { i } of order) if (remainder > 0 && parts[i] < (caps?.[i] ?? Infinity)) { parts[i]++; remainder--; changed = true; }
      if (!changed) throw new Error('Invalid demonstration snapshot capacity');
    }
    return parts;
  };
  const online = distribute(prior.onlineVehicles, weights);
  const running = distribute(prior.runningVehicles, online);
  const risk = distribute(prior.riskEvents);
  const major = distribute(prior.majorEvents, risk);
  const pending = distribute(prior.unresolvedMajor, major);
  const enterprises = distribute(prior.operatingEnterprises);
  const mileage = distribute(Math.round(prior.mileageToday * 10));
  return Object.fromEntries(types.map(([type], i) => [type, {
    registeredVehicles: weights[i], onlineVehicles: online[i], runningVehicles: running[i], operatingEnterprises: enterprises[i],
    mileageToday: mileage[i] / 10, riskEvents: risk[i], majorEvents: major[i], unresolvedMajor: pending[i], dataQualityRate: prior.dataQualityRate,
  }]));
}

// Add missing demonstration snapshots only. Never overwrite business snapshots.
// Type-level values are generated once here, persisted, and labelled DEMO.
async function main() {
  const regions = await prisma.cockpitRegion.findMany({ where: { level: { not: 'COUNTRY' } }, include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 } } });
  let created = 0;
  let repairedDemo = 0;
  // Repair only our own labelled demonstration records; never business rows.
  const ownDemo = await prisma.cockpitRegionSnapshot.findMany({ where: { sourceType: 'DEMO', sourceName: '演示数据 · 数字地球初始化' } });
  for (const row of ownDemo) {
    const json = JSON.stringify(typeMetrics(row));
    if (row.vehicleMetricsJson !== json) { await prisma.cockpitRegionSnapshot.update({ where: { id: row.id }, data: { vehicleMetricsJson: json } }); repairedDemo++; }
  }
  for (const region of regions) {
    const prior = region.snapshots[0];
    if (!prior) continue;
    for (let offset = -6; offset <= 0; offset++) {
      const capturedAt = new Date(); capturedAt.setHours(0, 0, 0, 0); capturedAt.setDate(capturedAt.getDate() + offset);
      if (await prisma.cockpitRegionSnapshot.findUnique({ where: { regionId_capturedAt: { regionId: region.id, capturedAt } } })) continue;
      const { id, createdAt, vehicleMetricsJson, ...base } = prior;
      const metrics = typeMetrics(prior);
      await prisma.cockpitRegionSnapshot.create({ data: { ...base, capturedAt, reportedAt: new Date(), sourceType: 'DEMO', sourceName: '演示数据 · 数字地球初始化', vehicleMetricsJson: JSON.stringify(metrics) } });
      created++;
    }
  }
  console.log(JSON.stringify({ created, repairedDemo, source: 'DEMO', preservedExisting: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
