import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CityAnalysisQuery, CityReportCreateDto } from './city-analytics.dto';
import { cityScope, cityWrite, confirmedEvent, csvFile, dayKey, eventQueue, parseJson, period, round } from './city-analytics.rules';
const eventModels = [{ kind: 'ALERT', table: 'SafetyAlert', subtype: 'alertType', time: 'occurredAt' }, { kind: 'ACCIDENT', table: 'Accident', subtype: 'accidentType', time: 'occurredAt' }, { kind: 'VIOLATION', table: 'Violation', subtype: 'violationType', time: 'occurredAt' }, { kind: 'OFFLINE', table: 'OfflineEvent', subtype: null, time: 'startedAt' }];
const typeName = (kind: string, subtype: string) => kind === 'ACCIDENT' ? '事故' : kind === 'OFFLINE' || /OFFLINE|COMMUNICATION_LOSS/.test(subtype) ? '车辆离线' : /SPEED/.test(subtype) ? '超速' : /BOUNDARY|OUT_OF|GEOFENCE|CROSS_BORDER/.test(subtype) ? '越界' : '其他';
@Injectable()
export class CityAnalysisService {
    constructor(private prisma: PrismaService, private auth: AuthService) { }
    async options(user: AuthUser) {
        if(user.workspace&&!['ANALYTICS','GOVERNANCE'].some(module=>user.workspace!.modules.includes(module)))throw new ForbiddenException('本市尚未开通分析评价功能');
        const own = cityScope(user), [enterprises, vehicles] = await Promise.all([
            this.prisma.enterprise.findMany({ where: { organizationId: own.organizationId, ...(user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
            this.prisma.vehicle.findMany({ where: { ...own, deletedAt: null }, select: { id: true, name: true, businessNo: true, enterpriseId: true, vehicleType: true, model: { select: { manufacturer: { select: { id: true, name: true, shortName: true } } } } }, orderBy: { name: 'asc' } }),
        ]);
        const manufacturers = [...new Map(vehicles.filter(v => v.model?.manufacturer).map(v => [v.model!.manufacturer.id, { id: v.model!.manufacturer.id, name: v.model!.manufacturer.shortName || v.model!.manufacturer.name }])).values()];
        return { enterprises, vehicles: vehicles.map(({ model, ...v }) => ({ ...v, manufacturerId: model?.manufacturer.id })), manufacturers };
    }
    async validateFilters(user: AuthUser, q: CityAnalysisQuery) {
        const own = cityScope(user);
        if (q.enterpriseId && !await this.prisma.enterprise.findFirst({ where: { id: q.enterpriseId, organizationId: own.organizationId, ...(user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' } : {}) } }))
            throw new NotFoundException('企业不存在或不在当前监管范围');
        if (q.vehicleId && !await this.prisma.vehicle.findFirst({ where: { ...own, id: q.vehicleId, ...(q.enterpriseId ? { enterpriseId: q.enterpriseId } : {}) } }))
            throw new NotFoundException('车辆不存在或不属于所选企业');
    }
    private operationWhere(user: AuthUser, q: CityAnalysisQuery) {
        const own = cityScope(user), r = period(q);
        return { ...own, ...(q.enterpriseId ? { enterpriseId: q.enterpriseId } : {}), ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}), startedAt: { gte: r.start, lt: r.cutoff }, vehicle: { ...(q.vehicleType ? { vehicleType: q.vehicleType } : {}), ...(q.manufacturerId ? { model: { manufacturerId: q.manufacturerId } } : {}) } };
    }
    async operations(user: AuthUser, q: CityAnalysisQuery) {
        await this.validateFilters(user, q);
        const r = period(q), own = cityScope(user);
        const conditions: Prisma.Sql[] = [Prisma.sql `r.organizationId IN (${Prisma.join(own.organizationId.in)})`, Prisma.sql `r.startedAt>=${r.start} AND r.startedAt<${r.cutoff}`];
        if (user.portal === 'ENTERPRISE')
            conditions.push(Prisma.sql `r.enterpriseId=${user.enterpriseId ?? '__none__'}`);
        if (q.enterpriseId)
            conditions.push(Prisma.sql `r.enterpriseId=${q.enterpriseId}`);
        if (q.vehicleId)
            conditions.push(Prisma.sql `r.vehicleId=${q.vehicleId}`);
        if (q.vehicleType)
            conditions.push(Prisma.sql `v.vehicleType=${q.vehicleType}`);
        if (q.manufacturerId)
            conditions.push(Prisma.sql `m.manufacturerId=${q.manufacturerId}`);
        const [groups, fleet, enterprises] = await Promise.all([
            this.prisma.$queryRaw<any[]>(Prisma.sql `SELECT r.enterpriseId,r.organizationId,o.name organizationName,strftime('%Y-%m-%d',r.startedAt/1000,'unixepoch','+8 hours') date,COUNT(*) trips,
        SUM(CASE WHEN r.mileage>=0 AND r.mileage<1000000000 THEN r.mileage ELSE 0 END) mileage,
        SUM(CASE WHEN r.mileage>=0 AND r.mileage<1000000000 THEN 0 ELSE 1 END) invalidMileage,
        SUM(CASE WHEN r.durationMinutes>=0 AND r.durationMinutes<10000000 THEN r.durationMinutes ELSE 0 END) duration,
        SUM(CASE WHEN r.durationMinutes>=0 AND r.durationMinutes<10000000 THEN 0 ELSE 1 END) invalidDuration
        FROM OperationRecord r JOIN Vehicle v ON v.id=r.vehicleId LEFT JOIN VehicleModel m ON m.id=v.modelId JOIN Organization o ON o.id=r.organizationId
        WHERE ${Prisma.join(conditions, ' AND ')} GROUP BY r.enterpriseId,r.organizationId,date`),
            this.prisma.vehicle.groupBy({ by: ['enterpriseId'], where: { ...own, deletedAt: null, ...(q.enterpriseId ? { enterpriseId: q.enterpriseId } : {}), ...(q.vehicleId ? { id: q.vehicleId } : {}), ...(q.vehicleType ? { vehicleType: q.vehicleType } : {}), ...(q.manufacturerId ? { model: { manufacturerId: q.manufacturerId } } : {}) }, _count: { _all: true } }),
            this.prisma.enterprise.findMany({ where: { organizationId: own.organizationId, ...(user.portal === 'ENTERPRISE' ? { id: user.enterpriseId ?? '__none__' } : q.enterpriseId ? { id: q.enterpriseId } : {}) }, select: { id: true, name: true } }),
        ]);
        const summarize = (g: any[]) => ({ trips: g.reduce((s, x) => s + Number(x.trips), 0), mileage: !g.length || g.some(x => Number(x.invalidMileage) > 0) ? null : round(g.reduce((s, x) => s + Number(x.mileage), 0)), durationHours: !g.length || g.some(x => Number(x.invalidDuration) > 0) ? null : round(g.reduce((s, x) => s + Number(x.duration), 0) / 60) });
        const rows = enterprises.map(e => ({ ...e, vehicles: fleet.find(f => f.enterpriseId === e.id)?._count._all ?? 0, ...summarize(groups.filter(g => g.enterpriseId === e.id)) })).filter(e => !q.vehicleId && !q.vehicleType && !q.manufacturerId || e.vehicles || e.trips);
        rows.sort((a, b) => q.sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') * ((q.order === 'desc') ? -1 : 1) : ((Number((b as any)[q.sort ?? 'mileage']) ?? 0) - (Number((a as any)[q.sort ?? 'mileage']) ?? 0)) * ((q.order === 'asc') ? -1 : 1));
        const districtIds = [...new Set(groups.map(g => g.organizationId))];
        return { period: { from: r.from, to: r.to, days: r.days }, computedAt: r.computedAt, scopeName: user.workspace?.cityName ?? '当前监管范围', kpis: { ...summarize(groups), vehicles: fleet.reduce((s, f) => s + f._count._all, 0) },
            trend: r.dates.map(date => ({ date, ...summarize(groups.filter(g => g.date === date)), reported: groups.some(g => g.date === date) })),
            districts: districtIds.map(id => ({ id, name: String(groups.find(g => g.organizationId === id).organizationName).replace(/交通运输局$/, ''), ...summarize(groups.filter(g => g.organizationId === id)) })),
            enterprises: rows, quality: { missingDays: r.dates.filter(date => !groups.some(g => g.date === date)).length, invalidRecords: groups.reduce((s, g) => s + Number(g.invalidMileage) + Number(g.invalidDuration), 0) },
        };
    }
    async operationRecords(user: AuthUser, q: CityAnalysisQuery) { await this.validateFilters(user, q); const where: any = this.operationWhere(user, q), [total, items] = await Promise.all([this.prisma.operationRecord.count({ where }), this.prisma.operationRecord.findMany({ where, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, businessNo: true, startedAt: true, endedAt: true, startAddress: true, endAddress: true, mileage: true, durationMinutes: true, status: true, vehicle: { select: { id: true, name: true, businessNo: true } }, region: { select: { name: true } } } })]); return { total, items, page: q.page, pageSize: q.pageSize }; }
    async operationRecord(user: AuthUser, id: string) { const row = await this.prisma.operationRecord.findFirst({ where: { id, ...cityScope(user) }, select: { id: true, businessNo: true, enterprise: { select: { name: true } }, vehicle: { select: { name: true, businessNo: true } }, startedAt: true, endedAt: true, startAddress: true, endAddress: true, mileage: true, durationMinutes: true, status: true, region: { select: { name: true } }, _count: { select: { trackPoints: true } } } }); if (!row)
        throw new NotFoundException('运行记录不存在或不在当前范围'); return row; }
    eventUnion(user: AuthUser, q: CityAnalysisQuery) {
        const own = cityScope(user), r = period(q);
        const parts = eventModels.map((model, index) => {
            const time = Prisma.raw('s.' + model.time), conditions: Prisma.Sql[] = [Prisma.sql `s.organizationId IN (${Prisma.join(own.organizationId.in)})`, Prisma.sql `${time}>=${r.start} AND ${time}<${r.cutoff}`, Prisma.sql `s.status NOT IN ('DISMISSED','REJECTED','CANCELLED','FALSE_ALARM')`];
            if (user.portal === 'ENTERPRISE')
                conditions.push(Prisma.sql `s.enterpriseId=${user.enterpriseId ?? '__none__'}`);
            if (q.enterpriseId)
                conditions.push(Prisma.sql `s.enterpriseId=${q.enterpriseId}`);
            if (q.vehicleId)
                conditions.push(Prisma.sql `s.vehicleId=${q.vehicleId}`);
            if (q.eventType && q.eventType !== model.kind)
                conditions.push(Prisma.sql `0=1`);
            // The highest-priority typed child represents one source family. The test is
            // independent of the date filter, so an upgrade cannot resurrect its alert.
            const higher = model.kind === 'ALERT' ? eventModels.slice(1) : eventModels.slice(1, index);
            for (const child of higher)
                conditions.push(model.kind === 'ALERT' ? Prisma.sql `NOT EXISTS(SELECT 1 FROM ${Prisma.raw(child.table)} c WHERE c.alertId=s.id AND c.organizationId IN (${Prisma.join(own.organizationId.in)}))` : Prisma.sql `(s.alertId IS NULL OR NOT EXISTS(SELECT 1 FROM ${Prisma.raw(child.table)} c WHERE c.alertId=s.alertId AND c.organizationId IN (${Prisma.join(own.organizationId.in)})))`);
            const title = model.kind === 'OFFLINE' ? Prisma.sql `COALESCE(v.name,'车辆')||'离线'` : Prisma.raw('s.title');
            const subtype = model.subtype ? Prisma.raw('s.' + model.subtype) : Prisma.sql `'OFFLINE'`;
            return Prisma.sql `SELECT ${model.kind} kind,s.id,s.businessNo,${title} title,s.status,${subtype} subtype,${time} occurredAt,s.enterpriseId,s.vehicleId,e.name enterpriseName,v.name vehicleName FROM ${Prisma.raw(model.table)} s JOIN Enterprise e ON e.id=s.enterpriseId LEFT JOIN Vehicle v ON v.id=s.vehicleId WHERE ${Prisma.join(conditions, ' AND ')}`;
        });
        return Prisma.join(parts, ' UNION ALL ');
    }
    async eventRows(user: AuthUser, q: CityAnalysisQuery) { await this.validateFilters(user, q); const union = this.eventUnion(user, q), rows = await this.prisma.$queryRaw<any[]>(Prisma.sql `SELECT * FROM (${union}) ORDER BY occurredAt DESC,kind,id`); return rows.map(e => ({ ...e, occurredAt: new Date(Number(e.occurredAt)), queue: eventQueue(e.status), category: typeName(e.kind, e.subtype), confirmed: confirmedEvent(e.kind, e.status) })).filter(e => (!q.queue || q.queue === 'ALL' || q.queue === e.queue) && (!q.category || q.category === e.category) && (!q.confirmation || q.confirmation === 'ALL' || e.confirmed) && (!q.q || `${e.businessNo} ${e.title} ${e.enterpriseName} ${e.vehicleName}`.toLocaleLowerCase().includes(q.q.trim().toLocaleLowerCase()))); }
    async safety(user: AuthUser, q: CityAnalysisQuery) {
        const r = period(q), [events, operations] = await Promise.all([this.eventRows(user, q), this.operations(user, Object.assign(new CityAnalysisQuery(), { from: r.from, to: r.to, enterpriseId: q.enterpriseId, vehicleId: q.vehicleId }))]);
        const summarize = (es: any[]) => ({ total: es.length, pending: es.filter(e => e.queue === 'PENDING').length, handling: es.filter(e => e.queue === 'HANDLING').length, closed: es.filter(e => e.queue === 'CLOSED').length, accidents: es.filter(e => e.kind === 'ACCIDENT').length });
        const all = summarize(events), categories = [...new Set(events.map(e => e.category))], rows = operations.enterprises.map(e => { const metrics = summarize(events.filter(s => s.enterpriseId === e.id)); return { ...e, ...metrics, eventRate: e.mileage != null && e.mileage > 0 ? round(metrics.total / e.mileage * 1000, 2) : null }; });
        rows.sort((a, b) => q.sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : b.total - a.total);
        return { period: operations.period, computedAt: r.computedAt, scopeName: operations.scopeName, kpis: { ...all, closureRate: all.total ? round(all.closed / all.total * 100) : null }, trend: r.dates.map(date => ({ date, total: events.filter(e => dayKey(e.occurredAt) === date).length })), types: categories.map(name => ({ name, value: events.filter(e => e.category === name).length })).sort((a, b) => b.value - a.value), enterprises: rows };
    }
    async events(user: AuthUser, q: CityAnalysisQuery) { const rows = await this.eventRows(user, q); return { items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: rows.length, page: q.page, pageSize: q.pageSize }; }
    async exportAnalysis(user: AuthUser, mode: string, q: CityAnalysisQuery) { const data = mode === 'safety' ? await this.safety(user, q) : await this.operations(user, q); const safety = mode === 'safety'; return csvFile(`${safety ? '安全' : '运行'}分析-${data.period.from}-${data.period.to}`, [['统计范围', data.scopeName], ['统计开始', data.period.from], ['统计结束', data.period.to], ['计算时间', data.computedAt], safety ? ['企业', '事件数(起)', '待核查', '处置中', '已闭环', '事故数(起)', '事件数(起/千公里)'] : ['企业', '接入车辆(辆)', '运行记录(条)', '里程(km)', '运行时长(h)'], ...data.enterprises.map((e: any) => safety ? [e.name, e.total, e.pending, e.handling, e.closed, e.accidents, e.eventRate] : [e.name, e.vehicles, e.trips, e.mileage, e.durationHours])]); }
    async reports(user: AuthUser, q: CityAnalysisQuery) { const own = cityScope(user), generatedAt: any = {}; if (q.generatedFrom)
        generatedAt.gte = period({ from: q.generatedFrom, to: q.generatedTo ?? q.generatedFrom }).start; if (q.generatedTo)
        generatedAt.lt = period({ from: q.generatedFrom ?? q.generatedTo, to: q.generatedTo }).end; const where: any = { ...own, ...(q.q ? { OR: [{ title: { contains: q.q.trim() } }, { businessNo: { contains: q.q.trim() } }] } : {}), ...(q.category ? { category: q.category } : {}), ...(q.reportType ? { reportType: q.reportType } : {}), ...(Object.keys(generatedAt).length ? { generatedAt } : {}) }; const [total, items] = await Promise.all([this.prisma.regulatoryReport.count({ where }), this.prisma.regulatoryReport.findMany({ where, orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, businessNo: true, title: true, category: true, reportType: true, periodStart: true, periodEnd: true, generatedAt: true, generatedByName: true, status: true, enterprise: { select: { id: true, name: true } } } })]); return { items, total, page: q.page, pageSize: q.pageSize }; }
    async report(user: AuthUser, id: string) { const row = await this.prisma.regulatoryReport.findFirst({ where: { id, ...cityScope(user) }, include: { organization: { select: { name: true } }, enterprise: { select: { name: true } } } }); if (!row)
        throw new NotFoundException('报表不存在或不在当前范围'); return { ...row, summary: parseJson(row.summaryJson), summaryJson: undefined }; }
    async createReport(user: AuthUser, dto: CityReportCreateDto) { cityWrite(user); const r = period(dto); if (!dto.title.trim())
        throw new BadRequestException('请填写报表名称'); if (dto.category === 'ENTERPRISE' && !dto.enterpriseId)
        throw new BadRequestException('企业专项须选择企业'); await this.validateFilters(user, Object.assign(new CityAnalysisQuery(), dto)); const q = Object.assign(new CityAnalysisQuery(), { from: r.from, to: r.to, enterpriseId: dto.enterpriseId }), operations = dto.category === 'SAFETY' ? undefined : await this.operations(user, q), safety = dto.category === 'OPERATIONS' ? undefined : await this.safety(user, q); const row = await this.prisma.regulatoryReport.create({ data: { businessNo: 'RPT-' + Date.now() + '-' + randomUUID().slice(0, 6), title: dto.title.trim(), category: dto.category, reportType: dto.reportType, periodStart: r.start, periodEnd: new Date(+r.end - 1), organizationId: user.organizationId!, enterpriseId: dto.enterpriseId || null, generatedById: user.id, generatedByName: user.displayName, summaryJson: JSON.stringify({ schemaVersion: 2, scopeName: dto.enterpriseId ? operations?.enterprises[0]?.name ?? safety?.enterprises[0]?.name ?? '指定企业' : user.workspace?.cityName ?? '当前监管范围', period: { from: r.from, to: r.to }, computedAt: r.computedAt, operations, safety }) } }); await this.auth.audit(user, 'analytics', 'regulatoryReport', row.id, 'GENERATE', { period: { from: r.from, to: r.to }, category: dto.category }); return { id: row.id }; }
    async exportReport(user: AuthUser, id: string) { const row = await this.report(user, id), s = row.summary, rows: unknown[][] = [['报表名称', row.title], ['报表编号', row.businessNo], ['统计开始', s.period?.from ?? dayKey(row.periodStart)], ['统计结束', s.period?.to ?? dayKey(row.periodEnd)], ['生成时间', row.generatedAt.toISOString()], ['生成者', row.generatedByName], ['统计范围', s.scopeName ?? row.enterprise?.name ?? row.organization.name]]; if (s.operations) {
        const k = s.operations.kpis ?? {};
        rows.push(['运行里程(km)', k.mileage], ['运行时长(h)', k.durationHours], ['运行记录(条)', k.trips], [], ['企业', '运行里程(km)', '运行时长(h)', '运行记录(条)'], ...(s.operations.enterprises ?? []).map((e: any) => [e.name, e.mileage, e.durationHours, e.trips]), [], ['日期', '运行里程(km)', '运行时长(h)', '运行记录(条)'], ...(s.operations.trend ?? []).map((t: any) => [t.date, t.mileage, t.durationHours, t.trips]));
    } if (s.safety) {
        const k = s.safety.kpis ?? {};
        rows.push([], ['事件统计口径', s.schemaVersion === 2 ? '来源事件去重' : '历史统计口径']);
        if(s.schemaVersion===2)rows.push(['事件数(起)', k.total], ['已闭环(起)', k.closed], ['事件闭环率(%)', k.closureRate]);
        else rows.push(['安全告警(条，历史口径)',k.alerts],['已闭环告警(条，历史口径)',typeof k.alerts==='number'&&typeof k.openAlerts==='number'?k.alerts-k.openAlerts:null],['告警闭环率(%，历史口径)',k.alerts>0?k.closureRate:null],['违规记录(条)',k.violations]);
        rows.push(['事故(起)', k.accidents], [], ['企业', '事件数(起)', '待核查', '处置中', '已闭环'], ...(s.safety.enterprises ?? []).map((e: any) => [e.name, e.total, e.pending, e.handling, e.closed]));
    } return csvFile(row.businessNo, rows); }
}
