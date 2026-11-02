// New, uniquely owned fixtures are removed in finally; existing rules are restored.
const {request}=require('playwright');
const {PrismaClient}=require('@prisma/client');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
process.env.DATABASE_URL='file:'+path.resolve('data/regulatory.db').replace(/\\/g,'/');
const db=new PrismaClient(),base=process.env.API_URL||'http://127.0.0.1:8080/api';
const marker='CA-ACCEPT-'+randomUUID(),checks=[],own={enterprise:[],vehicle:[],tasks:[],reports:[],materials:[],rules:[]};
let http,token,originalRules=[],orgId,passed=false;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function login(username){const r=await http.post(base+'/auth/login',{data:{username,password:process.env.TEST_PASSWORD||'Wrc@2026!'}});assert.equal(r.status(),200);return(await r.json()).data.accessToken;}
async function call(method,url,data,status=200,auth=token){const r=await http[method](base+url,{headers:{authorization:'Bearer '+auth},...(data?{data}:{})});const b=await r.json();if(status===200)assert(r.status()>=200&&r.status()<300,JSON.stringify({url,status:r.status(),body:b}));else assert.equal(r.status(),status,JSON.stringify({url,status:r.status(),body:b}));return b.data;}
const get=(url,status=200,auth=token)=>call('get',url,null,status,auth);
const post=(url,data,status=200,auth=token)=>call('post',url,data,status,auth);
(async()=>{http=await request.newContext();try{
 token=await login('jinan_admin');const foreign=await login('qingdao_admin'),enterpriseToken=await login('ent_admin'),provinceToken=await login('admin');
 const actor=await get('/auth/me');orgId=actor.organizationId;
 const ops=await get('/city-analytics/operations'),safety=await get('/city-analytics/safety');
 assert.equal(ops.trend.length,ops.period.days);assert.equal(safety.kpis.pending+safety.kpis.handling+safety.kpis.closed,safety.kpis.total);
 assert.equal(safety.types.reduce((s,t)=>s+t.value,0),safety.kpis.total);
 const source=await db.operationRecord.findMany({where:{organizationId:{in:actor.scopeOrganizationIds},startedAt:{gte:new Date(ops.period.from+'T00:00:00+08:00'),lte:new Date(ops.period.to+'T23:59:59.999+08:00')}}});
 assert.equal(ops.kpis.trips,source.length);assert.equal(ops.kpis.mileage,Math.round(source.reduce((s,r)=>s+r.mileage,0)*10)/10);
 await get('/city-analytics/operations?from=2026-02-30&to=2026-03-01',400);
 await get('/city-analytics/operations?from=2026-10-30&to=2026-10-01',400);
 assert.equal((await get('/city-analytics/operations?from=2026-08-01&to=2026-10-31')).trend.length,92);
 await get('/city-analytics/evaluations',403,enterpriseToken);await get('/city-analytics/credit',403,provinceToken);
 const fo=await get('/city-analytics/options',200,foreign);await get('/city-analytics/operations?enterpriseId='+fo.enterprises[0].id,404);
 checks.push('actual aggregates, Shanghai dates, cross-month range, invalid dates, role and city isolation');
 originalRules=await db.businessRule.findMany({where:{organizationId:orgId,category:{in:['CITY_EVALUATION','CITY_CREDIT']}}});
 const e=await db.enterprise.create({data:{businessNo:marker,name:'验收临时企业-'+marker.slice(-6),creditCode:marker,organizationId:orgId}});own.enterprise.push(e.id);
 const model=await db.vehicleModel.findFirstOrThrow({where:{status:'ACTIVE'}});
 const v=await db.vehicle.create({data:{businessNo:marker+'-VEH',vin:'TEST'+randomUUID().replace(/-/g,'').slice(0,13),deviceNo:marker,name:'验收临时车辆',unifiedCode:marker,enterpriseId:e.id,organizationId:orgId,modelId:model.id}});own.vehicle.push(v.id);
 const range={from:'2026-05-15',to:'2026-05-15'},at=new Date('2026-05-14T16:00:00Z');
 await db.operationRecord.create({data:{businessNo:marker+'-OP',vehicleId:v.id,enterpriseId:e.id,organizationId:orgId,startedAt:at,endedAt:new Date(+at+36000000),mileage:120,durationMinutes:600}});
 await db.vehicleOnlineDaily.create({data:{vehicleId:v.id,metricDate:at,onlineMinutes:600,totalMinutes:600,onlineRate:100}});
 const alert=await db.safetyAlert.create({data:{businessNo:marker+'-ALERT',alertType:'SPEEDING',source:'MANUAL',title:'验收关联告警',enterpriseId:e.id,organizationId:orgId,vehicleId:v.id,occurredAt:at,status:'PROCESSING'}});
 const makeViolation=(suffix,status,alertId)=>db.violation.create({data:{businessNo:marker+suffix,violationType:'SPEEDING',title:'验收违规事项',description:'核查记录',enterpriseId:e.id,organizationId:orgId,vehicleId:v.id,occurredAt:at,alertId,status}});
 const confirmed=await makeViolation('-V1','CONFIRMED',alert.id),pending=await makeViolation('-V2','PENDING_DETERMINATION');
 const query=new URLSearchParams({...range,enterpriseId:e.id});
 assert.equal((await get('/city-analytics/safety?'+query)).kpis.total,2);
 assert.equal((await get('/city-analytics/operations?'+query)).kpis.mileage,120);
 const initial=await get('/city-analytics/evaluations/rules');
 const indicators=[
  {name:'事故数',metricKey:'accidentCount',dimension:'SAFETY',weight:50,rules:[{minValue:0,maxValue:null,score:100,label:'有效统计'}]},
  {name:'违规数',metricKey:'violationCount',dimension:'COMPLIANCE',weight:30,rules:[{minValue:0,maxValue:1,score:100,label:'0起'},{minValue:1,maxValue:null,score:80,label:'1起以上'}]},
  {name:'在线率',metricKey:'onlineRate',dimension:'OPERATION',weight:20,rules:[{minValue:0,maxValue:95,score:80,label:'低于95%'},{minValue:95,maxValue:null,score:100,label:'95%以上'}]}
 ];
 const rule=await post('/city-analytics/evaluations/rules',{name:marker,expectedVersion:initial.version,indicators});own.rules.push(rule.id);
 await post('/city-analytics/evaluations/rules',{name:marker,expectedVersion:initial.version,indicators},409);
 const task=await post('/city-analytics/evaluations',{name:marker,periodType:'SPECIAL',...range,enterpriseId:e.id,rulesVersion:rule.versionLabel});own.tasks.push(task.id);
 const list=await get('/city-analytics/evaluations?taskId='+task.id);let ev=await get('/city-analytics/evaluations/'+list.items[0].id);
 assert.equal(ev.status,'DATA_PENDING');assert.equal(ev.totalScore,null);
 const act=(action,comment,status=200)=>post('/city-analytics/evaluations/'+ev.id+'/actions',{action,comment,version:ev.version},status);
 await act('PUBLISH','不应发布',400);
 await db.violation.update({where:{id:pending.id},data:{status:'CONFIRMED'}});
 ev=await act('RECALCULATE','核对后重算');assert.equal(ev.totalScore,94);
 await act('PUBLISH','不能跳过复核',400);ev=await act('REVIEW','核对指标与依据');ev=await act('PUBLISH','发布复核结果');assert.equal(ev.status,'PUBLISHED');
 const frozen=hash(ev.history),next=JSON.parse(JSON.stringify(indicators));next[0].rules[0].score=90;
 const rule2=await post('/city-analytics/evaluations/rules',{name:marker+'-V2',expectedVersion:rule.version,indicators:next});own.rules.push(rule2.id);
 const preserved=await get('/city-analytics/evaluations/'+ev.id);assert.equal(preserved.totalScore,94);assert.equal(preserved.rulesVersion,rule.versionLabel);assert.equal(hash(preserved.history),frozen);
 await get('/city-analytics/evaluations/'+ev.id,404,foreign);
 const appeal=await db.evaluationAppeal.create({data:{businessNo:marker+'-APPEAL',evaluationId:ev.id,enterpriseId:e.id,organizationId:orgId,reason:'验收申诉',submittedById:'fixture',submittedByName:'验收申请人'}});
 await post('/analytics/appeals/'+appeal.id+'/review',{action:'ACCEPT',comment:'受理重新核定'});
 ev=await get('/city-analytics/evaluations/'+ev.id);assert.equal(ev.status,'UNDER_REVIEW');assert(ev.quality.length);
 await act('REVIEW','不可跳过重算',400);ev=await act('RECALCULATE','按原版规则重新核定');assert.equal(ev.totalScore,94);assert.equal(ev.rulesVersion,rule.versionLabel);
 checks.push('event de-duplication, unknown score, review gate, immutable publication and appeal recalculation');
 const initialCredit=await get('/city-analytics/credit/rules'),bands=[{key:'MINOR',points:2,repairDays:30},{key:'GENERAL',points:5,repairDays:0},{key:'SERIOUS',points:10,repairDays:180},{key:'MAJOR',points:20,repairDays:365}];
 const cr=await post('/city-analytics/credit/rules',{expectedVersion:initialCredit.version,bands});
 own.rules.push((await db.businessRule.findFirstOrThrow({where:{organizationId:orgId,category:'CITY_CREDIT',version:cr.version}})).id);
 const data={enterpriseId:e.id,sourceType:'VIOLATION',sourceId:confirmed.id,severity:'GENERAL',reason:'验收确认事实',rulesVersion:cr.versionLabel};
 let profile=await post('/city-analytics/credit/entries',data);assert.equal(profile.account.currentScore,95);const entry=profile.entries[0];
 await post('/city-analytics/credit/entries',data,409);await get('/city-analytics/credit/'+e.id,404,foreign);
 const uploaded=await http.post(base+'/city-analytics/credit/materials',{headers:{authorization:'Bearer '+token},multipart:{enterpriseId:e.id,file:{name:'整改材料.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jc1kAAAAASUVORK5CYII=','base64')}}});
 assert(uploaded.status()>=200&&uploaded.status()<300);const material=(await uploaded.json()).data;own.materials.push(material.id);
 profile=await post('/city-analytics/credit/entries/'+entry.id+'/repair',{comment:'已核实整改完成',materialIds:[material.id]});
 assert.equal(profile.account.currentScore,100);assert.equal(profile.entries[0].status,'REPAIRED');assert.equal(profile.entries[0].reason,data.reason);assert.equal(profile.entries[0].repairMaterials[0].sha256,material.sha256);
 await post('/city-analytics/credit/entries/'+entry.id+'/repair',{comment:'重复修复',materialIds:[material.id]},400);await post('/city-analytics/credit/entries',data,409);
 profile=await post('/city-analytics/credit/entries',{...data,sourceId:pending.id,severity:'SERIOUS'});
 await post('/city-analytics/credit/entries/'+profile.entries.find(x=>x.sourceId===pending.id).id+'/repair',{comment:'日期未到',materialIds:[material.id]},400);
 checks.push('credit source confirmation, de-duplication, material upload and hash, repair restoration and date gates');
 const report=await post('/city-analytics/reports',{title:marker,reportType:'SPECIAL',category:'COMPREHENSIVE',...range,enterpriseId:e.id});own.reports.push(report.id);
 const before=await get('/city-analytics/reports/'+report.id);assert.equal(before.summary.operations.kpis.mileage,120);
 await db.operationRecord.updateMany({where:{enterpriseId:e.id},data:{mileage:999}});
 assert.equal(hash((await get('/city-analytics/reports/'+report.id)).summary),hash(before.summary));
 const file=await get('/city-analytics/reports/'+report.id+'/export');assert(file.content.includes('"120"'));assert(!file.content.includes('"999"'));
 const zip=await post('/city-analytics/reports/batch-export',{ids:[report.id]});assert.equal(Buffer.from(zip.content,'base64').subarray(0,2).toString(),'PK');
 await get('/city-analytics/reports/'+report.id,404,foreign);
 const records=await get('/city-analytics/operations/records?'+query+'&pageSize=1');assert.equal(records.total,1);
 await get('/city-analytics/operations/records/'+records.items[0].id,404,foreign);
 checks.push('report snapshots, CSV and ZIP export, record pagination and foreign-record denial');passed=true;
}finally{
 fs.writeFileSync('tmp/city-analytics-fixture-journal.json',JSON.stringify({marker,own,originalRules,orgId},null,2));
 const evals=own.tasks.length?await db.enterpriseEvaluation.findMany({where:{taskId:{in:own.tasks}},select:{id:true}}):[];
 const accounts=own.enterprise.length?await db.creditAccount.findMany({where:{enterpriseId:{in:own.enterprise}},select:{id:true}}):[];
 const entries=accounts.length?await db.creditEntry.findMany({where:{accountId:{in:accounts.map(a=>a.id)}},select:{id:true}}):[];
 const entityIds=[...own.tasks,...own.reports,...own.materials,...own.rules,...evals.map(e=>e.id),...entries.map(e=>e.id)];
 if(own.enterprise.length)await db.$transaction(async tx=>{
  await tx.evaluationAppeal.deleteMany({where:{enterpriseId:{in:own.enterprise}}});
  await tx.enterpriseEvaluation.deleteMany({where:{taskId:{in:own.tasks}}});await tx.evaluationTask.deleteMany({where:{id:{in:own.tasks}}});
  await tx.regulatoryReport.deleteMany({where:{id:{in:own.reports}}});await tx.creditEntry.deleteMany({where:{accountId:{in:accounts.map(a=>a.id)}}});await tx.creditAccount.deleteMany({where:{id:{in:accounts.map(a=>a.id)}}});
  await tx.violation.deleteMany({where:{enterpriseId:{in:own.enterprise}}});await tx.safetyAlert.deleteMany({where:{enterpriseId:{in:own.enterprise}}});
  await tx.operationRecord.deleteMany({where:{enterpriseId:{in:own.enterprise}}});await tx.vehicleOnlineDaily.deleteMany({where:{vehicleId:{in:own.vehicle}}});
  await tx.vehicle.deleteMany({where:{id:{in:own.vehicle}}});await tx.safetyMaterial.deleteMany({where:{id:{in:own.materials}}});await tx.enterprise.deleteMany({where:{id:{in:own.enterprise}}});
  await tx.auditLog.deleteMany({where:{objectId:{in:entityIds}}});await tx.businessRule.deleteMany({where:{id:{in:own.rules}}});
  for(const r of originalRules)await tx.businessRule.update({where:{id:r.id},data:{status:r.status,updatedAt:r.updatedAt}});
 });
 const root=path.resolve('data/safety-materials');for(const id of own.materials){assert(/^[a-f\d-]{36}$/i.test(id));const file=path.resolve(root,id);assert(file.startsWith(root+path.sep));if(fs.existsSync(file))fs.unlinkSync(file);}
 const fixturesRemoved=!await db.enterprise.count({where:{id:{in:own.enterprise}}});const out=path.resolve('test-results/city-analytics');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'api-acceptance.json'),JSON.stringify({passed,checks,fixturesRemoved},null,2));await db.$disconnect();await http?.dispose();
}console.log(JSON.stringify({passed,checks}));})().catch(e=>{console.error(e);process.exitCode=1;});

