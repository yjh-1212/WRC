import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseAccidentVideos, safeVideoUrl } from '../oversight/accident-video';
import { WorkspaceQueryDto, EventVideosDto, EvidenceSealDto, DeterminationDto } from './workspace.dto';
import { evidenceCompleteness, evidenceWindow, EVENT_PERMISSIONS, eventPermission, parse, requirePermission, scope } from './workspace-rules';
import { SafetyMaterialsService } from './workspace-materials.service';
import { evidenceZip } from './evidence-zip';

const identities = { enterprise:{select:{id:true,name:true}}, organization:{select:{id:true,name:true}}, vehicle:{select:{id:true,name:true,businessNo:true,unifiedCode:true}} };
const tables: Record<string,string> = {ALERT:'SafetyAlert',ACCIDENT:'Accident',VIOLATION:'Violation',OFFLINE:'OfflineEvent'};
const closed = ['CLOSED','ARCHIVED','RECOVERED'];

@Injectable()
export class EventWorkspaceService {
  constructor(private prisma: PrismaService, private auth: AuthService, private materials: SafetyMaterialsService) {}
  async options(user: AuthUser) {
    if (!Object.values(EVENT_PERMISSIONS).some(p=>user.permissions.includes(p.read)) && !user.permissions.includes('safety:emergency:read')) requirePermission(user,'safety:alert:read');
    const own=scope(user);
    const [enterprises,vehicles]=await Promise.all([
      this.prisma.enterprise.findMany({where:{organizationId:own.organizationId,...(user.portal==='ENTERPRISE'?{id:user.enterpriseId??'__none__'}:{})},select:{id:true,name:true,organizationId:true},orderBy:{name:'asc'}}),
      this.prisma.vehicle.findMany({where:{...own,deletedAt:null},select:{id:true,name:true,businessNo:true,enterpriseId:true,realtimeStatus:{select:{longitude:true,latitude:true,locationTime:true}}},orderBy:{name:'asc'}}),
    ]);return {enterprises,vehicles,eventTypes:Object.entries(EVENT_PERMISSIONS).filter(([,v])=>user.permissions.includes(v.read)).map(([key])=>key)};
  }
  async source(user: AuthUser, type: string, id: string, write=false) {
    const rule=eventPermission(user,type,write),row=await (this.prisma as any)[rule.model].findFirst({where:{id,...scope(user)},include:identities});
    if(!row)throw new NotFoundException('事件不存在或不在当前数据范围内');return row;
  }
  async readyToClose(user:AuthUser,type:string,id:string){
    const row=await this.source(user,type,id,true),alertId=type==='ALERT'?id:row.alertId;
    const candidates=[{sourceType:type,sourceId:id},...(alertId?[{sourceType:'ALERT',sourceId:alertId}]:[])];
    if(alertId){for(const [kind,model]of [['ACCIDENT','accident'],['VIOLATION','violation']] as const){const children=await (this.prisma as any)[model].findMany({where:{alertId,...scope(user)},select:{id:true}});candidates.push(...children.map((r:any)=>({sourceType:kind,sourceId:r.id})));}}
    const [emergency,rectification]=await Promise.all([this.prisma.emergencyTask.count({where:{...scope(user),status:{not:'CLOSED'},OR:[...(alertId?[{alertId}]:[]),...(type==='ACCIDENT'?[{accidentId:id}]:[])]}}),this.prisma.safetyRectificationTask.count({where:{...scope(user),status:{not:'CLOSED'},OR:candidates}})]);
    if(emergency||rectification)throw new BadRequestException('仍有关联任务未办结，请先完成应急或整改复核');
  }
  async legacyViolationAction(user:AuthUser,id:string){
    await this.source(user,'VIOLATION',id);const active=await this.prisma.safetyRectificationTask.count({where:{sourceType:'VIOLATION',sourceId:id,status:{not:'CLOSED'},...scope(user)}});if(active)throw new BadRequestException('请在关联整改任务中提交反馈或复核，不能跳过任务流程');
  }
  async list(user: AuthUser, query: WorkspaceQueryDto) {
    const kinds=Object.entries(EVENT_PERMISSIONS).filter(([kind,r])=>user.permissions.includes(r.read)&&(!query.eventType||query.eventType===kind)).map(([kind])=>kind);
    if(!kinds.length)return {items:[],total:0,page:query.page,pageSize:query.pageSize};
    if(query.from&&query.to&&new Date(query.from)>new Date(query.to))throw new BadRequestException('开始时间不能晚于结束时间');
    // Fixed table/column names only. Values and verified membership scope are bound
    // parameters, including the UNION: pagination/counts operate on the whole queue.
    const parts=kinds.map(kind=>{
      const time=Prisma.raw(kind==='OFFLINE'?'s.startedAt':'s.occurredAt'),conditions:Prisma.Sql[]=[];
      const own=scope(user);if(own.organizationId)conditions.push(Prisma.sql`s.organizationId IN (${Prisma.join(own.organizationId.in)})`);
      if(user.portal==='ENTERPRISE')conditions.push(Prisma.sql`s.enterpriseId=${user.enterpriseId??'__none__'}`);
      if(query.enterpriseId)conditions.push(Prisma.sql`s.enterpriseId=${query.enterpriseId}`);
      if(query.vehicleId)conditions.push(Prisma.sql`s.vehicleId=${query.vehicleId}`);
      if(query.level&&kind!=='OFFLINE')conditions.push(Prisma.sql`s.level=${query.level}`);
      if(query.from)conditions.push(Prisma.sql`${time}>=${new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.from)?query.from+'T00:00:00+08:00':query.from)}`);
      if(query.to)conditions.push(Prisma.sql`${time}<=${new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.to)?query.to+'T23:59:59.999+08:00':query.to)}`);
      if(query.q)conditions.push(Prisma.sql`instr(lower(s.businessNo||' '||COALESCE(v.name,'')||' '||COALESCE(e.name,'')||' '||${kind==='OFFLINE'?Prisma.raw("'车辆离线'"):Prisma.raw('s.title')}),lower(${query.q.trim()}))>0`);
      // A typed child becomes the queue entry, while its source alert stays linked
      // in detail. Never hide a source in favour of an unreadable child record.
      if(kind==='ALERT')for(const child of ['ACCIDENT','VIOLATION','OFFLINE'])if(user.permissions.includes(EVENT_PERMISSIONS[child].read))conditions.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM ${Prisma.raw(tables[child])} c WHERE c.alertId=s.id)`);
      const queue=Prisma.raw("CASE WHEN s.status IN ('CLOSED','ARCHIVED','RECOVERED') THEN 'CLOSED' WHEN s.status='PENDING_REVIEW' THEN 'REVIEW' WHEN s.status IN ('REPORTED','PENDING_CONFIRMATION','PENDING_HANDLING','PENDING_DETERMINATION','OFFLINE') THEN 'PENDING' ELSE 'HANDLING' END");
      if(query.queue&&query.queue!=='ALL')conditions.push(Prisma.sql`${queue}=${query.queue}`);
      if(query.status)conditions.push(Prisma.sql`s.status=${query.status}`);
      const title=kind==='OFFLINE'?Prisma.sql`COALESCE(v.name,'车辆')||'离线'`:Prisma.raw('s.title');
      const attachment=['ALERT','ACCIDENT'].includes(kind)?Prisma.raw('s.attachmentJson'):Prisma.raw('NULL');
      return Prisma.sql`SELECT ${kind} kind,s.id,s.businessNo,${title} title,s.status,${queue} queue,${time} occurredAt,s.vehicleId,s.enterpriseId,s.organizationId,v.name vehicleName,v.businessNo vehicleBusinessNo,e.name enterpriseName,${attachment} attachmentJson FROM ${Prisma.raw(tables[kind])} s LEFT JOIN Vehicle v ON v.id=s.vehicleId JOIN Enterprise e ON e.id=s.enterpriseId WHERE ${conditions.length?Prisma.join(conditions,' AND '):Prisma.sql`1=1`}`;
    });
    const union=Prisma.join(parts,' UNION ALL ');
    const [counts,rows]=await this.prisma.$transaction([
      this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT COUNT(*) total FROM (${union})`),
      this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM (${union}) ORDER BY occurredAt DESC,kind,id LIMIT ${query.pageSize} OFFSET ${(query.page-1)*query.pageSize}`),
    ]);
    return {total:Number(counts[0].total),page:query.page,pageSize:query.pageSize,items:rows.map(row=>{const videos=parseAccidentVideos(row.attachmentJson);return {...row,occurredAt:new Date(Number.isFinite(Number(row.occurredAt))?Number(row.occurredAt):row.occurredAt),attachmentJson:undefined,videoCount:videos.videos.filter(v=>v.state==='AVAILABLE').length,enterprise:{id:row.enterpriseId,name:row.enterpriseName},vehicle:row.vehicleId?{id:row.vehicleId,name:row.vehicleName,businessNo:row.vehicleBusinessNo}:null}})};
  }
  private async snapshot(user: AuthUser,type:string,id:string) {
    const row=await this.source(user,type,id),occurredAt=type==='OFFLINE'?row.startedAt:row.occurredAt,window=evidenceWindow(occurredAt),range={gte:window.from,lte:window.to};
    const canTrack=user.permissions.includes('operation:trajectory:read'),canAlerts=user.permissions.includes('safety:alert:read');
    const [observations,legacy,alerts]=await Promise.all([
      row.vehicleId?this.prisma.vehicleObservation.findMany({where:{vehicleId:row.vehicleId,recordedAt:range},orderBy:{recordedAt:'asc'},take:10001}):[],
      row.vehicleId?this.prisma.vehicleTrackPoint.findMany({where:{vehicleId:row.vehicleId,recordedAt:range},orderBy:{recordedAt:'asc'},take:10001}):[],
      canAlerts&&row.vehicleId?this.prisma.safetyAlert.findMany({where:{vehicleId:row.vehicleId,occurredAt:range,...scope(user)},select:{id:true,businessNo:true,title:true,alertType:true,status:true,occurredAt:true},orderBy:{occurredAt:'asc'}}):[],
    ]);
    const points=new Map<string,any>();for(const point of [...legacy,...observations])if(Number.isFinite(point.longitude)&&Number.isFinite(point.latitude)&&!(point.longitude===0&&point.latitude===0))points.set(`${point.recordedAt.toISOString()}/${point.longitude}/${point.latitude}`,{...point,recordedAt:point.recordedAt.toISOString()});
    const track=[...points.values()].sort((a,b)=>Date.parse(a.recordedAt)-Date.parse(b.recordedAt)),truncated=observations.length>10000||legacy.length>10000;
    let attachment=row.attachmentJson;if(!attachment&&row.alertId&&canAlerts)attachment=(await this.prisma.safetyAlert.findFirst({where:{id:row.alertId,...scope(user)},select:{attachmentJson:true}}))?.attachmentJson;
    const video=parseAccidentVideos(attachment),videos=video.videos.filter(v=>!v.startedAt||!v.endedAt||Date.parse(v.startedAt)<window.to.getTime()&&Date.parse(v.endedAt)>window.from.getTime());
    const completeness=evidenceCompleteness(window.from.getTime(),window.to.getTime(),videos,track);if(truncated&&completeness.state==='COMPLETE')completeness.state='PARTIAL';
    return {eventType:type,eventId:id,title:row.title??`${row.vehicle?.name??'车辆'}离线`,businessNo:row.businessNo,vehicleId:row.vehicleId,enterpriseId:row.enterpriseId,organizationId:row.organizationId,occurredAt:new Date(occurredAt).toISOString(),window:{...window,from:window.from.toISOString(),to:window.to.toISOString()},track:canTrack?track.slice(0,10000):[],trackTruncated:truncated,videos,videoState:video.state,completeness,alerts,access:{tracks:canTrack,alerts:canAlerts},collectedAt:new Date().toISOString()};
  }
  async detail(user:AuthUser,type:string,id:string,query:WorkspaceQueryDto=new WorkspaceQueryDto()) {
    const row=await this.source(user,type,id),revisions=await this.prisma.safetyEvidenceRevision.findMany({where:{eventType:type,eventId:id,...scope(user)},select:{id:true,version:true,state:true,sha256:true,reason:true,actorName:true,createdAt:true},orderBy:{version:'desc'}});
    let snapshot:any;if(query.revision){const stored=await this.prisma.safetyEvidenceRevision.findFirst({where:{eventType:type,eventId:id,version:query.revision,...scope(user)}});if(!stored)throw new NotFoundException('证据版本不存在');snapshot=parse(stored.snapshotJson);if(!user.permissions.includes('operation:trajectory:read')){snapshot.track=[];snapshot.access.tracks=false;}if(!user.permissions.includes('safety:alert:read')){snapshot.alerts=[];snapshot.access.alerts=false;}}else snapshot=await this.snapshot(user,type,id);
    const alertId=type==='ALERT'?id:row.alertId,linked:any[]=[];
    if(alertId){for(const [kind,r]of Object.entries(EVENT_PERMISSIONS)){if(kind==='ALERT'||!user.permissions.includes(r.read))continue;const children=await (this.prisma as any)[r.model].findMany({where:{alertId,...scope(user)},select:{id:true,businessNo:true,status:true}});linked.push(...children.filter((c:any)=>!(kind===type&&c.id===id)).map((c:any)=>({...c,kind})));}}
    const sources=[{sourceType:type,sourceId:id},...(alertId?[{sourceType:'ALERT',sourceId:alertId}]:[]),...linked.map(r=>({sourceType:r.kind,sourceId:r.id}))];
    const tasks=user.permissions.includes('safety:emergency:read')?await Promise.all([this.prisma.emergencyTask.findMany({where:{...scope(user),OR:[...(alertId?[{alertId}]:[]),...(type==='ACCIDENT'?[{accidentId:id}]:[])]},select:{id:true,businessNo:true,title:true,status:true,dueAt:true}}),this.prisma.safetyRectificationTask.findMany({where:{...scope(user),OR:sources},select:{id:true,businessNo:true,title:true,status:true,dueAt:true}})]):[[],[]];
    const history=await this.prisma.auditLog.findMany({where:{objectId:id,module:'safety'},select:{id:true,action:true,detail:true,createdAt:true,user:{select:{displayName:true}}},orderBy:{createdAt:'asc'},take:200});
    return {...row,...snapshot,attachmentJson:undefined,evidenceJson:undefined,evidence:parse(row.evidenceJson),determination:parse(row.determinationJson),determinationJson:undefined,related:linked,revisions,selectedRevision:query.revision??null,history:history.map(h=>({...h,actorName:h.user?.displayName??'记录人员',content:parse(h.detail).comment??parse(h.detail).reason??''})),tasks:[...tasks[0].map((t:any)=>({...t,taskType:'EMERGENCY'})),...tasks[1].map((t:any)=>({...t,taskType:'RECTIFICATION'}))]};
  }
  async submitVideos(user:AuthUser,type:string,id:string,dto:EventVideosDto) {
    const row=await this.source(user,type,id);if(['PROVINCE','OPERATIONS'].includes(user.accountLevel??''))requirePermission(user,'__local_write__');
    requirePermission(user,type==='ACCIDENT'?'safety:accident:report':'safety:alert:write');
    if(!['ACCIDENT','ALERT'].includes(type))throw new BadRequestException('请从关联告警或事故补充录像');
    const videos=[];for(const v of dto.videos){const url=safeVideoUrl(v.url),start=Date.parse(v.startedAt),end=Date.parse(v.endedAt);if(!url||end<=start||end-start>86400000)throw new BadRequestException('录像地址或起止时间无效');if(url.startsWith('/media/safety/')){const items=await this.materials.items(user,row.enterpriseId,[url.split('/').pop()!]);if(items[0]?.mimeType!=='video/mp4')throw new BadRequestException('关联材料不是MP4录像');}videos.push({...v,url,submittedById:user.id,submittedAt:new Date().toISOString()});}
    const previous=parse(row.attachmentJson,null);if(row.attachmentJson&&!previous)throw new BadRequestException('原附件格式异常，禁止覆盖原证据');const old=Array.isArray(previous)?previous:previous?.videos??[];if(old.length+videos.length>100)throw new BadRequestException('最多关联100段录像');
    const changed=await (this.prisma as any)[EVENT_PERMISSIONS[type].model].updateMany({where:{id,attachmentJson:row.attachmentJson,...scope(user)},data:{attachmentJson:JSON.stringify({...(!Array.isArray(previous)?previous:{}),videos:[...old,...videos]})}});if(changed.count!==1)throw new ConflictException('录像已被更新，请刷新后重试');
    await this.auth.audit(user,'safety',type.toLowerCase(),id,'ADD_VIDEO',{count:videos.length});return this.detail(user,type,id);
  }
  async seal(user:AuthUser,type:string,id:string,dto:EvidenceSealDto) {
    await this.source(user,type,id,true);requirePermission(user,'operation:trajectory:read');const snapshot=await this.snapshot(user,type,id),latest=await this.prisma.safetyEvidenceRevision.findFirst({where:{eventType:type,eventId:id,...scope(user)},orderBy:{version:'desc'}});
    const snapshotJson=JSON.stringify(snapshot),sha256=createHash('sha256').update(snapshotJson).digest('hex');
    try{const record=await this.prisma.safetyEvidenceRevision.create({data:{eventType:type,eventId:id,version:(latest?.version??0)+1,vehicleId:snapshot.vehicleId,enterpriseId:snapshot.enterpriseId,organizationId:snapshot.organizationId,occurredAt:new Date(snapshot.occurredAt),windowFrom:new Date(snapshot.window.from),windowTo:new Date(snapshot.window.to),state:snapshot.completeness.state,snapshotJson,sha256,reason:dto.reason.trim(),actorId:user.id,actorName:user.displayName}});await this.auth.audit(user,'safety',type.toLowerCase(),id,'PRESERVE_EVIDENCE',{version:record.version,sha256,reason:dto.reason});return {id:record.id,version:record.version,sha256,state:record.state};}catch(e){if((e as any).code==='P2002')throw new ConflictException('已生成新的证据版本，请刷新后重试');throw e;}
  }
  async export(user:AuthUser,type:string,id:string,query:WorkspaceQueryDto) {
    const detail=await this.detail(user,type,id,query),files:{name:string;buffer:Buffer}[]=[],omitted:any[]=[],included=new Set<string>();let total=0;
    for(const video of detail.videos){const materialId=video.url?.match(/^\/media\/safety\/([a-f\d-]{36})$/i)?.[1];if(!materialId||included.has(materialId))continue;included.add(materialId);const material=await this.materials.download(user,materialId);if(total+material.size>100*1024*1024){omitted.push({id:materialId,reason:'附件总量超过100MB，请单独下载'});continue;}total+=material.size;files.push({name:`录像/${material.id}.mp4`,buffer:material.buffer});}
    const manifest={...detail,exportedAt:new Date().toISOString(),omitted,mediaPolicy:'本地已上传录像随包提供；外部录像仅保留来源地址，不自动下载、不保证外部地址长期可用。录像按原文件保留，时间窗口为回放范围，未伪称已物理裁剪。'},json=JSON.stringify(manifest,null,2);
    files.unshift({name:'证据清单.json',buffer:Buffer.from(json)},{name:'清单校验.sha256',buffer:Buffer.from(createHash('sha256').update(json).digest('hex')+'  证据清单.json')});
    return {name:`${detail.businessNo}-证据${query.revision?'-V'+query.revision:''}.zip`,buffer:evidenceZip(files)};
  }
  async determination(user:AuthUser,id:string,dto:DeterminationDto){const row=await this.source(user,'ACCIDENT',id,true);if(row.status!=='INVESTIGATING')throw new BadRequestException('仅调查中的事故可以登记认定结果');if(!dto.materialIds.length)throw new BadRequestException('请上传认定文书');if(new Date(dto.issuedAt)>new Date())throw new BadRequestException('文书出具时间不能晚于当前时间');const materials=await this.materials.items(user,row.enterpriseId,dto.materialIds),determination={...dto,materials,registeredBy:user.displayName,registeredAt:new Date().toISOString()};const changed=await this.prisma.accident.updateMany({where:{id,status:row.status,updatedAt:row.updatedAt},data:{status:'RESPONSIBILITY_DETERMINED',responsibility:dto.result,determinationJson:JSON.stringify(determination)}});if(changed.count!==1)throw new ConflictException('事故状态已更新，请刷新后重试');await this.auth.audit(user,'safety','accident',id,'REGISTER_DETERMINATION',{authority:dto.authority,documentNo:dto.documentNo,comment:dto.result});return this.detail(user,'ACCIDENT',id);}
}
