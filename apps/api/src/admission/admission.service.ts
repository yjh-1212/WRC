import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  private isSuper(user: AuthUser) { return user.roles.some((role) => role.code === 'SUPER_ADMIN'); }
  private scope(user: AuthUser): Prisma.AdmissionApplicationWhereInput {
    if (user.portal === 'ENTERPRISE') {
      if (!user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
      return { enterpriseId: user.enterpriseId };
    }
    return this.isSuper(user) ? {} : { organization: { is: { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } } };
  }
  private page(query: { page: number; pageSize: number }) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
  private no(prefix: string) { return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-8)}`; }
  private date(value?: string) { return value ? new Date(value) : undefined; }

  async options(user: AuthUser) {
    const enterpriseWhere: Prisma.EnterpriseWhereInput = user.portal === 'ENTERPRISE'
      ? { id: user.enterpriseId ?? '__none__' }
      : this.isSuper(user) ? {} : { organization: { is: { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } } };
    const vehicleWhere: Prisma.VehicleWhereInput = user.portal === 'ENTERPRISE'
      ? { enterpriseId: user.enterpriseId ?? '__none__', deletedAt: null }
      : this.isSuper(user) ? { deletedAt: null } : { organization: { is: { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } }, deletedAt: null };
    const [enterprises, vehicles, licenses, workflows] = await this.prisma.$transaction([
      this.prisma.enterprise.findMany({ where: enterpriseWhere, orderBy: { name: 'asc' }, select: { id: true, name: true, creditCode: true, legalRepresentative: true, contactName: true, contactPhone: true, registeredAddress: true, organizationId: true } }),
      this.prisma.vehicle.findMany({ where: vehicleWhere, orderBy: { name: 'asc' }, select: { id: true, name: true, businessNo: true, vin: true, enterpriseId: true, status: true, licenses: { where: { status: 'VALID' }, select: { id: true } } } }),
      this.prisma.vehicleLicense.findMany({ where: { vehicle: vehicleWhere, status: { in: ['VALID', 'EXPIRING'] } }, orderBy: { expiresAt: 'asc' }, select: { id: true, licenseNo: true, expiresAt: true, enterpriseId: true, vehicle: { select: { id: true, name: true, businessNo: true } } } }),
      this.prisma.processDefinition.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ applicationType: 'asc' }, { version: 'desc' }], include: { nodes: { orderBy: { orderNo: 'asc' } } } }),
    ]);
    return { enterprises, vehicles, licenses, workflows };
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
    const [total, items] = await this.prisma.$transaction([
      this.prisma.admissionApplication.count({ where }),
      this.prisma.admissionApplication.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' }, include: {
        enterprise: { select: { id: true, name: true } }, applicantUser: { select: { displayName: true } },
        vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } },
        targetLicense: { select: { id: true, licenseNo: true, expiresAt: true } }, result: true,
      } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
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
    return item;
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
      businessNo: this.no(`APP-${typePrefix[dto.applicationType]}`), applicationType: dto.applicationType, title: dto.title,
      applicantUserId: user.id, enterpriseId: enterprise.id, organizationId: enterprise.organizationId,
      enterpriseNameSnapshot: dto.enterpriseNameSnapshot ?? enterprise.name, creditCodeSnapshot: dto.creditCodeSnapshot ?? enterprise.creditCode,
      legalRepresentative: dto.legalRepresentative ?? enterprise.legalRepresentative, contactName: dto.contactName ?? enterprise.contactName,
      contactPhone: dto.contactPhone ?? enterprise.contactPhone, registeredAddress: dto.registeredAddress ?? enterprise.registeredAddress,
      operationPlan: dto.operationPlan, qualificationSummary: dto.qualificationSummary,
      roadTestStartAt: this.date(dto.roadTestStartAt), roadTestEndAt: this.date(dto.roadTestEndAt), roadTestRoute: dto.roadTestRoute,
      testPlan: dto.testPlan, safetyMeasures: dto.safetyMeasures, targetLicenseId: dto.targetLicenseId,
      requestedExpiresAt: this.date(dto.requestedExpiresAt), renewalReason: dto.renewalReason,
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
      requestedExpiresAt: this.date(dto.requestedExpiresAt), renewalReason: dto.renewalReason,
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
      if (!item.roadTestStartAt || !item.roadTestEndAt || !item.roadTestRoute || !item.testPlan || !item.safetyMeasures || !item.vehicles.length) throw new BadRequestException('请完整填写测试时间、路线、方案、安全措施并选择车辆');
      if (item.roadTestEndAt <= item.roadTestStartAt) throw new BadRequestException('路测结束时间必须晚于开始时间');
    }
    if (item.applicationType === 'LICENSE_RENEWAL') {
      if (!item.targetLicense || !item.requestedExpiresAt || !item.renewalReason) throw new BadRequestException('请选择续期牌照并填写新有效期和续期原因');
      if (item.requestedExpiresAt <= item.targetLicense.expiresAt) throw new BadRequestException('申请续期日期必须晚于当前牌照有效期');
    }
  }

  async submitApplication(user: AuthUser, id: string) {
    const item = await this.application(user, id);
    if (user.portal !== 'ENTERPRISE' || !['DRAFT', 'RETURNED'].includes(item.status)) throw new BadRequestException('当前申请不能提交');
    this.validateSubmit(item);
    const definition = await this.prisma.processDefinition.findFirst({ where: { applicationType: item.applicationType, status: 'ACTIVE' }, orderBy: { version: 'desc' }, include: { nodes: { orderBy: { orderNo: 'asc' } } } });
    if (!definition?.nodes.length) throw new BadRequestException('当前申请类型尚未配置有效审批流程');
    const first = definition.nodes[0];
    const previous = item.status;
    await this.prisma.$transaction(async (tx) => {
      const instance = await tx.processInstance.create({ data: { businessNo: this.no('FLOW'), applicationId: id, processDefinitionId: definition.id, currentNodeOrder: first.orderNo } });
      await tx.approvalTask.create({ data: { businessNo: this.no('TASK'), applicationId: id, processInstanceId: instance.id, nodeDefinitionId: first.id, assigneeRoleCode: first.approvalRoleCode, dueAt: new Date(Date.now() + first.timeLimitHours * 3600000) } });
      await tx.admissionApplication.update({ where: { id }, data: { status: 'IN_REVIEW', currentNodeName: first.name, submittedAt: new Date(), completedAt: null } });
      await tx.approvalHistory.create({ data: { applicationId: id, processInstanceId: instance.id, actorUserId: user.id, actorName: user.displayName, action: previous === 'RETURNED' ? 'RESUBMIT' : 'SUBMIT', fromStatus: previous, toStatus: 'IN_REVIEW', nodeName: first.name, comment: previous === 'RETURNED' ? '补正材料后重新提交' : '提交审批' } });
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
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalTask.update({ where: { id }, data: { status: dto.action === 'APPROVE' ? 'APPROVED' : dto.action === 'RETURN' ? 'RETURNED' : 'REJECTED', handlerUserId: user.id, handledAt: now, comment: dto.comment } });
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
      await tx.admissionApplication.update({ where: { id: task.applicationId }, data: { status: 'APPROVED', currentNodeName: null, completedAt: now } });
      if (task.application.applicationType === 'LICENSE_RENEWAL' && task.application.targetLicenseId && task.application.requestedExpiresAt) {
        await tx.vehicleLicense.update({ where: { id: task.application.targetLicenseId }, data: { expiresAt: task.application.requestedExpiresAt, status: 'VALID' } });
      }
      await tx.approvalResult.upsert({ where: { applicationId: task.applicationId }, update: { status: 'VALID', issuedAt: now, validFrom: now, validTo: task.application.requestedExpiresAt }, create: { businessNo: this.no('RESULT'), applicationId: task.applicationId, resultType: task.application.applicationType, documentNo: this.no('DOC'), issuedAt: now, validFrom: now, validTo: task.application.requestedExpiresAt, content: '审批流程全部节点通过' } });
      await tx.approvalHistory.create({ data: { applicationId: task.applicationId, processInstanceId: task.processInstanceId, taskId: task.id, actorUserId: user.id, actorName: user.displayName, action: 'APPROVE', fromStatus: 'IN_REVIEW', toStatus: 'APPROVED', nodeName: task.nodeDefinition.name, comment: dto.comment ?? '审批通过' } });
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
    const item = await this.prisma.processDefinition.create({ data: { businessNo: this.no('PROC'), code: dto.code, name: dto.name, applicationType: dto.applicationType, version: dto.version, description: dto.description, nodes: { create: dto.nodes } }, include: { nodes: { orderBy: { orderNo: 'asc' } } } });
    await this.auth.audit(user, 'admission', 'processDefinition', item.id, 'CREATE', { code: item.code });
    return item;
  }

  async updateWorkflow(user: AuthUser, id: string, dto: UpdateProcessDefinitionDto) {
    const current = await this.prisma.processDefinition.findUnique({ where: { id }, include: { nodes: true } });
    if (!current) throw new NotFoundException('流程定义不存在');
    if (dto.status === 'ACTIVE' && !current.nodes.length) throw new BadRequestException('没有审批节点的流程不能启用');
    const item = await this.prisma.$transaction(async (tx) => {
      if (dto.status === 'ACTIVE') await tx.processDefinition.updateMany({ where: { applicationType: current.applicationType, status: 'ACTIVE', id: { not: id } }, data: { status: 'INACTIVE' } });
      return tx.processDefinition.update({ where: { id }, data: dto, include: { nodes: { orderBy: { orderNo: 'asc' } }, _count: { select: { instances: true } } } });
    });
    await this.auth.audit(user, 'admission', 'processDefinition', id, 'UPDATE', dto);
    return item;
  }

  async licenses(user: AuthUser, query: LicensePageQueryDto) {
    const where: Prisma.VehicleLicenseWhereInput = {
      status: query.status,
      enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId,
      vehicle: user.portal === 'ENTERPRISE' ? { enterpriseId: user.enterpriseId ?? '__none__' } : this.isSuper(user) ? {} : { organization: { is: { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } } },
      OR: query.q ? [{ licenseNo: { contains: query.q } }, { businessNo: { contains: query.q } }, { vehicle: { is: { OR: [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }] } } }] : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.vehicleLicense.count({ where }),
      this.prisma.vehicleLicense.findMany({ where, ...this.page(query), orderBy: { expiresAt: 'asc' }, include: { vehicle: { select: { id: true, name: true, businessNo: true } }, enterprise: { select: { id: true, name: true } }, approvalResults: { include: { application: { select: { id: true, businessNo: true, title: true } } } } } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }

  async issueLicense(user: AuthUser, applicationId: string, dto: IssueLicenseDto) {
    const application = await this.application(user, applicationId);
    if (user.portal !== 'REGULATORY' || application.applicationType !== 'ROAD_TEST' || application.status !== 'APPROVED') throw new BadRequestException('仅已审批通过的路测申请可以发放牌照');
    if (!application.vehicles.some((item) => item.vehicleId === dto.vehicleId)) throw new BadRequestException('所选车辆不在该路测申请中');
    const active = await this.prisma.vehicleLicense.findFirst({ where: { vehicleId: dto.vehicleId, status: { in: ['VALID', 'EXPIRING'] } } });
    if (active) throw new BadRequestException('该车辆已有有效牌照，不能重复发放');
    if (new Date(dto.expiresAt) <= new Date(dto.issuedAt)) throw new BadRequestException('牌照有效期必须晚于签发日期');
    const vehicle = application.vehicles.find((item) => item.vehicleId === dto.vehicleId)!.vehicle;
    const license = await this.prisma.$transaction(async (tx) => {
      const item = await tx.vehicleLicense.create({ data: { businessNo: dto.businessNo, licenseNo: dto.licenseNo, vehicleId: dto.vehicleId, enterpriseId: application.enterpriseId!, organizationId: application.organizationId, issuedAt: new Date(dto.issuedAt), expiresAt: new Date(dto.expiresAt), remark: dto.remark } });
      await tx.approvalResult.update({ where: { applicationId }, data: { licenseId: item.id, validFrom: new Date(dto.issuedAt), validTo: new Date(dto.expiresAt), content: `已发放牌照 ${dto.licenseNo}` } });
      await tx.admissionApplication.update({ where: { id: applicationId }, data: { status: 'COMPLETED' } });
      await tx.approvalHistory.create({ data: { applicationId, actorUserId: user.id, actorName: user.displayName, action: 'ISSUE_LICENSE', fromStatus: 'APPROVED', toStatus: 'COMPLETED', comment: `发放牌照 ${dto.licenseNo}` } });
      return item;
    });
    await this.auth.audit(user, 'admission', 'vehicleLicense', license.id, 'ISSUE', { applicationId, licenseNo: dto.licenseNo });
    return license;
  }
}
