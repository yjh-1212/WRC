import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { isScopedAdministrator } from '../auth/workspace-access';
import { PrismaService } from '../prisma/prisma.service';
import { AccidentActionDto, AccidentVideoDto, AlertActionDto, CreateAccidentDto, CreateAlertDto, CreateEmergencyTaskDto, CreateViolationDto, EmergencyActionDto, OfflineActionDto, SafetyQueryDto, SubmitAccidentVideosDto, ViolationActionDto } from './dto';
import { dueDate } from './workspace-rules';
import { safeVideoUrl } from '../oversight/accident-video';
import { effectiveLicense, inHours, inPolygon, json, permitFindings } from '../operations/monitoring-rules';

@Injectable()
export class SafetyService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  private isSuper(user: AuthUser) { return isScopedAdministrator(user); }
  private organizationRelation(user: AuthUser) {
    return { is: { OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] } };
  }
  private scoped(user: AuthUser) {
    if (user.portal === 'ENTERPRISE') {
      if (!user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
      return { enterpriseId: user.enterpriseId };
    }
    return this.isSuper(user) ? {} : { organization: this.organizationRelation(user) };
  }
  private page(query: SafetyQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
  private videoEvidence(user: AuthUser, videos: AccidentVideoDto[] = []) {
    return videos.map(video => {
      const url = safeVideoUrl(video.url), start = new Date(video.startedAt), end = new Date(video.endedAt);
      if (!url) throw new BadRequestException('录像地址必须为HTTP(S)地址或本平台媒体文件路径');
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end.getTime() - start.getTime() > 86400000) throw new BadRequestException('录像起止时间无效，单段录像最多24小时');
      return { ...video, url, startedAt: start.toISOString(), endedAt: end.toISOString(), submittedById: user.id, submittedAt: new Date().toISOString() };
    });
  }
  async submitAccidentVideos(user: AuthUser, id: string, dto: SubmitAccidentVideosDto) {
    if (user.accountLevel === 'PROVINCE' || user.accountLevel === 'OPERATIONS') throw new ForbiddenException('事故视频由所属地市或企业提交，省级只读核查');
    const row = await this.prisma.accident.findFirst({ where: { id, ...this.scoped(user) } });
    if (!row) throw new NotFoundException('事故不存在或不在当前数据范围内');
    const videos = this.videoEvidence(user, dto.videos);
    let previous: any = { videos: [] };
    if (row.attachmentJson) { try { previous = JSON.parse(row.attachmentJson); } catch { throw new BadRequestException('原事故附件格式异常，请先核查，禁止覆盖原证据'); } }
    const existing = Array.isArray(previous) ? previous : Array.isArray(previous?.videos) ? previous.videos : [];
    if (existing.length + videos.length > 100) throw new BadRequestException('单起事故最多关联100段录像');
    const next = Array.isArray(previous) ? [...previous, ...videos] : { ...previous, videos: [...existing, ...videos] };
    const result = await this.prisma.accident.updateMany({ where: { id, ...this.scoped(user), attachmentJson: row.attachmentJson }, data: { attachmentJson: JSON.stringify(next) } });
    if (result.count !== 1) throw new ConflictException('其他人员刚刚补充了事故资料，请重新读取后再提交');
    await this.auth.audit(user, 'safety', 'accident', id, 'ADD_VIDEO_EVIDENCE', { channels: videos.map(video => video.channel), count: videos.length });
    return { added: videos.length };
  }
  private range(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    return { gte: from ? new Date(from) : undefined, lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined };
  }
  private businessNo(prefix: string) {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
    return `${prefix}-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  private parsePolygon(value: string) {
    try { return JSON.parse(value) as Array<{ longitude: number; latitude: number }>; } catch { return []; }
  }
  private pointInPolygon(longitude: number, latitude: number, polygon: Array<{ longitude: number; latitude: number }>) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude, yi = polygon[i].latitude, xj = polygon[j].longitude, yj = polygon[j].latitude;
      const crossed = ((yi > latitude) !== (yj > latitude)) && longitude < ((xj - xi) * (latitude - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (crossed) inside = !inside;
    }
    return inside;
  }
  private validatePolygon(polygon?: Array<{ longitude: number; latitude: number }>) {
    if (!polygon || polygon.length < 3) throw new BadRequestException('电子围栏至少需要 3 个有效坐标点');
  }
  private async vehicleFor(user: AuthUser, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null, ...this.scoped(user) }, include: { enterprise: true, organization: true, realtimeStatus: true } });
    if (!vehicle) throw new NotFoundException('车辆不存在或不在当前数据范围内');
    return vehicle;
  }
  private async assertRegulatoryWrite(user: AuthUser, organizationId: string) {
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能维护监管规则');
    if (this.isSuper(user)) return;
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId, OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] } });
    if (!organization) throw new ForbiddenException('不能维护当前组织范围之外的数据');
  }

  async options(user: AuthUser) {
    const scope = this.scoped(user);
    const [vehicles, enterprises, organizations, assignees] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({ where: { deletedAt: null, ...scope }, orderBy: { name: 'asc' }, select: { id: true, name: true, businessNo: true, enterpriseId: true, organizationId: true } }),
      this.prisma.enterprise.findMany({ where: user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' } : this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }, orderBy: { name: 'asc' }, select: { id: true, name: true, organizationId: true } }),
      this.prisma.organization.findMany({ where: this.isSuper(user) ? {} : { OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] }, orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
      this.prisma.user.findMany({ where: { portal: 'REGULATORY', status: 'ACTIVE' }, orderBy: { displayName: 'asc' }, select: { id: true, displayName: true, username: true } }),
    ]);
    return { vehicles, enterprises, organizations, assignees };
  }

  private alertWhere(user: AuthUser, query: SafetyQueryDto): Prisma.SafetyAlertWhereInput {
    return {
      ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId,
      organizationId: query.organizationId, vehicleId: query.vehicleId, status: query.status, alertType: query.type, level: query.level,
      occurredAt: this.range(query.from, query.to),
      OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { vehicle: { name: { contains: query.q } } }, { enterprise: { name: { contains: query.q } } }] : undefined,
    };
  }
  async alerts(user: AuthUser, query: SafetyQueryDto) {
    const where = this.alertWhere(user, query);
    const [total, items, grouped] = await this.prisma.$transaction([
      this.prisma.safetyAlert.count({ where }),
      this.prisma.safetyAlert.findMany({ where, ...this.page(query), orderBy: [{ level: 'desc' }, { occurredAt: 'desc' }], include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, businessNo: true } }, responsibleUser: { select: { id: true, displayName: true } }, fenceTrigger: { include: { fence: { select: { id: true, name: true } } } }, _count: { select: { emergencyTasks: true } } } }),
      this.prisma.safetyAlert.groupBy({ by: ['status'], where: { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId }, orderBy: { status: 'asc' }, _count: true }),
    ]);
    const summary = { pendingConfirmation: 0, pendingHandling: 0, inProgress: 0, pendingReview: 0, closed: 0, critical: await this.prisma.safetyAlert.count({ where: { ...this.alertWhere(user, query), level: 'CRITICAL', status: { not: 'CLOSED' } } }) };
    const key: Record<string, keyof typeof summary> = { PENDING_CONFIRMATION: 'pendingConfirmation', PENDING_HANDLING: 'pendingHandling', IN_PROGRESS: 'inProgress', PENDING_REVIEW: 'pendingReview', CLOSED: 'closed' };
    grouped.forEach((item) => { if (key[item.status]) { const count = (item as any)._count; summary[key[item.status]] = Number(typeof count === 'number' ? count : count?._all ?? 0); } });
    return { page: query.page, pageSize: query.pageSize, total, summary, items };
  }
  async alert(user: AuthUser, id: string) {
    const item = await this.prisma.safetyAlert.findFirst({ where: { id, ...this.scoped(user) }, include: { enterprise: true, organization: true, vehicle: { include: { model: true } }, responsibleUser: { select: { id: true, displayName: true } }, fenceTrigger: { include: { fence: true } }, offlineEvent: true, accidents: true, violations: true, emergencyTasks: { orderBy: { createdAt: 'desc' } } } });
    if (!item) throw new NotFoundException('告警不存在或不在当前数据范围内');
    return {...item,evidence:json(item.evidenceJson)};
  }
  async createAlert(user: AuthUser, dto: CreateAlertDto) {
    if(!dto.title.trim()||dto.occurredAt&&new Date(dto.occurredAt).getTime()>Date.now()+300000)throw new BadRequestException('事件名称不能为空，发生时间不能晚于当前时间');
    if(dto.longitude!=null&&dto.latitude!=null&&(!Number.isFinite(dto.longitude)||!Number.isFinite(dto.latitude)||Math.abs(dto.longitude)>180||Math.abs(dto.latitude)>90||dto.longitude===0&&dto.latitude===0))throw new BadRequestException('请填写有效的事发位置');
    const vehicle = await this.vehicleFor(user, dto.vehicleId);
    const item = await this.prisma.safetyAlert.create({ data: { businessNo: this.businessNo('ALT'), alertType: dto.alertType, source: user.portal === 'ENTERPRISE' ? 'ENTERPRISE_REPORT' : 'REGULATORY_ENTRY', level: dto.level, title: dto.title, description: dto.description, enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, vehicleId: vehicle.id, longitude: dto.longitude ?? vehicle.realtimeStatus?.longitude, latitude: dto.latitude ?? vehicle.realtimeStatus?.latitude, address: dto.address, occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date() } });
    await this.auth.audit(user, 'safety', 'safetyAlert', item.id, 'CREATE', { businessNo: item.businessNo, source: item.source });
    return item;
  }
  async actAlert(user: AuthUser, id: string, dto: AlertActionDto) {
    const current = await this.prisma.safetyAlert.findFirst({ where: { id, ...this.scoped(user) } });
    if (!current) throw new NotFoundException('告警不存在或不在当前数据范围内');
    if (user.portal === 'ENTERPRISE' && !['START', 'SUBMIT_REVIEW'].includes(dto.action)) throw new ForbiddenException('企业账号只能开始处置或提交复核');
    const transitions: Record<string, Record<string, string>> = {
      PENDING_CONFIRMATION: { CONFIRM: 'PENDING_HANDLING' }, PENDING_HANDLING: { START: 'IN_PROGRESS' },
      IN_PROGRESS: { SUBMIT_REVIEW: 'PENDING_REVIEW' }, PENDING_REVIEW: { CLOSE: 'CLOSED', REOPEN: 'IN_PROGRESS' }, CLOSED: { REOPEN: 'IN_PROGRESS' },
    };
    const next = transitions[current.status]?.[dto.action];
    if (!next) throw new BadRequestException(`告警当前状态不支持 ${dto.action} 操作`);
    const item = await this.prisma.safetyAlert.update({ where: { id }, data: { status: next, ruleKey: next === 'CLOSED' ? null : undefined, responsibleUserId: ['CONFIRM', 'START'].includes(dto.action) ? user.id : undefined, confirmedAt: dto.action === 'CONFIRM' ? new Date() : undefined, closedAt: next === 'CLOSED' ? new Date() : next === 'IN_PROGRESS' ? null : undefined, lastComment: dto.comment } });
    await this.auth.audit(user, 'safety', 'safetyAlert', id, dto.action, { from: current.status, to: next, comment: dto.comment });
    return item;
  }

  async processTelemetry(vehicle: { id: string; name: string; enterpriseId: string; organizationId: string }, telemetry: { longitude: number; latitude: number; speed: number }, recordedAt: Date) {
    const organization=await this.prisma.organization.findUnique({where:{id:vehicle.organizationId},select:{workspaceId:true}});
    const fences=await this.prisma.electronicFence.findMany({where:{active:true,fenceType:{in:['NO_ENTRY','SPEED_LIMIT','TEMPORARY']},organization:{is:{workspaceId:organization?.workspaceId??'__none__'}},validFrom:{lte:recordedAt},AND:[{OR:[{validTo:null},{validTo:{gte:recordedAt}}]},{OR:[{enterpriseId:null},{enterpriseId:vehicle.enterpriseId}]},{OR:[{vehicles:{none:{}}},{vehicles:{some:{vehicleId:vehicle.id}}}]}]}});
    const activeKeys:string[]=[];
    const createAlert=async (key:string,type:string,title:string,source:string,evidence:any)=>{
      activeKeys.push(key);return this.prisma.safetyAlert.upsert({where:{ruleKey:key},update:{},create:{ruleKey:key,businessNo:this.businessNo('ALT'),alertType:type,source,level:type==='NO_ENTRY'?'HIGH':'MEDIUM',title:vehicle.name+' · '+title,description:'系统识别的疑似异常，请结合定位、许可和现场情况核查',evidenceJson:JSON.stringify(evidence),enterpriseId:vehicle.enterpriseId,organizationId:vehicle.organizationId,vehicleId:vehicle.id,longitude:telemetry.longitude,latitude:telemetry.latitude,occurredAt:recordedAt}});
    };
    for(const fence of fences){
      const inside=inPolygon(telemetry,json(fence.polygonJson,[]));
      const applies=inHours(fence.allowedHours,recordedAt)===true;
      const type=applies&&inside?(fence.fenceType==='SPEED_LIMIT'?(telemetry.speed>(fence.speedLimit??Infinity)?'OVERSPEED':null):'NO_ENTRY'):null;
      const open=await this.prisma.fenceTrigger.findFirst({where:{fenceId:fence.id,vehicleId:vehicle.id,status:'ACTIVE'}});
      if(!type){if(open){await this.prisma.fenceTrigger.update({where:{id:open.id},data:{status:'RECOVERED',recoveredAt:recordedAt}});await this.prisma.safetyAlert.update({where:{id:open.alertId},data:{ruleKey:null,lastComment:'实时条件已恢复，等待人工复核'}})}continue}
      const key='FENCE:'+vehicle.id+':'+fence.id;activeKeys.push(key);if(open)continue;
      const evidence={kind:'FENCE',recordedAt:recordedAt.toISOString(),actual:{...telemetry},expected:{speedLimit:fence.speedLimit,allowedHours:fence.allowedHours},rule:{id:fence.id,name:fence.name,version:fence.version,type:fence.fenceType,polygon:json(fence.polygonJson,[])}};
      const alert=await createAlert(key,type,type==='OVERSPEED'?'触发限速围栏':'进入管制区域','FENCE_RULE',evidence);
      await this.prisma.fenceTrigger.upsert({where:{alertId:alert.id},update:{},create:{businessNo:this.businessNo('FTR'),fenceId:fence.id,vehicleId:vehicle.id,alertId:alert.id,triggerType:type==='OVERSPEED'?'OVERSPEED':'ENTER',longitude:telemetry.longitude,latitude:telemetry.latitude,speed:telemetry.speed,occurredAt:recordedAt}});
    }
    if(telemetry.speed>0.5){const licenses=await this.prisma.vehicleLicense.findMany({where:{vehicleId:vehicle.id},orderBy:{issuedAt:'desc'}});const license=effectiveLicense(licenses,recordedAt);
      for(const finding of permitFindings(license,telemetry,recordedAt))await createAlert('PERMIT:'+vehicle.id+':'+finding.type,finding.type,finding.title,'PERMIT_RULE',{kind:'PERMIT',recordedAt:recordedAt.toISOString(),actual:finding.actual,expected:finding.expected,position:telemetry,permit:license?{id:license.id,licenseNo:license.licenseNo,status:license.status,version:license.version,issuedAt:license.issuedAt,expiresAt:license.expiresAt,conditions:json(license.conditionsJson)}:null});
    }
    await this.prisma.safetyAlert.updateMany({where:{vehicleId:vehicle.id,source:{in:['PERMIT_RULE','FENCE_RULE']},ruleKey:{not:null,...(activeKeys.length?{notIn:activeKeys}:{})}},data:{ruleKey:null,lastComment:'实时条件已恢复或规则已失效，等待人工复核'}});
    const staleTriggers=await this.prisma.fenceTrigger.findMany({where:{vehicleId:vehicle.id,status:'ACTIVE',alert:{ruleKey:null}}});for(const trigger of staleTriggers)await this.prisma.fenceTrigger.update({where:{id:trigger.id},data:{status:'RECOVERED',recoveredAt:recordedAt}});
    const openOffline=await this.prisma.offlineEvent.findMany({where:{vehicleId:vehicle.id,status:{in:['OFFLINE','INVESTIGATING']}}});
    for(const event of openOffline)await this.prisma.$transaction([this.prisma.offlineEvent.update({where:{id:event.id},data:{status:'RECOVERED',endedAt:recordedAt,durationMinutes:Math.max(1,Math.round((recordedAt.getTime()-event.startedAt.getTime())/60000)),recoveryNote:'遥测已恢复，等待人工核查关闭关联事件'}}),this.prisma.safetyAlert.update({where:{id:event.alertId},data:{lastComment:'车辆已恢复上报，等待人工复核'}})]);
  }

  private async caseVehicle(user: AuthUser, vehicleId: string, operationRecordId?: string, alertId?: string) {
    const vehicle = await this.vehicleFor(user, vehicleId);
    if (operationRecordId) { const record = await this.prisma.operationRecord.findFirst({ where: { id: operationRecordId, vehicleId, ...this.scoped(user) } }); if (!record) throw new BadRequestException('运行记录与车辆不匹配或无权访问'); }
    if (alertId) { const alert = await this.prisma.safetyAlert.findFirst({ where: { id: alertId, vehicleId, ...this.scoped(user) } }); if (!alert) throw new BadRequestException('关联告警与车辆不匹配或无权访问'); }
    return vehicle;
  }
  async accidents(user: AuthUser, query: SafetyQueryDto) {
    const where: Prisma.AccidentWhereInput = { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, organizationId: query.organizationId, vehicleId: query.vehicleId, status: query.status, accidentType: query.type, level: query.level, occurredAt: this.range(query.from, query.to), OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { vehicle: { name: { contains: query.q } } }] : undefined };
    const [total, items] = await this.prisma.$transaction([this.prisma.accident.count({ where }), this.prisma.accident.findMany({ where, ...this.page(query), orderBy: { occurredAt: 'desc' }, include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, businessNo: true } }, reporterUser: { select: { displayName: true } }, operationRecord: { select: { id: true, businessNo: true } } } })]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async accident(user: AuthUser, id: string) { const item = await this.prisma.accident.findFirst({ where: { id, ...this.scoped(user) }, include: { enterprise: true, organization: true, vehicle: { include: { model: true } }, operationRecord: { include: { trackPoints: { orderBy: { sequence: 'asc' } } } }, alert: true, reporterUser: { select: { displayName: true } }, emergencyTasks: true } }); if (!item) throw new NotFoundException('事故不存在或不在当前数据范围内'); return item; }
  async createAccident(user: AuthUser, dto: CreateAccidentDto) {
    if(!dto.title.trim()||dto.occurredAt&&new Date(dto.occurredAt).getTime()>Date.now()+300000)throw new BadRequestException('事件名称不能为空，发生时间不能晚于当前时间');
    if(dto.longitude!=null&&dto.latitude!=null&&(!Number.isFinite(dto.longitude)||!Number.isFinite(dto.latitude)||Math.abs(dto.longitude)>180||Math.abs(dto.latitude)>90||dto.longitude===0&&dto.latitude===0))throw new BadRequestException('请填写有效的事发位置');
    const vehicle = await this.caseVehicle(user, dto.vehicleId, dto.operationRecordId, dto.alertId), { videos, ...fields } = dto;
    const item = await this.prisma.accident.create({ data: { ...fields, attachmentJson: videos?.length ? JSON.stringify({ videos: this.videoEvidence(user, videos) }) : undefined, businessNo: this.businessNo('ACC'), source: user.portal === 'ENTERPRISE' ? 'ENTERPRISE_REPORT' : 'REGULATORY_ENTRY', enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, reporterUserId: user.id, occurredAt: new Date(dto.occurredAt), casualties: dto.casualties ?? 0 } });
    await this.auth.audit(user, 'safety', 'accident', item.id, 'REPORT', { businessNo: item.businessNo }); return item;
  }
  async actAccident(user: AuthUser, id: string, dto: AccidentActionDto) { const current = await this.prisma.accident.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('事故不存在或不在当前数据范围内'); if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能执行监管事故认定'); const transitions: Record<string, Record<string, string>> = { REPORTED: { ACCEPT: 'ACCEPTED' }, ACCEPTED: { INVESTIGATE: 'INVESTIGATING' }, INVESTIGATING: { DETERMINE: 'RESPONSIBILITY_DETERMINED' }, RESPONSIBILITY_DETERMINED: { PROCESS: 'PROCESSING' }, PROCESSING: { CLOSE: 'CLOSED' }, CLOSED: { ARCHIVE: 'ARCHIVED' } }; const next = transitions[current.status]?.[dto.action]; if (!next) throw new BadRequestException('事故当前状态不支持该操作'); const data: Prisma.AccidentUpdateInput = { status: next, investigation: dto.action === 'INVESTIGATE' ? dto.comment : undefined, responsibility: dto.action === 'DETERMINE' ? dto.comment : undefined, disposalProgress: ['PROCESS', 'CLOSE'].includes(dto.action) ? dto.comment : undefined, closedAt: next === 'CLOSED' ? new Date() : undefined, archivedAt: next === 'ARCHIVED' ? new Date() : undefined }; const item = await this.prisma.accident.update({ where: { id }, data }); await this.auth.audit(user, 'safety', 'accident', id, dto.action, { from: current.status, to: next, comment: dto.comment }); return item; }

  async violations(user: AuthUser, query: SafetyQueryDto) { const where: Prisma.ViolationWhereInput = { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, organizationId: query.organizationId, vehicleId: query.vehicleId, status: query.status, violationType: query.type, level: query.level, occurredAt: this.range(query.from, query.to), OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { vehicle: { name: { contains: query.q } } }] : undefined }; const [total, items] = await this.prisma.$transaction([this.prisma.violation.count({ where }), this.prisma.violation.findMany({ where, ...this.page(query), orderBy: { occurredAt: 'desc' }, include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, businessNo: true } }, operationRecord: { select: { id: true, businessNo: true } } } })]); return { page: query.page, pageSize: query.pageSize, total, items }; }
  async violation(user: AuthUser, id: string) { const item = await this.prisma.violation.findFirst({ where: { id, ...this.scoped(user) }, include: { enterprise: true, organization: true, vehicle: true, operationRecord: { include: { trackPoints: { orderBy: { sequence: 'asc' } } } }, alert: true } }); if (!item) throw new NotFoundException('违规记录不存在或不在当前数据范围内'); return item; }
  async createViolation(user: AuthUser, dto: CreateViolationDto) { if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能进行违规认定'); const vehicle = await this.caseVehicle(user, dto.vehicleId, dto.operationRecordId, dto.alertId); const item = await this.prisma.violation.create({ data: { ...dto, businessNo: this.businessNo('VIO'), enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, occurredAt: new Date(dto.occurredAt) } }); await this.auth.audit(user, 'safety', 'violation', item.id, 'CREATE', { businessNo: item.businessNo }); return item; }
  async actViolation(user: AuthUser, id: string, dto: ViolationActionDto) { const current = await this.prisma.violation.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('违规记录不存在或不在当前数据范围内'); const enterpriseActions = ['SUBMIT_RECTIFICATION']; if (user.portal === 'ENTERPRISE' && !enterpriseActions.includes(dto.action)) throw new ForbiddenException('企业账号只能提交整改反馈'); const transitions: Record<string, Record<string, string>> = { PENDING_DETERMINATION: { CONFIRM: 'CONFIRMED' }, CONFIRMED: { REQUEST_RECTIFICATION: 'RECTIFYING' }, RECTIFYING: { SUBMIT_RECTIFICATION: 'PENDING_REVIEW' }, PENDING_REVIEW: { APPROVE: 'CLOSED', RETURN: 'RECTIFYING' } }; const next = transitions[current.status]?.[dto.action]; if (!next) throw new BadRequestException('违规记录当前状态不支持该操作'); const item = await this.prisma.violation.update({ where: { id }, data: { status: next, determination: dto.action === 'CONFIRM' ? dto.comment : undefined, rectification: dto.action === 'SUBMIT_RECTIFICATION' ? dto.comment : undefined, reviewComment: ['APPROVE', 'RETURN'].includes(dto.action) ? dto.comment : undefined, confirmedAt: dto.action === 'CONFIRM' ? new Date() : undefined, closedAt: next === 'CLOSED' ? new Date() : undefined } }); await this.auth.audit(user, 'safety', 'violation', id, dto.action, { from: current.status, to: next, comment: dto.comment }); return item; }

  async scanOffline(user: AuthUser) {
    const threshold = new Date(Date.now() - 10 * 60_000); const vehicles = await this.prisma.vehicle.findMany({ where: { deletedAt: null, ...this.scoped(user), OR: [{ realtimeStatus: null }, { realtimeStatus: { heartbeatAt: { lt: threshold } } }] }, include: { realtimeStatus: true } }); let created = 0;
    for (const vehicle of vehicles) { const open = await this.prisma.offlineEvent.findFirst({ where: { vehicleId: vehicle.id, status: { in: ['OFFLINE', 'INVESTIGATING'] } } }); if (open) continue; const startedAt = vehicle.realtimeStatus?.heartbeatAt ?? threshold; await this.prisma.$transaction(async (tx) => { const alert = await tx.safetyAlert.create({ data: { businessNo: this.businessNo('ALT'), alertType: 'OFFLINE', source: 'OFFLINE_RULE', level: 'MEDIUM', title: `${vehicle.name}持续离线`, description: '车辆心跳超过 10 分钟未更新', enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, vehicleId: vehicle.id, longitude: vehicle.realtimeStatus?.longitude, latitude: vehicle.realtimeStatus?.latitude, occurredAt: startedAt } }); await tx.offlineEvent.create({ data: { businessNo: this.businessNo('OFF'), vehicleId: vehicle.id, enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, alertId: alert.id, startedAt, durationMinutes: Math.max(10, Math.round((Date.now() - startedAt.getTime()) / 60000)) } }); }); created++; }
    await this.auth.audit(user, 'safety', 'offlineEvent', null, 'SCAN', { created, threshold }); return { scanned: vehicles.length, created };
  }
  async offlineEvents(user: AuthUser, query: SafetyQueryDto) { const where: Prisma.OfflineEventWhereInput = { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, organizationId: query.organizationId, vehicleId: query.vehicleId, status: query.status, startedAt: this.range(query.from, query.to), OR: query.q ? [{ businessNo: { contains: query.q } }, { vehicle: { name: { contains: query.q } } }, { enterprise: { name: { contains: query.q } } }] : undefined }; const [total, items] = await this.prisma.$transaction([this.prisma.offlineEvent.count({ where }), this.prisma.offlineEvent.findMany({ where, ...this.page(query), orderBy: { startedAt: 'desc' }, include: { vehicle: { select: { id: true, name: true, businessNo: true, realtimeStatus: true } }, enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, alert: { select: { id: true, businessNo: true, status: true } } } })]); const open = items.filter((item) => item.status !== 'RECOVERED').length; return { page: query.page, pageSize: query.pageSize, total, summary: { open, recovered: total - open, longestMinutes: items.reduce((max, item) => Math.max(max, item.status === 'RECOVERED' ? item.durationMinutes : Math.round((Date.now() - item.startedAt.getTime()) / 60000)), 0) }, items }; }
  async actOffline(user: AuthUser, id: string, dto: OfflineActionDto) { const current = await this.prisma.offlineEvent.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('离线事件不存在或不在当前数据范围内'); const next = dto.action === 'INVESTIGATE' ? 'INVESTIGATING' : dto.action === 'RECOVER' ? 'RECOVERED' : current.status; const endedAt = next === 'RECOVERED' ? new Date() : undefined; const item = await this.prisma.offlineEvent.update({ where: { id }, data: { status: next, reason: dto.action === 'UPDATE_REASON' ? dto.comment : undefined, recoveryNote: dto.action === 'RECOVER' ? dto.comment : undefined, endedAt, durationMinutes: endedAt ? Math.max(1, Math.round((endedAt.getTime() - current.startedAt.getTime()) / 60000)) : undefined } }); await this.auth.audit(user, 'safety', 'offlineEvent', id, dto.action, { from: current.status, to: next, comment: dto.comment }); return item; }

  async emergencyTasks(user: AuthUser, query: SafetyQueryDto) { const where: Prisma.EmergencyTaskWhereInput = { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, organizationId: query.organizationId, status: query.status, level: query.level, OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { alert: { businessNo: { contains: query.q } } }] : undefined }; const [total, items] = await this.prisma.$transaction([this.prisma.emergencyTask.count({ where }), this.prisma.emergencyTask.findMany({ where, ...this.page(query), orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], include: { alert: { select: { id: true, businessNo: true, alertType: true, status: true, vehicle: { select: { id: true, name: true, businessNo: true } } } }, enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, assigneeUser: { select: { id: true, displayName: true } } } })]); return { page: query.page, pageSize: query.pageSize, total, items }; }
  async emergencyTask(user: AuthUser, id: string) { const item = await this.prisma.emergencyTask.findFirst({ where: { id, ...this.scoped(user) }, include: { alert: { include: { vehicle: true } }, accident: true, enterprise: true, organization: true, assigneeUser: { select: { id: true, displayName: true } }, logs: { orderBy: { createdAt: 'asc' } } } }); if (!item) throw new NotFoundException('应急任务不存在或不在当前数据范围内'); return item; }
  async createEmergencyTask(user: AuthUser, dto: CreateEmergencyTaskDto) {
    if(user.portal==='ENTERPRISE')throw new ForbiddenException('企业账号不能派发应急任务');
    const alert=await this.prisma.safetyAlert.findFirst({where:{id:dto.alertId,...this.scoped(user)}});if(!alert)throw new NotFoundException('关联告警不存在或不在当前数据范围内');
    const dueAt=dueDate(dto.dueAt);
    if(dto.assigneeUserId&&!await this.prisma.user.findFirst({where:{id:dto.assigneeUserId,enterpriseId:alert.enterpriseId}}))throw new BadRequestException('处置责任人不属于关联企业');
    if(dto.accidentId){const accident=await this.prisma.accident.findFirst({where:{id:dto.accidentId,...this.scoped(user)}});if(!accident||accident.enterpriseId!==alert.enterpriseId||accident.vehicleId!==alert.vehicleId||accident.alertId&&accident.alertId!==alert.id)throw new BadRequestException('关联事故与告警不一致');}
    const item=await this.prisma.$transaction(async tx=>{
      const existing=await tx.emergencyTask.findFirst({where:{alertId:alert.id,status:{not:'CLOSED'}}});if(existing)return existing;
      if(dto.accidentId)await tx.accident.update({where:{id:dto.accidentId},data:{alertId:alert.id}});
      return tx.emergencyTask.create({data:{businessNo:this.businessNo('EMG'),alertId:alert.id,accidentId:dto.accidentId,activeKey:'EMERGENCY:ALERT:'+alert.id,enterpriseId:alert.enterpriseId,organizationId:alert.organizationId,level:alert.level,title:dto.title,requirement:dto.requirement,assigneeUserId:dto.assigneeUserId,responseMode:dto.responseMode,dueAt,logs:{create:{actorUserId:user.id,actorName:user.displayName,action:'CREATE',toStatus:'PENDING_DISPATCH',content:dto.requirement}}}});
    });await this.auth.audit(user,'safety','emergencyTask',item.id,'CREATE',{businessNo:item.businessNo});return item;
  }
  async actEmergencyTask(user: AuthUser, id: string, dto: EmergencyActionDto) { const current = await this.prisma.emergencyTask.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('应急任务不存在或不在当前数据范围内'); const enterpriseActions = ['RESPOND', 'SUBMIT_FEEDBACK']; const regulatoryActions = ['DISPATCH', 'RETURN', 'CLOSE']; if (user.portal === 'ENTERPRISE' && !enterpriseActions.includes(dto.action)) throw new ForbiddenException('企业账号不能执行监管复核操作'); if (user.portal !== 'ENTERPRISE' && !regulatoryActions.includes(dto.action)) throw new ForbiddenException('监管账号不能代替企业响应或反馈'); if (user.portal === 'ENTERPRISE' && !user.permissions.includes('safety:emergency:respond')) throw new ForbiddenException('缺少应急响应权限'); if (user.portal !== 'ENTERPRISE' && ['RETURN', 'CLOSE'].includes(dto.action) && !user.permissions.includes('safety:emergency:review')) throw new ForbiddenException('缺少应急复核权限'); if (user.portal !== 'ENTERPRISE' && dto.action === 'DISPATCH' && !user.permissions.includes('safety:emergency:dispatch')) throw new ForbiddenException('缺少应急派发权限'); if (dto.action === 'CLOSE' && !dto.score) throw new BadRequestException('评价关闭应急任务时必须填写 1 至 5 分评分'); const transitions: Record<string, Record<string, string>> = { PENDING_DISPATCH: { DISPATCH: 'WAITING_RESPONSE' }, WAITING_RESPONSE: { RESPOND: 'IN_PROGRESS' }, IN_PROGRESS: { SUBMIT_FEEDBACK: 'PENDING_REVIEW' }, PENDING_REVIEW: { RETURN: 'IN_PROGRESS', CLOSE: 'CLOSED' } }; const next = transitions[current.status]?.[dto.action]; if (!next) throw new BadRequestException('应急任务当前状态不支持该操作'); const item = await this.prisma.$transaction(async (tx) => { const updated = await tx.emergencyTask.update({ where: { id }, data: { status: next, dispatchedAt: dto.action === 'DISPATCH' ? new Date() : undefined, respondedAt: dto.action === 'RESPOND' ? new Date() : undefined, feedback: dto.action === 'SUBMIT_FEEDBACK' ? dto.comment : undefined, reviewComment: ['RETURN', 'CLOSE'].includes(dto.action) ? dto.comment : undefined, evaluationScore: dto.action === 'CLOSE' ? dto.score : undefined, evaluation: dto.action === 'CLOSE' ? dto.comment : undefined, closedAt: next === 'CLOSED' ? new Date() : undefined } }); await tx.emergencyTaskLog.create({ data: { taskId: id, actorUserId: user.id, actorName: user.displayName, action: dto.action, fromStatus: current.status, toStatus: next, content: dto.comment } }); return updated; }); await this.auth.audit(user, 'safety', 'emergencyTask', id, dto.action, { from: current.status, to: next, comment: dto.comment }); return item; }
}
