/** Convert the six project-owned block fixtures to cached GCJ-02 road corridors.
 * Never moves telemetry, rewrites recorded tracks or changes issued permits.
 * --plan is read-only. --apply requires the reviewed, hash-checked plan and backs
 * up SQLite first. --verify validates both assignments and original source data.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
process.env.DATABASE_URL ||= 'file:' + path.join(root, 'data/regulatory.db').replace(/\\/g, '/');
const db = new PrismaClient(), version = 'road-corridors-20261031-v1';
const sourceFile = path.join(root, 'prisma/data/shandong-road-network.json');
const planFile = path.join(root, 'tmp/operation-road-corridors-plan.json');
const resultFile = path.join(root, 'tmp/operation-road-corridors-result.json');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function inside(p, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i], cross = (p.longitude - a.longitude) * (b.latitude - a.latitude) - (p.latitude - a.latitude) * (b.longitude - a.longitude);
    if (Math.abs(cross) < 1e-12 && p.longitude >= Math.min(a.longitude, b.longitude) && p.longitude <= Math.max(a.longitude, b.longitude) && p.latitude >= Math.min(a.latitude, b.latitude) && p.latitude <= Math.max(a.latitude, b.latitude)) return true;
    if ((a.latitude > p.latitude) !== (b.latitude > p.latitude) && p.longitude < (b.longitude - a.longitude) * (p.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) hit = !hit;
  } return hit;
}
function area(ring) {
  const origin = ring[0], cos = Math.cos(origin.latitude * Math.PI / 180);
  const points = ring.map(p => [(p.longitude - origin.longitude) * 111320 * cos, (p.latitude - origin.latitude) * 111320]);
  return Math.abs(points.reduce((total, p, i) => { const next = points[(i + 1) % points.length]; return total + p[0] * next[1] - next[0] * p[1]; }, 0)) / 2e6;
}
const corridorId = road => 'region-corridor-sd-' + road.id;
function sources() {
  const cache = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  if (cache.coordinateSystem !== 'GCJ-02' || cache.routes.length !== 20 || cache.serviceAreas.length !== 6) throw Error('道路源或坐标系与核对范围不一致');
  for (const road of cache.routes) {
    if (hash(road.points) !== road.hash || road.points.length < 2 || road.polygon.length > 1000 || !road.points.every(p => inside(p, road.polygon)) || road.roadNames.some(name => /高速|高架|快速路|匝道|收费站|轮渡/.test(name))) throw Error(road.id + ' 道路源校验失败');
    if (area(road.polygon) > road.distance / 1000 * .03 + .002) throw Error(road.id + ' 不是窄道路范围');
    const parent = cache.serviceAreas.find(region => region.district === road.district);
    if (!parent || !road.polygon.every(point => inside(point, parent.polygon))) throw Error(road.id + ' 道路范围超出原有运营范围');
  }
  return cache;
}
async function protectedData() {
  return {
    telemetry: hash(await db.vehicleRealtimeStatus.findMany({ orderBy: { vehicleId: 'asc' } })),
    observations: hash(await db.vehicleObservation.findMany({ orderBy: { id: 'asc' } })),
    tracks: hash(await db.vehicleTrackPoint.findMany({ orderBy: { id: 'asc' } })),
    records: hash(await db.operationRecord.findMany({ orderBy: { id: 'asc' } })),
    permits: hash(await db.vehicleLicense.findMany({ orderBy: { id: 'asc' } })),
    vehicles: await db.vehicle.count(),
  };
}
async function plan() {
  if (fs.existsSync(resultFile) && JSON.parse(fs.readFileSync(resultFile, 'utf8')).version === version) { console.log(JSON.stringify({ alreadyApplied: true, result: resultFile, message: '本批道路区域已应用；使用 --verify 校验，不覆盖后续业务改动' })); return; }
  const cache = sources(), legacyPlan = path.join(root, 'tmp/shandong-road-layout-plan.json'), known = fs.existsSync(legacyPlan) ? JSON.parse(fs.readFileSync(legacyPlan, 'utf8')) : { targets: [] };
  const preferred = new Map(known.targets.map(row => [row.id, row.roadId]));
  const regions = await db.operationRegion.findMany({ where: { status: 'ACTIVE', organization: { code: { in: cache.serviceAreas.map(area => area.district) } } }, include: { organization: { select: { code: true } }, vehicles: { include: { vehicle: { include: { realtimeStatus: true, trackPoints: { select: { longitude: true, latitude: true } } } } } } } });
  const replacements = [], vehicleRoads = [];
  for (const source of cache.serviceAreas) {
    const region = regions.find(row => row.organization.code === source.district && hash(JSON.parse(row.polygonJson)) === source.hash);
    if (!region) throw Error(source.district + ' 街区范围已变动，未自动覆盖');
    replacements.push({ id: region.id, name: region.name, organizationId: region.organizationId, district: source.district, polygonHash: hash(JSON.parse(region.polygonJson)), expectedUpdatedAt: region.updatedAt.toISOString(), areaKm2: area(source.polygon) });
    for (const link of region.vehicles) {
      const vehicle = link.vehicle, point = vehicle.realtimeStatus;
      const candidates = cache.routes.filter(road => road.district === source.district && point && inside(point, road.polygon) && vehicle.trackPoints.every(p => inside(p, road.polygon)));
      const road = candidates.find(road => road.id === preferred.get(vehicle.id)) ?? candidates[0];
      if (!road) throw Error(vehicle.businessNo + ' 当前定位未落在已核对道路内；保留原始定位，未应用范围');
      vehicleRoads.push({ vehicleId: vehicle.id, regionId: region.id, roadId: road.id });
    }
  }
  if (new Set(vehicleRoads.map(row => row.vehicleId)).size !== 348) throw Error('既有初始化车辆关联范围发生变化，未自动覆盖');
  const snapshot = { version, generatedAt: new Date().toISOString(), sourceHash: hash(cache), protected: await protectedData(), replacements, vehicleRoads,
    roads: cache.routes.map(road => ({ id: corridorId(road), sourceId: road.id, name: road.name.replace('配送走廊', '道路通行区'), polygonHash: hash(road.polygon), areaKm2: area(road.polygon), lengthMeters: road.distance, vertices: road.polygon.length })) };
  fs.writeFileSync(planFile, JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify({ databaseChanged: false, oldAreas: replacements.length, corridors: snapshot.roads.length, vehicles: vehicleRoads.length, lengthKm: +(snapshot.roads.reduce((n, row) => n + row.lengthMeters, 0) / 1000).toFixed(2), oldAreaKm2: +replacements.reduce((n, row) => n + row.areaKm2, 0).toFixed(3), corridorAreaKm2: +snapshot.roads.reduce((n, row) => n + row.areaKm2, 0).toFixed(3), maxVertices: Math.max(...snapshot.roads.map(row => row.vertices)), plan: planFile }));
}
async function apply() {
  if (fs.existsSync(resultFile) && JSON.parse(fs.readFileSync(resultFile, 'utf8')).version === version) { console.log('本批道路区域已应用，未重复修改'); return; }
  const cache = sources(), reviewed = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (reviewed.version !== version || reviewed.sourceHash !== hash(cache) || hash(await protectedData()) !== hash(reviewed.protected)) throw Error('源数据或上报记录已在计划后变化，请重新生成计划');
  const backupDir = path.join(root, 'tmp/backups'); fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, 'regulatory-before-road-corridors-' + Date.now() + '.db');
  if (!backup.startsWith(backupDir + path.sep)) throw Error('备份路径无效');
  await db.$executeRawUnsafe("VACUUM INTO '" + backup.replace(/'/g, "''") + "'");
  const at = new Date(), actor = '市省道路运营范围调整';
  await db.$transaction(async tx => {
    for (const replacement of reviewed.replacements) {
      const old = await tx.operationRegion.findUnique({ where: { id: replacement.id } });
      if (!old || old.status !== 'ACTIVE' || old.updatedAt.toISOString() !== replacement.expectedUpdatedAt || hash(JSON.parse(old.polygonJson)) !== replacement.polygonHash) throw Error('运营区域已变动，事务取消');
      const roads = cache.routes.filter(road => road.district === replacement.district);
      for (const road of roads) {
        const target = reviewed.roads.find(row => row.sourceId === road.id), vehicleIds = reviewed.vehicleRoads.filter(row => row.roadId === road.id).map(row => row.vehicleId);
        if (await tx.operationRegion.findUnique({ where: { id: target.id } })) throw Error('目标道路区域已存在，事务取消');
        await tx.operationRegion.create({ data: { id: target.id, businessNo: 'REG-SD-CORRIDOR-' + road.id, name: target.name, organizationId: old.organizationId,
          enterpriseId: null, approvalResultId: old.approvalResultId, regionType: 'OPERATION', status: 'ACTIVE', approvalStatus: old.approvalStatus,
          validFrom: old.validFrom, validTo: old.validTo, speedLimit: Math.min(20, old.speedLimit), allowedHours: old.allowedHours,
          polygonJson: JSON.stringify(road.polygon), ruleDescription: `按${road.roadNames.join('、')}实际地面道路折线形成通行范围；中心线两侧各6米，用于低速道路运营范围管理，非测绘路权边界。沿开放道路行驶，路口减速让行，不得驶入建筑、水域、封闭道路、高速或高架。`,
          historyJson: JSON.stringify([{ action: 'CREATE', actor, at: at.toISOString(), summary: '将街区运营范围拆分为具体道路通行区', sourceRegionId: old.id, sourceRouteId: road.id, coordinateSystem: 'GCJ-02', sourceHash: road.hash, halfWidthMeters: 6 }]),
          vehicles: { create: vehicleIds.map(vehicleId => ({ vehicleId })) } } });
      }
      const history = JSON.parse(old.historyJson || '[]');
      await tx.operationRegion.update({ where: { id: old.id }, data: { status: 'INACTIVE', historyJson: JSON.stringify([...history, { action: 'DISABLE', actor, at: at.toISOString(), summary: '街区大范围已改为沿道路的通行区，旧边界保留供历史查阅', before: { status: old.status, polygonJson: old.polygonJson }, replacementIds: roads.map(corridorId) }]) } });
      await tx.auditLog.create({ data: { result: 'SUCCESS', module: 'operation', objectType: 'operationRegion', objectId: old.id, action: 'ROAD_CORRIDOR_SCOPE', organizationId: old.organizationId,
        detail: JSON.stringify({ actor, before: { name: old.name, status: old.status, polygonHash: replacement.polygonHash }, after: { status: 'INACTIVE', roadRegions: roads.map(corridorId) }, source: '已核对的GCJ-02道路折线', reason: '按用户要求从街区运营面收敛为道路通行范围' }) } });
    }
  }, { timeout: 60000 });
  if (hash(await protectedData()) !== hash(reviewed.protected)) throw Error('原始上报、轨迹或许可意外改变，请按备份核查');
  const result = { version, appliedAt: at.toISOString(), backup, corridors: reviewed.roads.length, retiredAreas: reviewed.replacements.length, vehicles: reviewed.vehicleRoads.length, sourceHash: reviewed.sourceHash };
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
async function verify() {
  const cache = sources(), reviewed = JSON.parse(fs.readFileSync(planFile, 'utf8')), errors = [];
  const regions = await db.operationRegion.findMany({ where: { id: { in: reviewed.roads.map(row => row.id) } }, include: { vehicles: true } });
  if (regions.length !== 20) errors.push('道路区域数量不符');
  for (const region of regions) if (region.status !== 'ACTIVE' || hash(JSON.parse(region.polygonJson)) !== reviewed.roads.find(row => row.id === region.id)?.polygonHash) errors.push(region.id + ':道路边界或状态与已核对方案不符');
  let vehicles = 0, points = 0;
  for (const target of reviewed.vehicleRoads) {
    const region = regions.find(row => row.id === 'region-corridor-sd-' + target.roadId), vehicle = await db.vehicle.findUnique({ where: { id: target.vehicleId }, include: { realtimeStatus: true, trackPoints: true } });
    const ring = region ? JSON.parse(region.polygonJson) : [];
    if (!vehicle?.realtimeStatus || !region || region.status !== 'ACTIVE' || !region.vehicles.some(row => row.vehicleId === target.vehicleId) || !inside(vehicle.realtimeStatus, ring)) { errors.push(target.vehicleId + ':定位或关联不在道路通行区内'); continue; }
    vehicles++;
    for (const p of vehicle.trackPoints) { if (!inside(p, ring)) errors.push(target.vehicleId + ':历史定位不在对应道路内'); points++; }
  }
  for (const old of reviewed.replacements) if ((await db.operationRegion.findUnique({ where: { id: old.id } })).status !== 'INACTIVE') errors.push(old.id + ':旧街区范围仍启用');
  if (hash(await protectedData()) !== hash(reviewed.protected)) errors.push('车辆、上报、轨迹、运行记录或许可发生改变');
  const result = { passed: !errors.length, vehicles, points, corridors: regions.length, protectedDataUnchanged: !errors.includes('车辆、上报、轨迹、运行记录或许可发生改变'), errors };
  fs.writeFileSync(path.join(root, 'tmp/operation-road-corridors-verification.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); if (errors.length) process.exitCode = 1;
}
(process.argv.includes('--plan') ? plan() : process.argv.includes('--apply') ? apply() : process.argv.includes('--verify') ? verify() : Promise.reject(Error('请选择 --plan、--apply 或 --verify'))).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
