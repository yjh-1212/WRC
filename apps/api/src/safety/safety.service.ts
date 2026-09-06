import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccidentActionDto, AlertActionDto, CreateAccidentDto, CreateAlertDto, CreateEmergencyTaskDto, CreateFenceDto, CreateViolationDto, EmergencyActionDto, OfflineActionDto, SafetyQueryDto, UpdateFenceDto, ViolationActionDto } from './dto';

@Injectable()
export class SafetyService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  private isSuper(user: AuthUser) { return user.roles.some((role) => role.code === 'SUPER_ADMIN'); }
  private organizationRelation(user: AuthUser) {
    return { is: { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } };
  }
  private scoped(user: AuthUser) {
    if (user.portal === 'ENTERPRISE') {
      if (!user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
      return { enterpriseId: user.enterpriseId };
    }
    return this.isSuper(user) ? {} : { organization: this.organizationRelation(user) };
  }
  private page(query: SafetyQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
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
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId, OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] } });
    if (!organization) throw new ForbiddenException('不能维护当前组织范围之外的数据');
  }

  async options(user: AuthUser) {
    const scope = this.scoped(user);
    const [vehicles, enterprises, organizations, assignees] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({ where: { deletedAt: null, ...scope }, orderBy: { name: 'asc' }, select: { id: true, name: true, businessNo: true, enterpriseId: true, organizationId: true } }),
      this.prisma.enterprise.findMany({ where: user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' } : this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }, orderBy: { name: 'asc' }, select: { id: true, name: true, organizationId: true } }),
      this.prisma.organization.findMany({ where: this.isSuper(user) ? {} : { OR: [{ id: user.organizationId ?? '__none__' }, { parentId: user.organizationId ?? '__none__' }] }, orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
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
    return item;
  }
  async createAlert(user: AuthUser, dto: CreateAlertDto) {
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
    const item = await this.prisma.safetyAlert.update({ where: { id }, data: { status: next, responsibleUserId: ['CONFIRM', 'START'].includes(dto.action) ? user.id : undefined, confirmedAt: dto.action === 'CONFIRM' ? new Date() : undefined, closedAt: next === 'CLOSED' ? new Date() : next === 'IN_PROGRESS' ? null : undefined, lastComment: dto.comment } });
    await this.auth.audit(user, 'safety', 'safetyAlert', id, dto.action, { from: current.status, to: next, comment: dto.comment });
    return item;
  }

  private fenceWhere(user: AuthUser, query: SafetyQueryDto): Prisma.ElectronicFenceWhereInput {
    return { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, organizationId: query.organizationId, fenceType: query.type, active: query.status ? query.status === 'ACTIVE' : undefined, OR: query.q ? [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }, { enterprise: { name: { contains: query.q } } }] : undefined };
  }
  async fences(user: AuthUser, query: SafetyQueryDto) {
    const where = this.fenceWhere(user, query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.electronicFence.count({ where }),
      this.prisma.electronicFence.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' }, include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } }, triggers: { orderBy: { occurredAt: 'desc' }, take: 5, include: { vehicle: { select: { name: true } } } }, _count: true } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items: items.map((item) => ({ ...item, polygon: this.parsePolygon(item.polygonJson), polygonJson: undefined })) };
  }
  private async assertFenceRelations(user: AuthUser, enterpriseId?: string, vehicleIds?: string[]) {
    if (enterpriseId) {
      const enterprise = await this.prisma.enterprise.findFirst({ where: { id: enterpriseId, ...(this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }) } });
      if (!enterprise) throw new ForbiddenException('关联企业不在当前数据范围内');
    }
    if (vehicleIds?.length) {
      const count = await this.prisma.vehicle.count({ where: { id: { in: vehicleIds }, deletedAt: null, ...(enterpriseId ? { enterpriseId } : {}), ...this.scoped(user) } });
      if (count !== new Set(vehicleIds).size) throw new ForbiddenException('存在越权车辆或车辆与企业归属不一致');
    }
  }
  async createFence(user: AuthUser, dto: CreateFenceDto) {
    await this.assertRegulatoryWrite(user, dto.organizationId); await this.assertFenceRelations(user, dto.enterpriseId, dto.vehicleIds); this.validatePolygon(dto.polygon);
    if (dto.fenceType === 'SPEED_LIMIT' && !dto.speedLimit) throw new BadRequestException('限速围栏必须配置限速值');
    const { polygon, vehicleIds, ...data } = dto;
    const item = await this.prisma.electronicFence.create({ data: { ...data, polygonJson: JSON.stringify(polygon), validFrom: new Date(dto.validFrom), validTo: dto.validTo ? new Date(dto.validTo) : undefined, vehicles: vehicleIds?.length ? { create: vehicleIds.map((vehicleId) => ({ vehicleId })) } : undefined } });
    await this.auth.audit(user, 'safety', 'electronicFence', item.id, 'CREATE', { businessNo: item.businessNo, name: item.name }); return item;
  }
  async updateFence(user: AuthUser, id: string, dto: UpdateFenceDto) {
    const current = await this.prisma.electronicFence.findFirst({ where: { id, ...this.scoped(user) } });
    if (!current) throw new NotFoundException('电子围栏不存在或不在当前数据范围内');
    await this.assertRegulatoryWrite(user, dto.organizationId ?? current.organizationId); await this.assertFenceRelations(user, dto.enterpriseId ?? current.enterpriseId ?? undefined, dto.vehicleIds); if (dto.polygon) this.validatePolygon(dto.polygon);
    const { polygon, vehicleIds, validFrom, validTo, ...data } = dto;
    const item = await this.prisma.electronicFence.update({ where: { id }, data: { ...data, polygonJson: polygon ? JSON.stringify(polygon) : undefined, validFrom: validFrom ? new Date(validFrom) : undefined, validTo: validTo === '' ? null : validTo ? new Date(validTo) : undefined, vehicles: vehicleIds ? { deleteMany: {}, create: vehicleIds.map((vehicleId) => ({ vehicleId })) } : undefined } });
    await this.auth.audit(user, 'safety', 'electronicFence', id, 'UPDATE', { businessNo: item.businessNo }); return item;
  }
  async setFenceStatus(user: AuthUser, id: string, active: boolean) {
    const current = await this.prisma.electronicFence.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('电子围栏不存在或不在当前数据范围内'); await this.assertRegulatoryWrite(user, current.organizationId);
    if (active && current.validTo && current.validTo < new Date()) throw new BadRequestException('已过期围栏不能启用');
    const item = await this.prisma.electronicFence.update({ where: { id }, data: { active } }); await this.auth.audit(user, 'safety', 'electronicFence', id, active ? 'ENABLE' : 'DISABLE'); return item;
  }
  async deleteFence(user: AuthUser, id: string) {
    const current = await this.prisma.electronicFence.findFirst({ where: { id, ...this.scoped(user) }, include: { _count: { select: { triggers: true } } } });
    if (!current) throw new NotFoundException('电子围栏不存在或不在当前数据范围内');
    await this.assertRegulatoryWrite(user, current.organizationId);
    if (current._count.triggers) throw new BadRequestException('该围栏已有触发记录，不能删除。请先停用围栏，历史告警将继续保留');
    await this.prisma.electronicFence.delete({ where: { id } });
    await this.auth.audit(user, 'safety', 'electronicFence', id, 'DELETE', { businessNo: current.businessNo, name: current.name });
    return { id, deleted: true };
  }

  async processTelemetry(vehicle: { id: string; name: string; enterpriseId: string; organizationId: string }, telemetry: { longitude: number; latitude: number; speed: number }, recordedAt: Date) {
    const fences = await this.prisma.electronicFence.findMany({ where: { active: true, validFrom: { lte: recordedAt }, AND: [{ OR: [{ validTo: null }, { validTo: { gte: recordedAt } }] }, { OR: [{ enterpriseId: null }, { enterpriseId: vehicle.enterpriseId }] }, { OR: [{ vehicles: { none: {} } }, { vehicles: { some: { vehicleId: vehicle.id } } }] }] } });
    for (const fence of fences) {
      const inside = this.pointInPolygon(telemetry.longitude, telemetry.latitude, this.parsePolygon(fence.polygonJson));
      const triggerType = fence.fenceType === 'SPEED_LIMIT' && inside && telemetry.speed > (fence.speedLimit ?? Number.MAX_SAFE_INTEGER) ? 'OVERSPEED' : fence.fenceType === 'OPERATION' && !inside ? 'EXIT' : ['NO_ENTRY', 'TEMPORARY'].includes(fence.fenceType) && inside ? 'ENTER' : null;
      const open = await this.prisma.fenceTrigger.findFirst({ where: { fenceId: fence.id, vehicleId: vehicle.id, status: 'ACTIVE' } });
      if (!triggerType && open) { await this.prisma.fenceTrigger.update({ where: { id: open.id }, data: { status: 'RECOVERED', recoveredAt: recordedAt } }); continue; }
      if (!triggerType || open) continue;
      const level = fence.fenceType === 'NO_ENTRY' ? 'HIGH' : 'MEDIUM'; const alertType = triggerType === 'OVERSPEED' ? 'OVERSPEED' : triggerType === 'EXIT' ? 'OUT_OF_BOUNDS' : 'NO_ENTRY';
      await this.prisma.$transaction(async (tx) => {
        const alert = await tx.safetyAlert.create({ data: { businessNo: this.businessNo('ALT'), alertType, source: 'FENCE_RULE', level, title: `${vehicle.name}${triggerType === 'OVERSPEED' ? '触发限速围栏' : triggerType === 'EXIT' ? '驶出运营围栏' : '进入管控围栏'}`, description: `${fence.name}自动规则触发`, enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, vehicleId: vehicle.id, longitude: telemetry.longitude, latitude: telemetry.latitude, occurredAt: recordedAt } });
        await tx.fenceTrigger.create({ data: { businessNo: this.businessNo('FTR'), fenceId: fence.id, vehicleId: vehicle.id, alertId: alert.id, triggerType, longitude: telemetry.longitude, latitude: telemetry.latitude, speed: telemetry.speed, occurredAt: recordedAt } });
      });
    }
    const openOffline = await this.prisma.offlineEvent.findMany({ where: { vehicleId: vehicle.id, status: { in: ['OFFLINE', 'INVESTIGATING'] } } });
    for (const event of openOffline) await this.prisma.$transaction([this.prisma.offlineEvent.update({ where: { id: event.id }, data: { status: 'RECOVERED', endedAt: recordedAt, durationMinutes: Math.max(1, Math.round((recordedAt.getTime() - event.startedAt.getTime()) / 60000)), recoveryNote: '车辆遥测恢复，系统自动解除离线状态' } }), this.prisma.safetyAlert.update({ where: { id: event.alertId }, data: { lastComment: '车辆已恢复在线，等待人工复核关闭' } })]);
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
  async createAccident(user: AuthUser, dto: CreateAccidentDto) { const vehicle = await this.caseVehicle(user, dto.vehicleId, dto.operationRecordId, dto.alertId); const item = await this.prisma.accident.create({ data: { ...dto, businessNo: this.businessNo('ACC'), source: user.portal === 'ENTERPRISE' ? 'ENTERPRISE_REPORT' : 'REGULATORY_ENTRY', enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, reporterUserId: user.id, occurredAt: new Date(dto.occurredAt), casualties: dto.casualties ?? 0 } }); await this.auth.audit(user, 'safety', 'accident', item.id, 'REPORT', { businessNo: item.businessNo }); return item; }
  async actAccident(user: AuthUser, id: string, dto: AccidentActionDto) { const current = await this.prisma.accident.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('事故不存在或不在当前数据范围内'); if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能执行监管事故认定'); const transitions: Record<string, Record<string, string>> = { REPORTED: { ACCEPT: 'ACCEPTED' }, ACCEPTED: { INVESTIGATE: 'INVESTIGATING' }, INVESTIGATING: { DETERMINE: 'RESPONSIBILITY_DETERMINED' }, RESPONSIBILITY_DETERMINED: { PROCESS: 'PROCESSING' }, PROCESSING: { CLOSE: 'CLOSED' }, CLOSED: { ARCHIVE: 'ARCHIVED' } }; const next = transitions[current.status]?.[dto.action]; if (!next) throw new BadRequestException('事故当前状态不支持该操作'); const data: Prisma.AccidentUpdateInput = { status: next, investigation: dto.action === 'INVESTIGATE' ? dto.comment : undefined, responsibility: dto.action === 'DETERMINE' ? dto.comment : undefined, disposalProgress: ['PROCESS', 'CLOSE'].includes(dto.action) ? dto.comment : undefined, closedAt: next === 'CLOSED' ? new Date() : undefined, archivedAt: next === 'ARCHIVED' ? new Date() : undefined }; const item = await this.prisma.accident.update({ where: { id }, data }); await this.auth.audit(user, 'safety', 'accident', id, dto.action, { from: current.status, to: next }); return item; }

  async violations(user: AuthUser, query: SafetyQueryDto) { const where: Prisma.ViolationWhereInput = { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, organizationId: query.organizationId, vehicleId: query.vehicleId, status: query.status, violationType: query.type, level: query.level, occurredAt: this.range(query.from, query.to), OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { vehicle: { name: { contains: query.q } } }] : undefined }; const [total, items] = await this.prisma.$transaction([this.prisma.violation.count({ where }), this.prisma.violation.findMany({ where, ...this.page(query), orderBy: { occurredAt: 'desc' }, include: { enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, businessNo: true } }, operationRecord: { select: { id: true, businessNo: true } } } })]); return { page: query.page, pageSize: query.pageSize, total, items }; }
  async violation(user: AuthUser, id: string) { const item = await this.prisma.violation.findFirst({ where: { id, ...this.scoped(user) }, include: { enterprise: true, organization: true, vehicle: true, operationRecord: { include: { trackPoints: { orderBy: { sequence: 'asc' } } } }, alert: true } }); if (!item) throw new NotFoundException('违规记录不存在或不在当前数据范围内'); return item; }
  async createViolation(user: AuthUser, dto: CreateViolationDto) { if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能进行违规认定'); const vehicle = await this.caseVehicle(user, dto.vehicleId, dto.operationRecordId, dto.alertId); const item = await this.prisma.violation.create({ data: { ...dto, businessNo: this.businessNo('VIO'), enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, occurredAt: new Date(dto.occurredAt) } }); await this.auth.audit(user, 'safety', 'violation', item.id, 'CREATE', { businessNo: item.businessNo }); return item; }
  async actViolation(user: AuthUser, id: string, dto: ViolationActionDto) { const current = await this.prisma.violation.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('违规记录不存在或不在当前数据范围内'); const enterpriseActions = ['SUBMIT_RECTIFICATION']; if (user.portal === 'ENTERPRISE' && !enterpriseActions.includes(dto.action)) throw new ForbiddenException('企业账号只能提交整改反馈'); const transitions: Record<string, Record<string, string>> = { PENDING_DETERMINATION: { CONFIRM: 'CONFIRMED' }, CONFIRMED: { REQUEST_RECTIFICATION: 'RECTIFYING' }, RECTIFYING: { SUBMIT_RECTIFICATION: 'PENDING_REVIEW' }, PENDING_REVIEW: { APPROVE: 'CLOSED', RETURN: 'RECTIFYING' } }; const next = transitions[current.status]?.[dto.action]; if (!next) throw new BadRequestException('违规记录当前状态不支持该操作'); const item = await this.prisma.violation.update({ where: { id }, data: { status: next, determination: dto.action === 'CONFIRM' ? dto.comment : undefined, rectification: dto.action === 'SUBMIT_RECTIFICATION' ? dto.comment : undefined, reviewComment: ['APPROVE', 'RETURN'].includes(dto.action) ? dto.comment : undefined, confirmedAt: dto.action === 'CONFIRM' ? new Date() : undefined, closedAt: next === 'CLOSED' ? new Date() : undefined } }); await this.auth.audit(user, 'safety', 'violation', id, dto.action, { from: current.status, to: next }); return item; }

  async scanOffline(user: AuthUser) {
    const threshold = new Date(Date.now() - 10 * 60_000); const vehicles = await this.prisma.vehicle.findMany({ where: { deletedAt: null, ...this.scoped(user), OR: [{ realtimeStatus: null }, { realtimeStatus: { heartbeatAt: { lt: threshold } } }] }, include: { realtimeStatus: true } }); let created = 0;
    for (const vehicle of vehicles) { const open = await this.prisma.offlineEvent.findFirst({ where: { vehicleId: vehicle.id, status: { in: ['OFFLINE', 'INVESTIGATING'] } } }); if (open) continue; const startedAt = vehicle.realtimeStatus?.heartbeatAt ?? threshold; await this.prisma.$transaction(async (tx) => { const alert = await tx.safetyAlert.create({ data: { businessNo: this.businessNo('ALT'), alertType: 'OFFLINE', source: 'OFFLINE_RULE', level: 'MEDIUM', title: `${vehicle.name}持续离线`, description: '车辆心跳超过 10 分钟未更新', enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, vehicleId: vehicle.id, longitude: vehicle.realtimeStatus?.longitude, latitude: vehicle.realtimeStatus?.latitude, occurredAt: startedAt } }); await tx.offlineEvent.create({ data: { businessNo: this.businessNo('OFF'), vehicleId: vehicle.id, enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId, alertId: alert.id, startedAt, durationMinutes: Math.max(10, Math.round((Date.now() - startedAt.getTime()) / 60000)) } }); }); created++; }
    await this.auth.audit(user, 'safety', 'offlineEvent', null, 'SCAN', { created, threshold }); return { scanned: vehicles.length, created };
  }
  async offlineEvents(user: AuthUser, query: SafetyQueryDto) { const where: Prisma.OfflineEventWhereInput = { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, organizationId: query.organizationId, vehicleId: query.vehicleId, status: query.status, startedAt: this.range(query.from, query.to), OR: query.q ? [{ businessNo: { contains: query.q } }, { vehicle: { name: { contains: query.q } } }, { enterprise: { name: { contains: query.q } } }] : undefined }; const [total, items] = await this.prisma.$transaction([this.prisma.offlineEvent.count({ where }), this.prisma.offlineEvent.findMany({ where, ...this.page(query), orderBy: { startedAt: 'desc' }, include: { vehicle: { select: { id: true, name: true, businessNo: true, realtimeStatus: true } }, enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, alert: { select: { id: true, businessNo: true, status: true } } } })]); const open = items.filter((item) => item.status !== 'RECOVERED').length; return { page: query.page, pageSize: query.pageSize, total, summary: { open, recovered: total - open, longestMinutes: items.reduce((max, item) => Math.max(max, item.status === 'RECOVERED' ? item.durationMinutes : Math.round((Date.now() - item.startedAt.getTime()) / 60000)), 0) }, items }; }
  async actOffline(user: AuthUser, id: string, dto: OfflineActionDto) { const current = await this.prisma.offlineEvent.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('离线事件不存在或不在当前数据范围内'); const next = dto.action === 'INVESTIGATE' ? 'INVESTIGATING' : dto.action === 'RECOVER' ? 'RECOVERED' : current.status; const endedAt = next === 'RECOVERED' ? new Date() : undefined; const item = await this.prisma.offlineEvent.update({ where: { id }, data: { status: next, reason: dto.action === 'UPDATE_REASON' ? dto.comment : undefined, recoveryNote: dto.action === 'RECOVER' ? dto.comment : undefined, endedAt, durationMinutes: endedAt ? Math.max(1, Math.round((endedAt.getTime() - current.startedAt.getTime()) / 60000)) : undefined } }); await this.auth.audit(user, 'safety', 'offlineEvent', id, dto.action, { from: current.status, to: next }); return item; }

  async emergencyTasks(user: AuthUser, query: SafetyQueryDto) { const where: Prisma.EmergencyTaskWhereInput = { ...this.scoped(user), enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId, organizationId: query.organizationId, status: query.status, level: query.level, OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { alert: { businessNo: { contains: query.q } } }] : undefined }; const [total, items] = await this.prisma.$transaction([this.prisma.emergencyTask.count({ where }), this.prisma.emergencyTask.findMany({ where, ...this.page(query), orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], include: { alert: { select: { id: true, businessNo: true, alertType: true, status: true, vehicle: { select: { id: true, name: true, businessNo: true } } } }, enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, assigneeUser: { select: { id: true, displayName: true } } } })]); return { page: query.page, pageSize: query.pageSize, total, items }; }
  async emergencyTask(user: AuthUser, id: string) { const item = await this.prisma.emergencyTask.findFirst({ where: { id, ...this.scoped(user) }, include: { alert: { include: { vehicle: true } }, accident: true, enterprise: true, organization: true, assigneeUser: { select: { id: true, displayName: true } }, logs: { orderBy: { createdAt: 'asc' } } } }); if (!item) throw new NotFoundException('应急任务不存在或不在当前数据范围内'); return item; }
  async createEmergencyTask(user: AuthUser, dto: CreateEmergencyTaskDto) { if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业账号不能派发应急任务'); const alert = await this.prisma.safetyAlert.findFirst({ where: { id: dto.alertId, ...this.scoped(user) } }); if (!alert) throw new NotFoundException('关联告警不存在或不在当前数据范围内'); if (dto.accidentId) { const accident = await this.prisma.accident.findFirst({ where: { id: dto.accidentId, enterpriseId: alert.enterpriseId } }); if (!accident) throw new BadRequestException('关联事故与告警企业不一致'); } const item = await this.prisma.emergencyTask.create({ data: { businessNo: this.businessNo('EMG'), alertId: alert.id, accidentId: dto.accidentId, enterpriseId: alert.enterpriseId, organizationId: alert.organizationId, level: alert.level, title: dto.title, requirement: dto.requirement, assigneeUserId: dto.assigneeUserId, responseMode: dto.responseMode, dueAt: new Date(dto.dueAt), logs: { create: { actorUserId: user.id, actorName: user.displayName, action: 'CREATE', toStatus: 'PENDING_DISPATCH', content: dto.requirement } } } }); await this.auth.audit(user, 'safety', 'emergencyTask', item.id, 'CREATE', { businessNo: item.businessNo }); return item; }
  async actEmergencyTask(user: AuthUser, id: string, dto: EmergencyActionDto) { const current = await this.prisma.emergencyTask.findFirst({ where: { id, ...this.scoped(user) } }); if (!current) throw new NotFoundException('应急任务不存在或不在当前数据范围内'); const enterpriseActions = ['RESPOND', 'SUBMIT_FEEDBACK']; const regulatoryActions = ['DISPATCH', 'RETURN', 'CLOSE']; if (user.portal === 'ENTERPRISE' && !enterpriseActions.includes(dto.action)) throw new ForbiddenException('企业账号不能执行监管复核操作'); if (user.portal !== 'ENTERPRISE' && !regulatoryActions.includes(dto.action)) throw new ForbiddenException('监管账号不能代替企业响应或反馈'); if (user.portal === 'ENTERPRISE' && !user.permissions.includes('safety:emergency:respond')) throw new ForbiddenException('缺少应急响应权限'); if (user.portal !== 'ENTERPRISE' && ['RETURN', 'CLOSE'].includes(dto.action) && !user.permissions.includes('safety:emergency:review')) throw new ForbiddenException('缺少应急复核权限'); if (user.portal !== 'ENTERPRISE' && dto.action === 'DISPATCH' && !user.permissions.includes('safety:emergency:dispatch')) throw new ForbiddenException('缺少应急派发权限'); if (dto.action === 'CLOSE' && !dto.score) throw new BadRequestException('评价关闭应急任务时必须填写 1 至 5 分评分'); const transitions: Record<string, Record<string, string>> = { PENDING_DISPATCH: { DISPATCH: 'WAITING_RESPONSE' }, WAITING_RESPONSE: { RESPOND: 'IN_PROGRESS' }, IN_PROGRESS: { SUBMIT_FEEDBACK: 'PENDING_REVIEW' }, PENDING_REVIEW: { RETURN: 'IN_PROGRESS', CLOSE: 'CLOSED' } }; const next = transitions[current.status]?.[dto.action]; if (!next) throw new BadRequestException('应急任务当前状态不支持该操作'); const item = await this.prisma.$transaction(async (tx) => { const updated = await tx.emergencyTask.update({ where: { id }, data: { status: next, dispatchedAt: dto.action === 'DISPATCH' ? new Date() : undefined, respondedAt: dto.action === 'RESPOND' ? new Date() : undefined, feedback: dto.action === 'SUBMIT_FEEDBACK' ? dto.comment : undefined, reviewComment: ['RETURN', 'CLOSE'].includes(dto.action) ? dto.comment : undefined, evaluationScore: dto.action === 'CLOSE' ? dto.score : undefined, evaluation: dto.action === 'CLOSE' ? dto.comment : undefined, closedAt: next === 'CLOSED' ? new Date() : undefined } }); await tx.emergencyTaskLog.create({ data: { taskId: id, actorUserId: user.id, actorName: user.displayName, action: dto.action, fromStatus: current.status, toStatus: next, content: dto.comment } }); return updated; }); await this.auth.audit(user, 'safety', 'emergencyTask', id, dto.action, { from: current.status, to: next }); return item; }
}
