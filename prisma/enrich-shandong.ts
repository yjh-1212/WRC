import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/** Populate linked operating facts for the three initially opened cities. */
async function main(){
  const now=new Date();const today=new Date(now);today.setHours(0,0,0,0);
  const month=new Date(today.getFullYear(),today.getMonth(),1);
  const workspaces=await prisma.cityWorkspace.findMany({where:{cityCode:{in:['370100','370200','371300']}}});
  await prisma.$transaction(async tx=>{
    for(const workspace of workspaces){
      const orgs=await tx.organization.findMany({where:{workspaceId:workspace.id},select:{id:true}});const orgIds=orgs.map(o=>o.id);
      const enterprises=await tx.enterprise.findMany({where:{organizationId:{in:orgIds}},orderBy:{businessNo:'asc'}});
      const accountPrefix=({'370100':'jinan','370200':'qingdao','371300':'linyi'} as Record<string,string>)[workspace.cityCode];
      const enterprise=enterprises[0];
      if(accountPrefix&&enterprise){
        for(const kind of ['admin','user'] as const){
          const template=await tx.user.findUnique({where:{username:kind==='admin'?'ent_admin':'ent_user'}});
          const role=await tx.role.findUnique({where:{code:kind==='admin'?'ENTERPRISE_ADMIN':'ENTERPRISE_USER'}});
          if(!template||!role)throw new Error('Enterprise account templates are unavailable');
          const username=`${accountPrefix}_ent_${kind}`;
          const existing=await tx.user.findUnique({where:{username}});
          if(existing&&(existing.workspaceId!==workspace.id||existing.enterpriseId!==enterprise.id))throw new Error('Enterprise account belongs to a different business scope');
          await tx.user.upsert({where:{username},update:{},create:{username,displayName:`${workspace.cityName}企业${kind==='admin'?'管理员':'工作人员'}`,passwordHash:template.passwordHash,portal:'ENTERPRISE',accountLevel:'ENTERPRISE',workspaceId:workspace.id,organizationId:enterprise.organizationId,enterpriseId:enterprise.id,status:'ACTIVE',roles:{create:{roleId:role.id}}}});
        }
      }
      const vehicles=await tx.vehicle.findMany({where:{organizationId:{in:orgIds},deletedAt:null},include:{realtimeStatus:true},orderBy:{businessNo:'asc'}});
      if(!vehicles.length)continue;
      const city=workspace.cityName,code=workspace.cityCode;
      const actor=await tx.user.findFirst({where:{workspaceId:workspace.id,accountLevel:'CITY',status:'ACTIVE'}});
      if(!actor)continue;
      for(const [i,vehicle]of vehicles.slice(0,Math.min(12,vehicles.length)).entries()){
        if(!await tx.vehicleLicense.count({where:{vehicleId:vehicle.id,status:'VALID'}}))await tx.vehicleLicense.upsert({where:{businessNo:`LIC-SD-${code}-${String(i+1).padStart(3,'0')}`},update:{},create:{businessNo:`LIC-SD-${code}-${String(i+1).padStart(3,'0')}`,licenseNo:`鲁${code==='370100'?'A':code==='370200'?'B':'Q'}U${String(i+101).padStart(5,'0')}`,vehicleId:vehicle.id,enterpriseId:vehicle.enterpriseId,organizationId:vehicle.organizationId,issuedAt:new Date(today.getTime()-30*86400000),expiresAt:new Date('2027-12-31T15:59:59Z'),status:'VALID',remark:`${city}寄递道路通行登记`}});
      }
      for(const vehicle of vehicles){for(let offset=-6;offset<=0;offset++){
        const metricDate=new Date(today.getTime()+offset*86400000);const onlineMinutes=vehicle.onlineStatus==='ONLINE'?620+(Number(vehicle.businessNo.slice(-3))%80):420;
        await tx.vehicleOnlineDaily.upsert({where:{vehicleId_metricDate:{vehicleId:vehicle.id,metricDate}},update:{},create:{vehicleId:vehicle.id,metricDate,onlineMinutes,totalMinutes:1440,onlineRate:Math.round(onlineMinutes/1440*1000)/10,firstOnlineAt:new Date(metricDate.getTime()+8*3600000),lastOnlineAt:new Date(metricDate.getTime()+18*3600000)}});
      }}
      for(let i=0;i<3;i++){
        const vehicle=vehicles[i*5%vehicles.length];const rt=vehicle.realtimeStatus!;const occurredAt=new Date(today.getTime()+(8+i)*3600000);
        const alert=await tx.safetyAlert.upsert({where:{businessNo:`ALT-SD-${code}-${String(i+1).padStart(3,'0')}`},update:{},create:{businessNo:`ALT-SD-${code}-${String(i+1).padStart(3,'0')}`,alertType:['LOW_BATTERY','OVERSPEED','OUT_OF_BOUNDS'][i],source:'VEHICLE_TELEMETRY',level:i===1?'HIGH':'MEDIUM',title:[`${city}配送车辆电量提醒`,`${city}道路限速核查`,`${city}运行边界核查`][i],description:'运行状态核查事项已关联车辆、企业及所属辖区。',enterpriseId:vehicle.enterpriseId,organizationId:vehicle.organizationId,vehicleId:vehicle.id,longitude:rt.longitude,latitude:rt.latitude,address:`山东省${city}寄递运行道路`,occurredAt,status:i===0?'CLOSED':'PROCESSING',confirmedAt:occurredAt,closedAt:i===0?new Date(occurredAt.getTime()+12*60000):null,lastComment:i===0?'企业已完成补能并提交反馈。':'已通知企业核实并反馈处置情况。'}});
        if(i===1){const violation=await tx.violation.upsert({where:{businessNo:`VIO-SD-${code}-001`},update:{},create:{businessNo:`VIO-SD-${code}-001`,violationType:'OVERSPEED',level:'MEDIUM',title:`${city}配送道路速度核查`,description:'车辆速度超过许可道路配置阈值，已记录运行位置并转企业核查。',enterpriseId:vehicle.enterpriseId,organizationId:vehicle.organizationId,vehicleId:vehicle.id,alertId:alert.id,longitude:rt.longitude,latitude:rt.latitude,occurredAt,determination:'运行记录已复核，要求补充速度管理措施。',status:'RECTIFYING',confirmedAt:occurredAt}});}
        if(i===2){const task=await tx.emergencyTask.upsert({where:{businessNo:`EMG-SD-${code}-001`},update:{},create:{businessNo:`EMG-SD-${code}-001`,alertId:alert.id,enterpriseId:vehicle.enterpriseId,organizationId:vehicle.organizationId,level:'MEDIUM',title:`${city}运行边界核查处置`,requirement:'核实车辆通行范围，反馈现场情况及车辆当前状态。',responseMode:'ENTERPRISE_RESPONSE',dueAt:new Date(occurredAt.getTime()+2*3600000),status:'WAITING_RESPONSE',dispatchedAt:occurredAt,assigneeUserId:null}});await tx.emergencyTaskLog.upsert({where:{id:`emglog-${task.id}`},update:{},create:{id:`emglog-${task.id}`,taskId:task.id,actorUserId:actor.id,actorName:actor.displayName,action:'DISPATCH',fromStatus:'PENDING_DISPATCH',toStatus:'WAITING_RESPONSE',content:'处置要求已派发至企业工作台。'}});}
      }
      const ev=vehicles[vehicles.length-1],ert=ev.realtimeStatus!;
      await tx.accident.upsert({where:{businessNo:`ACC-SD-${code}-001`},update:{},create:{businessNo:`ACC-SD-${code}-001`,source:'ENTERPRISE_REPORT',accidentType:'MINOR_COLLISION',level:'LOW',title:`${city}配送车辆轻微接触事件`,description:'配送车辆低速通行时发生轻微接触，现场已核查，无人员伤亡。',enterpriseId:ev.enterpriseId,organizationId:ev.organizationId,vehicleId:ev.id,reporterUserId:actor.id,longitude:ert.longitude,latitude:ert.latitude,address:`山东省${city}寄递服务道路`,occurredAt:new Date(today.getTime()-2*86400000+10*3600000),casualties:0,damageDescription:'车辆外观局部擦痕，未造成道路持续阻断。',investigation:'已核查轨迹及现场处置记录。',responsibility:'企业已完成运行安全自查。',disposalProgress:'车辆检查完成，整改记录已归档。',status:'CLOSED',closedAt:new Date(today.getTime()-86400000)}});
      const evalTask=await tx.evaluationTask.upsert({where:{businessNo:`EVT-SD-${code}-202610`},update:{},create:{businessNo:`EVT-SD-${code}-202610`,name:`${city}十月运行履责评价`,periodType:'MONTHLY',periodStart:month,periodEnd:today,organizationId:workspace.organizationId,status:'PUBLISHED',createdById:actor.id,createdByName:actor.displayName,generatedAt:now,publishedAt:now}});
      for(const enterprise of enterprises){
        const [alerts,violations,accidents,record]=await Promise.all([tx.safetyAlert.count({where:{enterpriseId:enterprise.id}}),tx.violation.count({where:{enterpriseId:enterprise.id}}),tx.accident.count({where:{enterpriseId:enterprise.id}}),tx.operationRecord.aggregate({where:{enterpriseId:enterprise.id},_sum:{mileage:true}})]);
        const safety=Math.max(60,100-alerts*2-accidents*5),compliance=Math.max(60,100-violations*4),operation=92,total=Math.round((safety*.5+compliance*.3+operation*.2)*10)/10;
        await tx.enterpriseEvaluation.upsert({where:{taskId_enterpriseId:{taskId:evalTask.id,enterpriseId:enterprise.id}},update:{},create:{businessNo:`EVA-SD-${code}-${enterprise.businessNo.split('-').pop()}`,taskId:evalTask.id,enterpriseId:enterprise.id,organizationId:enterprise.organizationId,totalScore:total,grade:total>=90?'A':'B',riskLevel:total>=90?'LOW':'MEDIUM',safetyScore:safety,complianceScore:compliance,operationScore:operation,breakdownJson:JSON.stringify([{name:'安全履责',score:safety,weight:50},{name:'合规运行',score:compliance,weight:30},{name:'运行保障',score:operation,weight:20}]),status:'PUBLISHED',conclusion:`本期运行里程${Math.round(record._sum.mileage??0)}公里，告警${alerts}项、违规核查${violations}项，综合评价${total}分。`,publishedAt:now}});
      }
      const [alertCount,accidentCount,violationCount,records]=await Promise.all([tx.safetyAlert.count({where:{organizationId:{in:orgIds}}}),tx.accident.count({where:{organizationId:{in:orgIds}}}),tx.violation.count({where:{organizationId:{in:orgIds}}}),tx.operationRecord.aggregate({where:{organizationId:{in:orgIds}},_sum:{mileage:true},_count:true})]);
      await tx.regulatoryReport.upsert({where:{businessNo:`RPT-SD-${code}-202610`},update:{summaryJson:JSON.stringify({operations:{kpis:{vehicles:vehicles.length,trips:records._count,mileage:records._sum.mileage??0}},safety:{kpis:{alerts:alertCount,accidents:accidentCount,violations:violationCount}}})},create:{businessNo:`RPT-SD-${code}-202610`,reportType:'MONTHLY',category:'COMPREHENSIVE',title:`${city}十月无人配送运行监管报告`,periodStart:month,periodEnd:today,organizationId:workspace.organizationId,summaryJson:JSON.stringify({operations:{kpis:{vehicles:vehicles.length,trips:records._count,mileage:records._sum.mileage??0}},safety:{kpis:{alerts:alertCount,accidents:accidentCount,violations:violationCount}}}),status:'GENERATED',recipient:'山东省交通运输厅',generatedById:actor.id,generatedByName:actor.displayName}});
      for(const definition of await tx.processDefinition.findMany({where:{workspaceId:workspace.id},select:{id:true}}))await tx.processNodeDefinition.updateMany({where:{processDefinitionId:definition.id},data:{approvalRoleCode:`CITY_ADMIN_${code}`}});
    }
  },{timeout:120000,maxWait:30000});
  console.log('Shandong linked operating facts are ready.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
