import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { isScopedAdministrator } from '../auth/workspace-access';
import { PrismaService } from '../prisma/prisma.service';
import { PermitService, businessNo, jsonValue, localDate, ownerScope, regionReadScope } from './permit.service';
import {
  AdmissionPageQueryDto, CreateAdmissionApplicationDto, CreateProcessDefinitionDto,
  HandleApprovalDto, IssueLicenseDto, LicensePageQueryDto, TaskPageQueryDto,
  UpdateAdmissionApplicationDto, UpdateProcessDefinitionDto,
} from './dto';

const typePrefix: Record<string, string> = {
  ENTERPRISE_ONBOARDING: 'ENT', ROAD_TEST: 'ROAD', LICENSE_RENEWAL: 'REN',
};

@Injectable()
export class AdmissionService {
  constructor(private prisma: PrismaService, private auth: AuthService, private permits: PermitService) {}

  private isSuper(user: AuthUser) { return isScopedAdministrator(user); }
  private scope(user: AuthUser): Prisma.AdmissionApplicationWhereInput {
    if (user.portal === 'ENTERPRISE') {
      if (!user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
      return { enterpriseId: user.enterpriseId };
    }
    return ownerScope(user);
  }
  private page(query: { page: number; pageSize: number }) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
  private no(prefix: string) { return businessNo(prefix); }
  private date(value?: string) { return value ? new Date(value) : undefined; }

  async options(user: AuthUser) {
    const enterpriseWhere: Prisma.EnterpriseWhereInput = user.portal === 'ENTERPRISE'
      ? { id: user.enterpriseId ?? '__none__' }
      : this.isSuper(user) ? {} : { organization: { is: { OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] } } };
    const vehicleWhere: Prisma.VehicleWhereInput = user.portal === 'ENTERPRISE'
      ? { enterpriseId: user.enterpriseId ?? '__none__', deletedAt: null }
      : this.isSuper(user) ? { deletedAt: null } : { organization: { is: { OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] } }, deletedAt: null };
    const [enterprises, vehicles, licenses, workflows] = await this.prisma.$transaction([
      this.prisma.enterprise.findMany({ where: enterpriseWhere, orderBy: { name: 'asc' }, select: { id: true, name: true, creditCode: true, legalRepresentative: true, contactName: true, contactPhone: true, registeredAddress: true, organizationId: true } }),
      this.prisma.vehicle.findMany({ where: vehicleWhere, orderBy: { name: 'asc' }, select: { id: true, name: true, businessNo: true, vin: true, enterpriseId: true, status: true, licenses: { where: { status: 'VALID' }, select: { id: true } } } }),
      this.prisma.vehicleLicense.findMany({ where: { vehicle: vehicleWhere, status: { in: ['VALID', 'EXPIRING','EXPIRED','SUSPENDED'] } }, orderBy: { expiresAt: 'asc' }, select: { id: true, licenseNo: true, expiresAt: true, enterpriseId: true,conditionsJson:true,licenseType:true, vehicle: { select: { id: true, name: true, businessNo: true } } } }),
      this.prisma.processDefinition.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ applicationType: 'asc' }, { version: 'desc' }], include: { nodes: { orderBy: { orderNo: 'asc' } } } }),
    ]);
    const regions = await this.prisma.operationRegion.findMany({where:{...regionReadScope(user),status:'ACTIVE',approvalStatus:'APPROVED'},select:{id:true,name:true,businessNo:true,enterpriseId:true,validFrom:true,validTo:true,speedLimit:true,allowedHours:true},orderBy:{name:'asc'}});
    return { enterprises, vehicles, licenses:licenses.map(l=>({...l,conditions:jsonValue(l.conditionsJson),conditionsJson:undefined})), workflows, regions };
  }

  async applications(user: AuthUser, query: AdmissionPageQueryDto) {
    const where: Prisma.AdmissionApplicationWhereInput = {
      ...this.scope(user), applicationType: query.applicationType, status: query.status,
      enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId,
      OR: query.q ? [
        { businessNo: { contains: query.q } }, { title: { contains: query.q } },
        { enterpriseNameSnapshot: { contains: query.q } }, { enterprise: { name: { contains: query.q } } },
      ] : undefined,
    };
    const baseWhere={...where};
    const pending={OR:[...(user.permissions.includes('admission:approval:handle')?[{status:'IN_REVIEW',approvalTasks:{some:{status:'PENDING',...(this.isSuper(user)?{}:{assigneeRoleCode:{in:user.roles.map(r=>r.code)}})}}}]:[]),...(user.permissions.includes('admission:license:issue')?[{status:'APPROVED'}]:[])]};
    if(query.view==='pending')where.AND=[pending];
    const [total, items] = await this.prisma.$transaction([
      this.prisma.admissionApplication.count({ where }),
      this.prisma.admissionApplication.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' }, include: {
        enterprise: { select: { id: true, name: true } }, applicantUser: { select: { displayName: true } },
        vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } },
        targetLicense: { select: { id: true, licenseNo: true, expiresAt: true } }, result: true,
        approvalTasks:{where:{status:'PENDING'},orderBy:{createdAt:'asc'},include:{nodeDefinition:true}},
      } }),
    ]);
    const totalAll=query.view==='pending'?await this.prisma.admissionApplication.count({where:baseWhere}):total;
    const pendingTotal=query.view==='pending'?total:await this.prisma.admissionApplication.count({where:{...baseWhere,AND:[pending]}});
    return { page: query.page, pageSize: query.pageSize, total, totalAll,pendingTotal, items:items.map(item=>this.present(item,user)) };
  }

  async application(user: AuthUser, id: string) {
    const item = await this.prisma.admissionApplication.findFirst({
      where: { id, ...this.scope(user) },
      include: {
        enterprise: { include: { qualifications: { where: { deletedAt: null }, orderBy: { expiresAt: 'asc' } } } },
        applicantUser: { select: { id: true, displayName: true, username: true } },
        organization: { select: { id: true, name: true } },
        vehicles: {
          include: {
            vehicle: {
              include: {
                model: { include: { manufacturer: true } },
                licenses: { where: { status: { not: 'CANCELLED' } }, orderBy: { issuedAt: 'desc' } },
              },
            },
          },
        },
        targetLicense: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } },
        processInstances: {
          orderBy: { createdAt: 'desc' },
          include: {
            processDefinition: true,
            tasks: { orderBy: { createdAt: 'asc' }, include: { nodeDefinition: true, handlerUser: { select: { displayName: true } } } },
          },
        },
        approvalHistories: { orderBy: { createdAt: 'desc' }, include: { actorUser: { select: { displayName: true } } } },
        result: { include: { license: { include: { vehicle: { select: { name: true, businessNo: true } } } } } },
      },
    });
    if (!item) throw new NotFoundException('申请不存在或不在当前数据范围内');
    const issuedLicenses=await this.prisma.vehicleLicense.findMany({where:{sourceApplicationId:id},select:{id:true,licenseNo:true,vehicleId:true,status:true}});
    return {...this.present(item,user),issuedLicenses};
  }

  private present(item:any,user:AuthUser):any {
    const task=(item.approvalTasks??item.processInstances?.flatMap((p:any)=>p.tasks)??[]).find((t:any)=>t.status==='PENDING');
    return {...item,details:jsonValue(item.detailsJson),materials:jsonValue(item.materialsJson,[]),detailsJson:undefined,materialsJson:undefined,currentTask:task??null,
      canHandle:!!task&&user.portal==='REGULATORY'&&user.permissions.includes('admission:approval:handle')&&(this.isSuper(user)||user.roles.some(r=>r.code===task.assigneeRoleCode)),
      canIssue:user.portal==='REGULATORY'&&user.permissions.includes('admission:license:issue')&&item.status==='APPROVED'&&['ROAD_TEST','DEMONSTRATION','LICENSE_CHANGE','LICENSE_RENEWAL','LICENSE_EXIT'].includes(item.applicationType)};
  }
  private details(dto:Partial<CreateAdmissionApplicationDto>,current={}){
    const fields=['regionIds','changeReason','allowedHours','speedLimit'];
    return JSON.stringify({...current,...Object.fromEntries(fields.filter(key=>(dto as any)[key]!==undefined).map(key=>[key,(dto as any)[key]]))});
  }

  private async assertVehicles(user: AuthUser, vehicleIds: string[]) {
    const unique = [...new Set(vehicleIds)];
    const items = await this.prisma.vehicle.findMany({ where: { id: { in: unique }, deletedAt: null, enterpriseId: user.enterpriseId ?? '__none__' } });
    if (items.length !== unique.length) throw new ForbiddenException('存在不属于当前企业或已退出运营的车辆');
    return unique;
  }

  async createApplication(user: AuthUser, dto: CreateAdmissionApplicationDto) {
    if (user.portal !== 'ENTERPRISE' || !user.enterpriseId) throw new ForbiddenException('仅企业账号可以创建准入申请');
    const enterprise = await this.prisma.enterprise.findUnique({ where: { id: user.enterpriseId } });
    if (!enterprise) throw new ForbiddenException('企业主体不存在');
    const vehicleIds = dto.vehicleIds ? await this.assertVehicles(user, dto.vehicleIds) : [];
    if (dto.targetLicenseId) {
      const license = await this.prisma.vehicleLicense.findFirst({ where: { id: dto.targetLicenseId, enterpriseId: user.enterpriseId } });
      if (!license) throw new ForbiddenException('续期牌照不存在或不属于当前企业');
    }
    const item = await this.prisma.admissionApplication.create({ data: {
      businessNo: this.no(`APP-${typePrefix[dto.applicationType]??dto.applicationType.slice(0,4)}`), applicationType: dto.applicationType, title: dto.title,
      applicantUserId: user.id, enterpriseId: enterprise.id, organizationId: enterprise.organizationId,
      enterpriseNameSnapshot: dto.enterpriseNameSnapshot ?? enterprise.name, creditCodeSnapshot: dto.creditCodeSnapshot ?? enterprise.creditCode,
      legalRepresentative: dto.legalRepresentative ?? enterprise.legalRepresentative, contactName: dto.contactName ?? enterprise.contactName,
      contactPhone: dto.contactPhone ?? enterprise.contactPhone, registeredAddress: dto.registeredAddress ?? enterprise.registeredAddress,
      operationPlan: dto.operationPlan, qualificationSummary: dto.qualificationSummary,
      roadTestStartAt: this.date(dto.roadTestStartAt), roadTestEndAt: this.date(dto.roadTestEndAt), roadTestRoute: dto.roadTestRoute,
      testPlan: dto.testPlan, safetyMeasures: dto.safetyMeasures, targetLicenseId: dto.targetLicenseId,
      requestedExpiresAt: dto.requestedExpiresAt?localDate(dto.requestedExpiresAt,true):undefined, renewalReason: dto.renewalReason,detailsJson:this.details(dto),
      vehicles: vehicleIds.length ? { create: vehicleIds.map((vehicleId) => ({ vehicleId })) } : undefined,
    } });
    await this.auth.audit(user, 'admission', 'application', item.id, 'CREATE_DRAFT', { applicationType: dto.applicationType });
    return item;
  }

  async updateApplication(user: AuthUser, id: string, dto: UpdateAdmissionApplicationDto) {
    const current = await this.application(user, id);
    if (user.portal !== 'ENTERPRISE' || !['DRAFT', 'RETURNED'].includes(current.status)) throw new BadRequestException('仅草稿或退回补正的申请可以编辑');
    if (dto.applicationType && dto.applicationType !== current.applicationType) throw new BadRequestException('申请类型创建后不能变更');
    const vehicleIds = dto.vehicleIds ? await this.assertVehicles(user, dto.vehicleIds) : undefined;
    if (dto.targetLicenseId) {
      const license = await this.prisma.vehicleLicense.findFirst({ where: { id: dto.targetLicenseId, enterpriseId: user.enterpriseId ?? '__none__' } });
      if (!license) throw new ForbiddenException('续期牌照不存在或不属于当前企业');
    }
    const data: Prisma.AdmissionApplicationUncheckedUpdateInput = {
      title: dto.title, enterpriseNameSnapshot: dto.enterpriseNameSnapshot, creditCodeSnapshot: dto.creditCodeSnapshot,
      legalRepresentative: dto.legalRepresentative, contactName: dto.contactName, contactPhone: dto.contactPhone,
      registeredAddress: dto.registeredAddress, operationPlan: dto.operationPlan, qualificationSummary: dto.qualificationSummary,
      roadTestStartAt: this.date(dto.roadTestStartAt), roadTestEndAt: this.date(dto.roadTestEndAt), roadTestRoute: dto.roadTestRoute,
      testPlan: dto.testPlan, safetyMeasures: dto.safetyMeasures, targetLicenseId: dto.targetLicenseId,
      requestedExpiresAt: dto.requestedExpiresAt?localDate(dto.requestedExpiresAt,true):undefined, renewalReason: dto.renewalReason,detailsJson:this.details(dto,current.details),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.admissionApplication.update({ where: { id }, data });
      if (vehicleIds) {
        await tx.admissionApplicationVehicle.deleteMany({ where: { applicationId: id } });
        if (vehicleIds.length) await tx.admissionApplicationVehicle.createMany({ data: vehicleIds.map((vehicleId) => ({ applicationId: id, vehicleId })) });
      }
    });
    await this.auth.audit(user, 'admission', 'application', id, 'UPDATE_DRAFT');
    return this.application(user, id);
  }

  private validateSubmit(item: Awaited<ReturnType<AdmissionService['application']>>) {
    if (item.applicationType === 'ENTERPRISE_ONBOARDING') {
      if (!item.enterpriseNameSnapshot || !item.creditCodeSnapshot || !item.legalRepresentative || !item.contactName || !item.contactPhone || !item.registeredAddress || !item.operationPlan || !item.qualificationSummary) throw new BadRequestException('请完整填写企业信息、运营方案和资质说明后再提交');
    }
    if (item.applicationType === 'ROAD_TEST') {
      if (!item.roadTestStartAt || !item.roadTestEndAt || !item.testPlan || !item.safetyMeasures || !item.vehicles.length) throw new BadRequestException('请完整填写测试时间、方案、安全措施并选择车辆');
      if (item.roadTestEndAt <= item.roadTestStartAt) throw new BadRequestException('路测结束时间必须晚于开始时间');
    }
    if (item.applicationType === 'LICENSE_RENEWAL') {
      if (!item.targetLicense || !item.requestedExpiresAt || !item.renewalReason) throw new BadRequestException('请选择续期牌照并填写新有效期和续期原因');
      if (item.requestedExpiresAt <= item.targetLicense.expiresAt) throw new BadRequestException('申请续期日期必须晚于当前牌照有效期');
    }
  }

  async precheck(user:AuthUser,id:string){
    const item=await this.application(user,id),issues:string[]=[],type=item.applicationType,details=item.details;
    try{this.validateSubmit(item)}catch(e){issues.push((e as Error).message)}
    if(!item.title?.trim())issues.push('请填写申请名称');
    if(!item.materials.length)issues.push('请至少上传一份申报材料');
    if(type!=='ENTERPRISE_ONBOARDING'&&item.enterprise?.status!=='ACTIVE')issues.push('企业主体尚未通过准入或已停用');
    if(['ROAD_TEST','DEMONSTRATION','VEHICLE_REGISTRATION'].includes(type)&&!item.vehicles.length)issues.push('请选择本企业车辆');
    if(item.vehicles.some((v:any)=>v.vehicle.deletedAt||v.vehicle.status!=='ACTIVE'))issues.push('申请车辆中存在已停用或已退出运营车辆');
    if(['ROAD_TEST','DEMONSTRATION'].includes(type)){
      if(!details.regionIds?.length)issues.push('请选择拟通行区域');
      if(!item.roadTestStartAt||!item.roadTestEndAt||item.roadTestEndAt<=item.roadTestStartAt)issues.push('请填写有效的测试或示范起止日期');
      if(!item.testPlan||!item.safetyMeasures)issues.push('请补充实施方案和安全保障措施');
      const operators=await this.prisma.safetyOperator.findMany({where:{enterpriseId:item.enterpriseId,status:'APPROVED',trainingCompleted:true,expiresAt:{gte:new Date()}},include:{vehicles:true}});
      const covered=new Set(operators.filter(o=>o.vehicles.length<=5).flatMap(o=>o.vehicles.map(v=>v.vehicleId)));
      if(item.vehicles.some((v:any)=>!covered.has(v.vehicleId)))issues.push('部分车辆未分配资格有效、培训通过且负责不超过5台车的安全员');
      const connected=await this.prisma.externalInterfaceConfig.count({where:{enterpriseId:item.enterpriseId,status:{in:['CONFIGURED','ACTIVE']}}});
      if(!connected)issues.push('企业尚未完成数据接入配置');
    }
    if(type==='DEMONSTRATION'){
      const proof=await this.prisma.vehicleLicense.count({where:{enterpriseId:item.enterpriseId,licenseType:'ROAD_TEST',vehicleId:{in:item.vehicles.map((v:any)=>v.vehicleId)}}});
      if(!proof&&!item.materials.some((m:any)=>m.category==='测试报告'))issues.push('请上传道路测试证明报告或关联已有测试许可车辆');
    }
    if(['LICENSE_RENEWAL','LICENSE_CHANGE','LICENSE_EXIT'].includes(type)){
      if(!item.targetLicense)issues.push('请选择原通行许可');
      else if(['CANCELLED','REVOKED'].includes(item.targetLicense.status))issues.push('原许可已终止，不能继续变更或续期');
      if(type!=='LICENSE_RENEWAL'&&!details.changeReason?.trim())issues.push('请填写变更或退出原因');
      if(type==='LICENSE_RENEWAL'&&(!item.requestedExpiresAt||!item.renewalReason?.trim()))issues.push('请填写续期日期和原因');
    }
    if(details.regionIds?.length){
      const count=await this.prisma.operationRegion.count({where:{AND:[regionReadScope(user),{id:{in:details.regionIds},status:'ACTIVE',approvalStatus:'APPROVED',OR:[{enterpriseId:item.enterpriseId},{enterpriseId:null}]}]}});
      if(count!==details.regionIds.length)issues.push('部分通行区域未批准、已停用或与企业不一致');
    }
    return {valid:!issues.length,issues};
  }

  async withdraw(user:AuthUser,id:string){
    const item=await this.application(user,id);
    if(user.portal!=='ENTERPRISE'||!['DRAFT','RETURNED','IN_REVIEW'].includes(item.status))throw new BadRequestException('仅本企业未办结的申请可以撤回');
    await this.prisma.$transaction(async tx=>{
      const claimed=await tx.admissionApplication.updateMany({where:{id,status:item.status},data:{status:'WITHDRAWN',currentNodeName:null,completedAt:new Date()}});
      if(claimed.count!==1)throw new BadRequestException('申请状态已变化，请刷新后重试');
      await tx.approvalTask.updateMany({where:{applicationId:id,status:'PENDING'},data:{status:'REJECTED',comment:'企业已撤回申请',handledAt:new Date()}});
      await tx.processInstance.updateMany({where:{applicationId:id,status:'IN_PROGRESS'},data:{status:'WITHDRAWN',completedAt:new Date()}});
      await tx.approvalHistory.create({data:{applicationId:id,actorUserId:user.id,actorName:user.displayName,action:'WITHDRAW',fromStatus:item.status,toStatus:'WITHDRAWN',comment:'企业撤回申请',snapshotJson:JSON.stringify(item)}});
    });
    await this.auth.audit(user,'admission','application',id,'WITHDRAW');return this.application(user,id);
  }

  async reopen(user:AuthUser,id:string,comment:string){
    if(user.portal!=='REGULATORY'||!comment?.trim())throw new BadRequestException('请填写退回补正原因');
    await this.prisma.$transaction(async tx=>{
      const item=await tx.admissionApplication.findFirst({where:{id,...this.scope(user)},include:{result:true}});
      if(!item||item.status!=='APPROVED')throw new BadRequestException('仅待签发申请可以退回补正');
      if(item.result?.licenseId||await tx.vehicleLicense.count({where:{sourceApplicationId:id}}))throw new BadRequestException('已签发部分许可，请办理许可变更，不能修改原申报');
      if(item.result&&await tx.operationRegion.count({where:{approvalResultId:item.result.id}}))throw new BadRequestException('审批结果已用于区域授权，请先处理关联区域');
      const changed=await tx.admissionApplication.updateMany({where:{id,status:'APPROVED'},data:{status:'RETURNED',completedAt:null,currentNodeName:null}});
      if(changed.count!==1)throw new BadRequestException('申请状态已变化，请刷新');
      await tx.processInstance.updateMany({where:{applicationId:id,status:'APPROVED'},data:{status:'RETURNED',completedAt:new Date()}});
      await tx.approvalResult.updateMany({where:{applicationId:id},data:{status:'WITHDRAWN'}});
      await tx.approvalHistory.create({data:{applicationId:id,actorUserId:user.id,actorName:user.displayName,action:'REOPEN',fromStatus:'APPROVED',toStatus:'RETURNED',comment}});
    });
    await this.auth.audit(user,'admission','application',id,'RETURN_BEFORE_ISSUE',{comment});return this.application(user,id);
  }

  async submitApplication(user: AuthUser, id: string) {
    const item = await this.application(user, id);
    if (user.portal !== 'ENTERPRISE' || !['DRAFT', 'RETURNED'].includes(item.status)) throw new BadRequestException('当前申请不能提交');
    this.validateSubmit(item);
    const check=await this.precheck(user,id);if(!check.valid)throw new BadRequestException(check.issues.join('；'));
    const definition = await this.prisma.processDefinition.findFirst({ where: { applicationType: item.applicationType, status: 'ACTIVE', ...(user.workspaceId ? { workspaceId: user.workspaceId } : {}) }, orderBy: { version: 'desc' }, include: { nodes: { orderBy: { orderNo: 'asc' } } } })??await this.prisma.processDefinition.findFirst({where:{applicationType:item.applicationType,status:'ACTIVE',workspaceId:null},orderBy:{version:'desc'},include:{nodes:{orderBy:{orderNo:'asc'}}}});
    if (!definition?.nodes.length) throw new BadRequestException('当前申请类型尚未配置有效审批流程');
    const first = definition.nodes[0];
    const previous = item.status;
    await this.prisma.$transaction(async (tx) => {
      const instance = await tx.processInstance.create({ data: { businessNo: this.no('FLOW'), applicationId: id, processDefinitionId: definition.id, currentNodeOrder: first.orderNo } });
      await tx.approvalTask.create({ data: { businessNo: this.no('TASK'), applicationId: id, processInstanceId: instance.id, nodeDefinitionId: first.id, assigneeRoleCode: first.approvalRoleCode, dueAt: new Date(Date.now() + first.timeLimitHours * 3600000) } });
      const claimed=await tx.admissionApplication.updateMany({ where: { id,status:previous }, data: { status: 'IN_REVIEW', currentNodeName: first.name, submittedAt: new Date(), completedAt: null } });
      if(claimed.count!==1)throw new BadRequestException('申请状态已变化，请刷新后重试');
      await tx.approvalHistory.create({ data: { applicationId: id, processInstanceId: instance.id, actorUserId: user.id, actorName: user.displayName, action: previous === 'RETURNED' ? 'RESUBMIT' : 'SUBMIT', fromStatus: previous, toStatus: 'IN_REVIEW', nodeName: first.name, snapshotJson:JSON.stringify(item),comment: previous === 'RETURNED' ? '补正材料后重新提交' : '提交审批' } });
    });
    await this.auth.audit(user, 'admission', 'application', id, previous === 'RETURNED' ? 'RESUBMIT' : 'SUBMIT');
    return this.application(user, id);
  }

  async tasks(user: AuthUser, query: TaskPageQueryDto) {
    if (user.portal !== 'REGULATORY') throw new ForbiddenException('仅监管账号可以访问审批工作台');
    const roleCodes = user.roles.map((role) => role.code);
    const applicationScope = this.scope(user);
    const where: Prisma.ApprovalTaskWhereInput = {
      application: applicationScope, status: query.status,
      assigneeRoleCode: this.isSuper(user) ? undefined : query.status === 'PENDING' ? { in: roleCodes } : undefined,
      OR: query.q ? [{ businessNo: { contains: query.q } }, { application: { is: { OR: [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }] } } }] : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.approvalTask.count({ where }),
      this.prisma.approvalTask.findMany({ where, ...this.page(query), orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], include: {
        application: { include: { enterprise: { select: { id: true, name: true } }, vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } } } },
        nodeDefinition: true, handlerUser: { select: { displayName: true } }, processInstance: { include: { processDefinition: true } },
      } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }

  async handleTask(user: AuthUser, id: string, dto: HandleApprovalDto) {
    const task = await this.prisma.approvalTask.findFirst({ where: { id, application: this.scope(user) }, include: { application: { include: { targetLicense: true } }, processInstance: true, nodeDefinition: { include: { processDefinition: { include: { nodes: { orderBy: { orderNo: 'asc' } } } } } } } });
    if (!task) throw new NotFoundException('审批任务不存在或不在当前数据范围内');
    if (task.status !== 'PENDING') throw new BadRequestException('该任务已经处理，不能重复操作');
    if (!this.isSuper(user) && !user.roles.some((role) => role.code === task.assigneeRoleCode)) throw new ForbiddenException('当前角色不是该节点的审批角色');
    if (['RETURN', 'REJECT'].includes(dto.action) && !dto.comment?.trim()) throw new BadRequestException('退回或驳回时必须填写处理意见');
    if (dto.action === 'RETURN' && !task.nodeDefinition.canReturn) throw new BadRequestException('当前节点不允许退回补正');
    if(dto.action==='APPROVE'){const check=await this.precheck(user,task.applicationId);if(!check.valid)throw new BadRequestException(check.issues.join('；'))}
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed=await tx.approvalTask.updateMany({ where: { id,status:'PENDING' }, data: { status: dto.action === 'APPROVE' ? 'APPROVED' : dto.action === 'RETURN' ? 'RETURNED' : 'REJECTED', handlerUserId: user.id, handledAt: now, comment: dto.comment } });
      if(claimed.count!==1)throw new BadRequestException('任务已被其他人办理，请刷新后重试');
      if (dto.action === 'RETURN') {
        await tx.processInstance.update({ where: { id: task.processInstanceId }, data: { status: 'RETURNED', completedAt: now } });
        await tx.admissionApplication.update({ where: { id: task.applicationId }, data: { status: 'RETURNED', currentNodeName: null } });
        await tx.approvalHistory.create({ data: { applicationId: task.applicationId, processInstanceId: task.processInstanceId, taskId: task.id, actorUserId: user.id, actorName: user.displayName, action: 'RETURN', fromStatus: 'IN_REVIEW', toStatus: 'RETURNED', nodeName: task.nodeDefinition.name, comment: dto.comment } });
        return;
      }
      if (dto.action === 'REJECT') {
        await tx.processInstance.update({ where: { id: task.processInstanceId }, data: { status: 'REJECTED', completedAt: now } });
        await tx.admissionApplication.update({ where: { id: task.applicationId }, data: { status: 'REJECTED', currentNodeName: null, completedAt: now } });
        await tx.approvalHistory.create({ data: { applicationId: task.applicationId, processInstanceId: task.processInstanceId, taskId: task.id, actorUserId: user.id, actorName: user.displayName, action: 'REJECT', fromStatus: 'IN_REVIEW', toStatus: 'REJECTED', nodeName: task.nodeDefinition.name, comment: dto.comment } });
        return;
      }
      const nodes = task.nodeDefinition.processDefinition.nodes;
      const next = nodes.find((node) => node.orderNo > task.nodeDefinition.orderNo);
      if (next) {
        await tx.approvalTask.create({ data: { businessNo: this.no('TASK'), applicationId: task.applicationId, processInstanceId: task.processInstanceId, nodeDefinitionId: next.id, assigneeRoleCode: next.approvalRoleCode, dueAt: new Date(now.getTime() + next.timeLimitHours * 3600000) } });
        await tx.processInstance.update({ where: { id: task.processInstanceId }, data: { currentNodeOrder: next.orderNo } });
        await tx.admissionApplication.update({ where: { id: task.applicationId }, data: { status: 'IN_REVIEW', currentNodeName: next.name } });
        await tx.approvalHistory.create({ data: { applicationId: task.applicationId, processInstanceId: task.processInstanceId, taskId: task.id, actorUserId: user.id, actorName: user.displayName, action: 'APPROVE_NODE', fromStatus: 'IN_REVIEW', toStatus: 'IN_REVIEW', nodeName: task.nodeDefinition.name, comment: dto.comment ?? '节点审批通过' } });
        return;
      }
      await tx.processInstance.update({ where: { id: task.processInstanceId }, data: { status: 'APPROVED', completedAt: now } });
      const terminal=['ENTERPRISE_ONBOARDING','VEHICLE_REGISTRATION'].includes(task.application.applicationType)?'COMPLETED':'APPROVED';
      await tx.admissionApplication.update({ where: { id: task.applicationId }, data: { status: terminal, currentNodeName: null, completedAt: terminal==='COMPLETED'?now:null } });
      await tx.approvalResult.upsert({ where: { applicationId: task.applicationId }, update: { status: 'VALID', issuedAt: now, validFrom: now, validTo: task.application.requestedExpiresAt }, create: { businessNo: this.no('RESULT'), applicationId: task.applicationId, resultType: task.application.applicationType, documentNo: this.no('DOC'), issuedAt: now, validFrom: now, validTo: task.application.requestedExpiresAt, content: '审批流程全部节点通过' } });
      await tx.approvalHistory.create({ data: { applicationId: task.applicationId, processInstanceId: task.processInstanceId, taskId: task.id, actorUserId: user.id, actorName: user.displayName, action: 'APPROVE', fromStatus: 'IN_REVIEW', toStatus: terminal, nodeName: task.nodeDefinition.name, comment: dto.comment ?? '审批通过' } });
      if (task.application.applicationType === 'ENTERPRISE_ONBOARDING' && task.application.enterpriseId) await tx.enterprise.update({ where: { id: task.application.enterpriseId }, data: { status: 'ACTIVE' } });
    });
    await this.auth.audit(user, 'admission', 'approvalTask', id, dto.action, { comment: dto.comment });
    return this.application(user, task.applicationId);
  }

  async workflows() {
    return this.prisma.processDefinition.findMany({ orderBy: [{ applicationType: 'asc' }, { version: 'desc' }], include: { nodes: { orderBy: { orderNo: 'asc' } }, _count: { select: { instances: true } } } });
  }

  async createWorkflow(user: AuthUser, dto: CreateProcessDefinitionDto) {
    const orders = new Set(dto.nodes.map((node) => node.orderNo));
    const codes = new Set(dto.nodes.map((node) => node.nodeCode));
    if (orders.size !== dto.nodes.length || codes.size !== dto.nodes.length) throw new BadRequestException('流程节点顺序和节点编码不能重复');
    const roleCodes = [...new Set(dto.nodes.map((node) => node.approvalRoleCode))];
    const roles = await this.prisma.role.findMany({ where: { code: { in: roleCodes }, workspaceId: user.workspaceId, portal: 'REGULATORY', status: 'ACTIVE', permissions: { some: { permission: { code: 'admission:approval:handle' } } } } });
    if (roles.length !== roleCodes.length) throw new BadRequestException('审批角色必须是本市已启用且具备审批办理权限的监管角色');
    const code = `${dto.code}_${user.workspace?.cityCode ?? user.workspaceId}`;
    if (await this.prisma.processDefinition.findFirst({ where: { code } })) throw new BadRequestException('本市已存在该流程编码，请使用新的编码');
    const item = await this.prisma.processDefinition.create({ data: { businessNo: this.no('PROC'), code, name: dto.name, applicationType: dto.applicationType, version: dto.version, description: dto.description, nodes: { create: dto.nodes } }, include: { nodes: { orderBy: { orderNo: 'asc' } } } });
    await this.auth.audit(user, 'admission', 'processDefinition', item.id, 'CREATE', { code: item.code });
    return item;
  }

  async updateWorkflow(user: AuthUser, id: string, dto: UpdateProcessDefinitionDto) {
    const current = await this.prisma.processDefinition.findUnique({ where: { id }, include: { nodes: true } });
    if (!current) throw new NotFoundException('流程定义不存在');
    if (current.workspaceId !== user.workspaceId) throw new ForbiddenException('共享流程为只读模板，请创建本市审批流程后配置');
    if (dto.status === 'ACTIVE' && !current.nodes.length) throw new BadRequestException('没有审批节点的流程不能启用');
    const item = await this.prisma.$transaction(async (tx) => {
      if (dto.status === 'ACTIVE') await tx.processDefinition.updateMany({ where: { applicationType: current.applicationType, status: 'ACTIVE', id: { not: id } }, data: { status: 'INACTIVE' } });
      return tx.processDefinition.update({ where: { id }, data: dto, include: { nodes: { orderBy: { orderNo: 'asc' } }, _count: { select: { instances: true } } } });
    });
    await this.auth.audit(user, 'admission', 'processDefinition', id, 'UPDATE', dto);
    return item;
  }

  async licenses(user:AuthUser,query:LicensePageQueryDto){return this.permits.list(user,query);}
  async issueLicense(user:AuthUser,applicationId:string,dto:IssueLicenseDto){const check=await this.precheck(user,applicationId);if(!check.valid)throw new BadRequestException(check.issues.join('；'));return this.permits.issue(user,applicationId,dto);}
}
