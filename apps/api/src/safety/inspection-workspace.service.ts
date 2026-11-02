import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { businessNo } from '../admission/permit.service';
import { InspectionActionDto, GovernanceQueryDto } from '../governance/dto';
import { InspectionResultDto, WorkspaceInspectionDto } from './workspace.dto';
import { dueDate, historyEntry, parse, regulator, requirePermission, scope } from './workspace-rules';
import { SafetyMaterialsService } from './workspace-materials.service';

@Injectable()
export class InspectionWorkspaceService {
  constructor(private prisma:PrismaService,private auth:AuthService,private materials:SafetyMaterialsService){}
  async list(user:AuthUser,q:GovernanceQueryDto){
    requirePermission(user,'safety:violation:read');const where:any={...scope(user),inspectionType:q.type,enterpriseId:user.portal==='ENTERPRISE'?user.enterpriseId??'__none__':q.enterpriseId,status:q.status==='COMPLETED'?{in:['COMPLETED','CLOSED']}:q.status,OR:q.q?[{businessNo:{contains:q.q}},{title:{contains:q.q}},{enterprise:{name:{contains:q.q}}},{inspectorName:{contains:q.q}}]:undefined};
    const [total,items]=await this.prisma.$transaction([this.prisma.regulatoryInspection.count({where}),this.prisma.regulatoryInspection.findMany({where,skip:(q.page-1)*q.pageSize,take:q.pageSize,orderBy:[{scheduledAt:'desc'},{id:'asc'}],include:{enterprise:{select:{id:true,name:true}}}})]);return {total,page:q.page,pageSize:q.pageSize,items};
  }
  async detail(user:AuthUser,id:string){
    requirePermission(user,'safety:violation:read');const row=await this.prisma.regulatoryInspection.findFirst({where:{id,...scope(user)},include:{enterprise:{select:{id:true,name:true}},issues:{orderBy:{sequence:'asc'},include:{task:true}}}});if(!row)throw new NotFoundException('检查记录不存在或不在当前数据范围内');
    return {...row,materials:parse(row.materialsJson,[]),history:parse(row.historyJson,[]),materialsJson:undefined,historyJson:undefined,legacyIssueCount:row.issues.length?0:row.issueCount,issues:row.issues.map(i=>({...i,task:i.task?{...i.task,history:parse(i.task.historyJson,[]),materials:parse(i.task.materialsJson,[]),historyJson:undefined,materialsJson:undefined}:null}))};
  }
  async create(user:AuthUser,dto:WorkspaceInspectionDto){
    regulator(user);requirePermission(user,'safety:violation:write');const enterprise=await this.prisma.enterprise.findFirst({where:{id:dto.enterpriseId,organizationId:scope(user).organizationId}});if(!enterprise)throw new NotFoundException('企业不存在或不在当前监管范围内');
    const item=await this.prisma.regulatoryInspection.create({data:{businessNo:businessNo('JC'),title:dto.title.trim(),enterpriseId:enterprise.id,organizationId:enterprise.organizationId,inspectionType:dto.inspectionType,inspectorName:dto.inspectorName.trim(),scheduledAt:new Date(dto.scheduledAt),historyJson:JSON.stringify([historyEntry(user,'CREATE','创建检查计划',undefined,'PLANNED')])}});await this.auth.audit(user,'governance','inspection',item.id,'CREATE');return item;
  }
  async result(user:AuthUser,id:string,dto:InspectionResultDto){
    regulator(user);requirePermission(user,'safety:violation:write');const row=await this.detail(user,id);
    if(row.status!=='PLANNED'&&!(row.legacyIssueCount>0&&!row.issues.length&&row.status!=='CLOSED'))throw new BadRequestException('当前检查已登记结果，请按问题清单跟进整改');
    if(row.legacyIssueCount>dto.issues.length)throw new BadRequestException('请补齐历史记录中的全部问题，不可直接减少问题数');
    if(!dto.result.trim()||dto.issues.some(i=>!i.title.trim()||!i.requirement.trim()||!i.responsibleName.trim()))throw new BadRequestException('检查结论及问题信息不能为空');
    const dueDates=dto.issues.map(i=>dueDate(i.dueAt)),materials=await this.materials.items(user,row.enterpriseId,dto.materialIds??[]),next=dto.issues.length?'RECTIFYING':'COMPLETED';
    await this.prisma.$transaction(async tx=>{
      const changed=await tx.regulatoryInspection.updateMany({where:{id,version:dto.version,status:row.status,...scope(user)},data:{result:dto.result.trim(),completedAt:row.completedAt??new Date(),status:next,issueCount:dto.issues.length,rectificationDueAt:dueDates.length?new Date(Math.max(...dueDates.map(d=>d.getTime()))):null,materialsJson:JSON.stringify(materials),historyJson:JSON.stringify([...row.history,historyEntry(user,'RECORD_RESULT',dto.result,row.status,next)]),version:{increment:1}}});if(changed.count!==1)throw new ConflictException('检查记录已更新，请刷新后重试');
      for(let index=0;index<dto.issues.length;index++){const i=dto.issues[index],issue=await tx.inspectionIssue.create({data:{inspectionId:id,enterpriseId:row.enterpriseId,organizationId:row.organizationId,sequence:index+1,title:i.title.trim(),requirement:i.requirement.trim(),responsibleName:i.responsibleName.trim(),dueAt:dueDates[index]}});
        await tx.safetyRectificationTask.create({data:{businessNo:businessNo('ZG'),enterpriseId:row.enterpriseId,organizationId:row.organizationId,sourceType:'INSPECTION_ISSUE',sourceId:issue.id,inspectionIssueId:issue.id,activeKey:`RECTIFICATION:ISSUE:${issue.id}`,title:i.title.trim(),requirement:i.requirement.trim(),responsibleName:i.responsibleName.trim(),dueAt:dueDates[index],historyJson:JSON.stringify([historyEntry(user,'CREATE',`来源检查：${row.businessNo}；${i.requirement}`,undefined,'WAITING_RESPONSE')])}});
      }
    });await this.auth.audit(user,'governance','inspection',id,'RECORD_RESULT',{issueCount:dto.issues.length});return this.detail(user,id);
  }
  async legacyAction(user:AuthUser,id:string,dto:InspectionActionDto){
    const row=await this.detail(user,id);if(row.issues.length)throw new BadRequestException('请通过问题清单逐项提交整改或复查，不能整体跳过问题处理');
    if(user.portal==='ENTERPRISE'){requirePermission(user,'safety:emergency:respond');if(dto.action!=='SUBMIT_RECTIFICATION')throw new BadRequestException('企业只能提交整改反馈');}
    else{regulator(user);requirePermission(user,['CLOSE','REQUEST_RECTIFICATION'].includes(dto.action)?'safety:violation:review':'safety:violation:write');}
    const transitions:Record<string,Record<string,string>>={PLANNED:{COMPLETE:'COMPLETED',REQUEST_RECTIFICATION:'RECTIFYING'},COMPLETED:{REQUEST_RECTIFICATION:'RECTIFYING',CLOSE:'CLOSED'},RECTIFYING:{SUBMIT_RECTIFICATION:'PENDING_REVIEW'},PENDING_REVIEW:{CLOSE:'CLOSED',REQUEST_RECTIFICATION:'RECTIFYING'}};
    const next=transitions[row.status]?.[dto.action];if(!next)throw new BadRequestException('当前状态不支持该操作');if(!dto.content?.trim())throw new BadRequestException('请填写处理意见');
    if(dto.action==='REQUEST_RECTIFICATION'&&!dto.dueAt)throw new BadRequestException('请填写整改期限');const dueAt=dto.dueAt?dueDate(dto.dueAt):undefined;
    const changed=await this.prisma.regulatoryInspection.updateMany({where:{id,version:row.version,status:row.status,...scope(user)},data:{status:next,result:dto.action==='COMPLETE'?dto.content:undefined,completedAt:dto.action==='COMPLETE'?new Date():undefined,issueCount:dto.issueCount,rectificationDueAt:dueAt,rectification:dto.action==='SUBMIT_RECTIFICATION'?dto.content:undefined,reviewComment:['CLOSE','REQUEST_RECTIFICATION'].includes(dto.action)?dto.content:undefined,closedAt:next==='CLOSED'?new Date():undefined,historyJson:JSON.stringify([...row.history,historyEntry(user,dto.action,dto.content,row.status,next)]),version:{increment:1}}});if(changed.count!==1)throw new ConflictException('检查状态已更新，请刷新后重试');await this.auth.audit(user,'governance','inspection',id,dto.action);return this.detail(user,id);
  }
}
