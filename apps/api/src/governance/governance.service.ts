import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { Prisma } from '@prisma/client';
import { isScopedAdministrator } from '../auth/workspace-access';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBusinessRuleDto, CreateInspectionDto, CreateInterfaceConfigDto,
  CreditEntryDto, CreditRepairDto, GovernanceQueryDto, InspectionActionDto,
  UpdateInterfaceConfigDto,
  CreateSafetyOperatorDto, UpdateSafetyOperatorDto, ReviewSafetyOperatorDto, SafetyOperatorQueryDto, MAX_OPERATOR_VEHICLES,
} from './dto';

@Injectable()
export class GovernanceService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  private isSuper(user: AuthUser) { return isScopedAdministrator(user); }
  private orgScope(user: AuthUser) {
    return this.isSuper(user) ? {} : { organization: { is: { OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] } } };
  }
  private enterpriseId(user: AuthUser, requested?: string) {
    if (user.portal === 'ENTERPRISE') {
      if (!user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
      return user.enterpriseId;
    }
    if (!requested) throw new BadRequestException('请选择所属企业');
    return requested;
  }
  private page(query: GovernanceQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
  private businessNo(prefix: string) {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    return `${prefix}-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  private parse(value: string) { try { return JSON.parse(value); } catch { return value; } }
  private grade(score: number) { return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D'; }

  async options(user: AuthUser) {
    const enterpriseWhere: any = user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' } : this.orgScope(user);
    const vehicleWhere: any = user.portal === 'ENTERPRISE' ? { enterpriseId: user.enterpriseId ?? '__none__' } : this.orgScope(user);
    const [enterprises, vehicles, organizations] = await Promise.all([
      this.prisma.enterprise.findMany({ where: enterpriseWhere, orderBy: { name: 'asc' }, select: { id: true, name: true, organizationId: true } }),
      this.prisma.vehicle.findMany({ where: { ...vehicleWhere, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, businessNo: true, unifiedCode: true, enterpriseId: true } }),
      this.prisma.organization.findMany({ where: this.isSuper(user) ? {} : { OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return { enterprises, vehicles, organizations };
  }

  private operatorScope(user: AuthUser): Prisma.SafetyOperatorWhereInput {
    if (user.portal === 'ENTERPRISE') return { enterpriseId: user.enterpriseId ?? '__none__' };
    if (user.workspaceId) return { organization: { is: { workspaceId: user.workspaceId, ...(this.orgScope(user).organization?.is ?? {}) } } };
    return this.orgScope(user);
  }
  async operatorOptions(user: AuthUser) {
    const where: Prisma.EnterpriseWhereInput = user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' }
      : { ...(user.workspaceId ? { organization: { is: { workspaceId: user.workspaceId, ...(this.orgScope(user).organization?.is ?? {}) } } } : this.orgScope(user)) };
    const enterprises = await this.prisma.enterprise.findMany({ where, orderBy: { name: 'asc' }, select: { id: true, name: true } });
    const vehicles = await this.prisma.vehicle.findMany({ where: { enterpriseId: { in: enterprises.map(item => item.id) }, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, businessNo: true, unifiedCode: true, enterpriseId: true } });
    return { enterprises, vehicles, maxVehiclesPerOperator: MAX_OPERATOR_VEHICLES };
  }
  private readonly operatorInclude = { enterprise: { select: { id: true, name: true } }, vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true, unifiedCode: true, enterpriseId: true } } } } } as const;
  async operators(user: AuthUser, query: SafetyOperatorQueryDto) {
    const where: Prisma.SafetyOperatorWhereInput = { AND: [this.operatorScope(user), ...(query.enterpriseId ? [{ enterpriseId: query.enterpriseId }] : [])], status: query.status,
      OR: query.q ? [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }, { phone: { contains: query.q } }, { qualificationNo: { contains: query.q } }] : undefined };
    const [total, items] = await this.prisma.$transaction([this.prisma.safetyOperator.count({ where }), this.prisma.safetyOperator.findMany({ where, ...this.page(query), orderBy: { [query.sort ?? 'createdAt']: query.order ?? 'asc' }, include: this.operatorInclude })]);
    return { total, items, page: query.page, pageSize: query.pageSize };
  }
  async operator(user: AuthUser, id: string) {
    const item = await this.prisma.safetyOperator.findFirst({ where: { id, ...this.operatorScope(user) }, include: this.operatorInclude });
    if (!item) throw new NotFoundException('安全员不存在或不在当前管理范围内');
    return item;
  }
  private async operatorEnterprise(tx: Prisma.TransactionClient, user: AuthUser, requested?: string) {
    if (user.portal === 'ENTERPRISE' && requested && requested !== user.enterpriseId) throw new ForbiddenException('不能维护其他企业的安全员');
    const id = this.enterpriseId(user, requested);
    const enterprise = await tx.enterprise.findFirst({ where: { id, ...(user.portal === 'ENTERPRISE' ? {} : user.workspaceId ? { organization: { is: { workspaceId: user.workspaceId, ...(this.orgScope(user).organization?.is ?? {}) } } } : this.orgScope(user)) } });
    if (!enterprise) throw new ForbiddenException('所属企业不在当前管理范围内');
    return enterprise;
  }
  private async validateOperatorVehicles(tx: Prisma.TransactionClient, enterpriseId: string, ids: string[]) {
    if (ids.length > MAX_OPERATOR_VEHICLES) throw new BadRequestException('每位安全员最多负责5台车辆');
    if (new Set(ids).size !== ids.length) throw new BadRequestException('负责车辆不能重复选择');
    if (ids.length && await tx.vehicle.count({ where: { id: { in: ids }, enterpriseId, deletedAt: null } }) !== ids.length) throw new BadRequestException('负责车辆必须属于该企业，且未退出运营');
  }
  private operatorExpiry(value?: string | null) { return value ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999+08:00` : value) : value === null ? null : undefined; }
  async createOperator(user: AuthUser, dto: CreateSafetyOperatorDto) {
    const item = await this.prisma.$transaction(async tx => {
      const enterprise = await this.operatorEnterprise(tx, user, dto.enterpriseId), ids = dto.vehicleIds ?? [];
      await this.validateOperatorVehicles(tx, enterprise.id, ids);
      const { enterpriseId: _enterpriseId, vehicleIds: _vehicleIds, expiresAt, onDuty: _onDuty, ...data } = dto;
      return tx.safetyOperator.create({ data: { ...data, idNumberMasked: dto.idNumberMasked || '未登记', businessNo: this.businessNo('OPR'), enterpriseId: enterprise.id, organizationId: enterprise.organizationId, expiresAt: this.operatorExpiry(expiresAt), onDuty: false, vehicles: { create: ids.map(vehicleId => ({ vehicleId })) } }, include: this.operatorInclude });
    });
    await this.auth.audit(user, 'governance', 'safetyOperator', item.id, 'CREATE', { assignedVehicles: item.vehicles.length });
    return item;
  }
  async updateOperator(user: AuthUser, id: string, dto: UpdateSafetyOperatorDto) {
    const item = await this.prisma.$transaction(async tx => {
      const current = await tx.safetyOperator.findFirst({ where: { id, ...this.operatorScope(user) }, include: { vehicles: true } });
      if (!current) throw new NotFoundException('安全员不存在或不在当前管理范围内');
      const enterprise = await this.operatorEnterprise(tx, user, dto.enterpriseId ?? current.enterpriseId), ids = dto.vehicleIds ?? current.vehicles.map(item => item.vehicleId);
      await this.validateOperatorVehicles(tx, enterprise.id, ids);
      const { enterpriseId: _enterpriseId, vehicleIds, expiresAt, onDuty, ...data } = dto;
      const nextExpiry = this.operatorExpiry(expiresAt);
      const needsReview = user.portal === 'ENTERPRISE' && ((data.qualificationNo !== undefined && data.qualificationNo !== current.qualificationNo) || (data.trainingCompleted !== undefined && data.trainingCompleted !== current.trainingCompleted) || (nextExpiry !== undefined && (nextExpiry?.getTime() ?? null) !== (current.expiresAt?.getTime() ?? null)) || enterprise.id !== current.enterpriseId);
      const status = (needsReview || (['REJECTED', 'SUSPENDED'].includes(current.status) && user.portal === 'ENTERPRISE')) ? 'PENDING' : current.status;
      return tx.safetyOperator.update({ where: { id }, data: { ...data, enterpriseId: enterprise.id, organizationId: enterprise.organizationId, expiresAt: nextExpiry, status, onDuty: status === 'APPROVED' ? onDuty ?? current.onDuty : false,
        vehicles: vehicleIds !== undefined ? { deleteMany: {}, create: ids.map(vehicleId => ({ vehicleId })) } : undefined }, include: this.operatorInclude });
    });
    await this.auth.audit(user, 'governance', 'safetyOperator', item.id, 'UPDATE', { assignedVehicles: item.vehicles.length });
    return item;
  }
  async reviewOperator(user: AuthUser, id: string, dto: ReviewSafetyOperatorDto) {
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业不能修改监管审核结论');
    const current = await this.operator(user, id);
    if (dto.status === 'APPROVED' && (!current.trainingCompleted || !current.qualificationNo || !current.expiresAt || current.expiresAt < new Date())) throw new BadRequestException('请先完善资格编号、有效期和培训记录');
    if (current.vehicles.length > MAX_OPERATOR_VEHICLES) throw new BadRequestException('每位安全员最多负责5台车辆');
    const item = await this.prisma.safetyOperator.update({ where: { id }, data: { status: dto.status, reviewComment: dto.comment, reviewedAt: new Date(), onDuty: dto.status === 'APPROVED' ? current.onDuty : false } });
    await this.auth.audit(user, 'governance', 'safetyOperator', id, 'REVIEW', { status: dto.status });
    return item;
  }

  async interfaces(user: AuthUser, query: GovernanceQueryDto) {
    const where: any = { enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, status: query.status, interfaceType: query.type, enterprise: user.portal === 'ENTERPRISE' || this.isSuper(user) ? undefined : this.orgScope(user).organization,
      OR: query.q ? [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }, { endpoint: { contains: query.q } }] : undefined };
    const [total, raw] = await this.prisma.$transaction([this.prisma.externalInterfaceConfig.count({ where }), this.prisma.externalInterfaceConfig.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' }, include: { enterprise: { select: { id: true, name: true } } } })]);
    return { page: query.page, pageSize: query.pageSize, total, items: raw.map((item) => ({ ...item, capabilities: this.parse(item.capabilitiesJson), capabilitiesJson: undefined })) };
  }

  async createInterface(user: AuthUser, dto: CreateInterfaceConfigDto) {
    const enterpriseId = this.enterpriseId(user, dto.enterpriseId);
    const enterprise = await this.prisma.enterprise.findFirst({ where: { id: enterpriseId, ...(user.portal === 'ENTERPRISE' ? {} : this.orgScope(user)) } });
    if (!enterprise) throw new ForbiddenException('企业不存在或不在当前数据范围内');
    const { capabilities, enterpriseId: _enterpriseId, ...data } = dto;
    const item = await this.prisma.externalInterfaceConfig.create({ data: { ...data, businessNo: this.businessNo('IFC'), enterpriseId, capabilitiesJson: JSON.stringify(capabilities ?? []) } });
    await this.auth.audit(user, 'governance', 'externalInterface', item.id, 'CREATE'); return item;
  }
  async updateInterface(user: AuthUser, id: string, dto: UpdateInterfaceConfigDto) {
    const current = await this.prisma.externalInterfaceConfig.findFirst({ where: { id, enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : undefined, enterprise: user.portal === 'ENTERPRISE' || this.isSuper(user) ? undefined : this.orgScope(user).organization } });
    if (!current) throw new NotFoundException('接口配置不存在或不在当前数据范围内');
    const { capabilities, enterpriseId: _enterpriseId, ...data } = dto;
    const item = await this.prisma.externalInterfaceConfig.update({ where: { id }, data: { ...data, capabilitiesJson: capabilities ? JSON.stringify(capabilities) : undefined, status: 'UNVERIFIED' } });
    await this.auth.audit(user, 'governance', 'externalInterface', id, 'UPDATE'); return item;
  }
  async testInterface(user: AuthUser, id: string) {
    const current = await this.prisma.externalInterfaceConfig.findFirst({ where: { id, enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : undefined, enterprise: user.portal === 'ENTERPRISE' || this.isSuper(user) ? undefined : this.orgScope(user).organization } });
    if (!current) throw new NotFoundException('接口配置不存在或不在当前数据范围内');
    let endpoint: URL;
    try { endpoint = new URL(current.endpoint); } catch { throw new BadRequestException('接口地址格式不正确，请填写完整的 HTTPS 地址'); }
    if (!['https:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new BadRequestException('接口地址必须使用 HTTPS 或 WSS，凭证应通过独立鉴权配置提供');
    if (!current.protocolVersion || !current.authType) throw new BadRequestException('请填写协议版本和鉴权方式');
    const receipt = { mode: 'CONFIG_VALIDATION', requestId: this.businessNo('CHK'), configurationValid: true,
      networkVerified: false, checks: ['地址协议', '鉴权配置', '协议版本'], checkedAt: new Date().toISOString(), message: '配置检查通过，网络连通性及真实数据接入待验证' };
    await this.prisma.externalInterfaceConfig.update({ where: { id }, data: { status: 'CONFIGURED', lastTestAt: new Date(), lastTestResult: JSON.stringify(receipt) } });
    await this.auth.audit(user, 'governance', 'externalInterface', id, 'VALIDATE_CONFIG', receipt); return receipt;
  }

  async inspections(user: AuthUser, query: GovernanceQueryDto) {
    const where: any = { ...(user.portal === 'ENTERPRISE' ? { enterpriseId: user.enterpriseId ?? '__none__' } : this.orgScope(user)), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, status: query.status, inspectionType: query.type,
      OR: query.q ? [{ title: { contains: query.q } }, { businessNo: { contains: query.q } }, { enterprise: { name: { contains: query.q } } }, { inspectorName: { contains: query.q } }] : undefined };
    const [total, items] = await this.prisma.$transaction([this.prisma.regulatoryInspection.count({ where }), this.prisma.regulatoryInspection.findMany({ where, ...this.page(query), orderBy: { scheduledAt: 'desc' }, include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } } } })]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async createInspection(user: AuthUser, dto: CreateInspectionDto) {
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能创建监管检查');
    const enterprise = await this.prisma.enterprise.findFirst({ where: { id: dto.enterpriseId, ...this.orgScope(user) } });
    if (!enterprise) throw new ForbiddenException('企业不存在或不在当前监管范围内');
    const item = await this.prisma.regulatoryInspection.create({ data: { businessNo: this.businessNo('CHK'), title: dto.title, enterpriseId: enterprise.id, organizationId: enterprise.organizationId, inspectorName: dto.inspectorName, inspectionType: dto.inspectionType, scheduledAt: new Date(dto.scheduledAt) } });
    await this.auth.audit(user, 'governance', 'inspection', item.id, 'CREATE'); return item;
  }
  async actInspection(user: AuthUser, id: string, dto: InspectionActionDto) {
    const current = await this.prisma.regulatoryInspection.findFirst({ where: { id, ...(user.portal === 'ENTERPRISE' ? { enterpriseId: user.enterpriseId ?? '__none__' } : this.orgScope(user)) } });
    if (!current) throw new NotFoundException('检查记录不存在或不在当前数据范围内');
    if (user.portal === 'ENTERPRISE' && dto.action !== 'SUBMIT_RECTIFICATION') throw new ForbiddenException('企业账号只能提交整改反馈');
    const transitions: Record<string, Record<string, string>> = { PLANNED: { COMPLETE: 'COMPLETED', REQUEST_RECTIFICATION: 'RECTIFYING' }, COMPLETED: { REQUEST_RECTIFICATION: 'RECTIFYING', CLOSE: 'CLOSED' }, RECTIFYING: { SUBMIT_RECTIFICATION: 'PENDING_REVIEW' }, PENDING_REVIEW: { CLOSE: 'CLOSED', REQUEST_RECTIFICATION: 'RECTIFYING' } };
    const next = transitions[current.status]?.[dto.action]; if (!next) throw new BadRequestException('当前状态不支持该操作');
    const item = await this.prisma.regulatoryInspection.update({ where: { id }, data: { status: next, completedAt: dto.action === 'COMPLETE' ? new Date() : undefined, result: dto.action === 'COMPLETE' ? dto.content : undefined, issueCount: dto.issueCount, rectificationDueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, rectification: dto.action === 'SUBMIT_RECTIFICATION' ? dto.content : undefined, reviewComment: ['REQUEST_RECTIFICATION', 'CLOSE'].includes(dto.action) ? dto.content : undefined, closedAt: next === 'CLOSED' ? new Date() : undefined } });
    await this.auth.audit(user, 'governance', 'inspection', id, dto.action, dto); return item;
  }

  async rules(user: AuthUser, query: GovernanceQueryDto) {
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能访问业务规则配置');
    const where: any = { ...this.orgScope(user), category: query.type, status: query.status, OR: query.q ? [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }] : undefined };
    const [total, raw] = await this.prisma.$transaction([this.prisma.businessRule.count({ where }), this.prisma.businessRule.findMany({ where, ...this.page(query), orderBy: [{ category: 'asc' }, { version: 'desc' }], include: { organization: { select: { id: true, name: true } } } })]);
    return { page: query.page, pageSize: query.pageSize, total, items: raw.map((item) => ({ ...item, value: this.parse(item.valueJson), valueJson: undefined })) };
  }
  async createRule(user: AuthUser, dto: CreateBusinessRuleDto) {
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能维护业务规则');
    const organizationId = user.organizationId; if (!organizationId) throw new BadRequestException('当前账号未关联监管机构');
    const latest = await this.prisma.businessRule.findFirst({ where: { organizationId, category: dto.category }, orderBy: { version: 'desc' } });
    const item = await this.prisma.businessRule.create({ data: { businessNo: this.businessNo('RULE'), name: dto.name, category: dto.category, version: (latest?.version ?? 0) + 1, organizationId, valueJson: JSON.stringify(dto.value) } });
    await this.auth.audit(user, 'governance', 'businessRule', item.id, 'CREATE_VERSION'); return item;
  }
  async publishRule(user: AuthUser, id: string) {
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能发布业务规则');
    const current = await this.prisma.businessRule.findFirst({ where: { id, ...this.orgScope(user) } }); if (!current) throw new NotFoundException('规则不存在或不在当前监管范围内');
    await this.prisma.$transaction([this.prisma.businessRule.updateMany({ where: { organizationId: current.organizationId, category: current.category, status: 'PUBLISHED' }, data: { status: 'RETIRED' } }), this.prisma.businessRule.update({ where: { id }, data: { status: 'PUBLISHED', effectiveAt: new Date(), publishedBy: user.displayName } })]);
    await this.auth.audit(user, 'governance', 'businessRule', id, 'PUBLISH'); return { published: true };
  }

  private async ensureCreditAccounts(user: AuthUser) {
    const enterprises = await this.prisma.enterprise.findMany({ where: user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' } : this.orgScope(user), select: { id: true, organizationId: true } });
    for (const enterprise of enterprises) {
      const exists = await this.prisma.creditAccount.findFirst({ where: { subjectType: 'ENTERPRISE', enterpriseId: enterprise.id, vehicleId: null } });
      if (!exists) await this.prisma.creditAccount.create({ data: { businessNo: this.businessNo('CR-ENT'), subjectType: 'ENTERPRISE', enterpriseId: enterprise.id, organizationId: enterprise.organizationId } });
    }
  }
  async creditAccounts(user: AuthUser, query: GovernanceQueryDto) {
    await this.ensureCreditAccounts(user);
    const where: any = { ...(user.portal === 'ENTERPRISE' ? { enterpriseId: user.enterpriseId ?? '__none__' } : this.orgScope(user)), subjectType: query.type, grade: query.status,
      OR: query.q ? [{ businessNo: { contains: query.q } }, { enterprise: { name: { contains: query.q } } }, { vehicle: { name: { contains: query.q } } }, { vehicle: { unifiedCode: { contains: query.q } } }] : undefined };
    const [total, items] = await this.prisma.$transaction([this.prisma.creditAccount.count({ where }), this.prisma.creditAccount.findMany({ where, ...this.page(query), orderBy: [{ grade: 'desc' }, { updatedAt: 'desc' }], include: { enterprise: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, businessNo: true, unifiedCode: true } }, entries: { orderBy: { createdAt: 'desc' }, take: 10 } } })]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async addCreditEntry(user: AuthUser, id: string, dto: CreditEntryDto) {
    if(user.accountLevel==='CITY')throw new BadRequestException('请在信用管理页面关联已确认事项办理');
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能确认信用扣分');
    const account = await this.prisma.creditAccount.findFirst({ where: { id, ...this.orgScope(user) } }); if (!account) throw new NotFoundException('信用账户不存在或不在当前监管范围内');
    const change = ({ MINOR: -2, GENERAL: -5, SERIOUS: -10, MAJOR: -20 } as Record<string, number>)[dto.severity]; const scoreAfter = Math.max(0, Math.min(100, account.currentScore + change));
    const days = ({ MINOR: 30, GENERAL: 90, SERIOUS: 180, MAJOR: 365 } as Record<string, number>)[dto.severity]; const repairEligibleAt = new Date(Date.now() + days * 86400000);
    const entry = await this.prisma.$transaction(async (tx) => { const created = await tx.creditEntry.create({ data: { businessNo: this.businessNo('CRD'), accountId: id, eventType: 'DEDUCTION', severity: dto.severity, scoreChange: change, scoreAfter, reason: dto.reason, sourceType: dto.sourceType, sourceId: dto.sourceId, confirmedBy: user.displayName, confirmedAt: new Date(), repairEligibleAt } }); await tx.creditAccount.update({ where: { id }, data: { currentScore: scoreAfter, grade: this.grade(scoreAfter) } }); return created; });
    await this.auth.audit(user, 'governance', 'creditEntry', entry.id, 'DEDUCT', dto); return entry;
  }
  async repairCredit(user: AuthUser, id: string, dto: CreditRepairDto) {
    if(user.accountLevel==='CITY')throw new BadRequestException('请在信用管理详情中核对条件并提交修复材料');
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能确认信用修复');
    const entry = await this.prisma.creditEntry.findFirst({ where: { id, account: this.orgScope(user) } }); if (!entry) throw new NotFoundException('信用记录不存在或不在当前监管范围内');
    if (entry.status !== 'CONFIRMED') throw new BadRequestException('该记录已处理'); if (entry.repairEligibleAt && entry.repairEligibleAt > new Date()) throw new BadRequestException('尚未达到信用修复周期');
    const account = await this.prisma.creditAccount.findUniqueOrThrow({ where: { id: entry.accountId } }); const scoreAfter = Math.min(100, account.currentScore + Math.abs(entry.scoreChange));
    await this.prisma.$transaction([this.prisma.creditEntry.update({ where: { id }, data: { status: 'REPAIRED', repairedAt: new Date(), reason: `${entry.reason}；修复说明：${dto.comment}` } }), this.prisma.creditAccount.update({ where: { id: account.id }, data: { currentScore: scoreAfter, grade: this.grade(scoreAfter) } })]);
    await this.auth.audit(user, 'governance', 'creditEntry', id, 'REPAIR', dto); return { repaired: true, scoreAfter };
  }
}
