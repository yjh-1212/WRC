import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyMaterialsService } from '../safety/workspace-materials.service';
import { CityAnalysisQuery, CreditEntryCreateDto, CityCreditRepairDto, CreditRulesDto } from './city-analytics.dto';
import { cityScope, cityWrite, csvFile, DAY, parseJson } from './city-analytics.rules';
const category = 'CITY_CREDIT';
export const creditGrade = (score: number) => score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
const baseline = [{ key: 'MINOR', points: 2, repairDays: 30 }, { key: 'GENERAL', points: 5, repairDays: 90 }, { key: 'SERIOUS', points: 10, repairDays: 180 }, { key: 'MAJOR', points: 20, repairDays: 365 }];
@Injectable()
export class CityCreditService {
    constructor(private prisma: PrismaService, private auth: AuthService, private materials: SafetyMaterialsService) { }
    async rules(user: AuthUser) { cityScope(user); const row = await this.prisma.businessRule.findFirst({ where: { organizationId: user.workspace?.organizationId ?? user.organizationId!, category, status: 'PUBLISHED' }, orderBy: { version: 'desc' } }); return row ? { version: row.version, versionLabel: 'V' + row.version, publishedBy: row.publishedBy, effectiveAt: row.effectiveAt, bands: parseJson(row.valueJson, []), active: true } : { version: 0, versionLabel: '未生效', bands: baseline, active: false }; }
    async saveRules(user: AuthUser, dto: CreditRulesDto) { cityWrite(user); if (new Set(dto.bands.map(b => b.key)).size !== 4)
        throw new BadRequestException('四种事项程度须各配置一次'); const organizationId = user.workspace?.organizationId ?? user.organizationId!; try {
        const row = await this.prisma.$transaction(async (tx) => { const latest = await tx.businessRule.findFirst({ where: { organizationId, category }, orderBy: { version: 'desc' } }); if ((latest?.version ?? 0) !== dto.expectedVersion)
            throw new ConflictException('信用规则已更新，请重新载入'); await tx.businessRule.updateMany({ where: { organizationId, category, status: 'PUBLISHED' }, data: { status: 'RETIRED' } }); return tx.businessRule.create({ data: { businessNo: 'RULE-CR-' + randomUUID(), name: '企业平台信用规则', category, organizationId, version: dto.expectedVersion + 1, valueJson: JSON.stringify(dto.bands), status: 'PUBLISHED', effectiveAt: new Date(), publishedBy: user.displayName } }); });
        await this.auth.audit(user, 'analytics', 'businessRule', row.id, 'PUBLISH_CREDIT_RULE', { version: row.version });
        return this.rules(user);
    }
    catch (e) {
        if ((e as any).code === 'P2002')
            throw new ConflictException('信用规则已更新，请刷新');
        throw e;
    } }
    async list(user: AuthUser, q: CityAnalysisQuery) {
        const own = cityScope(user), where: any = { organizationId: own.organizationId, ...(user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' } : q.enterpriseId ? { id: q.enterpriseId } : {}), ...(q.q ? { OR: [{ name: { contains: q.q } }, { creditAccounts: { some: { businessNo: { contains: q.q } } } }] } : {}) };
        // Enterprise credit is one ledger; vehicle-level legacy accounts remain stored.
        const enterprises = await this.prisma.enterprise.findMany({ where, select: { id: true, name: true, creditAccounts: { where: { subjectType: 'ENTERPRISE', vehicleId: null }, orderBy: { createdAt: 'asc' }, take: 1, include: { entries: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
        let rows = enterprises.map(e => { const a = e.creditAccounts[0]; return { id: e.id, name: e.name, accountId: a?.id ?? null, businessNo: a?.businessNo ?? null, initialScore: a?.initialScore ?? null, currentScore: a?.currentScore ?? null, grade: a?.grade ?? null, updatedAt: a?.updatedAt ?? null, latest: a?.entries[0] ?? null }; });
        if (q.grade)
            rows = rows.filter(r => r.grade === q.grade);
        rows.sort((a, b) => q.sort === 'score' ? ((a.currentScore ?? -1) - (b.currentScore ?? -1)) * (q.order === 'desc' ? -1 : 1) : a.name.localeCompare(b.name, 'zh-CN'));
        return { total: rows.length, items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page, pageSize: q.pageSize };
    }
    async detail(user: AuthUser, enterpriseId: string) { const own = cityScope(user), enterprise = await this.prisma.enterprise.findFirst({ where: { id: enterpriseId, organizationId: own.organizationId, ...(user.portal === 'ENTERPRISE' ? { AND: { id: user.enterpriseId ?? '__none__' } } : {}) }, select: { id: true, name: true } }); if (!enterprise)
        throw new NotFoundException('企业不存在或不在当前监管范围'); const account = await this.prisma.creditAccount.findFirst({ where: { ...own, enterpriseId, subjectType: 'ENTERPRISE', vehicleId: null }, orderBy: { createdAt: 'asc' } }); const entries = account ? await this.prisma.creditEntry.findMany({ where: { accountId: account.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }) : []; return { enterprise, account, entries: entries.map(e => ({ ...e, ruleSnapshot: parseJson(e.ruleSnapshotJson), history: parseJson(e.historyJson, []), repairMaterials: parseJson(e.repairMaterialsJson, []), canRepair: e.status === 'CONFIRMED' && e.scoreChange < 0 && !!e.repairEligibleAt && e.repairEligibleAt <= new Date(), ruleSnapshotJson: undefined, historyJson: undefined, repairMaterialsJson: undefined })) }; }
    async sources(user: AuthUser, q: CityAnalysisQuery) {
        cityWrite(user);
        if (!q.enterpriseId)
            throw new BadRequestException('请先选择企业');
        await this.detail(user, q.enterpriseId);
        const own = { ...cityScope(user), enterpriseId: q.enterpriseId };
        let where: any = { ...own }, model: any;
        if (q.sourceType === 'ACCIDENT') {
            model = this.prisma.accident;
            where.status = { in: ['RESPONSIBILITY_DETERMINED', 'CLOSED', 'ARCHIVED'] };
            where.responsibility = { not: null };
        }
        else if (q.sourceType === 'VIOLATION') {
            model = this.prisma.violation;
            where.status = { in: ['CONFIRMED', 'RECTIFYING', 'CLOSED'] };
        }
        else if (q.sourceType === 'INSPECTION') {
            model = this.prisma.regulatoryInspection;
            where.status = 'CLOSED';
            where.issueCount = { gt: 0 };
        }
        else
            throw new BadRequestException('请选择事故、违规或检查来源');
        if (q.q)
            where.OR = [{ businessNo: { contains: q.q } }, { title: { contains: q.q } }];
        const [total, items] = await Promise.all([model.count({ where }), model.findMany({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: { createdAt: 'desc' }, select: { id: true, businessNo: true, title: true, status: true } })]);
        return { total, items, page: q.page, pageSize: q.pageSize };
    }
    private async source(user: AuthUser, enterpriseId: string, type: string, id: string) { const model = type === 'ACCIDENT' ? this.prisma.accident : type === 'VIOLATION' ? this.prisma.violation : this.prisma.regulatoryInspection, row: any = await (model as any).findFirst({ where: { id, enterpriseId, ...cityScope(user) } }); if (!row)
        throw new NotFoundException('来源不存在或不属于当前企业'); const confirmed = type === 'ACCIDENT' ? ['RESPONSIBILITY_DETERMINED', 'CLOSED', 'ARCHIVED'].includes(row.status) && !!row.responsibility?.trim() : type === 'VIOLATION' ? ['CONFIRMED', 'RECTIFYING', 'CLOSED'].includes(row.status) : row.status === 'CLOSED' && row.issueCount > 0; if (!confirmed)
        throw new BadRequestException('只有已确认事实的事项才能计入信用，请先完成核查或检查复核'); return { id: row.id, businessNo: row.businessNo, title: row.title, status: row.status, vehicleId: row.vehicleId ?? null, confirmedFact: type === 'ACCIDENT' ? row.responsibility : type === 'INSPECTION' ? row.result : row.description ?? row.title }; }
    async create(user: AuthUser, dto: CreditEntryCreateDto) { cityWrite(user); if (!dto.reason.trim())
        throw new BadRequestException('请填写事实与依据'); const rule = await this.rules(user); if (!rule.active || rule.versionLabel !== dto.rulesVersion)
        throw new ConflictException('请先发布信用规则，并确认当前版本'); const profile = await this.detail(user, dto.enterpriseId), source = await this.source(user, dto.enterpriseId, dto.sourceType, dto.sourceId), band = rule.bands.find((b: any) => b.key === dto.severity); if (!band)
        throw new BadRequestException('事项程度未配置'); try {
        const entry = await this.prisma.$transaction(async (tx) => { let account = profile.account ? await tx.creditAccount.findFirst({ where: { id: profile.account.id, ...cityScope(user) } }) : await tx.creditAccount.findFirst({ where: { ...cityScope(user), enterpriseId: dto.enterpriseId, subjectType: 'ENTERPRISE', vehicleId: null }, orderBy: { createdAt: 'asc' } }); if (!account)
            account = await tx.creditAccount.create({ data: { businessNo: 'CRA-' + randomUUID(), subjectType: 'ENTERPRISE', enterpriseId: dto.enterpriseId, organizationId: (await tx.enterprise.findFirstOrThrow({ where: { id: dto.enterpriseId, organizationId: cityScope(user).organizationId } })).organizationId } }); const duplicate = await tx.creditEntry.findFirst({ where: { accountId: account.id, sourceId: dto.sourceId, sourceType: { in: [dto.sourceType, dto.sourceType.toLowerCase()] }, eventType: 'DEDUCTION' } }); if (duplicate)
            throw new ConflictException('该来源已记入信用，不能重复扣分'); const after = Math.max(0, account.currentScore - band.points), change = after - account.currentScore; const changed = await tx.creditAccount.updateMany({ where: { id: account.id, currentScore: account.currentScore, updatedAt: account.updatedAt }, data: { currentScore: after, grade: creditGrade(after) } }); if (changed.count !== 1)
            throw new ConflictException('信用账户已变化，请重新核对'); return tx.creditEntry.create({ data: { businessNo: 'CRD-' + randomUUID(), accountId: account.id, eventType: 'DEDUCTION', severity: dto.severity, scoreChange: change, scoreAfter: after, reason: dto.reason.trim(), sourceType: dto.sourceType, sourceId: dto.sourceId, sourceKey: account.id + '/' + dto.sourceType + '/' + dto.sourceId, confirmedBy: user.displayName, confirmedAt: new Date(), repairEligibleAt: new Date(Date.now() + band.repairDays * DAY), ruleSnapshotJson: JSON.stringify({ version: rule.versionLabel, band, source }), historyJson: JSON.stringify([{ action: 'CONFIRM', actorId: user.id, actorName: user.displayName, at: new Date().toISOString(), scoreBefore: account.currentScore, scoreAfter: after, comment: dto.reason.trim() }]) } }); });
        await this.auth.audit(user, 'analytics', 'creditEntry', entry.id, 'CONFIRM', { sourceType: dto.sourceType, sourceId: dto.sourceId, scoreChange: entry.scoreChange });
        return this.detail(user, dto.enterpriseId);
    }
    catch (e) {
        if (['P2002', 'P2034'].includes((e as any).code))
            throw new ConflictException('该事项或信用账户已更新，请重新核对');
        throw e;
    } }
    async repair(user: AuthUser, id: string, dto: CityCreditRepairDto) { cityWrite(user); const entry = await this.prisma.creditEntry.findFirst({ where: { id, account: { ...cityScope(user), subjectType: 'ENTERPRISE' } }, include: { account: true } }); if (!entry || !entry.account.enterpriseId)
        throw new NotFoundException('信用事项不存在或不在当前范围'); if (entry.status !== 'CONFIRMED' || entry.scoreChange >= 0)
        throw new BadRequestException('该事项不能重复修复'); if (!entry.repairEligibleAt || entry.repairEligibleAt > new Date())
        throw new BadRequestException('尚未满足修复日期，请查看原事项的修复条件'); if (!dto.comment.trim() || !dto.materialIds.length)
        throw new BadRequestException('请填写核查意见并上传修复材料'); const files = await this.materials.items(user, entry.account.enterpriseId, dto.materialIds); for (const file of files)
        await this.materials.download(user, file.id, 'CREDIT'); const after = Math.min(entry.account.initialScore, entry.account.currentScore + Math.abs(entry.scoreChange)); await this.prisma.$transaction(async (tx) => { const changed = await tx.creditEntry.updateMany({ where: { id, status: 'CONFIRMED' }, data: { status: 'REPAIRED', repairedAt: new Date(), repairedBy: user.displayName, repairNote: dto.comment.trim(), repairMaterialsJson: JSON.stringify(files), historyJson: JSON.stringify([...parseJson(entry.historyJson, []), { action: 'REPAIR', at: new Date().toISOString(), actorId: user.id, actorName: user.displayName, scoreBefore: entry.account.currentScore, scoreAfter: after, comment: dto.comment.trim(), materials: files }]) } }); if (changed.count !== 1)
        throw new ConflictException('该事项已办理修复，请刷新'); const accountChanged = await tx.creditAccount.updateMany({ where: { id: entry.account.id, currentScore: entry.account.currentScore, updatedAt: entry.account.updatedAt }, data: { currentScore: after, grade: creditGrade(after) } }); if (accountChanged.count !== 1)
        throw new ConflictException('信用账户已变化，请重新核查'); }); await this.auth.audit(user, 'analytics', 'creditEntry', id, 'REPAIR', { comment: dto.comment, materials: files.map(f => f.id) }); return this.detail(user, entry.account.enterpriseId); }
    async export(user: AuthUser, enterpriseId: string) { const d = await this.detail(user, enterpriseId); return csvFile('企业信用-' + d.enterprise.name, [['企业', d.enterprise.name], ['初始分', d.account?.initialScore], ['当前分', d.account?.currentScore], ['等级', d.account?.grade], [], ['事项编号', '事实与依据', '分值变化', '确认后得分', '状态', '来源类型', '来源编号', '确认人', '可修复日期', '修复人', '修复意见'], ...d.entries.map(e => [e.businessNo, e.reason, e.scoreChange, e.scoreAfter, e.status, e.sourceType, e.sourceId, e.confirmedBy, e.repairEligibleAt?.toISOString(), e.repairedBy, e.repairNote])]); }
}
