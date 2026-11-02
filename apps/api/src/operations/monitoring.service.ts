import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { ownerScope } from '../admission/permit.service';
import { OperationsQueryDto } from './dto';
import { effectiveLicense, healthOf, inPolygon, json, licenseState, permitFindings } from './monitoring-rules';

@Injectable()
export class MonitoringService {
 constructor(private prisma:PrismaService){}
 private include(user:AuthUser):any{return {
  enterprise:{select:{id:true,name:true}},organization:{select:{id:true,name:true}},model:{select:{name:true,maxSpeed:true,autonomyLevel:true}},realtimeStatus:true,
  licenses:{orderBy:{issuedAt:'desc'}},
  ...(user.permissions.includes('archive:qualification:read')?{operatorAssignments:{include:{operator:{select:{id:true,name:true,phone:true,status:true,onDuty:true,expiresAt:true}}}}}:{}),
  ...(user.permissions.includes('safety:alert:read')?{safetyAlerts:{where:{status:{not:'CLOSED'}},orderBy:{occurredAt:'desc'},take:20,select:{id:true,title:true,alertType:true,level:true,status:true,occurredAt:true}}}:{})
 }}
 private present(v:any,now:Date){
  const health=healthOf(v.realtimeStatus,now),l=effectiveLicense(v.licenses,now),conditions=json<any>(l?.conditionsJson);
  const permit=l?{id:l.id,licenseNo:l.licenseNo,licenseType:l.licenseType,status:licenseState(l,now),issuedAt:l.issuedAt,expiresAt:l.expiresAt,version:l.version,conditions}:null;
  const issues:any[]=[];
  if(health.stale)issues.push({type:'DATA_STALE',title:v.realtimeStatus?'车辆上报超时，当前运行状态待核查':'尚无车辆上报数据'});
  else if(health.locationStale||!health.locationValid)issues.push({type:'LOCATION_STALE',title:'定位失效，仅显示最后有效位置'});
  if(!health.stale&&health.locationValid&&!health.locationStale&&(v.realtimeStatus?.speed??0)>0.5)issues.push(...permitFindings(l,v.realtimeStatus,now));
  const alerts=v.safetyAlerts??[];
  const areas=(conditions.regions??[]).filter((r:any)=>Array.isArray(r.polygon)&&r.polygon.length>=3);
  const scopeStatus=health.stale||health.locationStale||!health.locationValid?'UNKNOWN':!areas.length?'UNREGISTERED':areas.some((r:any)=>inPolygon(v.realtimeStatus,r.polygon))?'INSIDE':'OUTSIDE';
  const operators=(v.operatorAssignments??[]).map((x:any)=>({...x.operator,phone:x.operator.phone?.replace(/^(\d{3})\d{4}(\d+)$/,'$1****$2')}));
  const realtime=v.realtimeStatus?{...v.realtimeStatus,reportedDrivingState:v.realtimeStatus.drivingState,drivingState:health.state}:null;
  return {...v,licenses:undefined,safetyAlerts:undefined,operatorAssignments:undefined,reportedOnlineStatus:v.onlineStatus,onlineStatus:health.onlineStatus,realtimeStatus:realtime,health,scopeStatus,permit,operators,
   regions:(conditions.regions??[]).map((r:any)=>({id:r.id,name:r.name})),issues,alerts,abnormal:issues.length>0||alerts.length>0,openAlertCount:alerts.length,currentAlert:alerts[0]??null,
   attentionLevel:alerts.some((a:any)=>['HIGH','CRITICAL'].includes(a.level))?'HIGH':issues.length||alerts.length?'MEDIUM':'NORMAL'};
 }
 async realtime(user:AuthUser,q:OperationsQueryDto){
  const now=new Date();const where:any={...ownerScope(user),deletedAt:null,...(q.enterpriseId&&user.portal!=='ENTERPRISE'?{enterpriseId:q.enterpriseId}:{}),...(q.vehicleId?{id:q.vehicleId}:{}),...(q.organizationId?{organizationId:q.organizationId}:{})};
  if(q.q)where.OR=[{name:{contains:q.q}},{businessNo:{contains:q.q}},{unifiedCode:{contains:q.q}},{vin:{contains:q.q}},{deviceNo:{contains:q.q}}];
  if(q.regionId)where.operationRegions={some:{regionId:q.regionId}};
  const vehicles=await this.prisma.vehicle.findMany({where,include:this.include(user),orderBy:[{name:'asc'},{id:'asc'}]});
  let all=vehicles.map((v:any)=>this.present(v,now));
  if(q.permitStatus)all=all.filter(v=>(v.permit?.status??'NONE')===q.permitStatus||(q.permitStatus==='VALID'&&v.permit?.status==='EXPIRING'));
  const summary={total:all.length,online:all.filter(v=>v.onlineStatus==='ONLINE').length,offline:all.filter(v=>v.onlineStatus==='OFFLINE').length,running:all.filter(v=>v.health.state==='RUNNING').length,parked:all.filter(v=>['IDLE','PARKED'].includes(v.health.state)).length,lowBattery:all.filter(v=>!v.health.stale&&v.realtimeStatus&&v.realtimeStatus.battery<25).length,stale:all.filter(v=>v.health.stale).length,abnormal:all.filter(v=>v.abnormal).length};
  const grouped=new Map<string,any>();for(const v of all){const g=grouped.get(v.enterpriseId)??{...v.enterprise,total:0,stale:0};g.total++;if(v.health.stale)g.stale++;grouped.set(v.enterpriseId,g)}
  const concentrated=Array.from(grouped.values()).filter(g=>g.stale>=3&&g.stale/g.total>=.8);
  const items=all.filter(v=>(!q.status||v.onlineStatus===q.status)&&(!q.drivingState||(q.drivingState==='PARKED'?['IDLE','PARKED'].includes(v.health.state):v.health.state===q.drivingState))&&(q.view!=='abnormal'||v.abnormal));
  return {total:items.length,items,summary,concentrated,updatedAt:now.toISOString(),refreshSeconds:10};
 }
 async detail(user:AuthUser,id:string){const row=await this.prisma.vehicle.findFirst({where:{id,deletedAt:null,...ownerScope(user)},include:this.include(user)});if(!row)throw new NotFoundException('车辆不存在或不在当前数据范围内');return this.present(row,new Date())}
}
