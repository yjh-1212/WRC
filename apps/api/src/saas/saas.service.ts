import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { CityApplication, CityWorkspace, Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ActivateMemberDto, ApplyCityDto, ChangeRequestDto, CreateCityWorkspaceDto, CreateWorkspaceMemberDto, InviteMemberDto, MODULE_KEYS, PatchWorkspaceDto, PatchWorkspaceMemberDto, RecoverAdminDto, ResubmitApplicationDto, ReviewApplicationDto, SaasQueryDto, TrackApplicationDto } from './dto';

const CITIES = [
  ['370100', '济南市'], ['370200', '青岛市'], ['370300', '淄博市'], ['370400', '枣庄市'],
  ['370500', '东营市'], ['370600', '烟台市'], ['370700', '潍坊市'], ['370800', '济宁市'],
  ['370900', '泰安市'], ['371000', '威海市'], ['371100', '日照市'], ['371300', '临沂市'],
  ['371400', '德州市'], ['371500', '聊城市'], ['371600', '滨州市'], ['371700', '菏泽市'],
];
const MODULE_NAMES = ['监管档案', '准入与审批', '运行监管', '安全监管', '分析研判', '治理配置'];
type Actor = AuthUser & { workspaceId?: string | null; accountLevel?: string };
type Tx = Prisma.TransactionClient;
export type ApplicationUpload = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class SaasService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}
  private readonly locks = new Map<string, Promise<void>>();
  private readonly materialDirectory = resolve(__dirname, '../../../../data/saas-materials');
  private async serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => gate);
    this.locks.set(key, tail);
    await previous;
    try { return await work(); }
    finally { release(); if (this.locks.get(key) === tail) this.locks.delete(key); }
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private secret() { return randomBytes(32).toString('hex'); }
  private parse<T>(value: string, fallback: T): T { try { return JSON.parse(value); } catch { return fallback; } }
  private no() { return `CITY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(5).toString('hex').toUpperCase()}`; }
  private isProvince(user: Actor) { return user.accountLevel === 'PROVINCE'; }
  private province(user: Actor, write = false) {
    if (!this.isProvince(user) || user.portal !== 'REGULATORY') throw new ForbiddenException('仅省级业务人员可以办理地市开通与授权');
    const allowed = write ? user.permissions.includes('system:organization:update') : user.permissions.includes('system:organization:read') || user.permissions.includes('dashboard:view');
    if (!allowed) throw new ForbiddenException(write ? '当前省级账号没有开通或调整城市授权的权限' : '当前省级账号没有查看地市开通信息的权限');
  }
  private workspaceId(user: Actor) { if (!user.workspaceId || !['CITY', 'ENTERPRISE'].includes(user.accountLevel ?? '')) throw new ForbiddenException('当前账号未关联城市工作空间'); return user.workspaceId; }
  private admin(user: Actor) {
    const id = this.workspaceId(user);
    if (user.portal !== 'REGULATORY' || !user.roles.some((role) => role.code === 'CITY_ADMIN' || role.code.startsWith('CITY_ADMIN_'))) throw new ForbiddenException('仅本市管理员可以执行该操作');
    return id;
  }
  private page(query: SaasQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
  private app(item: CityApplication) {
    const { trackingHash: _hash, modulesJson, historyJson, grantJson, ...value } = item;
    return { ...value, modules: this.parse(modulesJson, []), history: this.parse(historyJson, []), grant: this.parse(grantJson, {}) };
  }
  private workspace(item: CityWorkspace) {
    const { modulesJson, quotasJson, configJson, ...value } = item;
    return { ...value, modules: this.parse(modulesJson, []), quotas: this.parse(quotasJson, {}), config: this.parse(configJson, {}), expired: !!item.validUntil && item.validUntil < new Date() };
  }
  private history(current: CityApplication, action: string, actor: string, comment?: string) {
    return JSON.stringify([...this.parse<any[]>(current.historyJson, []), { revision: current.revision, action, actor, comment, at: new Date().toISOString(), snapshot: { modules: this.parse(current.modulesJson, []), materialNote: current.materialNote, unitName: current.unitName, adminUsername: current.adminUsername } }]);
  }
  private async notice(workspaceId: string | null, title: string, content: string, tx: Tx = this.prisma) { return tx.workspaceNotice.create({ data: { workspaceId, title, content } }); }
  private audit(user: AuthUser, objectType: string, id: string, action: string, detail: unknown) { return this.auth.audit(user, 'saas', objectType, id, action, detail); }
  private verifySecret(application: CityApplication | null, secret: string) {
    if (!application || !timingSafeEqual(Buffer.from(application.trackingHash, 'hex'), Buffer.from(this.hash(secret), 'hex'))) throw new NotFoundException('申请编号或查询凭证无效');
    return application;
  }
  private assertFuture(value?: string | null) { if (value && new Date(value) <= new Date()) throw new BadRequestException('授权截止时间必须晚于当前时间'); }
  private quotas(value: Record<string, number> = {}) {
    for (const [key, amount] of Object.entries(value)) if (!['users', 'vehicles', 'enterprises'].includes(key) || !Number.isSafeInteger(amount) || amount < 0 || amount > 10000000) throw new BadRequestException('配额仅支持非负整数 users、vehicles、enterprises');
    return value;
  }
  private materialRows(applicationId: string, tx: Tx = this.prisma) {
    return tx.applicationMaterial.findMany({ where: { applicationId, deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, originalName: true, mimeType: true, size: true, revision: true, createdAt: true } });
  }
  private identifyMaterial(file: ApplicationUpload) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择需要提交的授权材料文件');
    if (file.buffer.length > 2 * 1024 * 1024 || file.size !== file.buffer.length) throw new BadRequestException('单个材料文件不能超过2MB');
    const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const originalName = (utf8Name.includes('\ufffd') ? file.originalname : utf8Name).replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 160).trim();
    const extension = extname(originalName).toLowerCase();
    const content = file.buffer;
    const pdf = content.subarray(0, 5).toString('ascii') === '%PDF-' && content.subarray(-1024).includes(Buffer.from('%%EOF'));
    const png = content.length >= 32 && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && content.subarray(-12, -8).readUInt32BE(0) === 0 && content.subarray(-8, -4).toString('ascii') === 'IEND';
    const jpg = content.length >= 4 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff && content[content.length - 2] === 0xff && content[content.length - 1] === 0xd9;
    const mimeType = pdf && extension === '.pdf' ? 'application/pdf' : png && extension === '.png' ? 'image/png' : jpg && ['.jpg', '.jpeg'].includes(extension) ? 'image/jpeg' : null;
    if (!mimeType || ![mimeType, 'application/octet-stream'].includes(file.mimetype)) throw new BadRequestException('仅支持内容与扩展名一致的PDF、PNG、JPG文件');
    return { originalName, mimeType, extension, sha256: createHash('sha256').update(content).digest('hex') };
  }
  async uploadMaterial(id: string, secret: string, file: ApplicationUpload) {
    return this.serial(`materials:${id}`, async () => {
      const current = this.verifySecret(await this.prisma.cityApplication.findUnique({ where: { id } }), secret);
      if (!['SUBMITTED', 'RETURNED'].includes(current.status)) throw new BadRequestException('当前申请状态不支持补充材料');
      const identity = this.identifyMaterial(file);
      if (await this.prisma.applicationMaterial.findFirst({ where: { applicationId: id, sha256: identity.sha256, deletedAt: null } })) return { materials: await this.materialRows(id) };
      const storageName = `${randomBytes(24).toString('hex')}${identity.extension}`;
      await mkdir(this.materialDirectory, { recursive: true });
      const filePath = resolve(this.materialDirectory, storageName);
      await writeFile(filePath, file.buffer, { flag: 'wx' });
      try {
        await this.prisma.$transaction(async (tx) => {
          const application = this.verifySecret(await tx.cityApplication.findUnique({ where: { id } }), secret);
          if (!['SUBMITTED', 'RETURNED'].includes(application.status)) throw new ConflictException('申请已进入下一办理状态，请刷新查看');
          if (await tx.applicationMaterial.count({ where: { applicationId: id, deletedAt: null } }) >= 3) throw new BadRequestException('每份申请最多保留3份有效材料，请先移除需要更正的文件');
          await tx.applicationMaterial.create({ data: { applicationId: id, originalName: identity.originalName, mimeType: identity.mimeType, size: file.buffer.length, storageName, sha256: identity.sha256, revision: application.revision + (application.status === 'RETURNED' ? 1 : 0) } });
          await tx.cityApplication.update({ where: { id }, data: { historyJson: this.history(application, 'UPLOAD_MATERIAL', application.contactName, `提交材料：${identity.originalName}`) } });
        });
      } catch (error) { await unlink(filePath).catch(() => undefined); throw error; }
      return { materials: await this.materialRows(id) };
    });
  }
  async removeMaterial(id: string, materialId: string, secret: string) {
    return this.serial(`materials:${id}`, async () => {
      await this.prisma.$transaction(async (tx) => {
        const application = this.verifySecret(await tx.cityApplication.findUnique({ where: { id } }), secret);
        if (!['SUBMITTED', 'RETURNED'].includes(application.status)) throw new BadRequestException('当前申请状态不能移除材料');
        const material = await tx.applicationMaterial.findFirst({ where: { id: materialId, applicationId: id, deletedAt: null } });
        if (!material) throw new NotFoundException('材料不存在或已被移除');
        await tx.applicationMaterial.update({ where: { id: materialId }, data: { deletedAt: new Date() } });
        await tx.cityApplication.update({ where: { id }, data: { historyJson: this.history(application, 'REMOVE_MATERIAL', application.contactName, `更正材料：${material.originalName}`) } });
      });
      return { materials: await this.materialRows(id) };
    });
  }
  private async storedMaterial(id: string, materialId: string, includeArchived = false) {
    const material = await this.prisma.applicationMaterial.findFirst({ where: { id: materialId, applicationId: id, deletedAt: includeArchived ? undefined : null } });
    if (!material || !/^[a-f0-9]{48}\.(pdf|png|jpe?g)$/.test(material.storageName)) throw new NotFoundException('材料不存在');
    let buffer: Buffer;
    try { buffer = await readFile(resolve(this.materialDirectory, material.storageName)); }
    catch { throw new NotFoundException('材料文件暂不可用，请联系平台管理员'); }
    if (buffer.length !== material.size || createHash('sha256').update(buffer).digest('hex') !== material.sha256) throw new ConflictException('材料完整性校验未通过，请联系平台管理员核验');
    return { originalName: material.originalName, mimeType: material.mimeType, buffer };
  }
  async downloadMaterial(user: Actor, id: string, materialId: string) {
    this.province(user);
    if (!await this.prisma.cityApplication.findUnique({ where: { id } })) throw new NotFoundException('申请不存在');
    const result = await this.storedMaterial(id, materialId, true);
    await this.audit(user, 'applicationMaterial', materialId, 'DOWNLOAD_MATERIAL', { applicationId: id });
    return result;
  }
  async downloadOwnMaterial(id: string, materialId: string, secret: string) {
    this.verifySecret(await this.prisma.cityApplication.findUnique({ where: { id } }), secret);
    return this.storedMaterial(id, materialId);
  }
  catalog() { return { cities: CITIES.map(([code, name]) => ({ code, name })), modules: MODULE_KEYS.map((code, index) => ({ code, name: MODULE_NAMES[index] })) }; }

  async workspaceOptions(user: Actor) {
    this.province(user);
    const workspaces = await this.prisma.cityWorkspace.findMany({ select: { cityCode: true } });
    const opened = new Set(workspaces.map((row) => row.cityCode));
    return { ...this.catalog(), cities: this.catalog().cities.map((city) => ({ ...city, opened: opened.has(city.code) })) };
  }

  async createWorkspace(user: Actor, dto: CreateCityWorkspaceDto) {
    this.province(user, true);
    const city = CITIES.find(([code]) => code === dto.cityCode);
    if (!city) throw new BadRequestException('请选择山东省所属地市');
    this.assertFuture(dto.validUntil);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.serial(`direct-city:${dto.cityCode}`, () => this.prisma.$transaction(async (tx) => {
        if (await tx.cityWorkspace.findUnique({ where: { cityCode: dto.cityCode } })) throw new ConflictException('该城市已开通，请在城市列表中调整授权');
        if (await tx.user.findUnique({ where: { username: dto.adminUsername } })) throw new ConflictException('管理员账号已存在，请更换账号名称');
        if (await tx.workspaceInvitation.findFirst({ where: { username: dto.adminUsername, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })) throw new ConflictException('该管理员账号已有有效邀请，请更换账号名称');
        const organization = await tx.organization.upsert({ where: { code: `CITY-${city[0]}` }, create: { code: `CITY-${city[0]}`, name: dto.unitName }, update: { name: dto.unitName } });
        if (organization.workspaceId) throw new ConflictException('该城市机构已关联工作空间，请核对已有城市信息');
        const workspace = await tx.cityWorkspace.create({ data: {
          cityCode: city[0], cityName: city[1], organizationId: organization.id, status: 'ACTIVE',
          modulesJson: JSON.stringify([...new Set(dto.modules)]), validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          quotasJson: JSON.stringify({ users: 100, vehicles: dto.vehicleQuota, enterprises: 100 }),
          configJson: JSON.stringify({ incidentRetentionDays: 90, timezone: 'Asia/Shanghai', openingSource: 'OFFLINE', offlineReference: dto.offlineReference ?? '', contactName: dto.contactName, contactPhone: dto.contactPhone, openedById: user.id, openedAt: new Date().toISOString() }),
        } });
        await tx.organization.update({ where: { id: organization.id }, data: { workspaceId: workspace.id } });
        const adminRole = await this.initializeWorkspace(tx, workspace);
        const administrator = await tx.user.create({ data: { username: dto.adminUsername, displayName: dto.adminName, passwordHash, phone: dto.contactPhone, status: 'ACTIVE', accountLevel: 'CITY', portal: 'REGULATORY', workspaceId: workspace.id, organizationId: organization.id, roles: { create: { roleId: adminRole.id } } }, select: { id: true, username: true, displayName: true, status: true } });
        await tx.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, roleNames: user.roles.map((role) => role.name).join(','), module: 'saas', objectType: 'cityWorkspace', objectId: workspace.id, action: 'DIRECT_OPEN', result: 'SUCCESS', detail: JSON.stringify({ cityCode: city[0], openingSource: 'OFFLINE', administratorId: administrator.id, adminUsername: dto.adminUsername, modules: dto.modules, validUntil: dto.validUntil, vehicleQuota: dto.vehicleQuota, offlineReference: dto.offlineReference ?? '' }) } });
        await this.notice(workspace.id, '本市平台已开通', '省级已根据线下申请开通本市平台，管理员可使用分配的账号和初始密码直接登录。', tx);
        return { workspace: this.workspace(workspace), administrator };
      }, { timeout: 15000 }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('城市或管理员账号已存在，请刷新后核对');
      throw error;
    }
  }

  async apply(_dto: ApplyCityDto) {
    throw new GoneException('地市开通改为线下申请，由省级管理员在城市管理中直接开通');
  }
  async track(dto: TrackApplicationDto) {
    const application = this.verifySecret(await this.prisma.cityApplication.findUnique({ where: { businessNo: dto.businessNo } }), dto.trackingSecret);
    const job = await this.prisma.provisionJob.findUnique({ where: { applicationId: application.id } });
    const workspace = application.workspaceId ? await this.prisma.cityWorkspace.findUnique({ where: { id: application.workspaceId } }) : null;
    return { ...this.app(application), materials: await this.materialRows(application.id), job: job ? { status: job.status, attempts: job.attempts, error: job.error ? '开通未完成，请联系省级管理员处理' : null } : null, workspaceStatus: workspace?.status ?? null };
  }
  async resubmit(_id: string, _dto: ResubmitApplicationDto) {
    throw new GoneException('线上开通申请已停用，请线下联系省级管理员办理');
  }
  async withdraw(id: string, secret: string) {
    const current = this.verifySecret(await this.prisma.cityApplication.findUnique({ where: { id } }), secret);
    if (!['SUBMITTED', 'RETURNED'].includes(current.status)) throw new BadRequestException('当前申请状态不支持撤回');
    return this.app(await this.prisma.cityApplication.update({ where: { id, status: current.status, revision: current.revision }, data: { status: 'WITHDRAWN', historyJson: this.history(current, 'WITHDRAW', current.contactName) } }));
  }
  async applications(user: Actor, query: SaasQueryDto) {
    this.province(user);
    const where: Prisma.CityApplicationWhereInput = { status: query.status, OR: query.q ? [{ cityName: { contains: query.q } }, { unitName: { contains: query.q } }, { businessNo: { contains: query.q } }] : undefined };
    const [total, rows] = await this.prisma.$transaction([this.prisma.cityApplication.count({ where }), this.prisma.cityApplication.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' } })]);
    const jobs = await this.prisma.provisionJob.findMany({ where: { applicationId: { in: rows.map((row) => row.id) } } });
    return { total, page: query.page, pageSize: query.pageSize, items: await Promise.all(rows.map(async (row) => ({ ...this.app(row), materials: await this.materialRows(row.id), materialHistory: await this.prisma.applicationMaterial.findMany({ where: { applicationId: row.id }, orderBy: { createdAt: 'asc' }, select: { id: true, originalName: true, mimeType: true, size: true, revision: true, deletedAt: true, createdAt: true } }), job: jobs.find((job) => job.applicationId === row.id) ?? null }))) };
  }
  async review(user: Actor, id: string, dto: ReviewApplicationDto) {
    this.province(user, true);
    return this.serial(`review:${id}`, () => this.performReview(user, id, dto));
  }
  private async performReview(user: Actor, id: string, dto: ReviewApplicationDto) {
    this.province(user, true); this.assertFuture(dto.validUntil); this.quotas(dto.quotas);
    const item = await this.prisma.$transaction(async (tx) => {
      const current = await tx.cityApplication.findUnique({ where: { id } }); if (!current) throw new NotFoundException('申请不存在');
      if (current.status !== 'SUBMITTED') throw new ConflictException('申请已被处理，请刷新后查看最新状态');
      const status = ({ APPROVE: 'APPROVED', RETURN: 'RETURNED', REJECT: 'REJECTED' } as const)[dto.action];
      const result = await tx.cityApplication.update({ where: { id, status: 'SUBMITTED', revision: current.revision }, data: { status, reviewComment: dto.comment, grantJson: dto.action === 'APPROVE' ? JSON.stringify({ modules: dto.modules ?? this.parse(current.modulesJson, []), validUntil: dto.validUntil, quotas: dto.quotas ?? {} }) : undefined, historyJson: this.history(current, dto.action, user.displayName, dto.comment) } });
      await this.notice(current.workspaceId, `申请${status === 'APPROVED' ? '已批准' : status === 'RETURNED' ? '待补正' : '已驳回'}`, `${current.businessNo}：${dto.comment}`, tx);
      return result;
    });
    await this.audit(user, 'cityApplication', id, dto.action, { cityCode: item.cityCode, workspaceId: item.workspaceId, comment: dto.comment });
    if (dto.action === 'APPROVE') return this.provision(user, id);
    return { application: this.app(item) };
  }

  private async initializeWorkspace(tx: Tx, workspace: CityWorkspace) {
    const adminRole = await this.role(tx, workspace, 'CITY_ADMIN'); await this.role(tx, workspace, 'CITY_USER');
    if (!await tx.processDefinition.count({ where: { workspaceId: workspace.id } })) {
      const templates = await tx.processDefinition.findMany({ where: { workspaceId: null, status: 'ACTIVE' }, include: { nodes: { orderBy: { orderNo: 'asc' } } }, orderBy: { version: 'desc' } });
      const copied = new Set<string>();
      for (const template of templates) {
        if (copied.has(template.applicationType)) continue;
        copied.add(template.applicationType);
        await tx.processDefinition.create({ data: { workspaceId: workspace.id, businessNo: `${template.businessNo}_${workspace.cityCode}`, code: `${template.code}_${workspace.cityCode}`, name: template.name, applicationType: template.applicationType, version: template.version, status: 'ACTIVE', description: template.description, nodes: { create: template.nodes.map((node) => ({ nodeCode: node.nodeCode, name: node.name, orderNo: node.orderNo, approvalRoleCode: adminRole.code, timeLimitHours: node.timeLimitHours, countersignMode: node.countersignMode, canReturn: node.canReturn })) } } });
      }
    }
    return adminRole;
  }

  private async role(tx: Tx, workspace: CityWorkspace, roleCode: string) {
    const code = `${roleCode}_${workspace.cityCode}`;
    let role = await tx.role.findUnique({ where: { code } });
    if (!role) {
      const permissions = await tx.permission.findMany({ where: roleCode === 'CITY_ADMIN' ? {} : { OR: [{ code: { endsWith: ':read' } }, { code: { in: ['dashboard:view', 'regulatory:access'] } }] } });
      role = await tx.role.create({ data: { code, name: roleCode === 'CITY_ADMIN' ? `${workspace.cityName}管理员` : `${workspace.cityName}工作人员`, portal: 'REGULATORY', workspaceId: workspace.id, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } } });
    }
    return role;
  }
  private async invitation(tx: Tx, workspace: CityWorkspace, dto: InviteMemberDto, recovery = false) {
    const existing = await tx.user.findUnique({ where: { username: dto.username } });
    if (existing && existing.workspaceId !== workspace.id) throw new ConflictException('该账号属于其他工作空间，请更换账号名称');
    if (existing && (existing.portal !== 'REGULATORY' || existing.accountLevel !== 'CITY')) throw new ForbiddenException('仅可邀请本市监管成员，不能变更企业或省级账号身份');
    if (existing?.status === 'ACTIVE' && !recovery) throw new BadRequestException('该成员已激活，请通过管理员交接办理；账号恢复须经省级核验');
    const token = this.secret(); const now = new Date();
    await tx.workspaceInvitation.updateMany({ where: { workspaceId: workspace.id, username: dto.username, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    const item = await tx.workspaceInvitation.create({ data: { workspaceId: workspace.id, username: dto.username, displayName: dto.displayName, roleCode: recovery ? 'CITY_ADMIN_RECOVERY' : dto.roleCode ?? 'CITY_ADMIN', tokenHash: this.hash(token), expiresAt: new Date(Date.now() + 72 * 3600000) } });
    const { tokenHash: _hash, ...value } = item;
    return { ...value, roleCode: recovery ? 'CITY_ADMIN' : value.roleCode, purpose: recovery ? 'RECOVER_ADMIN' : 'INVITE', activationToken: token };
  }
  async provision(user: Actor, id: string) {
    this.province(user, true);
    return this.serial(`provision:${id}`, () => this.performProvision(user, id));
  }
  private async performProvision(user: Actor, id: string) {
    this.province(user, true);
    const current = await this.prisma.cityApplication.findUnique({ where: { id } });
    if (!current || current.status !== 'APPROVED') throw new BadRequestException('仅已批准申请可以执行开通');
    const existing = await this.prisma.provisionJob.findUnique({ where: { applicationId: id } });
    if (existing?.status === 'SUCCEEDED') {
      const workspace = existing.workspaceId ? await this.prisma.cityWorkspace.findUnique({ where: { id: existing.workspaceId } }) : null;
      return { application: this.app(current), job: existing, workspace: workspace ? this.workspace(workspace) : null };
    }
    const job = await this.prisma.provisionJob.upsert({ where: { applicationId: id }, create: { applicationId: id, status: 'PENDING' }, update: {} });
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.provisionJob.findUniqueOrThrow({ where: { id: job.id } });
        if (locked.status === 'SUCCEEDED') return { job: locked, workspace: await tx.cityWorkspace.findUniqueOrThrow({ where: { id: locked.workspaceId! } }), invitation: undefined };
        await tx.provisionJob.update({ where: { id: job.id }, data: { status: 'RUNNING', attempts: { increment: 1 }, error: null } });
        const grant = this.parse<any>(current.grantJson, {});
        let workspace = current.workspaceId ? await tx.cityWorkspace.findUnique({ where: { id: current.workspaceId } }) : await tx.cityWorkspace.findUnique({ where: { cityCode: current.cityCode } });
        if (!workspace) {
          const organization = await tx.organization.upsert({ where: { code: `CITY-${current.cityCode}` }, create: { code: `CITY-${current.cityCode}`, name: current.unitName }, update: {} });
          workspace = await tx.cityWorkspace.create({ data: { cityCode: current.cityCode, cityName: current.cityName, organizationId: organization.id, modulesJson: JSON.stringify(grant.modules ?? this.parse(current.modulesJson, [])), validUntil: grant.validUntil ? new Date(grant.validUntil) : null, quotasJson: JSON.stringify(grant.quotas ?? {}), configJson: JSON.stringify({ incidentRetentionDays: 90, timezone: 'Asia/Shanghai' }) } });
          await tx.organization.update({ where: { id: organization.id }, data: { workspaceId: workspace.id } });
        } else if (current.kind === 'NEW' && workspace.cityCode !== current.cityCode) throw new ConflictException('城市归属不一致');
        if (current.kind !== 'ADMIN_CHANGE') workspace = await tx.cityWorkspace.update({ where: { id: workspace.id }, data: { modulesJson: JSON.stringify(grant.modules ?? this.parse(current.modulesJson, [])), validUntil: grant.validUntil ? new Date(grant.validUntil) : undefined, quotasJson: JSON.stringify(grant.quotas ?? this.parse(workspace.quotasJson, {})) } });
        const adminRole = await this.initializeWorkspace(tx, workspace);
        let invitation: Awaited<ReturnType<SaasService['invitation']>> | undefined;
        if (['NEW', 'ADMIN_CHANGE'].includes(current.kind)) {
          const candidate = current.kind === 'ADMIN_CHANGE' ? await tx.user.findUnique({ where: { username: current.adminUsername } }) : null;
          if (candidate?.status === 'ACTIVE') {
            if (candidate.workspaceId !== workspace.id || candidate.portal !== 'REGULATORY' || candidate.accountLevel !== 'CITY') throw new ForbiddenException('拟任管理员必须是本市有效监管成员');
            await tx.userRole.upsert({ where: { userId_roleId: { userId: candidate.id, roleId: adminRole.id } }, create: { userId: candidate.id, roleId: adminRole.id }, update: {} });
            await tx.user.update({ where: { id: candidate.id }, data: { authVersion: { increment: 1 } } });
            await this.notice(workspace.id, '管理员任命已生效', `${candidate.displayName} 已获得本市管理员权限，使用原账号登录`, tx);
          } else invitation = await this.invitation(tx, workspace, { username: current.adminUsername, displayName: current.adminName, roleCode: 'CITY_ADMIN' });
        }
        await tx.cityApplication.update({ where: { id }, data: { workspaceId: workspace.id } });
        const done = await tx.provisionJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', workspaceId: workspace.id, error: null } });
        await this.notice(workspace.id, '城市开通办理完成', `${current.businessNo} 已完成${current.kind === 'NEW' ? '开通配置，请激活管理员账号' : '授权变更'}`, tx);
        return { job: done, workspace, invitation };
      }, { timeout: 15000 });
      await this.audit(user, 'cityWorkspace', result.workspace.id, 'PROVISION', { applicationId: id, cityCode: current.cityCode });
      return { application: this.app(await this.prisma.cityApplication.findUniqueOrThrow({ where: { id } })), job: result.job, workspace: this.workspace(result.workspace), invitation: result.invitation };
    } catch (error) {
      const message = error instanceof Error ? error.message : '开通未完成';
      const observed = await this.prisma.provisionJob.findUniqueOrThrow({ where: { id: job.id } });
      if (observed.status === 'SUCCEEDED') return { application: this.app(await this.prisma.cityApplication.findUniqueOrThrow({ where: { id } })), job: observed, workspace: observed.workspaceId ? this.workspace(await this.prisma.cityWorkspace.findUniqueOrThrow({ where: { id: observed.workspaceId } })) : undefined };
      const failed = await this.prisma.provisionJob.update({ where: { id: job.id, status: { not: 'SUCCEEDED' } }, data: { status: 'FAILED', error: message.slice(0, 500), attempts: { increment: 1 } } });
      await this.audit(user, 'provisionJob', job.id, 'PROVISION_FAILED', { applicationId: id, error: message.slice(0, 200) });
      return { application: this.app(current), job: failed };
    }
  }
  async activate(dto: ActivateMemberDto) {
    return this.serial(`activation:${this.hash(dto.token)}`, () => this.performActivation(dto));
  }
  private async performActivation(dto: ActivateMemberDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const username = await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.workspaceInvitation.findUnique({ where: { tokenHash: this.hash(dto.token) } });
      if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) throw new BadRequestException('激活邀请已失效，请联系管理员重新发出邀请');
      const workspace = await tx.cityWorkspace.findUniqueOrThrow({ where: { id: invitation.workspaceId } });
      if (workspace.status === 'SUSPENDED') throw new ForbiddenException('城市工作空间已暂停，请联系省级管理员');
      const existing = await tx.user.findUnique({ where: { username: invitation.username } });
      if (existing && existing.workspaceId !== workspace.id) throw new ConflictException('该账号已被其他工作空间使用');
      if (existing && (existing.portal !== 'REGULATORY' || existing.accountLevel !== 'CITY')) throw new ForbiddenException('该账号身份不允许通过本邀请变更');
      const recovery = invitation.roleCode === 'CITY_ADMIN_RECOVERY';
      if (existing?.status === 'ACTIVE' && !recovery) throw new ConflictException('该账号已激活，请通过省级核验恢复流程处理');
      const role = await this.role(tx, workspace, recovery ? 'CITY_ADMIN' : invitation.roleCode);
      const member = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { displayName: invitation.displayName, passwordHash, status: 'ACTIVE', authVersion: { increment: 1 }, roles: { upsert: { where: { userId_roleId: { userId: existing.id, roleId: role.id } }, create: { roleId: role.id }, update: {} } } } })
        : await tx.user.create({ data: { username: invitation.username, displayName: invitation.displayName, passwordHash, workspaceId: workspace.id, accountLevel: 'CITY', organizationId: workspace.organizationId, portal: 'REGULATORY', roles: { create: { roleId: role.id } } } });
      await tx.workspaceInvitation.update({ where: { id: invitation.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
      if (workspace.status === 'PENDING_ACTIVATION') await tx.cityWorkspace.update({ where: { id: workspace.id }, data: { status: 'ACTIVE' } });
      await tx.auditLog.create({ data: { userId: member.id, organizationId: workspace.organizationId, roleNames: role.name, module: 'saas', objectType: 'workspaceInvitation', objectId: invitation.id, action: 'ACTIVATE', result: 'SUCCESS', detail: JSON.stringify({ workspaceId: workspace.id, cityCode: workspace.cityCode }) } });
      await this.notice(workspace.id, '管理员已激活', `${invitation.displayName} 已激活账号，可登录配置本市组织与人员`, tx);
      return invitation.username;
    });
    return { activated: true, username };
  }
  async workspaces(user: Actor, query: SaasQueryDto) {
    this.province(user);
    const where: Prisma.CityWorkspaceWhereInput = { status: query.status, OR: query.q ? [{ cityName: { contains: query.q } }, { cityCode: { contains: query.q } }] : undefined };
    const [total, rows] = await this.prisma.$transaction([this.prisma.cityWorkspace.count({ where }), this.prisma.cityWorkspace.findMany({ where, ...this.page(query), orderBy: { cityCode: 'asc' } })]);
    const organizations = await this.prisma.organization.findMany({ where: { id: { in: rows.map(row => row.organizationId) } }, select: { id: true, name: true } });
    const names = new Map(organizations.map(row => [row.id, row.name]));
    const items = await Promise.all(rows.map(async (row) => ({ ...this.workspace(row), organizationName: names.get(row.organizationId) ?? null, usage: await this.usage(row), administrators: await this.prisma.user.findMany({ where: { workspaceId: row.id, roles: { some: { role: { code: `CITY_ADMIN_${row.cityCode}` } } } }, select: { id: true, username: true, displayName: true, status: true } }), invitations: await this.prisma.workspaceInvitation.findMany({ where: { workspaceId: row.id, acceptedAt: null, revokedAt: null }, select: { id: true, username: true, displayName: true, expiresAt: true } }) })));
    return { total, page: query.page, pageSize: query.pageSize, items };
  }
  async updateWorkspace(user: Actor, id: string, dto: PatchWorkspaceDto) {
    this.province(user, true); this.assertFuture(dto.validUntil); this.quotas(dto.quotas);
    const current = await this.prisma.cityWorkspace.findUnique({ where: { id } }); if (!current) throw new NotFoundException('城市工作空间不存在');
    const item = await this.prisma.$transaction(async (tx) => {
      const value = await tx.cityWorkspace.update({ where: { id }, data: { status: dto.status, modulesJson: dto.modules ? JSON.stringify([...new Set(dto.modules)]) : undefined, validUntil: dto.validUntil === null ? null : dto.validUntil ? new Date(dto.validUntil) : undefined, quotasJson: dto.quotas ? JSON.stringify(dto.quotas) : undefined, configJson: dto.config ? JSON.stringify(dto.config) : undefined } });
      await tx.user.updateMany({ where: { workspaceId: id }, data: { authVersion: { increment: 1 } } });
      await this.notice(id, '平台授权已调整', dto.reason, tx); return value;
    });
    await this.audit(user, 'cityWorkspace', id, 'UPDATE_GRANT', { workspaceId: id, cityCode: item.cityCode, reason: dto.reason, before: this.workspace(current), after: this.workspace(item) });
    return this.workspace(item);
  }
  async invite(user: Actor, id: string, dto: InviteMemberDto) {
    this.province(user, true);
    const workspace = await this.prisma.cityWorkspace.findUnique({ where: { id } }); if (!workspace) throw new NotFoundException('城市工作空间不存在');

    const result = await this.serial(`invite:${id}:${dto.username}`, () => this.prisma.$transaction((tx) => this.invitation(tx, workspace, dto)));
    await this.audit(user, 'workspaceInvitation', result.id, 'INVITE', { workspaceId: id, username: dto.username, roleCode: dto.roleCode });
    return result;
  }
  async recoverAdmin(user: Actor, id: string, dto: RecoverAdminDto) {
    this.province(user, true);
    const workspace = await this.prisma.cityWorkspace.findUnique({ where: { id } }); if (!workspace) throw new NotFoundException('城市工作空间不存在');
    const result = await this.serial(`invite:${id}:${dto.username}`, () => this.prisma.$transaction((tx) => this.invitation(tx, workspace, { ...dto, roleCode: 'CITY_ADMIN' }, true)));
    await this.audit(user, 'cityWorkspace', id, 'RECOVER_ADMIN', { workspaceId: id, username: dto.username, reason: dto.reason });
    return result;
  }
  private async organizationIds(workspace: CityWorkspace) {
    const organizations = await this.prisma.organization.findMany({ where: { workspaceId: workspace.id }, select: { id: true } });
    return [...new Set([workspace.organizationId, ...organizations.map((row) => row.id)])];
  }
  private async usage(workspace: CityWorkspace) {
    const ids = await this.organizationIds(workspace);
    const [users, enterprises, vehicles, organizations, telemetry, events] = await Promise.all([
      this.prisma.user.count({ where: { workspaceId: workspace.id } }), this.prisma.enterprise.count({ where: { organizationId: { in: ids } } }), this.prisma.vehicle.count({ where: { organizationId: { in: ids }, deletedAt: null } }),
      this.prisma.organization.count({ where: { workspaceId: workspace.id } }), this.prisma.vehicleRealtimeStatus.count({ where: { vehicle: { organizationId: { in: ids } } } }), this.prisma.safetyAlert.count({ where: { organizationId: { in: ids }, status: { not: 'CLOSED' } } }),
    ]);
    return { users, enterprises, vehicles, organizations, connectedVehicles: telemetry, openEvents: events, measuredAt: new Date().toISOString() };
  }
  async current(user: Actor) {
    if (user.accountLevel === 'OPERATIONS') throw new ForbiddenException('运维账号未获业务数据访问授权');
    if (user.portal === 'ENTERPRISE' || user.accountLevel === 'ENTERPRISE') throw new ForbiddenException('企业账号请在企业门户管理获授权业务');
    if (this.isProvince(user)) { this.province(user); return { workspace: null, modules: this.catalog().modules, usage: { workspaces: await this.prisma.cityWorkspace.count(), pendingActivation: await this.prisma.cityWorkspace.count({ where: { status: 'PENDING_ACTIVATION' } }) }, checklist: [], notices: await this.prisma.workspaceNotice.findMany({ where: { workspaceId: null }, orderBy: { createdAt: 'desc' }, take: 30 }), history: [] }; }
    const id = this.workspaceId(user);
    const workspace = await this.prisma.cityWorkspace.findUnique({ where: { id } }); if (!workspace) throw new NotFoundException('城市工作空间不存在');
    if (workspace.validUntil && workspace.validUntil.getTime() - Date.now() <= 30 * 86400000) {
      const expiry = workspace.validUntil.toISOString().slice(0, 10);
      const expired = workspace.validUntil <= new Date();
      await this.prisma.workspaceNotice.upsert({ where: { id: `expiry-${workspace.id}-${expiry}` },
        create: { id: `expiry-${workspace.id}-${expiry}`, workspaceId: id, title: expired ? '平台授权已到期' : '平台授权即将到期', content: `本市平台授权截止日期为 ${expiry}，请线下联系省级管理员办理续期。历史查询、安全处置和恢复管理按授权策略保留。` },
        update: { title: expired ? '平台授权已到期' : '平台授权即将到期' } });
    }
    const usage = await this.usage(workspace);
    const history = await this.prisma.cityApplication.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { workspace: this.workspace(workspace), modules: this.catalog().modules, usage, checklist: [
      { key: 'activation', title: '管理员激活', complete: workspace.status !== 'PENDING_ACTIVATION' }, { key: 'members', title: '组织与人员配置', complete: usage.users >= 2 },
      { key: 'rules', title: '本市业务规则确认', complete: !!this.parse<any>(workspace.configJson, {}).rulesConfirmed }, { key: 'enterprises', title: '企业与车辆建档', complete: usage.enterprises > 0 && usage.vehicles > 0 }, { key: 'telemetry', title: '车辆运行状态资料', complete: usage.connectedVehicles > 0 },
    ], notices: await this.prisma.workspaceNotice.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'desc' }, take: 30 }), history: history.map((row) => this.app(row)) };
  }
  async confirmRules(user: Actor) {
    const id = this.admin(user);
    const workspace = await this.prisma.cityWorkspace.findUniqueOrThrow({ where: { id } });
    const config = { ...this.parse<Record<string, unknown>>(workspace.configJson, {}), rulesConfirmed: true, rulesConfirmedAt: new Date().toISOString(), rulesConfirmedBy: user.displayName };
    await this.prisma.cityWorkspace.update({ where: { id }, data: { configJson: JSON.stringify(config) } });
    await this.audit(user, 'cityWorkspace', id, 'CONFIRM_RULES', { workspaceId: id, cityCode: workspace.cityCode });
    return { confirmed: true, config };
  }
  async members(user: Actor) {
    const id = this.admin(user);
    const rows = await this.prisma.user.findMany({ where: { workspaceId: id, portal: 'REGULATORY' }, orderBy: { createdAt: 'asc' }, select: { id: true, username: true, displayName: true, status: true, accountLevel: true, organization: { select: { id: true, name: true } }, roles: { include: { role: { select: { id: true, code: true, name: true, workspaceId: true } } } }, createdAt: true, lastLoginAt: true } });
    return { items: rows.map((row) => ({ ...row, roles: row.roles.map((link) => link.role) })) };
  }
  async createMember(user: Actor, dto: CreateWorkspaceMemberDto) {
    const id = this.admin(user); const passwordHash = await bcrypt.hash(dto.password, 12);
    const workspace = await this.prisma.cityWorkspace.findUniqueOrThrow({ where: { id } });
    if (dto.organizationId && !await this.prisma.organization.findFirst({ where: { id: dto.organizationId, workspaceId: id } })) throw new ForbiddenException('所选机构不属于本市');
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) throw new ConflictException('账号名称已被使用');
    const item = await this.prisma.$transaction(async (tx) => {
      const role = await this.role(tx, workspace, dto.roleCode);
      return tx.user.create({ data: { username: dto.username, displayName: dto.displayName, passwordHash, workspaceId: id, accountLevel: 'CITY', portal: 'REGULATORY', organizationId: dto.organizationId ?? workspace.organizationId, roles: { create: { roleId: role.id } } }, select: { id: true, username: true, displayName: true, status: true } });
    });
    await this.audit(user, 'user', item.id, 'CREATE_MEMBER', { workspaceId: id, roleCode: dto.roleCode }); return item;
  }
  async updateMember(user: Actor, memberId: string, dto: PatchWorkspaceMemberDto) {
    const workspaceId = this.admin(user);
    return this.serial(`members:${workspaceId}`, () => this.performUpdateMember(user, memberId, dto));
  }
  private async performUpdateMember(user: Actor, memberId: string, dto: PatchWorkspaceMemberDto) {
    const id = this.admin(user);
    const item = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findFirst({ where: { id: memberId, workspaceId: id, portal: 'REGULATORY', accountLevel: 'CITY' }, include: { roles: { include: { role: true } } } });
      if (!current) throw new NotFoundException('本市成员不存在');
      const isAdmin = current.roles.some((link) => link.role.code.startsWith('CITY_ADMIN_') || link.role.code === 'CITY_ADMIN');
      if (isAdmin && (dto.status === 'DISABLED' || dto.roleCode === 'CITY_USER')) {
        const remaining = await tx.user.count({ where: { workspaceId: id, status: 'ACTIVE', id: { not: memberId }, roles: { some: { role: { code: { startsWith: 'CITY_ADMIN_' }, status: 'ACTIVE' } } } } });
        if (!remaining) throw new BadRequestException('请先指定另一位有效管理员，不能取消本市最后一位管理员');
      }
      let roleId: string | undefined;
      if (dto.roleCode) roleId = (await this.role(tx, await tx.cityWorkspace.findUniqueOrThrow({ where: { id } }), dto.roleCode)).id;
      const value = await tx.user.update({ where: { id: memberId }, data: { status: dto.status, displayName: dto.displayName, authVersion: { increment: 1 }, roles: roleId ? { deleteMany: {}, create: { roleId } } : undefined }, select: { id: true, username: true, displayName: true, status: true } });
      await tx.refreshToken.updateMany({ where: { userId: memberId, revokedAt: null }, data: { revokedAt: new Date() } });
      return value;
    });
    await this.audit(user, 'user', memberId, 'UPDATE_MEMBER', { workspaceId: id, ...dto }); return item;
  }
  async transferAdmin(user: Actor, targetUserId: string) {
    const workspaceId = this.admin(user);
    return this.serial(`members:${workspaceId}`, () => this.performTransferAdmin(user, targetUserId));
  }
  private async performTransferAdmin(user: Actor, targetUserId: string) {
    const id = this.admin(user); if (targetUserId === user.id) throw new BadRequestException('请选择其他有效成员接任');
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findFirst({ where: { id: targetUserId, workspaceId: id, status: 'ACTIVE', portal: 'REGULATORY', accountLevel: 'CITY' } });
      if (!target) throw new BadRequestException('接任者必须是本市已激活的有效工作人员');
      const workspace = await tx.cityWorkspace.findUniqueOrThrow({ where: { id } }); const admin = await this.role(tx, workspace, 'CITY_ADMIN'); const regular = await this.role(tx, workspace, 'CITY_USER');
      await tx.userRole.upsert({ where: { userId_roleId: { userId: target.id, roleId: admin.id } }, create: { userId: target.id, roleId: admin.id }, update: {} });
      await tx.userRole.deleteMany({ where: { userId: user.id, role: { OR: [{ code: 'CITY_ADMIN' }, { code: { startsWith: 'CITY_ADMIN_' } }] } } });
      await tx.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: regular.id } }, create: { userId: user.id, roleId: regular.id }, update: {} });
      await tx.user.updateMany({ where: { id: { in: [target.id, user.id] } }, data: { authVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId: { in: [target.id, user.id] }, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.notice(id, '本市管理员已交接', `${user.displayName} 已将管理职责移交给 ${target.displayName}`, tx);
    });
    await this.audit(user, 'cityWorkspace', id, 'TRANSFER_ADMIN', { workspaceId: id, targetUserId }); return { transferred: true };
  }
  async changeRequest(user: Actor, _dto: ChangeRequestDto) {
    this.admin(user);
    throw new GoneException('授权调整、续期和管理员变更请线下联系省级管理员办理');
  }
  async readNotice(user: Actor, id: string) {
    const workspaceId = this.isProvince(user) ? null : this.workspaceId(user);
    const notice = await this.prisma.workspaceNotice.findFirst({ where: { id, workspaceId } }); if (!notice) throw new NotFoundException('通知不存在');
    await this.prisma.workspaceNotice.update({ where: { id }, data: { readAt: new Date() } }); return { read: true };
  }
}
