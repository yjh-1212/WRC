import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { isScopedAdministrator } from '../auth/workspace-access';
import { PrismaService } from '../prisma/prisma.service';
import { IssueLicenseDto, LicensePageQueryDto, PermitActionDto } from './dto';

export const jsonValue = (text: string | null | undefined, fallback: any = {}) => { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } };
export const businessNo = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${randomUUID().slice(0,8).toUpperCase()}`;
export const localDate = (value: string, end = false) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${end?'23:59:59.999':'00:00:00.000'}+08:00` : value);
export function ownerScope(user: AuthUser): any {
  if (user.portal === 'ENTERPRISE') return { enterpriseId: user.enterpriseId ?? '__none__' };
  if (user.accountLevel === 'PROVINCE') return {};
  return { organization: { is: { workspaceId: user.workspaceId ?? '__none__', ...(isScopedAdministrator(user) ? {} : { id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }) } } };
}
export function regionReadScope(user:AuthUser):any{return user.portal==='ENTERPRISE'?{organization:{is:{workspaceId:user.workspaceId??'__none__'}},OR:[{enterpriseId:user.enterpriseId??'__none__'},{enterpriseId:null}]}:ownerScope(user)}
const include = { vehicle: { select: { id:true,name:true,businessNo:true,unifiedCode:true } }, enterprise: { select: { id:true,name:true } }, approvalResults: { include: { application: { select: { id:true,businessNo:true,title:true,applicationType:true } }, operationRegions:true } } };
export function permitStatus(item: {status:string; expiresAt:Date|string}, now=new Date()) {
  if (['SUSPENDED','CANCELLED','REVOKED'].includes(item.status)) return item.status;
  const remaining=new Date(item.expiresAt).getTime()-now.getTime();
  return remaining<0?'EXPIRED':remaining<=30*86400000?'EXPIRING':'VALID';
}
export function permitScopeView(item:any,now=new Date()) {
  const conditions=jsonValue(item.conditionsJson),snapshot=Array.isArray(conditions.regions);
  const current=(item.approvalResults??[]).flatMap((result:any)=>result.operationRegions??[]).filter((region:any)=>region.status==='ACTIVE'&&region.approvalStatus==='APPROVED'&&(!region.validFrom||new Date(region.validFrom)<=now)&&(!region.validTo||new Date(region.validTo)>=now));
  const unique=[...new Map<string,any>(current.map((region:any)=>[region.id,region] as [string,any])).values()];
  return {conditions:{...conditions,regions:snapshot?conditions.regions:unique.map((region:any)=>({...region,polygon:jsonValue(region.polygonJson,[])}))},conditionsSource:snapshot?'ISSUED_SNAPSHOT':unique.length?'CURRENT_REGIONS':'NONE'};
}

@Injectable()
export class PermitService {
  constructor(private prisma:PrismaService,private auth:AuthService){}
  private where(user:AuthUser,query:LicensePageQueryDto):any {
    const where:any={AND:[ownerScope(user)],id:query.id,licenseType:query.licenseType};
    if(query.enterpriseId)where.AND.push({enterpriseId:query.enterpriseId});
    if(query.q)where.AND.push({OR:[{licenseNo:{contains:query.q}},{businessNo:{contains:query.q}},{enterprise:{name:{contains:query.q}}},{vehicle:{OR:[{name:{contains:query.q}},{businessNo:{contains:query.q}},{unifiedCode:{contains:query.q}}]}}]});
    const now=new Date(),soon=new Date(now.getTime()+30*86400000),active={status:{in:['VALID','EXPIRING','EXPIRED']}};
    if(query.status==='VALID')where.AND.push(active,{expiresAt:{gt:soon}});
    else if(query.status==='EXPIRING')where.AND.push(active,{expiresAt:{gte:now,lte:soon}});
    else if(query.status==='EXPIRED')where.AND.push(active,{expiresAt:{lt:now}});
    else if(query.status)where.AND.push({status:query.status});
    return where;
  }
  private present(item:any){
    return {...item,status:permitStatus(item),storedStatus:item.status,...permitScopeView(item),history:jsonValue(item.historyJson,[]),conditionsJson:undefined,historyJson:undefined};
  }
  async list(user:AuthUser,query:LicensePageQueryDto){
    const where=this.where(user,query);
    const [total,items]=await this.prisma.$transaction([this.prisma.vehicleLicense.count({where}),this.prisma.vehicleLicense.findMany({where,skip:(query.page-1)*query.pageSize,take:query.pageSize,orderBy:[{expiresAt:'asc'},{id:'asc'}],include})]);
    return {page:query.page,pageSize:query.pageSize,total,items:items.map(item=>this.present(item))};
  }
  async detail(user:AuthUser,id:string){
    const item=await this.prisma.vehicleLicense.findFirst({where:{id,...ownerScope(user)},include});
    if(!item)throw new NotFoundException('通行许可不存在或不在当前数据范围内');
    return this.present(item);
  }
  async options(user:AuthUser){
    const enterprises=await this.prisma.enterprise.findMany({where:user.portal==='ENTERPRISE'?{id:user.enterpriseId??'__none__'}:ownerScope(user),select:{id:true,name:true},orderBy:{name:'asc'}});
    return {enterprises};
  }
  async action(user:AuthUser,id:string,dto:PermitActionDto){
    if(user.portal!=='REGULATORY')throw new ForbiddenException('企业端不能直接修改许可结论');
    if(!dto.reason?.trim())throw new BadRequestException('请填写处理原因');
    await this.prisma.$transaction(async tx=>{
      const item=await tx.vehicleLicense.findFirst({where:{id,...ownerScope(user)}});
      if(!item)throw new NotFoundException('通行许可不存在或不在当前数据范围内');
      const state=permitStatus(item);
      const allowed:Record<string,string[]>={SUSPEND:['VALID','EXPIRING'],RESUME:['SUSPENDED'],REVOKE:['VALID','EXPIRING','SUSPENDED'],CANCEL:['VALID','EXPIRING','EXPIRED','SUSPENDED']};
      if(!allowed[dto.action]?.includes(state))throw new BadRequestException('当前许可状态不能执行此操作');
      if(dto.action==='RESUME'&&item.expiresAt<new Date())throw new BadRequestException('许可已过期，不能恢复，请先办理续期');
      const status=({SUSPEND:'SUSPENDED',RESUME:'VALID',REVOKE:'REVOKED',CANCEL:'CANCELLED'} as any)[dto.action];
      const event={action:dto.action,reason:dto.reason.trim(),actor:user.displayName,at:new Date().toISOString(),before:{status:state,version:item.version},after:{status},snapshot:{...item,historyJson:undefined}};
      const changed=await tx.vehicleLicense.updateMany({where:{id,version:item.version,status:item.status},data:{status,version:{increment:1},historyJson:JSON.stringify([...jsonValue(item.historyJson,[]),event])}});
      if(changed.count!==1)throw new BadRequestException('许可刚被其他人更新，请刷新后重试');
    });
    await this.auth.audit(user,'admission','vehicleLicense',id,dto.action,{reason:dto.reason});
    return this.detail(user,id);
  }
  async regionConditions(tx:any,user:AuthUser,enterpriseId:string,ids:string[],expiresAt:Date){
    if(!ids.length)throw new BadRequestException('请关联已批准的通行区域');
    const regions=await tx.operationRegion.findMany({where:{AND:[ownerScope(user),{id:{in:[...new Set(ids)]},status:'ACTIVE',approvalStatus:'APPROVED',OR:[{enterpriseId},{enterpriseId:null}]}]}});
    if(regions.length!==new Set(ids).size)throw new BadRequestException('通行区域未启用、未批准或不属于该企业');
    if(regions.some((r:any)=>r.validTo&&new Date(r.validTo)<expiresAt))throw new BadRequestException('许可有效期不能超过关联区域的有效期');
    return regions.map((r:any)=>({id:r.id,name:r.name,businessNo:r.businessNo,polygon:jsonValue(r.polygonJson,[]),speedLimit:r.speedLimit,allowedHours:r.allowedHours,validFrom:r.validFrom,validTo:r.validTo}));
  }
  async issue(user:AuthUser,applicationId:string,dto:IssueLicenseDto){
    if(user.portal!=='REGULATORY')throw new ForbiddenException('仅监管人员可以签发许可');
    const signed=await this.prisma.$transaction(async tx=>{
      const application=await tx.admissionApplication.findFirst({where:{id:applicationId,...ownerScope(user)},include:{vehicles:{include:{vehicle:true}},targetLicense:true,result:true}});
      if(!application||application.status!=='APPROVED')throw new BadRequestException('仅审核通过、待签发的申请可以办理签发');
      if(!['ROAD_TEST','DEMONSTRATION','LICENSE_CHANGE','LICENSE_RENEWAL','LICENSE_EXIT'].includes(application.applicationType))throw new BadRequestException('该业务不需要签发通行许可');
      const details=jsonValue(application.detailsJson),now=new Date(),issuedAt=localDate(dto.issuedAt??now.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}));
      const target=application.targetLicense,historyEvent=(item:any,action:string)=>({at:now.toISOString(),actor:user.displayName,action,applicationId,applicationNo:application.businessNo,reason:details.changeReason||application.renewalReason||dto.remark||'审核通过后签发',snapshot:{...item,historyJson:undefined}});
      let results:any[]=[];
      if(application.applicationType==='LICENSE_EXIT'){
        if(!target||target.enterpriseId!==application.enterpriseId||['CANCELLED','REVOKED'].includes(target.status))throw new BadRequestException('原许可已终止或不存在');
        results=[await tx.vehicleLicense.update({where:{id:target.id},data:{status:'CANCELLED',version:{increment:1},historyJson:JSON.stringify([...jsonValue(target.historyJson,[]),historyEvent(target,'EXIT')])}})];
      }else{
        const expiry=dto.expiresAt??application.requestedExpiresAt?.toISOString()??application.roadTestEndAt?.toISOString();
        if(!expiry)throw new BadRequestException('请填写许可有效期');
        const expiresAt=localDate(expiry,true);
        if(!Number.isFinite(expiresAt.getTime())||expiresAt<=issuedAt||expiresAt<=now)throw new BadRequestException('许可有效期必须晚于签发日期且尚未到期');
        const approvedEnd=application.requestedExpiresAt??application.roadTestEndAt??target?.expiresAt;
        if(approvedEnd&&expiresAt>localDate(approvedEnd.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),true))throw new BadRequestException('签发有效期不能超过本次申请批准的结束日期');
        const previous=target?jsonValue(target.conditionsJson):{};
        const regionIds=dto.regionIds??details.regionIds??previous.regionIds??[];
        const approvedRegions=details.regionIds??previous.regionIds??[];
        if(approvedRegions.length&&regionIds.some((id:string)=>!approvedRegions.includes(id)))throw new BadRequestException('签发区域不能超出本次申请批准的范围');
        const regions=await this.regionConditions(tx,user,application.enterpriseId!,regionIds,expiresAt);
        const speedLimit=dto.speedLimit??details.speedLimit??previous.speedLimit??Math.min(...regions.map((r:any)=>r.speedLimit));
        if(speedLimit>Math.min(...regions.map((r:any)=>r.speedLimit)))throw new BadRequestException('许可限速不能超过区域限速');
        if(details.speedLimit&&speedLimit>details.speedLimit)throw new BadRequestException('签发限速不能超过申请批准值');
        const allowedHours=dto.allowedHours??details.allowedHours??previous.allowedHours??regions[0].allowedHours??'00:00-23:59';
        if(!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(allowedHours))throw new BadRequestException('通行时段格式应为 HH:mm-HH:mm');
        if(allowedHours.slice(0,5)>=allowedHours.slice(6))throw new BadRequestException('通行时段结束时间必须晚于开始时间');
        if(details.allowedHours&&(allowedHours.slice(0,5)<details.allowedHours.slice(0,5)||allowedHours.slice(6)>details.allowedHours.slice(6)))throw new BadRequestException('签发时段不能超出申请批准时段');
        if(regions.some((r:any)=>r.allowedHours&&/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(r.allowedHours)&&(allowedHours.slice(0,5)<r.allowedHours.slice(0,5)||allowedHours.slice(6)>r.allowedHours.slice(6))))throw new BadRequestException('许可时段不能超出区域允许时段');
        const conditionsJson=JSON.stringify({regionIds,regions,speedLimit,allowedHours});
        if(['LICENSE_RENEWAL','LICENSE_CHANGE'].includes(application.applicationType)){
          if(!target||target.enterpriseId!==application.enterpriseId||['CANCELLED','REVOKED','SUSPENDED'].includes(target.status))throw new BadRequestException('原许可不能变更或续期，暂停中的许可需先处理暂停原因');
          if(application.applicationType==='LICENSE_RENEWAL'&&expiresAt<=target.expiresAt)throw new BadRequestException('续期日期必须晚于原许可有效期');
          results=[await tx.vehicleLicense.update({where:{id:target.id},data:{expiresAt,conditionsJson,version:{increment:1},status:'VALID',historyJson:JSON.stringify([...jsonValue(target.historyJson,[]),historyEvent(target,application.applicationType)])}})];
        }else{
          const issued=await tx.vehicleLicense.findMany({where:{sourceApplicationId:applicationId},select:{vehicleId:true}});
          const vehicles=dto.vehicleId?application.vehicles.filter(v=>v.vehicleId===dto.vehicleId):application.vehicles.filter(v=>!issued.some(l=>l.vehicleId===v.vehicleId));
          if(!vehicles.length)throw new BadRequestException('没有可签发的申请车辆');
          for(const link of vehicles){
            if(link.vehicle.deletedAt||link.vehicle.status!=='ACTIVE')throw new BadRequestException('车辆已停用或退出运营，不能签发');
            if(await tx.vehicleLicense.findFirst({where:{sourceApplicationId:applicationId,vehicleId:link.vehicleId}}))throw new BadRequestException('所选车辆已签发，不可重复签发');
            const active=await tx.vehicleLicense.findFirst({where:{vehicleId:link.vehicleId,status:{in:['VALID','EXPIRING','SUSPENDED']},expiresAt:{gte:now}}});
            if(active?.status==='SUSPENDED')throw new BadRequestException('车辆存在暂停中的许可，请先完成暂停事项处置');
            if(active&&!(application.applicationType==='DEMONSTRATION'&&active.licenseType==='ROAD_TEST'))throw new BadRequestException(`${link.vehicle.name}已有未终止许可，请办理变更或续期`);
            if(active)await tx.vehicleLicense.update({where:{id:active.id},data:{status:'CANCELLED',version:{increment:1},historyJson:JSON.stringify([...jsonValue(active.historyJson,[]),historyEvent(active,'UPGRADE_TO_DEMONSTRATION')])}});
            results.push(await tx.vehicleLicense.create({data:{businessNo:vehicles.length===1&&dto.businessNo?dto.businessNo:businessNo(`XK-BIZ-${user.workspace?.cityCode??'SD'}`),licenseNo:vehicles.length===1&&dto.licenseNo?dto.licenseNo:businessNo(`XK-${user.workspace?.cityCode??'SD'}`),enterpriseId:application.enterpriseId!,organizationId:application.organizationId,vehicleId:link.vehicleId,sourceApplicationId:applicationId,licenseType:application.applicationType,issuedAt,expiresAt,conditionsJson,remark:dto.remark,historyJson:JSON.stringify([{at:now.toISOString(),actor:user.displayName,action:'ISSUE',applicationId,applicationNo:application.businessNo}])}}));
          }
        }
      }
      if(application.applicationType!=='LICENSE_EXIT')for(const license of results)for(const regionId of jsonValue(license.conditionsJson).regionIds??[])await tx.operationRegionVehicle.upsert({where:{regionId_vehicleId:{regionId,vehicleId:license.vehicleId}},create:{regionId,vehicleId:license.vehicleId},update:{}});
      const allIssued=['ROAD_TEST','DEMONSTRATION'].includes(application.applicationType)?await tx.vehicleLicense.count({where:{sourceApplicationId:applicationId}}):application.vehicles.length;
      const complete=!['ROAD_TEST','DEMONSTRATION'].includes(application.applicationType)||allIssued>=application.vehicles.length;
      await tx.approvalResult.upsert({where:{applicationId},create:{applicationId,businessNo:businessNo('RESULT'),documentNo:businessNo('DOC'),resultType:application.applicationType,licenseId:results[0]?.id,validFrom:results[0]?.issuedAt,validTo:results[0]?.expiresAt,content:'审核通过并完成结果签发'},update:{licenseId:application.result?.licenseId??results[0]?.id,validTo:results[0]?.expiresAt,content:complete?'业务已签发办结':'部分车辆已签发，尚有车辆待签发'}});
      await tx.admissionApplication.update({where:{id:applicationId},data:{status:complete?'COMPLETED':'APPROVED',completedAt:complete?now:null}});
      await tx.approvalHistory.create({data:{applicationId,actorUserId:user.id,actorName:user.displayName,action:'ISSUE_LICENSE',fromStatus:'APPROVED',toStatus:complete?'COMPLETED':'APPROVED',comment:`已签发/更新 ${results.length} 项许可`}});
      return results;
    },{timeout:20000});
    await this.auth.audit(user,'admission','application',applicationId,'ISSUE_LICENSE',{licenseIds:signed.map(r=>r.id)});
    return signed.length===1?signed[0]:{items:signed};
  }
}
