import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProvinceMatter } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CityTaskActionDto, CreateProvinceMatterDto, CreateResourceDto, GenerateDutyEvaluationDto, OversightQueryDto, MatterQueryDto, RelatedMatterQueryDto, ProvinceMatterActionDto, PublishDutyEvaluationDto, UpdateProvinceMatterDto, UpdateResourceDto, UpsertPilotDto } from './dto';

import { readChecklist, validateChecklist, validateInspectionReport, readInspectionReport, inspectionSummary } from './coordination';

type Tx = Prisma.TransactionClient;
const KIND_LABELS = { RISK_NOTICE: '风险通报', SUPERVISION: '督办任务', CROSS_CITY: '跨市协同', EMERGENCY: '应急统筹' };

@Injectable()
export class OversightService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}
  private readonly locks = new Map<string, Promise<void>>();
  private async serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => gate); this.locks.set(key, tail); await previous;
    try { return await work(); } finally { release(); if (this.locks.get(key) === tail) this.locks.delete(key); }
  }
  private province(user: AuthUser, write = false) {
    if (user.accountLevel !== 'PROVINCE' || user.portal !== 'REGULATORY') throw new ForbiddenException('仅省级监管人员可以访问省级协同业务');
    if (write ? !user.permissions.includes('system:organization:update') : !user.permissions.some((permission) => ['dashboard:view', 'system:organization:read'].includes(permission))) throw new ForbiddenException(write ? '当前账号没有省级事项办理权限' : '当前账号没有省级信息查询权限');
  }
  private city(user: AuthUser, write = false) {
    if (user.accountLevel !== 'CITY' || user.portal !== 'REGULATORY' || !user.workspaceId) throw new ForbiddenException('仅市级监管人员可以办理本市承接事项');
    if (write && !user.roles.some((role) => /^CITY_ADMIN(?:_|$)/.test(role.code)) && !user.permissions.some((permission) => ['safety:alert:handle', 'safety:emergency:respond', 'safety:emergency:dispatch', 'safety:violation:write'].includes(permission))) throw new ForbiddenException('当前账号没有市级事项响应和反馈权限');
    return user.workspaceId;
  }
  private parse<T>(value: string, fallback: T): T { try { return JSON.parse(value); } catch { return fallback; } }
  private no() { return `SD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`; }
  private page(query: OversightQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
  private log(logs: string, action: string, user: AuthUser, detail: Record<string, unknown> = {}) { return JSON.stringify([...this.parse<any[]>(logs, []), { action, actorId: user.id, actorName: user.displayName, at: new Date().toISOString(), ...detail }]); }
  private audit(user: AuthUser, objectType: string, id: string, action: string, detail?: unknown) { return this.auth.audit(user, 'oversight', objectType, id, action, detail); }
  private async workspace(id: string, tx: Tx = this.prisma) {
    const item = await tx.cityWorkspace.findUnique({ where: { id }, select: { id: true, cityCode: true, cityName: true, organizationId: true, status: true } });
    if (!item) throw new BadRequestException('关联地市不存在或不在授权范围内');
    return item;
  }
  private async workspaceMap(ids?: string[], tx: Tx = this.prisma) {
    const rows = await tx.cityWorkspace.findMany({ where: { cityCode: { startsWith: '37' }, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, cityCode: true, cityName: true, organizationId: true, status: true } });
    return new Map(rows.map((row) => [row.id, row]));
  }
  private async decorateRows<T extends { workspaceId: string }>(rows: T[]) {
    const workspaces = await this.workspaceMap([...new Set(rows.map((row) => row.workspaceId))]);
    return rows.map((row) => ({ ...row, cityName: workspaces.get(row.workspaceId)?.cityName ?? '已归档地市', cityCode: workspaces.get(row.workspaceId)?.cityCode, workspace: workspaces.get(row.workspaceId) ?? null }));
  }
  private async validateTargets(workspaceIds: string[], resourceIds: string[], kind: string, tx: Tx = this.prisma) {
    if (!workspaceIds.length || new Set(workspaceIds).size !== workspaceIds.length) throw new BadRequestException('请选择不重复的承接地市');
    if (kind === 'CROSS_CITY' && workspaceIds.length < 2) throw new BadRequestException('跨市协同至少需要两个承接地市');
    const workspaces = await this.workspaceMap(workspaceIds, tx);
    if (workspaces.size !== workspaceIds.length || [...workspaces.values()].some((row) => row.status === 'PENDING_ACTIVATION')) throw new BadRequestException('承接地市不存在、未激活或不在授权范围内');
    if (new Set(resourceIds).size !== resourceIds.length) throw new BadRequestException('保障资源不能重复选择');
    if (resourceIds.length) {
      const count = await tx.provinceResource.count({ where: { id: { in: resourceIds }, workspaceId: { in: workspaceIds } } });
      if (count !== resourceIds.length) throw new BadRequestException('所选资源不存在或不属于承接地市');
    }
  }
  private assertDeadline(value?: string | null) { if (value && new Date(value) <= new Date()) throw new BadRequestException('办理期限应晚于当前时间'); }
  private async relatedScope(workspaceIds?: string[], tx: Tx = this.prisma) {
    const workspaces = await this.workspaceMap(workspaceIds, tx);
    if (workspaceIds?.some(id => !workspaces.has(id))) throw new BadRequestException('责任地市不在山东监管范围');
    const organizations = await tx.organization.findMany({ where: { workspaceId: { in: [...workspaces.keys()] } }, select: { id: true, workspaceId: true } });
    const ids = [...new Set([...organizations.map(row => row.id), ...[...workspaces.values()].map(row => row.organizationId)])];
    const cityFor = (id: string) => [...workspaces.values()].find(city => city.organizationId === id || organizations.some(org => org.id === id && org.workspaceId === city.id));
    return { ids, cityFor };
  }
  private relatedPermission(type: string) { return ({ VEHICLE: 'archive:vehicle:read', ALERT: 'safety:alert:read', ACCIDENT: 'safety:accident:read' } as Record<string, string>)[type]; }
  async relatedOptions(user: AuthUser, query: RelatedMatterQueryDto) {
    this.province(user);
    if (!this.relatedPermission(query.type) || !user.permissions.includes(this.relatedPermission(query.type))) throw new ForbiddenException('当前账号没有关联资料的查询权限');
    const scope = await this.relatedScope(query.workspaceIds), organizationId = { in: scope.ids }, q = query.q?.trim();
    const rows = query.type === 'VEHICLE'
      ? await this.prisma.vehicle.findMany({ where: { deletedAt: null, organizationId, OR: q ? [{ businessNo: { contains: q } }, { unifiedCode: { contains: q } }, { vin: { contains: q } }, { enterprise: { name: { contains: q } } }] : undefined }, select: { id: true, businessNo: true, name: true, organizationId: true }, orderBy: { updatedAt: 'desc' }, take: 30 })
      : query.type === 'ALERT'
        ? await this.prisma.safetyAlert.findMany({ where: { organizationId, OR: q ? [{ businessNo: { contains: q } }, { title: { contains: q } }, { vehicle: { businessNo: { contains: q } } }] : undefined }, select: { id: true, businessNo: true, title: true, organizationId: true }, orderBy: { occurredAt: 'desc' }, take: 30 })
        : await this.prisma.accident.findMany({ where: { organizationId, OR: q ? [{ businessNo: { contains: q } }, { title: { contains: q } }, { vehicle: { businessNo: { contains: q } } }] : undefined }, select: { id: true, businessNo: true, title: true, organizationId: true }, orderBy: { occurredAt: 'desc' }, take: 30 });
    return { items: rows.map(row => ({ id: row.id, type: query.type, businessNo: row.businessNo, title: 'title' in row ? row.title : row.name, workspaceId: scope.cityFor(row.organizationId)?.id, cityName: scope.cityFor(row.organizationId)?.cityName })) };
  }
  private async relatedRecord(user: AuthUser, type?: string | null, id?: string | null, workspaceIds?: string[], strict = false, tx: Tx = this.prisma) {
    if (!type && !id) return null;
    const permission = type ? this.relatedPermission(type) : undefined;
    if (!type || !id || !permission) { if (strict) throw new BadRequestException('请选择完整的关联资料类型和记录'); return null; }
    if (!user.permissions.includes(permission)) { if (strict) throw new ForbiddenException('当前账号没有关联资料的查询权限'); return null; }
    const scope = await this.relatedScope(workspaceIds, tx), where = { id, organizationId: { in: scope.ids } };
    const row = type === 'VEHICLE' ? await tx.vehicle.findFirst({ where: { ...where, deletedAt: null }, select: { id: true, businessNo: true, name: true, organizationId: true } }) : type === 'ALERT' ? await tx.safetyAlert.findFirst({ where, select: { id: true, businessNo: true, title: true, organizationId: true } }) : await tx.accident.findFirst({ where, select: { id: true, businessNo: true, title: true, organizationId: true } });
    if (!row) { if (strict) throw new BadRequestException('关联记录不存在或不属于责任地市'); return null; }
    return { id: row.id, type, businessNo: row.businessNo, title: 'title' in row ? row.title : row.name, cityName: scope.cityFor(row.organizationId)?.cityName };
  }
  private validateConfig(data: { kind: string; template?: string; leadWorkspaceId?: string | null; checklist?: any[]; dueAt?: string | Date | null; relatedType?: string | null; relatedId?: string | null }, workspaceIds: string[], resourceIds: string[]) {
    const template = data.template || 'STANDARD';
    if (data.kind === 'CROSS_CITY' && (!data.leadWorkspaceId || !workspaceIds.includes(data.leadWorkspaceId))) throw new BadRequestException('跨市协同需从责任地市中指定牵头市');
    if (data.kind !== 'EMERGENCY' && resourceIds.length) throw new BadRequestException('仅应急统筹事项可以关联保障资源');
    if (template === 'SPECIAL_INSPECTION' && data.kind !== 'SUPERVISION') throw new BadRequestException('专项排查模板用于督办任务');
    if (template === 'SPECIAL_INSPECTION' && !data.dueAt) throw new BadRequestException('专项排查需明确完成期限');
    const checklist = template === 'SPECIAL_INSPECTION' ? validateChecklist(data.checklist) : [];
    if (!!data.relatedId !== !!data.relatedType) throw new BadRequestException('关联资料类型与记录应同时填写');
    return { template, leadWorkspaceId: data.kind === 'CROSS_CITY' ? data.leadWorkspaceId : null, checklistJson: JSON.stringify(checklist), relatedType: data.relatedType || null, relatedId: data.relatedId || null };
  }
  private async matterView(item: ProvinceMatter & { assignments: any[] }, user?: AuthUser) {
    const { resourceIdsJson, logsJson, checklistJson, assignments: rawAssignments, ...value } = item;
    const resourceIds = this.parse<string[]>(resourceIdsJson, []);
    const assignments = (await this.decorateRows(rawAssignments)).map(({ reportJson, ...row }) => ({ ...row, role: item.kind === 'CROSS_CITY' && item.leadWorkspaceId ? row.workspaceId === item.leadWorkspaceId ? 'LEAD' : 'SUPPORT' : 'PARTICIPANT', report: readInspectionReport(reportJson) }));
    return { ...value, assignments, checklist: readChecklist(checklistJson), inspectionSummary: item.template === 'SPECIAL_INSPECTION' ? inspectionSummary(rawAssignments) : null, related: user ? await this.relatedRecord(user, item.relatedType, item.relatedId) : null, resourceIds, resources: resourceIds.length ? await this.decorateRows(await this.prisma.provinceResource.findMany({ where: { id: { in: resourceIds } } })) : [], logs: this.parse(logsJson, []) };
  }
  async options(user: AuthUser) {
    this.province(user);
    return { workspaces: [...(await this.workspaceMap()).values()], resources: await this.decorateRows(await this.prisma.provinceResource.findMany({ orderBy: [{ workspaceId: 'asc' }, { name: 'asc' }] })), kinds: Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })) };
  }
  async overview(user: AuthUser) {
    this.province(user);
    const workspaces = [...(await this.workspaceMap()).values()];
    const cities = await Promise.all(workspaces.map(async (workspace) => {
      const organizations = await this.prisma.organization.findMany({ where: { workspaceId: workspace.id }, select: { id: true } });
      const ids = [...new Set([workspace.organizationId, ...organizations.map((row) => row.id)])];
      const [vehicles, enterprises, onlineVehicles, openMatters] = await Promise.all([
        this.prisma.vehicle.count({ where: { organizationId: { in: ids }, deletedAt: null } }), this.prisma.enterprise.count({ where: { organizationId: { in: ids } } }),
        this.prisma.vehicle.count({ where: { organizationId: { in: ids }, deletedAt: null, onlineStatus: 'ONLINE' } }),
        this.prisma.provinceAssignment.count({ where: { workspaceId: workspace.id, status: { not: 'CLOSED' }, matter: { status: { not: 'DRAFT' } } } }),
      ]);
      return { ...workspace, vehicles, enterprises, onlineVehicles, openMatters };
    }));
    const [pendingActivation, openMatters, overdueMatters, tasks, risks] = await Promise.all([
      this.prisma.cityWorkspace.count({ where: { status: 'PENDING_ACTIVATION' } }), this.prisma.provinceMatter.count({ where: { status: { notIn: ['DRAFT', 'CLOSED'] } } }), this.prisma.provinceMatter.count({ where: { status: { notIn: ['DRAFT', 'CLOSED'] }, dueAt: { lt: new Date() } } }),
      this.prisma.provinceMatter.findMany({ where: { status: { notIn: ['DRAFT', 'CLOSED'] } }, orderBy: { updatedAt: 'desc' }, take: 6, include: { assignments: true } }), this.prisma.safetyAlert.findMany({ where: { status: { not: 'CLOSED' }, level: { in: ['HIGH', 'CRITICAL'] } }, orderBy: { occurredAt: 'desc' }, take: 6, select: { id: true, businessNo: true, title: true, level: true, occurredAt: true, status: true, organization: { select: { name: true } } } }),
    ]);
    return { summary: { cities: cities.length, vehicles: cities.reduce((sum, row) => sum + row.vehicles, 0), enterprises: cities.reduce((sum, row) => sum + row.enterprises, 0), pendingActivation, openMatters, overdueMatters }, cities, tasks: await Promise.all(tasks.map((row) => this.matterView(row, user))), risks };
  }
  async matters(user: AuthUser, query: MatterQueryDto) {
    this.province(user);
    const dueFrom = query.dueFrom ? new Date(query.dueFrom.length === 10 ? `${query.dueFrom}T00:00:00+08:00` : query.dueFrom) : undefined, dueTo = query.dueTo ? new Date(query.dueTo.length === 10 ? `${query.dueTo}T23:59:59.999+08:00` : query.dueTo) : undefined;
    if (dueFrom && dueTo && dueFrom > dueTo) throw new BadRequestException('截止日期范围的开始不能晚于结束');
    const createdAt = query.createdMonth ? { gte: new Date(`${query.createdMonth}-01T00:00:00+08:00`), lt: new Date(Date.UTC(Number(query.createdMonth.slice(0, 4)), Number(query.createdMonth.slice(5)), 1) - 8 * 3600000) } : undefined;
    const base: Prisma.ProvinceMatterWhereInput = { kind: query.kind, template: query.template, status: query.status, dueAt: dueFrom || dueTo ? { gte: dueFrom, lte: dueTo } : undefined, assignments: query.workspaceId ? { some: { workspaceId: query.workspaceId } } : undefined, OR: query.q ? [{ businessNo: { contains: query.q } }, { title: { contains: query.q } }, { description: { contains: query.q } }, { basis: { contains: query.q } }] : undefined };
    const bucket = (key?: string): Prisma.ProvinceMatterWhereInput => key === 'OVERDUE' ? { status: { notIn: ['DRAFT', 'CLOSED'] }, dueAt: { lt: new Date() } } : ['WAITING', 'PROCESSING', 'REVIEW'].includes(key || '') ? { status: { not: 'DRAFT' }, assignments: { some: { workspaceId: query.workspaceId, status: key === 'REVIEW' ? 'SUBMITTED' : key === 'PROCESSING' ? 'PROCESSING' : 'WAITING' } } } : {};
    const where = { AND: [base, { createdAt }, bucket(query.bucket)] };
    const [total, rows, counts] = await Promise.all([this.prisma.provinceMatter.count({ where }), this.prisma.provinceMatter.findMany({ where, ...this.page(query), orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], include: { assignments: true } }), Promise.all(['ALL', 'WAITING', 'PROCESSING', 'REVIEW', 'OVERDUE'].map(async key => [key, await this.prisma.provinceMatter.count({ where: { AND: [base, { createdAt }, bucket(key)] } })])).then(Object.fromEntries)]);
    return { total, counts, page: query.page, pageSize: query.pageSize, items: await Promise.all(rows.map(row => this.matterView(row, user))) };
  }
  async matter(user: AuthUser, id: string) {
    this.province(user);
    const item = await this.prisma.provinceMatter.findUnique({ where: { id }, include: { assignments: true } });
    if (!item) throw new NotFoundException('省级协同事项不存在');
    return this.matterView(item, user);
  }
  async createMatter(user: AuthUser, dto: CreateProvinceMatterDto) {
    this.province(user, true); this.assertDeadline(dto.dueAt);
    await this.validateTargets(dto.workspaceIds, dto.resourceIds ?? [], dto.kind);
    const config = this.validateConfig(dto, dto.workspaceIds, dto.resourceIds ?? []);
    await this.relatedRecord(user, config.relatedType, config.relatedId, dto.workspaceIds, true);
    const { workspaceIds, resourceIds, dueAt, checklist: _checklist, ...data } = dto;
    const item = await this.prisma.provinceMatter.create({ data: { ...data, ...config, businessNo: this.no(), dueAt: dueAt ? new Date(dueAt) : null, resourceIdsJson: JSON.stringify(resourceIds ?? []), createdById: user.id, createdByName: user.displayName, logsJson: this.log('[]', 'CREATE', user, { comment: '建立省级协同事项草稿' }), assignments: { create: workspaceIds.map(workspaceId => ({ workspaceId })) } }, include: { assignments: true } });
    await this.audit(user, 'provinceMatter', item.id, 'CREATE', { kind: dto.kind, workspaceIds }); return this.matterView(item, user);
  }
  async updateMatter(user: AuthUser, id: string, dto: UpdateProvinceMatterDto) {
    this.province(user, true); this.assertDeadline(dto.dueAt);
    return this.serial(`matter:${id}`, async () => {
      const item = await this.prisma.$transaction(async tx => {
        const current = await tx.provinceMatter.findUnique({ where: { id }, include: { assignments: true } });
        if (!current) throw new NotFoundException('省级协同事项不存在');
        if (current.status !== 'DRAFT') throw new BadRequestException('仅草稿可以修改，已派发事项请通过反馈和复核处理');
        const workspaceIds = dto.workspaceIds ?? current.assignments.map(row => row.workspaceId), resourceIds = dto.resourceIds ?? this.parse<string[]>(current.resourceIdsJson, []);
        const changes = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
        const merged = { ...current, ...changes, checklist: dto.checklist ?? readChecklist(current.checklistJson) };
        await this.validateTargets(workspaceIds, resourceIds, merged.kind, tx);
        const config = this.validateConfig(merged, workspaceIds, resourceIds);
        await this.relatedRecord(user, config.relatedType, config.relatedId, workspaceIds, true, tx);
        const { workspaceIds: _ids, resourceIds: _resources, dueAt, checklist: _checklist, ...data } = dto;
        return tx.provinceMatter.update({ where: { id, status: 'DRAFT' }, data: { ...data, ...config, dueAt: dueAt === null ? null : dueAt ? new Date(dueAt) : undefined, resourceIdsJson: JSON.stringify(resourceIds), logsJson: this.log(current.logsJson, 'UPDATE', user, { comment: '更新事项草稿' }), assignments: dto.workspaceIds ? { deleteMany: {}, create: workspaceIds.map(workspaceId => ({ workspaceId })) } : undefined }, include: { assignments: true } });
      });
      await this.audit(user, 'provinceMatter', id, 'UPDATE', { title: item.title }); return this.matterView(item, user);
    });
  }
  private matterStatus(assignments: Array<{ status: string }>) { return assignments.every((row) => row.status === 'CLOSED') ? 'CLOSED' : assignments.every((row) => ['SUBMITTED', 'CLOSED'].includes(row.status)) ? 'PENDING_REVIEW' : assignments.some((row) => row.status !== 'WAITING') ? 'RESPONDING' : 'DISPATCHED'; }
  async actMatter(user: AuthUser, id: string, dto: ProvinceMatterActionDto) {
    this.province(user, true);
    return this.serial(`matter:${id}`, async () => {
      const result = await this.prisma.$transaction(async (tx) => {
        const current = await tx.provinceMatter.findUnique({ where: { id }, include: { assignments: true } }); if (!current) throw new NotFoundException('省级协同事项不存在');
        if (current.status === 'CLOSED') throw new BadRequestException('该事项已办结');
        const resourceIds = this.parse<string[]>(current.resourceIdsJson, []);
        if (dto.action === 'DISPATCH') {
          if (current.status !== 'DRAFT') throw new BadRequestException('仅草稿可以派发');
          if (current.dueAt && current.dueAt <= new Date()) throw new BadRequestException('请先调整已过期的办理期限');
          await this.validateTargets(current.assignments.map(row => row.workspaceId), resourceIds, current.kind, tx);
          this.validateConfig({ ...current, checklist: readChecklist(current.checklistJson) }, current.assignments.map(row => row.workspaceId), resourceIds);
          await this.relatedRecord(user, current.relatedType, current.relatedId, current.assignments.map(row => row.workspaceId), true, tx);
          if (resourceIds.length) {
            const reserved = await tx.provinceResource.updateMany({ where: { id: { in: resourceIds }, status: 'AVAILABLE' }, data: { status: 'BUSY' } });
            if (reserved.count !== resourceIds.length) throw new ConflictException('部分保障资源当前不可用，请刷新资源状态后调整草稿');
          }
          const value = await tx.provinceMatter.update({ where: { id, status: 'DRAFT' }, data: { status: 'DISPATCHED', logsJson: this.log(current.logsJson, 'DISPATCH', user, { comment: dto.comment }) }, include: { assignments: true } });
          for (const assignment of current.assignments) await tx.workspaceNotice.create({ data: { workspaceId: assignment.workspaceId, title: `${KIND_LABELS[current.kind as keyof typeof KIND_LABELS]}待响应`, content: `${current.businessNo} ${current.title}` } });
          return value;
        }
        if (current.status === 'DRAFT') throw new BadRequestException('事项尚未派发，不能复核或办结');
        const targets = dto.workspaceId ? current.assignments.filter((row) => row.workspaceId === dto.workspaceId) : current.assignments.filter((row) => row.status !== 'CLOSED');
        if (!targets.length) throw new BadRequestException('承接地市不存在或已办结');
        if (dto.action === 'RETURN' && !dto.workspaceId && targets.length !== 1) throw new BadRequestException('请指定需要退回的地市');
        if (targets.some((row) => row.status !== 'SUBMITTED')) throw new BadRequestException('只能复核已提交反馈的地市，不能直接办结未反馈事项');
        for (const assignment of targets) {
          await tx.provinceAssignment.update({ where: { id: assignment.id, status: 'SUBMITTED' }, data: { status: dto.action === 'RETURN' ? 'PROCESSING' : 'CLOSED', reviewComment: dto.comment, closedAt: dto.action === 'CLOSE' ? new Date() : null } });
          await tx.workspaceNotice.create({ data: { workspaceId: assignment.workspaceId, title: dto.action === 'RETURN' ? '省级事项反馈已退回' : '省级事项已复核办结', content: `${current.businessNo}：${dto.comment}` } });
        }
        const assignments = await tx.provinceAssignment.findMany({ where: { matterId: id } }); const status = this.matterStatus(assignments);
        if (status === 'CLOSED' && resourceIds.length) {
          for (const resourceId of resourceIds) {
            const other = await tx.provinceMatter.count({ where: { id: { not: id }, status: { notIn: ['DRAFT', 'CLOSED'] }, resourceIdsJson: { contains: `"${resourceId}"` } } });
            if (!other) await tx.provinceResource.updateMany({ where: { id: resourceId, status: 'BUSY' }, data: { status: 'AVAILABLE' } });
          }
        }
        return tx.provinceMatter.update({ where: { id }, data: { status, logsJson: this.log(current.logsJson, dto.action, user, { workspaceId: dto.workspaceId, comment: dto.comment }) }, include: { assignments: true } });
      });
      await this.audit(user, 'provinceMatter', id, dto.action, { workspaceId: dto.workspaceId, comment: dto.comment }); return this.matterView(result, user);
    });
  }
  private safeCityMatter(matter: ProvinceMatter, workspaceId: string) {
    const { id, businessNo, kind, title, description, level, status, dueAt, basis, createdByName, createdAt, updatedAt, template } = matter;
    const logs = this.parse<any[]>(matter.logsJson, []).filter((entry) => entry.workspaceId === workspaceId || (!entry.workspaceId && ['CREATE', 'UPDATE', 'DISPATCH'].includes(entry.action))).map(({ actorId: _actorId, ...entry }) => entry);
    // Whitelist the shared task brief rather than spreading a relation object:
    // future includes must not accidentally expose sibling feedback/resources.
    return { id, businessNo, kind, title, description, level, status, dueAt, basis, createdByName, createdAt, updatedAt, template: template || 'STANDARD', checklist: readChecklist(matter.checklistJson), role: matter.kind === 'CROSS_CITY' && matter.leadWorkspaceId ? matter.leadWorkspaceId === workspaceId ? 'LEAD' : 'SUPPORT' : 'PARTICIPANT', logs };
  }
  async cityTasks(user: AuthUser, query: OversightQueryDto) {
    const workspaceId = this.city(user);
    const where: Prisma.ProvinceAssignmentWhereInput = { workspaceId, status: query.status, matter: { status: { not: 'DRAFT' }, kind: query.kind, OR: query.q ? [{ title: { contains: query.q } }, { businessNo: { contains: query.q } }] : undefined } };
    const [total, rows] = await this.prisma.$transaction([this.prisma.provinceAssignment.count({ where }), this.prisma.provinceAssignment.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' }, include: { matter: true } })]);
    return { total, page: query.page, pageSize: query.pageSize, items: rows.map(({ matter, reportJson, ...assignment }) => ({ ...assignment, report: readInspectionReport(reportJson), matter: this.safeCityMatter(matter, workspaceId) })) };
  }
  async cityTask(user: AuthUser, id: string) {
    const workspaceId = this.city(user);
    const item = await this.prisma.provinceAssignment.findFirst({ where: { id, workspaceId, matter: { status: { not: 'DRAFT' } } }, include: { matter: true } });
    if (!item) throw new NotFoundException('该事项不存在或未分派至本市');
    const { matter, reportJson, ...assignment } = item; return { ...assignment, report: readInspectionReport(reportJson), matter: this.safeCityMatter(matter, workspaceId) };
  }
  async actCityTask(user: AuthUser, id: string, dto: CityTaskActionDto) {
    const workspaceId = this.city(user, true);
    if (dto.action === 'SUBMIT' && (!dto.feedback || dto.feedback.trim().length < 5)) throw new BadRequestException('提交反馈时请填写至少5个字的办理结果');
    const found = await this.prisma.provinceAssignment.findFirst({ where: { id, workspaceId }, select: { matterId: true } }); if (!found) throw new NotFoundException('该事项不存在或未分派至本市');
    return this.serial(`matter:${found.matterId}`, async () => {
      await this.prisma.$transaction(async (tx) => {
        const item = await tx.provinceAssignment.findFirst({ where: { id, workspaceId }, include: { matter: true } });
        if (!item || ['DRAFT', 'CLOSED'].includes(item.matter.status)) throw new BadRequestException('当前事项尚未派发或已办结');
        const report = dto.action === 'SUBMIT' && item.matter.template === 'SPECIAL_INSPECTION' ? validateInspectionReport(dto.report, readChecklist(item.matter.checklistJson)) : null;
        if (dto.action === 'SUBMIT' && dto.report && item.matter.template !== 'SPECIAL_INSPECTION') throw new BadRequestException('当前事项不需要专项排查统计，请填写办理反馈');
        const expected = dto.action === 'RESPOND' ? 'WAITING' : 'PROCESSING';
        if (item.status !== expected) throw new ConflictException(dto.action === 'RESPOND' ? '该事项已响应或已处理，请刷新查看' : '请先响应事项，且不能重复提交反馈');
        await tx.provinceAssignment.update({ where: { id, workspaceId, status: expected }, data: { status: dto.action === 'RESPOND' ? 'PROCESSING' : 'SUBMITTED', feedback: dto.feedback, evidenceNote: dto.evidenceNote, reportJson: report ? JSON.stringify(report) : undefined, respondedAt: dto.action === 'RESPOND' ? new Date() : undefined, submittedAt: dto.action === 'SUBMIT' ? new Date() : undefined, reviewComment: dto.action === 'SUBMIT' ? null : undefined } });
        // The verified city may update its own assignment only. Parent state needs
        // all sibling STATES, not sibling records: scoped findMany would otherwise
        // report only this city's status and prematurely mark a cross-city matter
        // ready for review. This parameterized aggregate exposes no city data.
        const assignments = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`SELECT DISTINCT "status" FROM "ProvinceAssignment" WHERE "matterId" = ${item.matterId}`);
        await tx.provinceMatter.update({ where: { id: item.matterId }, data: { status: this.matterStatus(assignments), logsJson: this.log(item.matter.logsJson, dto.action, user, { workspaceId, comment: dto.action === 'SUBMIT' ? dto.feedback : '属地已响应' }) } });
        if (dto.action === 'SUBMIT') await tx.workspaceNotice.create({ data: { workspaceId: null, title: '地市协同反馈待复核', content: `${item.matter.businessNo} 已收到属地反馈` } });
      });
      await this.audit(user, 'provinceAssignment', id, dto.action, { workspaceId, matterId: found.matterId }); return this.cityTask(user, id);
    });
  }
  // Deferred pilot workflow is retained internally; no public route exposes it.
  async pilots(user: AuthUser, query: OversightQueryDto) {
    this.province(user);
    const cityRows = query.q ? [...(await this.workspaceMap()).values()].filter((row) => row.cityName.includes(query.q!)).map((row) => row.id) : [];
    const where: Prisma.ProvincePilotWhereInput = { workspaceId: query.workspaceId, stage: query.status, OR: query.q ? [{ responsibleName: { contains: query.q } }, { summary: { contains: query.q } }, { workspaceId: { in: cityRows } }] : undefined };
    const [total, rows] = await this.prisma.$transaction([this.prisma.provincePilot.count({ where }), this.prisma.provincePilot.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' } })]);
    return { total, page: query.page, pageSize: query.pageSize, items: await this.decorateRows(rows.map(({ logsJson, ...row }) => ({ ...row, logs: this.parse(logsJson, []) }))) };
  }
  async upsertPilot(user: AuthUser, dto: UpsertPilotDto) {
    this.province(user, true); await this.workspace(dto.workspaceId);
    if (dto.stage === 'RECTIFYING' && !dto.reviewComment?.trim()) throw new BadRequestException('退回整改时请填写审核意见');
    const result = await this.serial(`pilot:${dto.workspaceId}`, () => this.prisma.$transaction(async (tx) => {
      const current = await tx.provincePilot.findUnique({ where: { workspaceId: dto.workspaceId } });
      const transitions: Record<string, string[]> = { PREPARING: ['SUBMITTED'], SUBMITTED: ['REVIEWING', 'RECTIFYING'], REVIEWING: ['RECTIFYING', 'ACCEPTED'], RECTIFYING: ['SUBMITTED', 'REVIEWING'], ACCEPTED: ['OPERATING', 'RECTIFYING'], OPERATING: ['RECTIFYING'] };
      if (current && current.stage !== dto.stage && !transitions[current.stage]?.includes(dto.stage)) throw new BadRequestException('当前试点阶段不支持该流转，请按申报、审核、整改、验收顺序办理');
      const { planDate, ...data } = dto;
      const logsJson = this.log(current?.logsJson ?? '[]', 'UPDATE_STAGE', user, { previousStage: current?.stage ?? null, stage: dto.stage, comment: dto.reviewComment ?? dto.summary });
      return tx.provincePilot.upsert({ where: { workspaceId: dto.workspaceId }, create: { ...data, planDate: planDate ? new Date(planDate) : null, logsJson }, update: { ...data, planDate: planDate === null ? null : planDate ? new Date(planDate) : undefined, logsJson } });
    }));
    await this.audit(user, 'provincePilot', result.id, 'UPDATE_STAGE', { workspaceId: dto.workspaceId, stage: dto.stage });
    return (await this.decorateRows([{ ...result, logs: this.parse(result.logsJson, []), logsJson: undefined }]))[0];
  }
  async resources(user: AuthUser, query: OversightQueryDto) {
    this.province(user);
    const where: Prisma.ProvinceResourceWhereInput = { workspaceId: query.workspaceId, kind: query.kind, status: query.status, OR: query.q ? [{ name: { contains: query.q } }, { conditions: { contains: query.q } }] : undefined };
    const [total, rows] = await this.prisma.$transaction([this.prisma.provinceResource.count({ where }), this.prisma.provinceResource.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' } })]);
    return { total, page: query.page, pageSize: query.pageSize, items: await this.decorateRows(rows) };
  }
  async createResource(user: AuthUser, dto: CreateResourceDto) {
    this.province(user, true); await this.workspace(dto.workspaceId);
    const item = await this.prisma.provinceResource.create({ data: dto }); await this.audit(user, 'provinceResource', item.id, 'CREATE', { workspaceId: dto.workspaceId, kind: dto.kind }); return (await this.decorateRows([item]))[0];
  }
  async updateResource(user: AuthUser, id: string, dto: UpdateResourceDto) {
    this.province(user, true);
    const item = await this.prisma.$transaction(async (tx) => {
      const current = await tx.provinceResource.findUnique({ where: { id } }); if (!current) throw new NotFoundException('保障资源不存在');
      if (dto.workspaceId) await this.workspace(dto.workspaceId, tx);
      const occupied = await tx.provinceMatter.count({ where: { status: { notIn: ['DRAFT', 'CLOSED'] }, resourceIdsJson: { contains: `"${id}"` } } });
      if (occupied && ((dto.workspaceId && dto.workspaceId !== current.workspaceId) || (dto.status && dto.status !== 'BUSY'))) throw new ConflictException('该资源正在保障任务中，办结后方可调整归属或可用状态');
      return tx.provinceResource.update({ where: { id }, data: dto });
    });
    await this.audit(user, 'provinceResource', id, 'UPDATE', { workspaceId: item.workspaceId }); return (await this.decorateRows([item]))[0];
  }
  async evaluations(user: AuthUser, query: OversightQueryDto) {
    const isProvince = user.accountLevel === 'PROVINCE'; if (isProvince) this.province(user); else this.city(user);
    const where: Prisma.ProvinceDutyEvaluationWhereInput = { workspaceId: isProvince ? query.workspaceId : user.workspaceId!, status: isProvince ? query.status : 'PUBLISHED', period: query.period, conclusion: query.q ? { contains: query.q } : undefined };
    const [total, rows] = await this.prisma.$transaction([this.prisma.provinceDutyEvaluation.count({ where }), this.prisma.provinceDutyEvaluation.findMany({ where, ...this.page(query), orderBy: [{ period: 'desc' }, { score: 'desc' }] })]);
    return { total, page: query.page, pageSize: query.pageSize, items: await this.decorateRows(rows.map(({ breakdownJson, ...row }) => ({ ...row, breakdown: this.parse(breakdownJson, {}) }))) };
  }
  async generateEvaluations(user: AuthUser, dto: GenerateDutyEvaluationDto) {
    this.province(user, true);
    const [year, month] = dto.period.split('-').map(Number); const start = new Date(Date.UTC(year, month - 1, 1) - 8 * 3600000); const end = new Date(Date.UTC(year, month, 1) - 8 * 3600000);
    if (start > new Date()) throw new BadRequestException('不能生成尚未开始月份的履责评价');
    return this.serial(`evaluations:${dto.period}`, async () => {
      const workspaces = [...(await this.workspaceMap()).values()].filter((row) => row.status === 'ACTIVE'); let skipped = 0; const items: any[] = [];
      for (const workspace of workspaces) {
        const existing = await this.prisma.provinceDutyEvaluation.findUnique({ where: { workspaceId_period: { workspaceId: workspace.id, period: dto.period } } });
        if (existing?.status === 'PUBLISHED') { skipped++; continue; }
        const organizations = await this.prisma.organization.findMany({ where: { workspaceId: workspace.id }, select: { id: true } }); const ids = [...new Set([workspace.organizationId, ...organizations.map((row) => row.id)])]; const asOf = new Date(Math.min(Date.now(), end.getTime() - 1));
        const [enterprises, vehicles, daily, obligations] = await Promise.all([
          this.prisma.enterprise.findMany({ where: { organizationId: { in: ids }, status: 'ACTIVE' }, select: { id: true } }), this.prisma.vehicle.findMany({ where: { organizationId: { in: ids }, deletedAt: null }, select: { id: true, enterpriseId: true, licenses: { select: { status: true, issuedAt: true, expiresAt: true } }, realtimeStatus: { select: { heartbeatAt: true } } } }),
          this.prisma.vehicleOnlineDaily.findMany({ where: { vehicle: { organizationId: { in: ids } }, metricDate: { gte: start, lt: end } }, select: { onlineRate: true } }), this.prisma.provinceAssignment.findMany({ where: { workspaceId: workspace.id, matter: { status: { not: 'DRAFT' }, dueAt: { gte: start, lte: asOf } } }, select: { status: true, submittedAt: true, matter: { select: { dueAt: true } } } }),
        ]);
        const ratio = (value: number, total: number, empty = 0) => total ? Math.round(value / total * 1000) / 10 : empty;
        const enterpriseScore = ratio(enterprises.filter((row) => vehicles.some((vehicle) => vehicle.enterpriseId === row.id)).length, enterprises.length);
        const licenseScore = ratio(vehicles.filter((vehicle) => vehicle.licenses.some((license) => ['VALID', 'EXPIRING'].includes(license.status) && license.issuedAt <= asOf && license.expiresAt >= asOf)).length, vehicles.length);
        const currentPeriod = end > new Date();
        const dataScore = currentPeriod ? ratio(vehicles.filter((vehicle) => vehicle.realtimeStatus && vehicle.realtimeStatus.heartbeatAt >= new Date(Date.now() - 10 * 60000) && vehicle.realtimeStatus.heartbeatAt <= new Date(Date.now() + 60000)).length, vehicles.length) : daily.length ? Math.round(daily.reduce((sum, row) => sum + row.onlineRate, 0) / daily.length * 10) / 10 : 0;
        const receiptScore = ratio(obligations.filter((row) => !!row.submittedAt && !!row.matter.dueAt && row.submittedAt <= row.matter.dueAt && ['SUBMITTED', 'CLOSED'].includes(row.status)).length, obligations.length, 100);
        const indicators = [
          { key: 'enterpriseCoverage', name: '企业建档运行覆盖率', value: enterpriseScore, score: enterpriseScore, weight: 0.2, definition: '具有在档车辆的有效企业数/有效企业总数；无有效企业计0分' },
          { key: 'licenseValidity', name: '车辆许可有效率', value: licenseScore, score: licenseScore, weight: 0.3, definition: '统计截止时许可有效车辆数/在档车辆总数；无在档车辆计0分' },
          { key: 'dataTimeliness', name: '运行数据时效率', value: dataScore, score: dataScore, weight: 0.25, definition: currentPeriod ? '生成时心跳在10分钟内且不晚于未来1分钟的车辆数/在档车辆数' : '历史月份使用当月车辆日在线率均值；无上报计0分' },
          { key: 'receiptFulfillment', name: '省级事项按时回执率', value: receiptScore, score: receiptScore, weight: 0.25, definition: `当期截至统计时到期事项中按时提交且已提交/办结的比例；本期到期事项${obligations.length}项，无到期事项不扣分` },
        ];
        const score = Math.round(indicators.reduce((sum, row) => sum + row.score * row.weight, 0) * 10) / 10; const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
        const data = { score, grade, breakdownJson: JSON.stringify({ indicators, generatedAt: new Date().toISOString(), periodStart: start.toISOString(), periodEnd: end.toISOString(), asOf: asOf.toISOString() }), conclusion: `${workspace.cityName}${dto.period}履责评价${score}分，等级${grade}，待省级复核发布。` };
        const item = await this.prisma.$transaction(async (tx) => {
          const fresh = await tx.provinceDutyEvaluation.findUnique({ where: { workspaceId_period: { workspaceId: workspace.id, period: dto.period } } });
          if (fresh?.status === 'PUBLISHED') return null;
          return fresh ? tx.provinceDutyEvaluation.update({ where: { id: fresh.id, status: 'DRAFT' }, data }) : tx.provinceDutyEvaluation.create({ data: { workspaceId: workspace.id, period: dto.period, ...data } });
        });
        if (item) items.push(item); else skipped++;
      }
      await this.audit(user, 'provinceDutyEvaluation', dto.period, 'GENERATE', { period: dto.period, generated: items.length, skipped });
      return { generated: items.length, skipped, items: await this.decorateRows(items.map(({ breakdownJson, ...row }) => ({ ...row, breakdown: this.parse(breakdownJson, {}) }))) };
    });
  }
  async publishEvaluation(user: AuthUser, id: string, dto: PublishDutyEvaluationDto) {
    this.province(user, true);
    const current = await this.prisma.provinceDutyEvaluation.findUnique({ where: { id } }); if (!current) throw new NotFoundException('地市履责评价不存在');
    const item = await this.serial(`evaluations:${current.period}`, () => this.prisma.$transaction(async (tx) => {
      const fresh = await tx.provinceDutyEvaluation.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== 'DRAFT') throw new ConflictException('已发布评价不能重复发布或覆盖');
      const result = await tx.provinceDutyEvaluation.update({ where: { id, status: 'DRAFT' }, data: { status: 'PUBLISHED', conclusion: dto.conclusion, publishedAt: new Date() } });
      await tx.workspaceNotice.create({ data: { workspaceId: result.workspaceId, title: '地市履责评价已发布', content: `${result.period}履责评价已发布，请查看评价结论和指标口径` } }); return result;
    }));
    await this.audit(user, 'provinceDutyEvaluation', id, 'PUBLISH', { workspaceId: item.workspaceId, period: item.period }); return (await this.decorateRows([{ ...item, breakdown: this.parse(item.breakdownJson, {}), breakdownJson: undefined }]))[0];
  }
  directory(user: AuthUser) {
    this.province(user);
    return { items: [
      { key: 'enterprises', name: '运营主体目录', source: 'Enterprise / GET /archives/enterprises', level: '内部', updatePolicy: '主体档案变更时更新', scope: '省级监管与属地授权查询', fields: ['企业标识', '企业名称', '主体状态', '属地机构'] },
      { key: 'vehicles', name: '车辆与许可目录', source: 'Vehicle、VehicleLicense / GET /archives/vehicles', level: '内部', updatePolicy: '登记、许可或主体关系变更时更新', scope: '按城市和企业业务范围查询', fields: ['车辆统一编码', 'VIN', '车型', '所属企业', '许可状态与有效期'] },
      { key: 'telemetry', name: '车辆运行数据目录', source: 'VehicleRealtimeStatus、VehicleTrackPoint / /operations', level: '敏感', updatePolicy: '实际遥测接收时更新，返回来源时间', scope: '授权监管查询，不提供公众原始轨迹', fields: ['位置', '速度', '电量', '自动驾驶状态', '采集时间', '心跳时间'] },
      { key: 'safety', name: '安全事件与整改目录', source: 'SafetyAlert、Accident、Violation、EmergencyTask / /safety', level: '敏感', updatePolicy: '事件上报、响应、反馈与复核时更新', scope: '属地办理，省级按职责查询', fields: ['事件编号', '类型等级', '发生时间', '责任主体', '处置及整改状态'] },
      { key: 'coordination', name: '省市协同事项目录', source: 'ProvinceMatter、ProvinceAssignment / /oversight/matters', level: '内部', updatePolicy: '派发、属地响应、反馈与复核时更新', scope: '省级完整过程；市级仅本市承接反馈', fields: ['事项编号', '承接地市', '办理期限', '反馈状态', '复核意见'] },
      { key: 'dutyEvaluations', name: '地市履责评价目录', source: 'ProvinceDutyEvaluation / GET /oversight/evaluations', level: '内部', updatePolicy: '按月生成、复核发布后保留版本', scope: '省级全量；市级仅本市已发布评价', fields: ['评价月份', '分值', '等级', '指标口径', '结论', '发布时间'] },
      { key: 'access', name: '城市接入与授权目录', source: 'CityWorkspace、CityApplication、AuditLog / /saas', level: '敏感', updatePolicy: '申请审核及授权变更时更新', scope: '开通管理授权人员可查；材料需独立鉴权', fields: ['城市编码', '开通状态', '功能授权', '有效期', '审核与操作记录'] },
    ], exchangeStatus: '目录及授权查询能力已建立，对外交换须另行完成接口授权与联调' };
  }
}
