import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CityAnalysisService } from './city-analysis.service';
import { CityAnalysisQuery, EvaluationActionDto, EvaluationCreateDto, EvaluationRulesDto } from './city-analytics.dto';
import { cityScope, cityWrite, confirmedEvent, csvFile, evaluate, initialIndicators, parseJson, period, round, validateIndicators } from './city-analytics.rules';
const category = 'CITY_EVALUATION';
const event = (user: AuthUser, action: string, comment: string, extra: any = {}) => ({ action, comment, actorId: user.id, actorName: user.displayName, at: new Date().toISOString(), ...extra });
@Injectable()
export class CityEvaluationService {
    constructor(private prisma: PrismaService, private auth: AuthService, private analysis: CityAnalysisService) { }
    async rules(user: AuthUser) { cityScope(user); const item = await this.prisma.businessRule.findFirst({ where: { organizationId: user.workspace?.organizationId ?? user.organizationId!, category, status: 'PUBLISHED' }, orderBy: { version: 'desc' } }); return item ? { id: item.id, name: item.name, version: item.version, versionLabel: 'V' + item.version, effectiveAt: item.effectiveAt, publishedBy: item.publishedBy, indicators: parseJson(item.valueJson, []), active: true } : { id: null, name: '企业周期评价规则', version: 0, versionLabel: '未生效', indicators: initialIndicators, active: false }; }
    async saveRules(user: AuthUser, dto: EvaluationRulesDto) { cityWrite(user); const indicators = validateIndicators(dto.indicators), current = await this.rules(user); if (current.version !== dto.expectedVersion)
        throw new ConflictException('规则版本已更新，请重新载入'); const organizationId = user.workspace?.organizationId ?? user.organizationId!; try {
        const item = await this.prisma.$transaction(async (tx) => { const latest = await tx.businessRule.findFirst({ where: { organizationId, category }, orderBy: { version: 'desc' } }); if ((latest?.version ?? 0) !== dto.expectedVersion)
            throw new ConflictException('规则版本已更新'); await tx.businessRule.updateMany({ where: { organizationId, category, status: 'PUBLISHED' }, data: { status: 'RETIRED' } }); return tx.businessRule.create({ data: { businessNo: 'RULE-EVA-' + randomUUID(), name: dto.name.trim(), category, organizationId, version: dto.expectedVersion + 1, valueJson: JSON.stringify(indicators), status: 'PUBLISHED', effectiveAt: new Date(), publishedBy: user.displayName } }); });
        await this.auth.audit(user, 'analytics', 'businessRule', item.id, 'PUBLISH_EVALUATION_RULE', { version: item.version });
        return this.rules(user);
    }
    catch (e) {
        if ((e as any).code === 'P2002')
            throw new ConflictException('规则版本已更新，请刷新后重试');
        throw e;
    } }
    private view(row: any) { const quality = parseJson(row.qualityJson, []), missing = row.status === 'DATA_PENDING' || quality.length > 0; return { ...row, totalScore: missing ? null : row.totalScore, grade: missing ? null : row.grade, safetyScore: missing ? null : row.safetyScore, complianceScore: missing ? null : row.complianceScore, operationScore: missing ? null : row.operationScore, breakdown: parseJson(row.breakdownJson, []), quality, evidence: parseJson(row.evidenceJson, []), history: parseJson(row.historyJson, []), breakdownJson: undefined, qualityJson: undefined, evidenceJson: undefined, historyJson: undefined, rulesVersion: row.task?.rulesVersion ?? '历史版本未留存' }; }
    async list(user: AuthUser, q: CityAnalysisQuery) { const where: any = { ...cityScope(user), ...(q.enterpriseId ? { enterpriseId: q.enterpriseId } : {}), ...(q.taskId ? { taskId: q.taskId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ businessNo: { contains: q.q } }, { enterprise: { name: { contains: q.q } } }, { task: { name: { contains: q.q } } }] } : {}) }; const [total, items] = await Promise.all([this.prisma.enterpriseEvaluation.count({ where }), this.prisma.enterpriseEvaluation.findMany({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: [{ task: { periodEnd: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }], include: { enterprise: { select: { id: true, name: true } }, task: { select: { id: true, name: true, periodStart: true, periodEnd: true, rulesVersion: true } }, appeals: { select: { id: true, status: true } } } })]); return { total, items: items.map(r => this.view(r)), page: q.page, pageSize: q.pageSize }; }
    async batches(user: AuthUser) { return this.prisma.evaluationTask.findMany({ where: cityScope(user, false), select: { id: true, name: true, periodStart: true, periodEnd: true, status: true, rulesVersion: true }, orderBy: { periodEnd: 'desc' }, take: 200 }); }
    async detail(user: AuthUser, id: string) { const row = await this.prisma.enterpriseEvaluation.findFirst({ where: { id, ...cityScope(user) }, include: { enterprise: { select: { id: true, name: true } }, task: true, appeals: { orderBy: { createdAt: 'desc' } } } }); if (!row)
        throw new NotFoundException('评价不存在或不在当前范围'); return this.view(row); }
    private async calculate(user: AuthUser, enterpriseId: string, r: any, indicators: any[]) {
        const own = { ...cityScope(user), enterpriseId }, [records, online, tasks, events, vehicles] = await Promise.all([
            this.prisma.operationRecord.findMany({ where: { ...own, startedAt: { gte: r.start, lt: r.end } }, select: { id: true, businessNo: true, mileage: true, startedAt: true } }),
            this.prisma.vehicleOnlineDaily.findMany({ where: { vehicle: { ...own, deletedAt: null }, metricDate: { gte: r.start, lt: r.end } }, select: { id: true, vehicleId: true, metricDate: true, onlineMinutes: true, totalMinutes: true, onlineRate: true } }),
            this.prisma.safetyRectificationTask.findMany({ where: { ...own, dueAt: { gte: r.start, lt: r.end, lte: new Date() } }, select: { id: true, businessNo: true, status: true, dueAt: true, closedAt: true } }),
            this.analysis.eventRows(user, Object.assign(new CityAnalysisQuery(), { from: r.from, to: r.to, enterpriseId })),
            this.prisma.vehicle.count({ where: { ...own, deletedAt: null } }),
        ]);
        const activity = records.length > 0 || online.length > 0;
        const validOnline = online.filter(o => Number.isFinite(o.onlineMinutes) && o.onlineMinutes >= 0 && o.totalMinutes > 0 && o.onlineMinutes <= o.totalMinutes && o.onlineRate >= 0 && o.onlineRate <= 100);
        const pending = (kind: string) => events.some(e => e.kind === kind && !confirmedEvent(kind, e.status));
        const metrics = { accidentCount: !activity || pending('ACCIDENT') ? null : events.filter(e => e.kind === 'ACCIDENT' && e.confirmed).length, violationCount: !activity || pending('VIOLATION') ? null : events.filter(e => e.kind === 'VIOLATION' && e.confirmed).length, onlineRate: !validOnline.length || validOnline.length !== online.length ? null : round(validOnline.reduce((s, o) => s + o.onlineMinutes, 0) / validOnline.reduce((s, o) => s + o.totalMinutes, 0) * 100), rectificationRate: tasks.length ? round(tasks.filter(t => t.status === 'CLOSED' && t.closedAt && t.closedAt <= t.dueAt).length / tasks.length * 100) : null };
        const reasons = { accidentCount: !activity ? '本期缺少运行或联网记录，无法确认评价覆盖范围' : '本期事故尚未完成认定', violationCount: !activity ? '本期缺少运行或联网记录，无法确认评价覆盖范围' : '本期违规事项尚未完成核查', onlineRate: online.length ? '联网记录存在无效值，请核对源数据' : '本期没有有效联网日记录', rectificationRate: '本期没有已到期整改任务，无法计算该指标' };
        const result = evaluate(indicators, metrics, reasons); if (+r.end > Date.now()) { result.quality.push({metricKey:'period',name:'评价周期',reason:'评价周期尚未结束，请在结束后重新计算'});result.totalScore=null;result.grade=null;}
        const evidence = [...records.map(x => ({ kind: 'OPERATION', id: x.id, businessNo: x.businessNo, title: '运行记录', at: x.startedAt })), ...online.map(x => ({ kind: 'ONLINE', id: x.id, vehicleId: x.vehicleId, title: '联网日统计', at: x.metricDate, onlineMinutes: x.onlineMinutes, totalMinutes: x.totalMinutes, onlineRate: x.onlineRate })), ...events.map(x => ({ kind: x.kind, id: x.id, businessNo: x.businessNo, title: x.title, status: x.status, at: x.occurredAt })), ...tasks.map(x => ({ kind: 'RECTIFICATION', id: x.id, businessNo: x.businessNo, title: '整改任务', status: x.status, at: x.dueAt }))];
        return { ...result, evidence, coverage: { vehicles, onlineRows: online.length, validOnlineRows: validOnline.length, recordCount: records.length, days: r.days } };
    }
    private storage(result: any) { return { totalScore: result.totalScore ?? 0, grade: result.grade ?? 'PENDING', riskLevel: result.totalScore == null ? 'UNKNOWN' : result.totalScore >= 90 ? 'LOW' : result.totalScore >= 80 ? 'MEDIUM' : result.totalScore >= 70 ? 'HIGH' : 'CRITICAL', safetyScore: result.safetyScore ?? 0, complianceScore: result.complianceScore ?? 0, operationScore: result.operationScore ?? 0, breakdownJson: JSON.stringify(result.breakdown), qualityJson: JSON.stringify(result.quality), evidenceJson: JSON.stringify({ items: result.evidence, coverage: result.coverage }), status: result.quality.length ? 'DATA_PENDING' : 'DRAFT' }; }
    async create(user: AuthUser, dto: EvaluationCreateDto) { cityWrite(user); const r = period(dto), rule = await this.rules(user); if (!rule.active || rule.versionLabel !== dto.rulesVersion)
        throw new ConflictException('请先发布有效评价规则，并确认当前版本'); await this.analysis.validateFilters(user, Object.assign(new CityAnalysisQuery(), { enterpriseId: dto.enterpriseId })); const own = cityScope(user), enterprises = await this.prisma.enterprise.findMany({ where: { organizationId: own.organizationId, status: 'ACTIVE', ...(dto.enterpriseId ? { id: dto.enterpriseId } : {}) }, select: { id: true, organizationId: true } }); if (!enterprises.length)
        throw new BadRequestException('当前范围没有可评价企业'); const calculated: any[] = []; for (const e of enterprises)
        calculated.push({ enterprise: e, result: await this.calculate(user, e.id, r, rule.indicators) }); const task = await this.prisma.$transaction(async (tx) => { const t = await tx.evaluationTask.create({ data: { businessNo: 'EVT-' + randomUUID(), name: dto.name.trim(), periodType: dto.periodType, periodStart: r.start, periodEnd: new Date(+r.end - 1), organizationId: user.organizationId!, createdById: user.id, createdByName: user.displayName, rulesVersion: rule.versionLabel, rulesSnapshotJson: JSON.stringify(rule.indicators), status: 'COMPLETED', generatedAt: new Date() } }); for (const x of calculated)
        await tx.enterpriseEvaluation.create({ data: { businessNo: 'EVA-' + randomUUID(), taskId: t.id, enterpriseId: x.enterprise.id, organizationId: x.enterprise.organizationId, ...this.storage(x.result), historyJson: JSON.stringify([event(user, 'CALCULATE', '生成评价草稿', { rulesVersion: rule.versionLabel })]) } }); return t; }, { timeout: 30000 }); await this.auth.audit(user, 'analytics', 'evaluationTask', task.id, 'GENERATE', { count: enterprises.length, rulesVersion: rule.versionLabel }); return { id: task.id, count: enterprises.length, pending: calculated.filter(x => x.result.quality.length).length }; }
    async action(user: AuthUser, id: string, dto: EvaluationActionDto) {
        cityWrite(user);
        const row = await this.prisma.enterpriseEvaluation.findFirst({ where: { id, ...cityScope(user) }, include: { task: true } });
        if (!row)
            throw new NotFoundException('评价不存在或不在当前范围');
        if (row.version !== dto.version)
            throw new ConflictException('评价已更新，请刷新后重试');
        if (!dto.comment.trim())
            throw new BadRequestException('请填写办理意见');
        if (row.status === 'PUBLISHED')
            throw new BadRequestException('已发布结果已留存，请通过申诉复核后重新核定');
        let data: any = { version: { increment: 1 } }, extra: any = {};
        if (dto.action === 'RECALCULATE') {
            if (!row.task.rulesVersion)
                throw new BadRequestException('历史结果没有规则快照，请新建评价批次');
            const r = period({ from: dayKeyOf(row.task.periodStart), to: dayKeyOf(row.task.periodEnd) }), result = await this.calculate(user, row.enterpriseId, r, parseJson(row.task.rulesSnapshotJson, []));
            data = { ...data, ...this.storage(result), publishedAt: null, reviewedAt: null, reviewedById: null, reviewedByName: null, reviewComment: null };
            extra = { previous: { totalScore: row.totalScore, grade: row.grade, status: row.status, breakdown: parseJson(row.breakdownJson, []), evidence: parseJson(row.evidenceJson, []), publishedAt: row.publishedAt, rulesVersion: row.task.rulesVersion } };
        }
        else if (dto.action === 'REVIEW') {
            if (!['DRAFT', 'UNDER_REVIEW'].includes(row.status) || parseJson(row.qualityJson, []).length || !row.task.rulesVersion)
                throw new BadRequestException('请先完成数据核对和重新计算，再进行复核');
            data = { ...data, status: 'REVIEWED', reviewedAt: new Date(), reviewedById: user.id, reviewedByName: user.displayName, reviewComment: dto.comment.trim() };
        }
        else if (dto.action === 'RETURN') {
            if (!['DRAFT', 'REVIEWED', 'UNDER_REVIEW'].includes(row.status))
                throw new BadRequestException('当前状态不能退回复核');
            data = { ...data, status: 'UNDER_REVIEW', reviewedAt: null, reviewedById: null, reviewedByName: null, reviewComment: dto.comment.trim(), qualityJson: JSON.stringify([{metricKey:'review',name:'退回核对',reason:'请核对依据并重新计算后复核'}]) };
        }
        else {
            if (row.status !== 'REVIEWED' || !row.reviewedAt || parseJson(row.qualityJson, []).length || !row.task.rulesVersion)
                throw new BadRequestException('仅已复核且数据完整的评价可发布');
            data = { ...data, status: 'PUBLISHED', publishedAt: new Date() };
            extra = { publishedSnapshot: { totalScore: row.totalScore, grade: row.grade, breakdown: parseJson(row.breakdownJson, []), evidence: parseJson(row.evidenceJson, []), rulesVersion: row.task.rulesVersion } };
        }
        data.historyJson = JSON.stringify([...parseJson(row.historyJson, []), event(user, dto.action, dto.comment.trim(), extra)]);
        const changed = await this.prisma.enterpriseEvaluation.updateMany({ where: { id, version: dto.version, status: row.status, ...cityScope(user) }, data });
        if (changed.count !== 1)
            throw new ConflictException('评价已更新，请刷新后重试');
        await this.auth.audit(user, 'analytics', 'enterpriseEvaluation', id, dto.action, { comment: dto.comment });
        return this.detail(user, id);
    }
    async export(user: AuthUser, id: string) { const e = await this.detail(user, id); return csvFile(e.businessNo, [['企业', e.enterprise.name], ['评价批次', e.task.name], ['规则版本', e.rulesVersion], ['状态', e.status], ['综合得分', e.totalScore], ['等级', e.grade], [], ['指标', '指标值', '权重(%)', '指标得分', '适用区间', '核对说明'], ...e.breakdown.map((b: any) => [b.name, b.value, b.weight, b.score, b.rule, b.issue]), [], ['办理意见', e.reviewComment], ['复核人', e.reviewedByName], ['发布时间', e.publishedAt?.toISOString()]]); }
}
const dayKeyOf = (date: Date) => new Date(+date + 8 * 3600000).toISOString().slice(0, 10);
