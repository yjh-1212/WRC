/** Local fixture repair only: actual AMap GCJ-02 road geometry, no coordinate
 * interpolation and no changes to subsequently created business records.
 * Usage: tsx prisma/align-shandong-road-network.ts --plan | --apply | --verify
 */
import { PrismaClient } from '@prisma/client';
import buffer from '@turf/buffer';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { amapGet, parseLngLat, parsePolyline, headingDegrees, type LngLat } from './amap-web';

const prisma = new PrismaClient();
const root = resolve(import.meta.dirname ?? __dirname, '..');
const file = resolve(root, 'prisma/data/shandong-road-network.json');
const planFile = resolve(root, 'tmp/shandong-road-layout-plan.json');
const resultFile = resolve(root, 'tmp/shandong-road-layout-result.json');
const cutoff = new Date('2026-10-28T23:59:59.999Z');
const version = 'shandong-road-layout-20261030-v2';
const restrictedRoad = /高速|高架|快速路|匝道|收费站|轮渡/;
const districts = [
 { code: '370102', city: '370100', name: '济南历下', queries: ['泉城广场', '甸柳新村', '济南市中心医院', '燕山立交桥'] },
 { code: '370112', city: '370100', name: '济南历城', queries: ['洪家楼广场', '山东大学中心校区', '全福立交桥', '济南市历城区政府'] },
 { code: '370202', city: '370200', name: '青岛市南', queries: ['青岛市南软件园', '青岛书城', '闽江路', '香港中路'] },
 { code: '370212', city: '370200', name: '青岛崂山', queries: ['青岛国际会展中心', '金家岭街道办事处', '海尔路', '青岛软件园'] },
 { code: '371302', city: '371300', name: '临沂兰山', queries: ['临沂人民广场', '临沂市兰山区政府', '临沂银雀山汉墓竹简博物馆', '临沂市人民医院'] },
 { code: '371312', city: '371300', name: '临沂河东', queries: ['临沂市河东区政府', '九曲街道办事处', '临沂河东汽车站', '河东吾悦广场'] },
];
type Spot = LngLat & { name: string; address: string; adcode: string };
type Road = { id: string; district: string; name: string; origin: Spot; destination: Spot; points: LngLat[]; roadNames: string[]; distance: number; duration: number; polygon: LngLat[]; retrievedAt: string; hash: string };
type ServiceArea = { district: string; name: string; polygon: LngLat[]; squareKilometers: number; hash: string };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const distance = (a: LngLat, b: LngLat) => Math.hypot((a.longitude - b.longitude) * 111320 * Math.cos((a.latitude + b.latitude) * Math.PI / 360), (a.latitude - b.latitude) * 111320);
function cumulative(points: LngLat[]) { const values = [0]; for (let i = 1; i < points.length; i++) values.push(values[i - 1] + distance(points[i - 1], points[i])); return values; }
function nearestIndex(values: number[], fraction: number) { const target = values.at(-1)! * fraction; let i = values.findIndex(value => value >= target); return Math.max(0, i < 0 ? values.length - 1 : i); }
function inside(point: LngLat, ring: LngLat[]) {
 let hit = false;
 for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.latitude > point.latitude) !== (b.latitude > point.latitude) && point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) hit = !hit; }
 return hit;
}
function roadHash(points: LngLat[]) { return createHash('sha256').update(JSON.stringify(points)).digest('hex'); }
function serviceArea(district: typeof districts[number], roads: Road[]): ServiceArea {
 const points = [...new Map(roads.flatMap(road => road.points).map(p => [`${p.longitude},${p.latitude}`, p])).values()].sort((a, b) => a.longitude - b.longitude || a.latitude - b.latitude);
 const cross = (a: LngLat, b: LngLat, c: LngLat) => (b.longitude - a.longitude) * (c.latitude - a.latitude) - (b.latitude - a.latitude) * (c.longitude - a.longitude);
 const lower: LngLat[] = [], upper: LngLat[] = [];
 for (const point of points) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop(); lower.push(point); }
 for (const point of [...points].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop(); upper.push(point); }
 const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]; hull.push(hull[0]);
 // A service area covers the surrounding urban blocks, not just road pavement.
 const shape: any = buffer({ type: 'Polygon', coordinates: [hull.map(p => [p.longitude, p.latitude])] }, .15, { units: 'kilometers', steps: 6 });
 if (shape?.geometry.type !== 'Polygon' || shape.geometry.coordinates.length !== 1) throw new Error(`${district.name}服务区域无效`);
 const polygon = shape.geometry.coordinates[0].map(([longitude, latitude]: number[]) => ({ longitude, latitude })) as LngLat[];
 if (!points.every(p => inside(p, polygon))) throw new Error(`${district.name}服务区域未包含全部运营道路`);
 const lat = polygon.reduce((sum, p) => sum + p.latitude, 0) / polygon.length, factor = Math.cos(lat * Math.PI / 180) * 111320 * 111320;
 const squareKilometers = Math.abs(polygon.reduce((sum, p, i) => { const next = polygon[(i + 1) % polygon.length]; return sum + p.longitude * next.latitude - next.longitude * p.latitude; }, 0)) * factor / 2e6;
 return { district: district.code, name: `${district.name}城区运营区`, polygon, squareKilometers: Number(squareKilometers.toFixed(2)), hash: roadHash(polygon) };
}
async function search(query: string, district: typeof districts[number]): Promise<Spot> {
 const data = await amapGet('/v3/place/text', { keywords: query, city: district.city, citylimit: 'true', offset: 20, page: 1, extensions: 'all' });
 const candidates = (data.pois ?? []).filter((p: any) => String(p.adcode) === district.code && p.location && !/地铁站|公交站|水库|海水浴场|码头/.test(p.name));
 const poi = candidates[0]; if (!poi) throw new Error(`${district.name}未找到辖区内地点：${query}`);
 const point = parseLngLat(poi.location); if (!point) throw new Error('POI坐标无效');
 return { ...point, name: poi.name, address: typeof poi.address === 'string' ? poi.address : '', adcode: poi.adcode };
}
async function route(origin: Spot, destination: Spot, district: typeof districts[number], index: number): Promise<Road> {
 const data = await amapGet('/v3/direction/driving', { origin: `${origin.longitude},${origin.latitude}`, destination: `${destination.longitude},${destination.latitude}`, strategy: 13, ferry: 0, extensions: 'all' });
 for (const path of data.route?.paths ?? []) {
  const steps = path.steps ?? [], roadNames = [...new Set<string>(steps.map((step: any) => step.road).filter(Boolean))];
  if (Number(path.distance) < 400 || Number(path.distance) > 8000 || steps.some((step: any) => restrictedRoad.test(`${step.road ?? ''}${step.instruction ?? ''}`))) continue;
  const points: LngLat[] = [];
  for (const point of steps.flatMap((step: any) => parsePolyline(step.polyline))) if (!points.length || distance(points.at(-1)!, point) > .05) points.push(point);
  const maxGap = Math.max(...points.slice(1).map((point, i) => distance(points[i], point)));
  // Provider vertices may be sparse on a straight arterial. Keep them intact;
  // reject discontinuities above 750m instead of fabricating intermediate fixes.
  if (points.length < 8 || maxGap > 750) { console.log(`折线检查 ${district.name} ${points.length}点 最大源段${Math.round(maxGap)}m`); continue; }
  // A narrow, valid road corridor, never a rectangular/convex hull service area.
  const feature: any = buffer({ type: 'LineString', coordinates: points.map(p => [p.longitude, p.latitude]) }, .006, { units: 'kilometers', steps: 4 });
  if (feature?.geometry.type !== 'Polygon' || feature.geometry.coordinates.length !== 1) { console.log(`走廊几何检查 ${feature?.geometry.type} 环${feature?.geometry.coordinates.length}`); continue; }
  const polygon = feature.geometry.coordinates[0].map(([longitude, latitude]: number[]) => ({ longitude, latitude }));
  if (!points.every(point => inside(point, polygon))) { console.log(`走廊包含检查 ${points.filter(point => !inside(point, polygon)).length}/${points.length}`); continue; }
  return { id: `${district.code}-${index}`, district: district.code, name: `${district.name}·${roadNames.slice(0, 2).join('—')}配送走廊`, origin, destination, points, roadNames, distance: Number(path.distance), duration: Number(path.duration), polygon, retrievedAt: new Date().toISOString(), hash: roadHash(points) };
 }
 throw new Error(`${district.name}路线不满足短途地面道路及简单走廊条件：${origin.name}→${destination.name}`);
}
async function makePlan() {
 const existing: Road[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).routes.filter((road: Road) => road.distance <= 8000 && !road.roadNames.some(name => restrictedRoad.test(name))) : [];
 const roads: Road[] = [];
 for (const district of districts) {
  const prior = existing.filter(road => road.district === district.code);
  if (prior.length >= 2) { roads.push(...prior); console.log(`${district.name}复用${prior.length}条已核对道路`); continue; }
  const spots: Spot[] = [];
  for (const query of district.queries) { try { const spot = await search(query, district); if (!spots.some(row => distance(row, spot) < 180)) spots.push(spot); } catch (e) { console.log((e as Error).message); } await sleep(150); }
  for (let i = 0; i < spots.length; i++) {
   try { const road = await route(spots[i], spots[(i + 1) % spots.length], district, roads.filter(row => row.district === district.code).length + 1); roads.push(road); console.log(`${road.name} ${road.distance}m/${road.points.length}点`); } catch (e) { console.log((e as Error).message); }
   await sleep(150);
  }
  // Persist successful district work so a retry never discards verified routes.
  mkdirSync(resolve(root, 'prisma/data'), { recursive: true });
  writeFileSync(file, JSON.stringify({ version, provider: '高德地图', coordinateSystem: 'GCJ-02', policy: '不走高速；禁止轮渡；保留全部道路折线顶点', corridorHalfWidthMeters: 6, routes: [...roads, ...existing.filter(row => !roads.some(r => r.district === row.district))] }, null, 2));
  if (roads.filter(row => row.district === district.code).length < 2) throw new Error(`${district.name}有效道路不足，未修改数据库`);
 }
 mkdirSync(resolve(root, 'prisma/data'), { recursive: true });
 const serviceAreas = districts.map(district => serviceArea(district, roads.filter(road => road.district === district.code)));
 writeFileSync(file, JSON.stringify({ version, provider: '高德地图', coordinateSystem: 'GCJ-02', policy: '地面道路；避开高速、高架、快速路、匝道和轮渡；保留全部源折线顶点', serviceAreaPolicy: '依据服务道路与接驳点外围形成连续街区范围，外扩150米；不是道路缓冲带或实际许可文件', serviceAreas, routes: roads }, null, 2));
 const vehicles = await prisma.vehicle.findMany({ where: { deletedAt: null, businessNo: { startsWith: 'VEH-2026-' }, createdAt: { lte: cutoff }, organization: { workspaceId: { in: ['workspace-sd-370100', 'workspace-sd-370200', 'workspace-sd-371300'] } } }, include: { realtimeStatus: true, organization: { select: { code: true, workspaceId: true } } }, orderBy: { businessNo: 'asc' } });
 const targets = vehicles.filter(v => v.realtimeStatus).map((v, index) => {
  const district = districts.find(d => d.code === v.organization.code) ?? districts.find(d => v.organization.workspaceId?.endsWith(d.city))!;
  const pool = roads.filter(road => road.district === district.code), road = pool[index % pool.length];
  const state = v.realtimeStatus!.drivingState, running = v.onlineStatus === 'ONLINE' && state === 'RUNNING';
  const values = cumulative(road.points), fraction = running ? .18 + ((index * 37 % 79) / 100) * .64 : state === 'IDLE' ? .04 + (index % 7) * .012 : .90 + (index % 7) * .008;
  const pointIndex = Math.min(road.points.length - 2, Math.max(1, nearestIndex(values, fraction)));
  return { id: v.id, no: v.businessNo, organizationId: v.organizationId, enterpriseId: v.enterpriseId, onlineStatus: v.onlineStatus, drivingState: v.realtimeStatus!.drivingState, roadId: road.id, pointIndex, expectedUpdatedAt: v.realtimeStatus!.updatedAt.toISOString(), expectedLongitude: v.realtimeStatus!.longitude, expectedLatitude: v.realtimeStatus!.latitude };
 });
 const plan = { version, generatedAt: new Date().toISOString(), cutoff: cutoff.toISOString(), roads: roads.map(road => ({ id: road.id, hash: road.hash })), serviceAreas: serviceAreas.map(area => ({ district: area.district, hash: area.hash })), targets };
 writeFileSync(planFile, JSON.stringify(plan, null, 2));
 console.log(JSON.stringify({ plan: planFile, routes: roads.length, serviceAreas: serviceAreas.map(area => ({ name: area.name, squareKilometers: area.squareKilometers })), targetVehicles: targets.length, databaseChanged: false }));
}
async function apply() {
 if (existsSync(resultFile) && JSON.parse(readFileSync(resultFile, 'utf8')).version === version) { console.log('本批道路布局已应用；保留之后的定位与业务操作。'); return; }
 const plan = JSON.parse(readFileSync(planFile, 'utf8')), cache = JSON.parse(readFileSync(file, 'utf8')), roads: Road[] = cache.routes, serviceAreas: ServiceArea[] = cache.serviceAreas;
 if (plan.version !== version || !plan.targets.length || plan.roads.some((r: any) => roads.find(road => road.id === r.id)?.hash !== r.hash)) throw new Error('道路计划与缓存不一致');
 for (const road of roads) if (roadHash(road.points) !== road.hash || !road.points.every(point => inside(point, road.polygon)) || road.roadNames.some(name => restrictedRoad.test(name))) throw new Error(`${road.id}道路或运营边界校验失败`);
 for (const target of plan.targets) { const road = roads.find(row => row.id === target.roadId); if (!road || !road.points[target.pointIndex] || !inside(road.points[target.pointIndex], road.polygon)) throw new Error(`${target.no}不在计划运营区域内`); }
 for (const area of serviceAreas) if (roadHash(area.polygon) !== plan.serviceAreas.find((a: any) => a.district === area.district)?.hash || !roads.filter(road => road.district === area.district).every(road => road.points.every(point => inside(point, area.polygon)))) throw new Error(`${area.name}未包含全部车辆与道路`);
 mkdirSync(resolve(root, 'tmp/backups'), { recursive: true });
 const backup = resolve(root, `tmp/backups/regulatory-before-road-layout-${Date.now()}.db`);
 await prisma.$executeRawUnsafe(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
 const now = new Date();
 const result = await prisma.$transaction(async tx => {
  const regionForRoad = new Map<string, string>();
  let regionsUpdated = 0, regionsCreated = 0, regionsRetired = 0, tracksUpdated = 0, ordersUpdated = 0;
  const ownedRegionIds: string[] = [];
  for (const district of districts) {
   const org = await tx.organization.findUnique({ where: { code: district.code } }); if (!org) throw new Error('缺少运营辖区');
   const owned = await tx.operationRegion.findMany({ where: { organizationId: org.id, OR: [{ createdAt: { lte: cutoff }, OR: [{ businessNo: { startsWith: 'REGION-2026-' } }, { businessNo: { startsWith: 'REG-178845271' } }] }, { businessNo: { startsWith: `REG-SD-ROAD-${district.code}` } }, { businessNo: `REG-SD-AREA-${district.code}` }] }, orderBy: { businessNo: 'asc' } });
   ownedRegionIds.push(...owned.map(region => region.id));
   const local = roads.filter(road => road.district === district.code), area = serviceAreas.find(area => area.district === district.code)!;
   const prior = owned.find(row => row.status === 'ACTIVE' && row.approvalResultId) ?? owned.find(row => row.status === 'ACTIVE');
   const values = { name: area.name, enterpriseId: null, polygonJson: JSON.stringify(area.polygon), ruleDescription: '在运营区封闭边界内开展城区配送服务；实际行驶应沿开放道路，限速20km/h，交叉口减速让行，不得驶入建筑、水域及未开放道路。' };
   const region = prior ? await tx.operationRegion.update({ where: { id: prior.id }, data: values }) : await tx.operationRegion.create({ data: { id: `region-area-sd-${district.code}`, businessNo: `REG-SD-AREA-${district.code}`, organizationId: org.id, ...values, regionType: 'OPERATION', status: 'ACTIVE', approvalStatus: 'APPROVED', validFrom: now, speedLimit: 20 } });
   for (const road of local) regionForRoad.set(road.id, region.id);
   prior ? regionsUpdated++ : regionsCreated++;
   for (const old of owned.filter(row => row.id !== region.id && row.status === 'ACTIVE')) { await tx.operationRegion.update({ where: { id: old.id }, data: { status: 'SUSPENDED' } }); regionsRetired++; }
  }
  for (const target of plan.targets) {
   const vehicle = await tx.vehicle.findUnique({ where: { id: target.id }, include: { realtimeStatus: true } });
   if (!vehicle || vehicle.onlineStatus !== target.onlineStatus || vehicle.realtimeStatus?.updatedAt.toISOString() !== target.expectedUpdatedAt || vehicle.realtimeStatus.longitude !== target.expectedLongitude || vehicle.realtimeStatus.latitude !== target.expectedLatitude) throw new Error(`${target.no}已在计划后被修改；本次事务已取消`);
   const road = roads.find(row => row.id === target.roadId)!, point = road.points[target.pointIndex], rt = vehicle.realtimeStatus!;
   const online = vehicle.onlineStatus === 'ONLINE', running = online && rt.drivingState === 'RUNNING';
   const heading = headingDegrees(point, road.points[target.pointIndex + 1]);
   await tx.vehicleRealtimeStatus.update({ where: { vehicleId: vehicle.id }, data: { ...point, heading, speed: running ? Math.min(18, Math.max(6, rt.speed)) : 0, ...(online ? { heartbeatAt: now, locationTime: now } : {}) } });
   const regionId = regionForRoad.get(road.id)!;
   await tx.operationRegionVehicle.deleteMany({ where: { vehicleId: vehicle.id, regionId: { in: ownedRegionIds } } });
   await tx.operationRegionVehicle.upsert({ where: { regionId_vehicleId: { regionId, vehicleId: vehicle.id } }, update: {}, create: { regionId, vehicleId: vehicle.id } });
   const records = await tx.operationRecord.findMany({ where: { vehicleId: vehicle.id, createdAt: { lte: cutoff } }, orderBy: { startedAt: 'desc' } });
   if (running && !records.some(record => record.endedAt === null && record.status === 'RUNNING')) records.unshift(await tx.operationRecord.create({ data: { businessNo: `ROAD-SD-${vehicle.businessNo}`, vehicleId: vehicle.id, organizationId: vehicle.organizationId, enterpriseId: vehicle.enterpriseId, regionId, startedAt: new Date(now.getTime() - 1800000), status: 'RUNNING' } }));
   for (const record of records) {
    const current = record.status === 'RUNNING' && record.endedAt === null;
    const points = current ? road.points.slice(0, target.pointIndex + 1) : road.points;
    const values = cumulative(points), length = values.at(-1)!;
    const endedAt = current ? online ? now : rt.locationTime : record.endedAt ?? new Date(record.startedAt.getTime() + Math.max(600, length / 3) * 1000);
    const duration = Math.max(120, length / 3), startedAt = new Date(endedAt.getTime() - duration * 1000);
    await tx.vehicleTrackPoint.deleteMany({ where: { operationRecordId: record.id } });
    await tx.vehicleTrackPoint.createMany({ data: points.map((p, i) => ({ operationRecordId: record.id, vehicleId: vehicle.id, sequence: i + 1, ...p, heading: headingDegrees(points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]), speed: current && !running ? 0 : 10.8, battery: rt.battery, autonomousState: 'AUTO', pointType: i === 0 ? 'START' : i === points.length - 1 ? 'END' : 'NORMAL', recordedAt: new Date(startedAt.getTime() + duration * 1000 * (length ? values[i] / length : 0)) })) });
    await tx.operationRecord.update({ where: { id: record.id }, data: { regionId, startAddress: `${road.origin.name}附近·${road.roadNames[0] ?? '配送道路'}`, endAddress: current ? `${road.roadNames.at(-1) ?? road.destination.name}沿线当前位置` : `${road.destination.name}附近道路`, mileage: Number((length / 1000).toFixed(2)), startedAt, ...(current ? {} : { endedAt }), durationMinutes: Math.ceil(duration / 60) } }); tracksUpdated++;
   }
   const orders = await tx.deliveryOrder.findMany({ where: { vehicleId: vehicle.id, createdAt: { lte: cutoff } } });
   for (const order of orders) { await tx.deliveryOrder.update({ where: { id: order.id }, data: { startName: road.origin.name, startAddress: `${road.origin.address}·${road.roadNames[0] ?? '道路'}接驳点`, startLng: road.points[0].longitude, startLat: road.points[0].latitude, endName: road.destination.name, endAddress: `${road.destination.address}·道路接驳点`, endLng: road.points.at(-1)!.longitude, endLat: road.points.at(-1)!.latitude, progressPct: running ? Math.round(cumulative(road.points)[target.pointIndex] / cumulative(road.points).at(-1)! * 100) : order.progressPct } }); ordersUpdated++; }
  }
  return { version, appliedAt: now.toISOString(), backup, vehicles: plan.targets.length, serviceAreas: serviceAreas.map(area => ({ name: area.name, squareKilometers: area.squareKilometers })), regionsUpdated, regionsCreated, regionsRetired, tracksUpdated, ordersUpdated };
 }, { timeout: 120000, maxWait: 30000 });
 writeFileSync(resultFile, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
async function verify() {
 const plan = JSON.parse(readFileSync(planFile, 'utf8')), roads: Road[] = JSON.parse(readFileSync(file, 'utf8')).routes;
 let vehicles = 0, tracks = 0, points = 0; const errors: string[] = [];
 for (const target of plan.targets) {
  const road = roads.find(row => row.id === target.roadId)!, row = await prisma.vehicle.findUnique({ where: { id: target.id }, include: { realtimeStatus: true, operationRegions: { include: { region: true } }, operationRecords: { include: { trackPoints: { orderBy: { sequence: 'asc' } } } } } });
  const position = row?.realtimeStatus;
  const assigned = row?.operationRegions.filter(link => link.region.status === 'ACTIVE').map(link => ({ id: link.region.id, polygon: JSON.parse(link.region.polygonJson) as LngLat[] })) ?? [];
  if (!position || distance(position, road.points[target.pointIndex]) > .05 || !inside(position, road.polygon)) errors.push(`${target.no}:位置不在已核对道路上`); else vehicles++;
  if (!position || !assigned.some(region => inside(position, region.polygon))) errors.push(`${target.no}:位置不在已分配的有效运营区域内`);
  for (const record of row?.operationRecords ?? []) {
   if (record.createdAt > cutoff && !record.businessNo.startsWith('ROAD-SD-')) continue;
   const source = new Set(road.points.map(p => `${p.longitude},${p.latitude}`));
   if (record.trackPoints.some(p => !source.has(`${p.longitude},${p.latitude}`))) errors.push(`${record.businessNo}:轨迹含非路网坐标`);
   const region = assigned.find(area => area.id === record.regionId);
   if (!region || record.trackPoints.some(point => !inside(point, region.polygon))) errors.push(`${record.businessNo}:轨迹不在对应有效运营区域内`);
   if (record.trackPoints.some((p, i) => i && distance(p, record.trackPoints[i - 1]) > 750)) errors.push(`${record.businessNo}:轨迹存在过大断点`);
   if (record.trackPoints.some(p => p.recordedAt.getTime() > Date.now() + 1000)) errors.push(`${record.businessNo}:轨迹含未来点`);
   if (record.status === 'RUNNING' && record.endedAt === null && position && distance(record.trackPoints.at(-1)!, position) > .05) errors.push(`${record.businessNo}:当前轨迹终点与车辆不一致`);
   tracks++; points += record.trackPoints.length;
  }
 }
 const result = { passed: errors.length === 0, vehicles, tracks, points, routes: roads.length, errors };
 writeFileSync(resolve(root, 'tmp/shandong-road-layout-verification.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); if (errors.length) process.exitCode = 1;
}
(process.argv.includes('--plan') ? makePlan() : process.argv.includes('--apply') ? apply() : process.argv.includes('--verify') ? verify() : Promise.reject(new Error('请选择 --plan、--apply 或 --verify'))).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
