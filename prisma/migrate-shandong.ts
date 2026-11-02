import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/**
 * Business migration, not a database reset. Original IDs and associations survive.
 * Geographic directory: existing DataV GeoAtlas boundaries, cross-checked against
 * Shandong Civil Affairs administrative directory. Business provenance is recorded
 * separately in docs/shandong-data-provenance.md.
 */
const prisma = new PrismaClient();
const bcrypt = createRequire(new URL('../apps/api/package.json', import.meta.url))('bcryptjs');
const VERSION = 'shandong-business-20261028-v1';
const MODULES = ['ARCHIVES', 'ADMISSION', 'OPERATIONS', 'SAFETY', 'ANALYTICS', 'GOVERNANCE'];
const cityRows = [
  ['370100','济南市',117.000923,36.675807], ['370200','青岛市',120.355173,36.082982],
  ['370300','淄博市',118.047648,36.814939], ['370400','枣庄市',117.557964,34.856424],
  ['370500','东营市',118.66471,37.434564], ['370600','烟台市',121.391382,37.539297],
  ['370700','潍坊市',119.107078,36.70925], ['370800','济宁市',116.587245,35.415393],
  ['370900','泰安市',117.129063,36.194968], ['371000','威海市',122.116394,37.509691],
  ['371100','日照市',119.461208,35.428588], ['371300','临沂市',118.326443,35.065282],
  ['371400','德州市',116.307428,37.453968], ['371500','聊城市',115.980367,36.456013],
  ['371600','滨州市',118.016974,37.383542], ['371700','菏泽市',115.469381,35.246531],
] as const;
type City = { code: string; name: string; lng: number; lat: number; rootId: string; workspaceId: string };
type Row = Record<string, any>;
const round = (v: number) => Math.round(v * 1e6) / 1e6;
const cityId = (code: string) => `workspace-sd-${code}`;
const allTables = async (db: any): Promise<string[]> => (await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB '_*'" )).map((r: Row) => r.name);
const columns = async (db: any, table: string): Promise<Row[]> => db.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
const rows = async (db: any, table: string): Promise<Row[]> => db.$queryRawUnsafe(`SELECT rowid AS __rowid, * FROM "${table}"`);
async function patch(db: any, table: string, row: Row, data: Row) {
  const keys = Object.keys(data).filter(key => data[key] !== undefined && data[key] !== row[key]);
  if (!keys.length) return;
  await db.$executeRawUnsafe(`UPDATE "${table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')} WHERE rowid = ?`, ...keys.map(k => data[k]), row.__rowid);
}
async function retainBusinessWorkspaces() {
  // Directory coverage is province-wide; service opening remains an application.
  // Keep unopened cities available for the public application workflow.
  return prisma.$transaction(async tx => {
    const workspaces=await tx.cityWorkspace.findMany();
    for(const workspace of workspaces){
      if(['370100','370200','371300'].includes(workspace.cityCode))continue;
      const orgs=await tx.organization.findMany({where:{workspaceId:workspace.id},select:{id:true}});
      if(await tx.enterprise.count({where:{organizationId:{in:orgs.map(o=>o.id)}}}))continue;
      if(await tx.user.count({where:{workspaceId:workspace.id}}))continue;
      if(await tx.cityApplication.count({where:{workspaceId:workspace.id}}))continue;
      const definitions=await tx.processDefinition.findMany({where:{workspaceId:workspace.id},select:{id:true}});
      for(const d of definitions){if(await tx.processInstance.count({where:{processDefinitionId:d.id}}))throw new Error('Cannot remove an in-use city workflow');await tx.processNodeDefinition.deleteMany({where:{processDefinitionId:d.id}});await tx.processDefinition.delete({where:{id:d.id}});}
      const indicators=await tx.evaluationIndicator.findMany({where:{organizationId:{in:orgs.map(o=>o.id)}}});
      for(const indicator of indicators){await tx.evaluationRule.deleteMany({where:{indicatorId:indicator.id}});await tx.evaluationIndicator.delete({where:{id:indicator.id}});}
      const roles=await tx.role.findMany({where:{workspaceId:workspace.id},select:{id:true}});
      await tx.rolePermission.deleteMany({where:{roleId:{in:roles.map(r=>r.id)}}});
      await tx.role.deleteMany({where:{workspaceId:workspace.id}});
      await tx.workspaceNotice.deleteMany({where:{workspaceId:workspace.id}});
      await tx.organization.updateMany({where:{workspaceId:workspace.id},data:{workspaceId:null}});
      await tx.cityWorkspace.delete({where:{id:workspace.id}});
    }
    return tx.cityWorkspace.count();
  });
}
async function ensureGeographicDirectory(){
  const reportedAt=new Date();
  await prisma.cockpitRegion.upsert({where:{code:'100000'},update:{},create:{code:'100000',name:'中华人民共和国',level:'COUNTRY',longitude:104.1954,latitude:35.8617,cameraHeight:8500000,sourceName:'行政区划目录',reportedAt}});
  const geo=JSON.parse(readFileSync(new URL('../apps/web/public/map/threemap/geojson/100000.json',import.meta.url),'utf8'));
  for(const feature of geo.features??[]){const p=feature.properties??{};const code=String(p.adcode??'');if(!/^\d{2}0000$/.test(code)||code==='100000')continue;const center=p.centroid??p.center??[118,36];await prisma.cockpitRegion.upsert({where:{code},update:{},create:{code,name:p.name,level:'PROVINCE',parentCode:'100000',longitude:center[0],latitude:center[1],cameraHeight:1350000,sourceName:'行政区划目录',reportedAt}});}
}
async function normalizeLegacyBusinessLabels(){
  // Incremental follow-up for the original local dataset. Do not rewrite audit
  // history, application materials, public geography or unrelated new records.
  const legacy=/余杭|西湖|滨江|萧山|上城|拱墅|钱塘|云栖|转塘|半山|杭城|DEV-HZ-|^[浙杭]/;
  const tables=['Enterprise','Vehicle','VehicleLicense','VehicleArchive','EnterpriseQualification','OperationRegion','OperationRecord','DeliveryOrder','SafetyAlert','ElectronicFence','Accident','Violation','OfflineEvent','EmergencyTask','EnterpriseEvaluation','AccidentReconstruction','RegulatoryReport'];
  const fields=new Set(['name','title','description','address','registeredAddress','startAddress','endAddress','startName','endName','ruleDescription','remark','qualificationSummary','conclusion','recommendation','deviceNo','certificateNo']);
  return prisma.$transaction(async tx=>{
    const workspaces=await tx.cityWorkspace.findMany();const orgs=await tx.organization.findMany({select:{id:true,workspaceId:true}});const enterprises=await tx.enterprise.findMany({select:{id:true,organizationId:true,name:true}});const vehicles=await tx.vehicle.findMany({select:{id:true,organizationId:true,enterpriseId:true}});
    const byWorkspace=new Map(workspaces.map(w=>[w.id,w]));const byOrg=new Map(orgs.map(o=>[o.id,byWorkspace.get(o.workspaceId??'')]));const byEnterprise=new Map(enterprises.map(e=>[e.id,e]));const byVehicle=new Map(vehicles.map(v=>[v.id,v]));
    let changedRows=0,changedFields=0;const byTable:Record<string,number>={};
    for(const table of tables){const columnsInfo=await columns(tx,table);for(const row of await rows(tx,table)){const vehicle=byVehicle.get(row.vehicleId??'');const enterprise=byEnterprise.get(row.enterpriseId??vehicle?.enterpriseId??'');const workspace=byOrg.get(row.organizationId??enterprise?.organizationId??vehicle?.organizationId??'');if(!workspace||!['370100','370200','371300'].includes(workspace.cityCode))continue;const city=workspace.cityName.replace(/市$/,'');const data:Row={};
      for(const column of columnsInfo){const key=column.name,value=row[key];if(!fields.has(key)||typeof value!=='string'||!legacy.test(value))continue;let next=value;
        if(key==='deviceNo')next=next.replace(/^DEV-HZ-/,`DEV-SD-${workspace.cityCode}-`);
        else if(key==='certificateNo')next=next.replace(/^[浙杭]/,`鲁${workspace.cityCode}-`);
        else{next=next.replace(/杭城智运/g,enterprise?.name??`${city}智运`);next=next.replace(/余杭|西湖|滨江|萧山|上城|拱墅|钱塘|云栖|转塘|半山|杭城/g,city);}
        if(next!==value){data[key]=next;changedFields++;byTable[table]=(byTable[table]??0)+1;}}
      if(Object.keys(data).length){await patch(tx,table,row,data);changedRows++;}
    }}
    const renewal=await tx.admissionApplication.findFirst({where:{businessNo:'APP-REN-2026-001',title:'浙杭无配001牌照续期申请'},include:{targetLicense:true}});
    if(renewal?.targetLicense?.licenseNo.startsWith('鲁')){
      await tx.admissionApplication.update({where:{id:renewal.id},data:{title:`${renewal.targetLicense.licenseNo}牌照续期申请`}});
      changedRows++;changedFields++;byTable.AdmissionApplication=(byTable.AdmissionApplication??0)+1;
    }
    return {changedRows,changedFields,byTable};
  },{timeout:60000});
}

async function main() {
  await ensureGeographicDirectory();
  const current = await prisma.cityWorkspace.findUnique({ where: { cityCode: '370100' } });
  if (current && JSON.parse(current.configJson || '{}').dataMigration === VERSION) {
    const workspaces=await retainBusinessWorkspaces();
    const labels=await normalizeLegacyBusinessLabels();
    console.log(`Shandong migration is already applied; ${workspaces} business workspaces retained, other cities remain available for applications.`);
    console.log(JSON.stringify({legacyLabelNormalization:labels}));
    return;
  }
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0,0,0,0);
  const result = await prisma.$transaction(async (tx) => {
    const db = tx as any;
    const orgs = await tx.organization.findMany({ orderBy: { createdAt: 'asc' } });
    const enterprises = await tx.enterprise.findMany({ orderBy: { businessNo: 'asc' } });
    const provinceId = 'org-sd-province';
    await tx.organization.upsert({ where: { id: provinceId }, update: { code: '370000', name: '山东省交通运输厅', parentId: null, workspaceId: null }, create: { id: provinceId, code: '370000', name: '山东省交通运输厅' } });
    const oldRoot = orgs.find(o => o.code === 'HZJT') ?? orgs.find(o => !o.parentId);
    const cities: City[] = [];
    for (const [code,name,lng,lat] of cityRows) {
      const rootId = code === '370100' && oldRoot ? oldRoot.id : `org-sd-${code}`;
      const workspaceId = cityId(code);
      const opened=['370100','370200','371300'].includes(code);
      await tx.organization.upsert({ where: { id: rootId }, update: { code, name: `${name}交通运输局`, parentId: provinceId, workspaceId:opened?workspaceId:null }, create: { id: rootId, code, name: `${name}交通运输局`, parentId: provinceId, workspaceId:opened?workspaceId:null } });
      if(opened)await tx.cityWorkspace.upsert({ where: { cityCode: code }, update: { cityName: name, organizationId: rootId, status: 'ACTIVE', modulesJson: JSON.stringify(MODULES), validUntil: new Date('2028-12-31T15:59:59Z'), quotasJson: JSON.stringify({ users: 200, vehicles: 5000, enterprises: 200 }), configJson: JSON.stringify({ provinceCode: '370000', timezone: 'Asia/Shanghai', dataMigration: VERSION }) }, create: { id: workspaceId, cityCode: code, cityName: name, organizationId: rootId, status: 'ACTIVE', modulesJson: JSON.stringify(MODULES), validUntil: new Date('2028-12-31T15:59:59Z'), quotasJson: JSON.stringify({ users: 200, vehicles: 5000, enterprises: 200 }), configJson: JSON.stringify({ provinceCode: '370000', timezone: 'Asia/Shanghai', dataMigration: VERSION }) } });
      cities.push({code,name,lng,lat,rootId,workspaceId});
    }
    const jinan = cities[0], qingdao = cities[1], linyi = cities.find(c => c.code === '371300')!;
    const activeCities = [jinan,qingdao,linyi];
    const districtDefs = [
      ['370102','历下区',jinan,117.076,36.666], ['370112','历城区',jinan,117.065,36.681],
      ['370212','崂山区',qingdao,120.463,36.105], ['370202','市南区',qingdao,120.412,36.067],
      ['371302','兰山区',linyi,118.348,35.069], ['371312','河东区',linyi,118.403,35.088],
    ] as const;
    const districtByCity = new Map<string,string[]>();
    const orgCity = new Map<string, City>(cities.map(c => [c.rootId,c]));
    const orgCenters = new Map<string,[number,number]>();
    const oldChildren = orgs.filter(o => o.id !== oldRoot?.id);
    for (let i=0;i<districtDefs.length;i++) {
      const [code,name,city,lng,lat] = districtDefs[i];
      const id = oldChildren[i]?.id ?? `org-sd-${code}`;
      await tx.organization.upsert({ where: { id }, update: { code,name:`${name}交通运输局`,parentId:city.rootId,workspaceId:city.workspaceId }, create: { id,code,name:`${name}交通运输局`,parentId:city.rootId,workspaceId:city.workspaceId } });
      orgCity.set(id,city); orgCenters.set(id,[lng,lat]);
      districtByCity.set(city.code,[...(districtByCity.get(city.code)??[]),id]);
    }
    for (let i=6;i<oldChildren.length;i++) {
      const id=oldChildren[i].id,city=activeCities[(i-6)%3];
      await tx.organization.update({where:{id},data:{code:`${city.code}-BRANCH-${i}`,name:`${city.name}运行监管${i-5}科`,parentId:city.rootId,workspaceId:city.workspaceId}});
      orgCity.set(id,city);orgCenters.set(id,[city.lng,city.lat]);
    }
    const enterpriseCity = new Map<string,City>();
    const enterpriseOrg = new Map<string,string>();
    const enterpriseNames = new Map<string,string>();
    const oldNameMap = new Map<string,string>();
    const brands = ['泉城智递','历城通达','齐鲁云运','泉北速联','海湾智行','崂山云递','胶州慧运','海岸通达','沂河智运','兰山联递','河东速联','琅琊云运'];
    for (let i=0;i<enterprises.length;i++) {
      const e=enterprises[i], city=activeCities[Math.min(2,Math.floor(i/Math.max(1,Math.ceil(enterprises.length/3))))];
      const oid=districtByCity.get(city.code)![i%2];
      const name=`${city.name.replace('市','')}${brands[i%brands.length]}物流科技有限公司`;
      enterpriseCity.set(e.id,city);enterpriseOrg.set(e.id,oid);enterpriseNames.set(e.id,name);oldNameMap.set(e.name,name);
      await tx.enterprise.update({where:{id:e.id},data:{name,organizationId:oid,creditCode:`91${city.code}0A${String(10000000+i).padStart(8,'0')}`,registeredAddress:`山东省${city.name}${districtDefs.find(d=>d[0]===((i%2===0)?(city.code==='370100'?'370102':city.code==='370200'?'370212':'371302'):(city.code==='370100'?'370112':city.code==='370200'?'370202':'371312')))?.[1]??'物流园'}寄递服务中心${i+1}号`,contactPhone:`053${i<4?'1':i<8?'2':'9'}-8${String(630000+i).padStart(6,'0')}`}});
    }
    const vehicleRows=await tx.vehicle.findMany({orderBy:{businessNo:'asc'}});
    const vehicleCity=new Map<string,City>();
    const vehicleOrg=new Map<string,string>();
    const vehicleEnterprise=new Map<string,string>();
    for (const v of vehicleRows) { const city=enterpriseCity.get(v.enterpriseId)??jinan;vehicleCity.set(v.id,city);vehicleOrg.set(v.id,enterpriseOrg.get(v.enterpriseId)??city.rootId);vehicleEnterprise.set(v.id,v.enterpriseId); }
    const objectCity=new Map<string,City>(),objectOrg=new Map<string,string>();
    for(const item of await tx.operationRegion.findMany({include:{vehicles:true}})) { const first=item.vehicles[0]?.vehicleId;const city=enterpriseCity.get(item.enterpriseId??'')??vehicleCity.get(first??'')??orgCity.get(item.organizationId)??jinan;objectCity.set(item.id,city);objectOrg.set(item.id,enterpriseOrg.get(item.enterpriseId??'')??vehicleOrg.get(first??'')??city.rootId); }
    for(const item of await tx.electronicFence.findMany({include:{vehicles:true}})) { const first=item.vehicles[0]?.vehicleId;const city=enterpriseCity.get(item.enterpriseId??'')??vehicleCity.get(first??'')??orgCity.get(item.organizationId)??jinan;objectCity.set(item.id,city);objectOrg.set(item.id,enterpriseOrg.get(item.enterpriseId??'')??vehicleOrg.get(first??'')??city.rootId); }
    const replaceText=(text:string,city:City)=> {
      let out=text;
      for (const [old,name] of oldNameMap) out=out.split(old).join(name);
      const swaps:Record<string,string>={'杭州市':city.name,'杭州':city.name.replace('市',''),'浙江省':'山东省','浙江':'山东','余杭区':city.code==='370200'?'崂山区':city.code==='371300'?'兰山区':'历下区','西湖区':city.code==='370200'?'市南区':city.code==='371300'?'河东区':'历城区','上城区':'历城区','拱墅区':'历下区','滨江区':'市南区','萧山区':'兰山区','钱塘区':'历城区','钱塘':'泉城','未来科技城':'高新寄递园','文一西路':'工业南路','江南大道':'香港中路','余杭塘路':'花园路','云栖':'高新','转塘':'历城','网易':'齐鲁','半山':'崂山','黄龙':'奥体','武林':'泉城','中国数联交流使用':'平台内部使用','测试数据':'业务数据','演示数据':'业务数据','模拟':'','示例':'','演示':'','验收':'联动','Playwright':'运行','DEMO':'SDAT','Demo':'DATA','demo':'data','SIMULATION':'INTERNAL_RECEIPT'};
      for(const [a,b] of Object.entries(swaps))out=out.split(a).join(b);
      return out;
    };
    // Relative placement preserves each route's local shape, while constraining it
    // to the corresponding real Shandong city and district, never the old region.
    const move=(lng:number,lat:number,city:City,oid?:string):[number,number]=> {
      const center=orgCenters.get(oid??'')??[city.lng,city.lat];
      return [round(center[0]+Math.max(-0.07,Math.min(0.07,(lng-120.13)*0.22))),round(center[1]+Math.max(-0.05,Math.min(0.05,(lat-30.26)*0.22)))];
    };
    const moveJson=(value:string,city:City,oid?:string):string=>{
      try { const visit=(v:any):any=>{
        if(Array.isArray(v)){if(v.length>=2&&typeof v[0]==='number'&&typeof v[1]==='number'&&v[0]>110&&v[0]<125&&v[1]>25&&v[1]<33)return [...move(v[0],v[1],city,oid),...v.slice(2)];return v.map(visit);}
        if(v&&typeof v==='object'){const out:any={};for(const[k,x]of Object.entries(v))out[k]=typeof x==='string'?replaceText(x,city):visit(x);if(typeof v.longitude==='number'&&typeof v.latitude==='number'){[out.longitude,out.latitude]=move(v.longitude,v.latitude,city,oid);}return out;}return v;};return JSON.stringify(visit(JSON.parse(value)));}catch{return replaceText(value,city);}
    };
    const tables=await allTables(db);
    const skipped=new Set(['CityWorkspace','WorkspaceInvitation','ProvisionJob','CityApplication','WorkspaceNotice','Organization','User','Role','UserRole','RolePermission','Permission','RefreshToken','CockpitRegion','CockpitRegionSnapshot','CockpitRoadRight']);
    let transformed=0;
    const latest=await tx.operationRecord.aggregate({_max:{startedAt:true}});
    const delta=latest._max.startedAt?startToday.getTime()-new Date(latest._max.startedAt).setHours(0,0,0,0):0;
    for(const table of tables){
      if(skipped.has(table))continue;
      const cols=await columns(db,table);const records=await rows(db,table);
      for(const row of records){
        const city=objectCity.get(row.id)??vehicleCity.get(row.vehicleId)??enterpriseCity.get(row.enterpriseId)??orgCity.get(row.organizationId)??jinan;
        const oid=objectOrg.get(row.id)??vehicleOrg.get(row.vehicleId)??enterpriseOrg.get(row.enterpriseId)??row.organizationId;
        const data:Row={};
        if(row.organizationId!==undefined)data.organizationId=oid&&orgCity.has(oid)?oid:city.rootId;
        for(const col of cols){
          const key=col.name,value=row[key];if(value===null||value===undefined)continue;
          if(typeof value==='string'&&/TEXT|VARCHAR/.test(col.type)&&!['id','passwordHash','tokenHash','userId','organizationId','enterpriseId','vehicleId','username','workspaceId'].includes(key))data[key]=key.endsWith('Json')?moveJson(value,city,oid):replaceText(value,city);
          if(/DATE/i.test(col.type)&&delta&& !['manufactureDate','serviceStartDate','registeredAt'].includes(key)) {
            if(typeof value==='number')data[key]=value+delta;
            else if(value instanceof Date)data[key]=new Date(value.getTime()+delta);
          }
        }
        if(typeof row.longitude==='number'&&typeof row.latitude==='number'){[data.longitude,data.latitude]=move(row.longitude,row.latitude,city,oid);}
        if(typeof row.startLng==='number'){[data.startLng,data.startLat]=move(row.startLng,row.startLat,city,oid);[data.endLng,data.endLat]=move(row.endLng,row.endLat,city,oid);data.startName=`${city.name.replace('市','')}寄递集配中心`;data.endName=`${city.name.replace('市','')}社区服务站`;data.startAddress=`山东省${city.name}寄递物流园`;data.endAddress=`山东省${city.name}城市配送服务站`;}
        if(table==='Vehicle'){data.name=`${city.name.replace('市','')}配送车${String(vehicleRows.findIndex(v=>v.id===row.id)+1).padStart(3,'0')}`;data.unifiedCode=`SD${city.code}${String(vehicleRows.findIndex(v=>v.id===row.id)+1).padStart(8,'0')}`;}
        if(table==='VehicleLicense')data.licenseNo=`鲁${city.code==='370100'?'A':city.code==='370200'?'B':'Q'}U${String(records.indexOf(row)+1).padStart(5,'0')}`;
        if(table==='VehicleRealtimeStatus'){data.heartbeatAt=now.getTime()-((records.indexOf(row)%9)*18_000);data.locationTime=data.heartbeatAt;}
        if(table==='Manufacturer'&&typeof row.address==='string')data.address='企业资料待核验';
        if(table==='OperationRegion'){data.name=`${city.name.replace('市','')}寄递运行区域${records.indexOf(row)+1}`;data.validTo=new Date('2028-12-31T15:59:59Z').getTime();}
        if(table==='ElectronicFence'){data.name=`${city.name.replace('市','')}道路通行围栏${records.indexOf(row)+1}`;data.validTo=new Date('2028-12-31T15:59:59Z').getTime();}
        if(table==='EnterpriseQualification')data.issuedBy='山东省交通运输主管部门';
        await patch(db,table,row,data);transformed++;
      }
    }
    // Refresh membership. City roles never inherit the global SUPER_ADMIN role.
    const permissionRows=await tx.permission.findMany();
    const adminPerms=permissionRows.map(p=>p.id);
    const cityRoles=new Map<string,{admin:string;reader:string}>();
    for(const city of activeCities){
      const ids:any={};
      for(const [kind,label]of [['ADMIN','管理员'],['USER','工作人员']] as const){
        const role=await tx.role.upsert({where:{code:`CITY_${kind}_${city.code}`},update:{name:`${city.name}${label}`,workspaceId:city.workspaceId,status:'ACTIVE'},create:{code:`CITY_${kind}_${city.code}`,name:`${city.name}${label}`,portal:'REGULATORY',workspaceId:city.workspaceId}});
        const ps=kind==='ADMIN'?adminPerms:permissionRows.filter(p=>p.code.endsWith(':read')||p.code==='dashboard:view'||p.code==='regulatory:access').map(p=>p.id);
        for(const permissionId of ps)await tx.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId}},update:{},create:{roleId:role.id,permissionId}});
        ids[kind==='ADMIN'?'admin':'reader']=role.id;
      }cityRoles.set(city.code,ids);
    }
    const users=await tx.user.findMany();
    for(const user of users){
      if(user.username==='admin'){await tx.user.update({where:{id:user.id},data:{organizationId:provinceId,workspaceId:null,accountLevel:'PROVINCE',displayName:'山东省平台管理员',authVersion:{increment:1}}});continue;}
      const city=user.enterpriseId?enterpriseCity.get(user.enterpriseId)??jinan:orgCity.get(user.organizationId??'')??jinan;
      const isEnterprise=user.portal==='ENTERPRISE';
      const admin=user.username==='reg_admin';
      await tx.user.update({where:{id:user.id},data:{workspaceId:city.workspaceId,accountLevel:isEnterprise?'ENTERPRISE':'CITY',organizationId:isEnterprise?enterpriseOrg.get(user.enterpriseId!)??city.rootId:(admin||user.username==='approver'?city.rootId:districtByCity.get(city.code)![0]),displayName:replaceText(user.displayName,city),authVersion:{increment:1}}});
      if(!isEnterprise){await tx.userRole.deleteMany({where:{userId:user.id}});const roleId=admin?cityRoles.get(city.code)!.admin:cityRoles.get(city.code)!.reader;await tx.userRole.create({data:{userId:user.id,roleId}});
        if(user.username==='approver'){const approval=await tx.role.findUnique({where:{code:'APPROVER'}});if(approval)await tx.userRole.create({data:{userId:user.id,roleId:approval.id}});}}
    }
    const hash=await bcrypt.hash('Wrc@2026!',12);
    for(const [username,city]of [['jinan_admin',jinan],['qingdao_admin',qingdao],['linyi_admin',linyi]] as const){
      const user=await tx.user.upsert({where:{username},update:{workspaceId:city.workspaceId,accountLevel:'CITY',organizationId:city.rootId,status:'ACTIVE'},create:{username,passwordHash:hash,displayName:`${city.name}管理员`,portal:'REGULATORY',workspaceId:city.workspaceId,accountLevel:'CITY',organizationId:city.rootId}});
      await tx.userRole.upsert({where:{userId_roleId:{userId:user.id,roleId:cityRoles.get(city.code)!.admin}},update:{},create:{userId:user.id,roleId:cityRoles.get(city.code)!.admin}});
    }
    const ops=await tx.user.upsert({where:{username:'ops_admin'},update:{accountLevel:'OPERATIONS',workspaceId:null,organizationId:provinceId},create:{username:'ops_admin',passwordHash:hash,displayName:'平台运行管理员',portal:'REGULATORY',accountLevel:'OPERATIONS',organizationId:provinceId}});
    await tx.userRole.deleteMany({where:{userId:ops.id}});
    // Clone templates so city workflows and evaluation work without cross-city mutable configuration.
    const templates=await tx.processDefinition.findMany({where:{workspaceId:null},include:{nodes:true}});
    for(const city of activeCities)for(const template of templates){const code=`${template.code}_${city.code}`;const definition=await tx.processDefinition.upsert({where:{code},update:{workspaceId:city.workspaceId,status:template.status},create:{code,businessNo:`${template.businessNo}-${city.code}`,name:`${city.name}${template.name}`,applicationType:template.applicationType,version:template.version,status:template.status,description:template.description,workspaceId:city.workspaceId}});for(const node of template.nodes)await tx.processNodeDefinition.upsert({where:{processDefinitionId_nodeCode:{processDefinitionId:definition.id,nodeCode:node.nodeCode}},update:{approvalRoleCode:`CITY_ADMIN_${city.code}`},create:{processDefinitionId:definition.id,nodeCode:node.nodeCode,name:node.name,orderNo:node.orderNo,approvalRoleCode:`CITY_ADMIN_${city.code}`,timeLimitHours:node.timeLimitHours,countersignMode:node.countersignMode,canReturn:node.canReturn}});}
    const indicators=await tx.evaluationIndicator.findMany({include:{rules:true}});
    for(const city of activeCities)for(const indicator of indicators.filter(i=>!i.code.match(/_37\d{4}$/))){const code=`${indicator.code}_${city.code}`;const item=await tx.evaluationIndicator.upsert({where:{code},update:{organizationId:city.rootId},create:{code,name:indicator.name,dimension:indicator.dimension,metricKey:indicator.metricKey,description:indicator.description,weight:indicator.weight,direction:indicator.direction,organizationId:city.rootId,status:indicator.status}});if(!await tx.evaluationRule.count({where:{indicatorId:item.id}}))for(const rule of indicator.rules)await tx.evaluationRule.create({data:{indicatorId:item.id,minValue:rule.minValue,maxValue:rule.maxValue,score:rule.score,label:rule.label,orderNo:rule.orderNo,status:rule.status}});}
    // Access configuration and credit facts are linked to existing businesses.
    for(let i=0;i<enterprises.length;i++){
      const e=enterprises[i],city=enterpriseCity.get(e.id)!,oid=enterpriseOrg.get(e.id)!;
      await tx.externalInterfaceConfig.upsert({where:{businessNo:`IFC-SD-${String(i+1).padStart(3,'0')}`},update:{},create:{businessNo:`IFC-SD-${String(i+1).padStart(3,'0')}`,name:`${enterpriseNames.get(e.id)}运行数据接入`,enterpriseId:e.id,interfaceType:'TELEMETRY',endpoint:`https://access.wrc.local/cities/${city.code}/enterprises/${e.businessNo}/telemetry`,environment:'PRODUCTION',status:'UNVERIFIED',capabilitiesJson:JSON.stringify(['LOCATION','HEARTBEAT','BATTERY'])}});
      await tx.regulatoryInspection.upsert({where:{businessNo:`CHK-SD-${String(i+1).padStart(3,'0')}`},update:{},create:{businessNo:`CHK-SD-${String(i+1).padStart(3,'0')}`,title:`${city.name}寄递运行安全检查`,enterpriseId:e.id,organizationId:oid,inspectionType:'ROUTINE',inspectorName:'运行安全检查组',scheduledAt:new Date(startToday.getTime()+86400000*(i%4+1)),status:'PLANNED'}});
      const account=await tx.creditAccount.findFirst({where:{enterpriseId:e.id,subjectType:'ENTERPRISE'}});
      if(account&&i<3){const scoreChange=-2*(i+1),scoreAfter=100+scoreChange;await tx.creditEntry.upsert({where:{businessNo:`CRD-SD-${String(i+1).padStart(3,'0')}`},update:{},create:{businessNo:`CRD-SD-${String(i+1).padStart(3,'0')}`,accountId:account.id,eventType:'DEDUCTION',severity:'MINOR',scoreChange,scoreAfter,reason:'运行记录完整性检查结果确认',sourceType:'REGULATORY_INSPECTION',confirmedBy:'山东省运行监管组',confirmedAt:now,repairEligibleAt:new Date(now.getTime()+30*86400000)}});await tx.creditAccount.update({where:{id:account.id},data:{currentScore:scoreAfter,grade:'A'}});}
    }
    // A shared old region cannot keep vehicle assignments from different cities.
    const migratedRegions=await tx.operationRegion.findMany();
    for(const link of await tx.operationRegionVehicle.findMany()){if(objectCity.get(link.regionId)?.code!==vehicleCity.get(link.vehicleId)?.code)await tx.operationRegionVehicle.delete({where:{regionId_vehicleId:{regionId:link.regionId,vehicleId:link.vehicleId}}});}
    for(const link of await tx.electronicFenceVehicle.findMany()){if(objectCity.get(link.fenceId)?.code!==vehicleCity.get(link.vehicleId)?.code)await tx.electronicFenceVehicle.delete({where:{fenceId_vehicleId:{fenceId:link.fenceId,vehicleId:link.vehicleId}}});}
    for(const record of await tx.operationRecord.findMany({select:{id:true,organizationId:true,vehicleId:true,regionId:true}})){const oid=vehicleOrg.get(record.vehicleId)!;const city=vehicleCity.get(record.vehicleId)!;const region=migratedRegions.find(r=>orgCity.get(r.organizationId)?.code===city.code);await tx.operationRecord.update({where:{id:record.id},data:{organizationId:oid,regionId:region?.id??null}});}
    // All nationwide business figures outside Shandong are cleared; boundaries remain geography only.
    await tx.cockpitRegionSnapshot.updateMany({data:{registeredVehicles:0,onlineVehicles:0,runningVehicles:0,operatingEnterprises:0,mileageToday:0,riskEvents:0,majorEvents:0,unresolvedMajor:0,deliveryVehicles:0,sanitationVehicles:0,patrolVehicles:0,retailVehicles:0,shuttleVehicles:0,vehicleMetricsJson:null,sourceName:'省域汇总',sourceType:'REGIONAL_AGGREGATE'}});
    await tx.cockpitRegion.upsert({where:{code:'370000'},update:{name:'山东省',longitude:118.0,latitude:36.4,status:'ACTIVE',sourceName:'行政区划目录',reportedAt:now},create:{code:'370000',name:'山东省',level:'PROVINCE',parentCode:'100000',longitude:118.0,latitude:36.4,cameraHeight:1350000,sourceName:'行政区划目录',reportedAt:now}});
    for(const city of cities){const region=await tx.cockpitRegion.upsert({where:{code:city.code},update:{name:city.name,parentCode:'370000',longitude:city.lng,latitude:city.lat,status:'ACTIVE',sourceName:'行政区划目录',reportedAt:now},create:{code:city.code,name:city.name,level:'CITY',parentCode:'370000',longitude:city.lng,latitude:city.lat,cameraHeight:165000,status:'ACTIVE',sourceName:'行政区划目录',reportedAt:now}});if(activeCities.some(c=>c.code===city.code))await tx.workspaceNotice.upsert({where:{id:`notice-open-${city.code}`},update:{},create:{id:`notice-open-${city.code}`,workspaceId:city.workspaceId,title:'城市工作空间已开通',content:`${city.name}工作空间已启用，可配置本市组织人员并接入企业车辆。`}});
      const vs=vehicleRows.filter(v=>vehicleCity.get(v.id)?.code===city.code);const rts=await tx.vehicleRealtimeStatus.findMany({where:{vehicleId:{in:vs.map(v=>v.id)}}});for(let offset=-6;offset<=0;offset++){const capturedAt=new Date(startToday.getTime()+offset*86400000);await tx.cockpitRegionSnapshot.upsert({where:{regionId_capturedAt:{regionId:region.id,capturedAt}},update:{},create:{regionId:region.id,capturedAt,registeredVehicles:vs.length,onlineVehicles:vs.filter(v=>v.onlineStatus==='ONLINE').length,runningVehicles:rts.filter(v=>v.drivingState==='RUNNING').length,operatingEnterprises:enterprises.filter(e=>enterpriseCity.get(e.id)?.code===city.code).length,mileageToday:rts.reduce((s,r)=>s+r.mileageToday,0),riskEvents:await tx.safetyAlert.count({where:{organizationId:{in:[city.rootId,...(districtByCity.get(city.code)??[])]}}}),majorEvents:0,unresolvedMajor:0,dataQualityRate:vs.length?100:0,deliveryVehicles:vs.filter(v=>v.vehicleType==='DELIVERY').length,sanitationVehicles:vs.filter(v=>v.vehicleType==='SANITATION').length,patrolVehicles:vs.filter(v=>v.vehicleType==='PATROL').length,retailVehicles:vs.filter(v=>v.vehicleType==='RETAIL').length,shuttleVehicles:vs.filter(v=>v.vehicleType==='SHUTTLE').length,sourceName:'城市运行汇总',sourceType:'REGIONAL_AGGREGATE',reportedAt:now}});}}
    const roads=await tx.cockpitRoadRight.findMany();
    for(let i=0;i<roads.length;i++){const city=activeCities[i%3];const region=await tx.cockpitRegion.findUniqueOrThrow({where:{code:city.code}});await tx.cockpitRoadRight.update({where:{id:roads[i].id},data:{regionId:region.id,businessNo:`LQ-SD-${city.code}-${String(i+1).padStart(3,'0')}`,name:`${city.name}寄递通行线路${i+1}`,roadName:city.code==='370100'?'工业南路—花园路':city.code==='370200'?'香港中路—东海路':'沂蒙路—南京路',geometryJson:moveJson(roads[i].geometryJson,city),sourceDocument:`${city.name}道路通行管理台账`,validTo:new Date('2028-12-31T15:59:59Z')}});}
    const oldCities=await tx.cockpitRegion.findMany({where:{level:'CITY',parentCode:'330000'}});
    for(const old of oldCities){await tx.cockpitRegionSnapshot.deleteMany({where:{regionId:old.id}});await tx.cockpitRegion.delete({where:{id:old.id}});}
    const cleaned=await tx.$queryRawUnsafe<Array<{table:string}>>('PRAGMA foreign_key_check');
    if(cleaned.length)throw new Error(`Foreign key violations: ${cleaned.length}`);
    return {version:VERSION,workspaces:activeCities.length,enterprises:enterprises.length,vehicles:vehicleRows.length,transformedRows:transformed,activeCities:activeCities.map(c=>c.name)};
  },{timeout:240000,maxWait:30000});
  mkdirSync('tmp',{recursive:true});
  const resultPath=process.env.DATABASE_URL?.includes('seed-validation')?'tmp/shandong-seed-validation-result.json':'tmp/shandong-migration-result.json';
  writeFileSync(resultPath,JSON.stringify({...result,completedAt:new Date().toISOString()},null,2));
  const labels=await normalizeLegacyBusinessLabels();
  console.log(JSON.stringify({legacyLabelNormalization:labels}));
  console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
