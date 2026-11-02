import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { businessNo } from '../admission/permit.service';
import { EventWorkspaceService } from './event-workspace.service';
import { SafetyMaterialsService } from './workspace-materials.service';
import { WorkspaceQueryDto, WorkspaceTaskDto, WorkspaceTaskActionDto } from './workspace.dto';
import { actionState, dueDate, historyEntry, parse, regulator, requirePermission, scope } from './workspace-rules';

@Injectable()
export class TaskWorkspaceService {
  constructor(private prisma:PrismaService,private auth:AuthService,private events:EventWorkspaceService,private materials:SafetyMaterialsService){}
  async list(user:AuthUser,q:WorkspaceQueryDto){
    requirePermission(user,'safety:emergency:read');
    const parts=(q.taskType?[q.taskType]:['EMERGENCY','RECTIFICATION']).map(kind=>{
      const conditions:Prisma.Sql[]=[],own=scope(user);if(own.organizationId)conditions.push(Prisma.sql`t.organizationId IN (${Prisma.join(own.organizationId.in)})`);if(own.enterpriseId)conditions.push(Prisma.sql`t.enterpriseId=${own.enterpriseId}`);if(q.enterpriseId)conditions.push(Prisma.sql`t.enterpriseId=${q.enterpriseId}`);if(q.status)conditions.push(Prisma.sql`t.status=${q.status}`);
      if(q.q)conditions.push(Prisma.sql`instr(lower(t.title||' '||t.businessNo||' '||e.name),lower(${q.q.trim()}))>0`);
      if(q.queue==='OVERDUE')conditions.push(Prisma.sql`t.status!='CLOSED' AND t.dueAt<${new Date()}`);
      const table=Prisma.raw(kind==='EMERGENCY'?'EmergencyTask':'SafetyRectificationTask');
      return Prisma.sql`SELECT t.id,${kind} taskType,t.title,t.businessNo,t.status,t.dueAt,t.enterpriseId,t.organizationId,t.createdAt,e.name enterpriseName FROM ${table} t JOIN Enterprise e ON e.id=t.enterpriseId WHERE ${conditions.length?Prisma.join(conditions,' AND '):Prisma.sql`1=1`}`;
    });const union=Prisma.join(parts,' UNION ALL ');
    const [counts,rows]=await this.prisma.$transaction([this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT COUNT(*) total FROM (${union})`),this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM (${union}) ORDER BY CASE WHEN status='CLOSED' THEN 1 ELSE 0 END,dueAt,id LIMIT ${q.pageSize} OFFSET ${(q.page-1)*q.pageSize}`)]);
    return {total:Number(counts[0].total),page:q.page,pageSize:q.pageSize,items:rows.map(t=>({...t,dueAt:new Date(Number.isFinite(Number(t.dueAt))?Number(t.dueAt):t.dueAt),createdAt:new Date(Number.isFinite(Number(t.createdAt))?Number(t.createdAt):t.createdAt),enterprise:{id:t.enterpriseId,name:t.enterpriseName}}))};
  }
  async detail(user:AuthUser,kind:string,id:string){
    requirePermission(user,'safety:emergency:read');if(!['EMERGENCY','RECTIFICATION'].includes(kind))throw new BadRequestException('不支持的任务类型');
    if(kind==='EMERGENCY'){const t=await this.prisma.emergencyTask.findFirst({where:{id,...scope(user)},include:{enterprise:{select:{id:true,name:true}},alert:{select:{id:true,title:true,businessNo:true,vehicleId:true}},logs:{orderBy:{createdAt:'asc'}},assigneeUser:{select:{displayName:true}}}});if(!t)throw new NotFoundException('任务不存在或不在当前数据范围内');return {...t,taskType:kind,responsibleName:t.responsibleName??t.assigneeUser?.displayName??'待指定',sourceType:t.accidentId?'ACCIDENT':'ALERT',sourceId:t.accidentId??t.alertId,sourceTitle:t.alert.title,materials:parse(t.attachmentJson,[]),history:t.logs.map(l=>({...l,version:undefined})),attachmentJson:undefined};}
    const t=await this.prisma.safetyRectificationTask.findFirst({where:{id,...scope(user)},include:{inspectionIssue:{include:{inspection:{select:{id:true,title:true,businessNo:true}}}}}});if(!t)throw new NotFoundException('任务不存在或不在当前数据范围内');const enterprise=await this.prisma.enterprise.findFirst({where:{id:t.enterpriseId},select:{id:true,name:true}});
    return {...t,taskType:kind,enterprise,sourceTitle:t.inspectionIssue?.title??t.title,inspection:t.inspectionIssue?.inspection,history:parse(t.historyJson,[]),materials:parse(t.materialsJson,[]),historyJson:undefined,materialsJson:undefined};
  }
  async create(user:AuthUser,dto:WorkspaceTaskDto){
    regulator(user);requirePermission(user,'safety:emergency:dispatch');if(!dto.title.trim()||!dto.requirement.trim()||!dto.responsibleName.trim())throw new BadRequestException('任务名称、要求和负责人不能为空');const row=await this.events.source(user,dto.sourceType,dto.sourceId),dueAt=dueDate(dto.dueAt),alertId=dto.sourceType==='ALERT'?row.id:row.alertId;
    const activeKey=`${dto.taskType}:${alertId?'ALERT:'+alertId:dto.sourceType+':'+row.id}`;
    if(dto.taskType==='RECTIFICATION'&&dto.sourceType==='VIOLATION'&&!['CONFIRMED','RECTIFYING','PENDING_REVIEW'].includes(row.status))throw new BadRequestException('请先完成违规核查，再下达整改任务');
    const result=await this.prisma.$transaction(async tx=>{
      if(dto.taskType==='RECTIFICATION'){
        const existing=await tx.safetyRectificationTask.findFirst({where:{activeKey,...scope(user)}});if(existing)return {...existing,taskType:dto.taskType,reused:true};
        return {...await tx.safetyRectificationTask.create({data:{businessNo:businessNo('ZG'),enterpriseId:row.enterpriseId,organizationId:row.organizationId,sourceType:dto.sourceType,sourceId:row.id,activeKey,title:dto.title.trim(),requirement:dto.requirement.trim(),responsibleName:dto.responsibleName.trim(),dueAt,historyJson:JSON.stringify([historyEntry(user,'CREATE',dto.requirement,undefined,'WAITING_RESPONSE')])}}),taskType:dto.taskType,reused:false};
      }
      let linkId=alertId;
      if(!linkId){const alert=await tx.safetyAlert.create({data:{businessNo:businessNo('ALT'),alertType:'MANUAL_REPORT',source:'CASE_LINK',level:row.level??'MEDIUM',title:row.title,description:row.description,enterpriseId:row.enterpriseId,organizationId:row.organizationId,vehicleId:row.vehicleId,occurredAt:row.occurredAt??row.startedAt}});linkId=alert.id;if(dto.sourceType==='ACCIDENT')await tx.accident.update({where:{id:row.id},data:{alertId:linkId}});if(dto.sourceType==='VIOLATION')await tx.violation.update({where:{id:row.id},data:{alertId:linkId}});await tx.safetyRectificationTask.updateMany({where:{sourceType:dto.sourceType,sourceId:row.id,status:{not:'CLOSED'},...scope(user)},data:{activeKey:`RECTIFICATION:ALERT:${linkId}`}});}
      const existing=await tx.emergencyTask.findFirst({where:{alertId:linkId,status:{not:'CLOSED'},...scope(user)}});if(existing)return {...existing,taskType:dto.taskType,reused:true};
      const item=await tx.emergencyTask.create({data:{businessNo:businessNo('YJ'),alertId:linkId,accidentId:dto.sourceType==='ACCIDENT'?row.id:undefined,enterpriseId:row.enterpriseId,organizationId:row.organizationId,activeKey:`EMERGENCY:ALERT:${linkId}`,level:row.level??'MEDIUM',title:dto.title.trim(),requirement:dto.requirement.trim(),responsibleName:dto.responsibleName.trim(),responseMode:dto.responseMode??'FIELD',dueAt,status:'WAITING_RESPONSE',dispatchedAt:new Date(),logs:{create:{actorUserId:user.id,actorName:user.displayName,action:'DISPATCH',toStatus:'WAITING_RESPONSE',content:dto.requirement}}}});return {...item,taskType:dto.taskType,reused:false};
    });if(!result.reused)await this.auth.audit(user,'safety','task',result.id,'CREATE',{taskType:dto.taskType,sourceType:dto.sourceType,sourceId:dto.sourceId});return result;
  }
  private async refreshInspection(tx:any,inspectionId:string){
    const inspection=await tx.regulatoryInspection.findUnique({where:{id:inspectionId},include:{issues:{include:{task:true}}}});if(!inspection)return;
    const tasks=inspection.issues.map((i:any)=>i.task);const status=tasks.length&&tasks.every((t:any)=>t?.status==='CLOSED')?'CLOSED':tasks.length&&tasks.every((t:any)=>['CLOSED','PENDING_REVIEW'].includes(t?.status))?'PENDING_REVIEW':'RECTIFYING';
    await tx.regulatoryInspection.update({where:{id:inspectionId},data:{status,closedAt:status==='CLOSED'?new Date():null,version:{increment:1}}});
  }
  async act(user:AuthUser,kind:string,id:string,dto:WorkspaceTaskActionDto){
    const current:any=await this.detail(user,kind,id),enterprise=user.portal==='ENTERPRISE';
    if(enterprise){requirePermission(user,'safety:emergency:respond');if(!['RESPOND','SUBMIT_FEEDBACK'].includes(dto.action))throw new ForbiddenException('企业只能响应任务或提交反馈');}
    else {regulator(user);requirePermission(user,dto.action==='DISPATCH'?'safety:emergency:dispatch':'safety:emergency:review');if(!['DISPATCH','RETURN','CLOSE'].includes(dto.action))throw new ForbiddenException('监管人员不能代替企业响应或反馈');}
    if(!dto.comment.trim())throw new BadRequestException('请填写办理意见');
    const next=actionState(current.status,dto.action,kind as any),isRect=kind==='RECTIFICATION';
    if(dto.action==='CLOSE'&&!isRect&&!dto.score)throw new BadRequestException('请填写1至5分应急响应评价');
    const materials=dto.action==='SUBMIT_FEEDBACK'?await this.materials.items(user,current.enterpriseId,dto.materialIds??[]):current.materials;
    if(isRect&&dto.action==='SUBMIT_FEEDBACK'&&!materials.length)throw new BadRequestException('请至少提交一份整改材料');
    const dueAt=dto.action==='RETURN'&&dto.dueAt?dueDate(dto.dueAt):undefined;
    if(dto.action==='RETURN'&&new Date(current.dueAt)<new Date()&&!dueAt)throw new BadRequestException('原期限已过，请同时填写新的补正期限');
    await this.prisma.$transaction(async tx=>{
      const where={id,status:current.status,...scope(user)},common={status:next,respondedAt:dto.action==='RESPOND'?new Date():undefined,feedback:dto.action==='SUBMIT_FEEDBACK'?dto.comment.trim():undefined,reviewComment:['RETURN','CLOSE'].includes(dto.action)?dto.comment.trim():undefined,dueAt,closedAt:next==='CLOSED'?new Date():undefined,activeKey:next==='CLOSED'?null:undefined};
      if(isRect){const changed=await tx.safetyRectificationTask.updateMany({where:{...where,version:dto.version??current.version},data:{...common,materialsJson:dto.action==='SUBMIT_FEEDBACK'?JSON.stringify(materials):undefined,historyJson:JSON.stringify([...current.history,{...historyEntry(user,dto.action,dto.comment,current.status,next),materials:dto.action==='SUBMIT_FEEDBACK'?materials:undefined,previousDueAt:current.dueAt,dueAt:dueAt?.toISOString()}]),version:{increment:1}}});if(changed.count!==1)throw new ConflictException('任务状态已更新，请刷新后重试');if(current.inspectionIssue)await this.refreshInspection(tx,current.inspectionIssue.inspectionId);
        if(current.sourceType==='VIOLATION'){const source=await tx.violation.findFirst({where:{id:current.sourceId,...scope(user)}});if(source&&['CONFIRMED','RECTIFYING','PENDING_REVIEW'].includes(source.status))await tx.violation.updateMany({where:{id:source.id,status:source.status},data:{status:next==='CLOSED'?'CLOSED':next==='PENDING_REVIEW'?'PENDING_REVIEW':'RECTIFYING',rectification:dto.action==='SUBMIT_FEEDBACK'?dto.comment:undefined,reviewComment:['RETURN','CLOSE'].includes(dto.action)?dto.comment:undefined,closedAt:next==='CLOSED'?new Date():undefined}});}
      }else {const changed=await tx.emergencyTask.updateMany({where:{...where,updatedAt:current.updatedAt},data:{...common,dispatchedAt:dto.action==='DISPATCH'?new Date():undefined,attachmentJson:dto.action==='SUBMIT_FEEDBACK'?JSON.stringify(materials):undefined,evaluationScore:dto.action==='CLOSE'?dto.score:undefined,evaluation:dto.action==='CLOSE'?dto.comment:undefined}});if(changed.count!==1)throw new ConflictException('任务状态已更新，请刷新后重试');await tx.emergencyTaskLog.create({data:{taskId:id,actorUserId:user.id,actorName:user.displayName,action:dto.action,fromStatus:current.status,toStatus:next,content:dto.comment}});}
    });await this.auth.audit(user,'safety','task',id,dto.action,{taskType:kind,comment:dto.comment});return this.detail(user,kind,id);
  }
}
