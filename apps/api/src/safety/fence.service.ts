import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { businessNo, localDate, ownerScope, regionReadScope } from '../admission/permit.service';
import { json, validHours } from '../operations/monitoring-rules';
import { CreateFenceDto, SafetyQueryDto, UpdateFenceDto } from './dto';

@Injectable()
export class FenceService {
 constructor(private prisma:PrismaService,private auth:AuthService){}
 private scope(user:AuthUser):any{return user.portal==='ENTERPRISE'?regionReadScope(user):ownerScope(user)}
 private include:any={enterprise:{select:{id:true,name:true}},organization:{select:{id:true,name:true}},vehicles:{include:{vehicle:{select:{id:true,name:true,businessNo:true}}}},_count:{select:{triggers:true}}};
 private present(v:any){return {...v,polygon:json(v.polygonJson,[]),history:json(v.historyJson,[]),polygonJson:undefined,historyJson:undefined}}
 async options(user:AuthUser){const [vehicles,enterprises,organizations,regions]=await this.prisma.$transaction([
  this.prisma.vehicle.findMany({where:{...ownerScope(user),deletedAt:null},select:{id:true,name:true,businessNo:true,enterpriseId:true,organizationId:true}}),
  this.prisma.enterprise.findMany({where:ownerScope(user),select:{id:true,name:true,organizationId:true}}),
  this.prisma.organization.findMany({where:user.accountLevel==='PROVINCE'?{}:{workspaceId:user.workspaceId??'__none__',...(user.scopeOrganizationIds?.length?{id:{in:user.scopeOrganizationIds}}:{})},select:{id:true,name:true}}),
  this.prisma.operationRegion.findMany({where:{...regionReadScope(user),approvalStatus:'APPROVED',status:'ACTIVE'},select:{id:true,name:true,businessNo:true,polygonJson:true,validFrom:true,validTo:true,speedLimit:true,allowedHours:true,enterpriseId:true,organizationId:true,regionType:true,status:true}})
 ]);return {vehicles,enterprises,organizations,regions:regions.map(r=>({...r,polygon:json(r.polygonJson,[]),polygonJson:undefined}))}}
 async list(user:AuthUser,q:SafetyQueryDto){const where:any={...this.scope(user),...(q.enterpriseId?{enterpriseId:q.enterpriseId}:{}),...(q.type?{fenceType:q.type}:{}),...(q.status?{active:q.status==='ACTIVE'}:{})};
  if(q.q)where.AND=[{OR:[{name:{contains:q.q}},{businessNo:{contains:q.q}},{enterprise:{name:{contains:q.q}}}]}];
  const [total,items]=await this.prisma.$transaction([this.prisma.electronicFence.count({where}),this.prisma.electronicFence.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(q.page-1)*q.pageSize,take:q.pageSize,include:this.include})]);return {total,items:items.map(v=>this.present(v)),page:q.page,pageSize:q.pageSize};
 }
 async detail(user:AuthUser,id:string){const v=await this.prisma.electronicFence.findFirst({where:{id,...this.scope(user)},include:this.include});if(!v)throw new NotFoundException('围栏不存在或不在当前数据范围内');return this.present(v)}
 async triggers(user:AuthUser,id:string,q:SafetyQueryDto){await this.detail(user,id);const where:any={fenceId:id};const [total,items]=await this.prisma.$transaction([this.prisma.fenceTrigger.count({where}),this.prisma.fenceTrigger.findMany({where,orderBy:{occurredAt:'desc'},skip:(q.page-1)*q.pageSize,take:q.pageSize,include:{vehicle:{select:{id:true,name:true,businessNo:true}},alert:{select:{id:true,status:true,evidenceJson:true}}}})]);return {total,items:items.map(x=>({...x,alert:{id:x.alert.id,status:x.alert.status,evidence:user.permissions.includes('safety:alert:read')?json(x.alert.evidenceJson):undefined}})),page:q.page,pageSize:q.pageSize}}
 private async validate(user:AuthUser,d:any){
  if(user.portal==='ENTERPRISE'||['PROVINCE','OPERATIONS'].includes(user.accountLevel??''))throw new ForbiddenException('电子围栏由属地监管人员维护');
  if(d.fenceType==='OPERATION')throw new BadRequestException('运营范围请在准入与许可的通行区域中维护');
  const org=await this.prisma.organization.findFirst({where:{id:d.organizationId,workspaceId:user.workspaceId??'__none__',...(user.scopeOrganizationIds?.length?{id:{in:user.scopeOrganizationIds}}:{})}});if(!org)throw new ForbiddenException('管理机构不在当前数据范围内');
  if(d.enterpriseId&&!await this.prisma.enterprise.findFirst({where:{id:d.enterpriseId,...ownerScope(user)}}))throw new ForbiddenException('关联企业不在当前数据范围内');
  if(d.vehicleIds?.length&&await this.prisma.vehicle.count({where:{id:{in:d.vehicleIds},deletedAt:null,...ownerScope(user),...(d.enterpriseId?{enterpriseId:d.enterpriseId}:{})}})!==new Set(d.vehicleIds).size)throw new BadRequestException('所选车辆与企业或管理范围不匹配');
  const p=d.polygon;if(!Array.isArray(p)||p.length<3||p.some(x=>!Number.isFinite(x.longitude)||!Number.isFinite(x.latitude)||Math.abs(x.longitude)>180||Math.abs(x.latitude)>90))throw new BadRequestException('请绘制至少3个有效区域边界点');
  const pts=p.length>3&&p[0].longitude===p.at(-1).longitude&&p[0].latitude===p.at(-1).latitude?p.slice(0,-1):p;
  if(new Set(pts.map(x=>x.longitude+','+x.latitude)).size!==pts.length)throw new BadRequestException('边界顶点不能重复');
  const cross=(a:any,b:any,c:any)=>(b.longitude-a.longitude)*(c.latitude-a.latitude)-(b.latitude-a.latitude)*(c.longitude-a.longitude);
  if(Math.abs(pts.reduce((s,a,i)=>s+a.longitude*pts[(i+1)%pts.length].latitude-pts[(i+1)%pts.length].longitude*a.latitude,0))<1e-10)throw new BadRequestException('区域边界不能退化为直线');
  for(let i=0;i<pts.length;i++)for(let j=i+2;j<pts.length;j++){if(i===0&&j===pts.length-1)continue;const a=pts[i],b=pts[(i+1)%pts.length],c=pts[j],e=pts[(j+1)%pts.length];if(cross(a,b,c)*cross(a,b,e)<=0&&cross(c,e,a)*cross(c,e,b)<=0&&Math.max(a.longitude,b.longitude)>=Math.min(c.longitude,e.longitude)&&Math.max(c.longitude,e.longitude)>=Math.min(a.longitude,b.longitude)&&Math.max(a.latitude,b.latitude)>=Math.min(c.latitude,e.latitude)&&Math.max(c.latitude,e.latitude)>=Math.min(a.latitude,b.latitude))throw new BadRequestException('区域边界不能自相交')}
  if(!validHours(d.allowedHours)||d.allowedHours&&d.allowedHours.slice(0,5)===d.allowedHours.slice(6))throw new BadRequestException('生效时段请填写 HH:mm-HH:mm');
  if(d.validTo&&localDate(d.validTo,true)<localDate(d.validFrom))throw new BadRequestException('截止日期不能早于生效日期');
  if(d.active&&d.validTo&&localDate(d.validTo,true)<new Date())throw new BadRequestException('已过期围栏不能启用');
  if(d.fenceType==='SPEED_LIMIT'&&!d.speedLimit)throw new BadRequestException('限速区必须填写限速值');
 }
 async save(user:AuthUser,dto:CreateFenceDto|UpdateFenceDto,id?:string){
  const current=id?await this.detail(user,id):null;const merged={...current,...dto,vehicleIds:dto.vehicleIds??current?.vehicles.map((v:any)=>v.vehicle.id)??[]};await this.validate(user,merged);
  const history={action:id?'UPDATE':'CREATE',at:new Date().toISOString(),actor:user.displayName,summary:id?'调整围栏范围与规则':'创建围栏',snapshot:current?{name:current.name,polygon:current.polygon,fenceType:current.fenceType,allowedHours:current.allowedHours,speedLimit:current.speedLimit,validFrom:current.validFrom,validTo:current.validTo,version:current.version}:null};
  const data:any={businessNo:merged.businessNo||businessNo('WL-'+user.workspace?.cityCode),name:merged.name,fenceType:merged.fenceType,enterpriseId:merged.enterpriseId||null,organizationId:merged.organizationId,polygonJson:JSON.stringify(merged.polygon),validFrom:localDate(String(merged.validFrom)),validTo:merged.validTo?localDate(String(merged.validTo),true):null,active:merged.active??false,speedLimit:merged.fenceType==='SPEED_LIMIT'?merged.speedLimit:null,allowedHours:merged.allowedHours||null,ruleDescription:merged.ruleDescription??null,historyJson:JSON.stringify([...(current?.history??[]),history]),vehicles:{...(id?{deleteMany:{}}:{}),create:merged.vehicleIds.map((vehicleId:string)=>({vehicleId}))}};
  const row=await this.prisma.$transaction(async tx=>{if(current){const claim=await tx.electronicFence.updateMany({where:{id,version:current.version},data:{version:{increment:1}}});if(claim.count!==1)throw new ConflictException('围栏已被其他人员修改，请重新读取');return tx.electronicFence.update({where:{id},data})}return tx.electronicFence.create({data})});
  await this.auth.audit(user,'safety','electronicFence',row.id,id?'UPDATE':'CREATE',{name:row.name,version:row.version});return this.detail(user,row.id);
 }
 async status(user:AuthUser,id:string,active:boolean){const row=await this.detail(user,id);if(user.portal==='ENTERPRISE'||['PROVINCE','OPERATIONS'].includes(user.accountLevel??''))throw new ForbiddenException('电子围栏由属地监管人员维护');if(active&&(row.fenceType==='OPERATION'||row.validTo&&new Date(row.validTo)<new Date()))throw new BadRequestException('历史运营围栏或已过期围栏不能启用');const history=[...row.history,{action:active?'ENABLE':'DISABLE',at:new Date().toISOString(),actor:user.displayName,summary:active?'启用围栏':'停用围栏'}];const result=await this.prisma.electronicFence.updateMany({where:{id,version:row.version},data:{active,version:{increment:1},historyJson:JSON.stringify(history)}});if(result.count!==1)throw new ConflictException('围栏已修改，请刷新后再操作');await this.auth.audit(user,'safety','electronicFence',id,active?'ENABLE':'DISABLE',{});return this.detail(user,id)}
 async remove(user:AuthUser,id:string){const row=await this.detail(user,id);if(user.portal==='ENTERPRISE'||['PROVINCE','OPERATIONS'].includes(user.accountLevel??''))throw new ForbiddenException('电子围栏由属地监管人员维护');if(row._count.triggers)throw new BadRequestException('该围栏已有触发记录，请停用并保留历史');await this.prisma.electronicFence.delete({where:{id}});await this.auth.audit(user,'safety','electronicFence',id,'DELETE',{name:row.name});return {deleted:true}}
}
