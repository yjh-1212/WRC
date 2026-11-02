import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
export const DAY = 86400000;
export const round = (v: number, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
export const parseJson = (v: string | null | undefined, fallback: any = {}) => { try {
    return v ? JSON.parse(v) : fallback;
}
catch {
    return fallback;
} };
export const dayKey = (d: Date | number) => new Date(+d + 8 * 3600000).toISOString().slice(0, 10);
export function cityScope(user: AuthUser, enterprise = true): any {
    if (user.accountLevel !== 'CITY' || user.portal !== 'REGULATORY')
        throw new ForbiddenException('请使用所属地市监管账号访问分析评价');
    return { organizationId: { in: user.scopeOrganizationIds?.length ? user.scopeOrganizationIds : [user.organizationId ?? '__none__'] } };
}
export function cityWrite(user: AuthUser) { cityScope(user); if (user.portal !== 'REGULATORY' || user.accountLevel !== 'CITY')
    throw new ForbiddenException('该操作由市级监管人员办理'); }
export function period(q: {
    from?: string;
    to?: string;
}, now = new Date()) {
    const today = dayKey(now), from = q.from ?? `${today.slice(0, 7)}-01`, to = q.to ?? today;
    const date = (s: string) => { const d = new Date(`${s}T00:00:00+08:00`); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(+d) || dayKey(d) !== s)
        throw new BadRequestException('请使用有效的年月日'); return d; };
    const start = date(from), last = date(to), days = Math.round((+last - +start) / DAY) + 1;
    if (days <= 0 || days > 366)
        throw new BadRequestException('统计周期须按先后顺序选择，且不超过366天');
    if (to > today)
        throw new BadRequestException('统计结束日期不能晚于今天');
    return { from, to, start, end: new Date(+last + DAY), cutoff: new Date(Math.min(+last + DAY, +now)), days, dates: Array.from({ length: days }, (_, i) => dayKey(+start + DAY * i)), computedAt: now.toISOString() };
}
export function csvFile(name: string, rows: unknown[][]) {
    const value = (v: unknown) => { let s = v == null ? '—' : String(v); if (/^[\s]*[=+@-]/.test(s) && typeof v !== 'number')
        s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    return { filename: name + '.csv', mimeType: 'text/csv;charset=utf-8', content: '\uFEFF' + rows.map(r => r.map(value).join(',')).join('\r\n') };
}
export const eventQueue = (s: string) => ['CLOSED', 'ARCHIVED', 'RECOVERED'].includes(s) ? 'CLOSED' : ['REPORTED', 'PENDING_CONFIRMATION', 'PENDING_HANDLING', 'PENDING_DETERMINATION', 'OFFLINE'].includes(s) ? 'PENDING' : 'HANDLING';
export const confirmedEvent = (kind: string, status: string) => kind === 'ACCIDENT' ? ['RESPONSIBILITY_DETERMINED', 'CLOSED', 'ARCHIVED'].includes(status) : kind === 'VIOLATION' ? ['CONFIRMED', 'RECTIFYING', 'CLOSED'].includes(status) : ['PROCESSING', 'HANDLING', 'PENDING_REVIEW', 'CLOSED', 'RECOVERED', 'INVESTIGATING_OFFLINE'].includes(status);
export const metricNames: Record<string, string> = { accidentCount: '已确认事故数', violationCount: '已确认违规数', onlineRate: '有效上报在线率', rectificationRate: '到期整改完成率', alertRate: '百条运行记录告警数', autonomousRate: '自主运行里程占比', operationEfficiency: '平均运行速度' };
export type Indicator = {
    metricKey: string;
    name: string;
    dimension: string;
    weight: number;
    rules: {
        minValue: number | null;
        maxValue: number | null;
        score: number;
        label: string;
    }[];
};
export const initialIndicators: Indicator[] = [
    { metricKey: 'accidentCount', name: '已确认事故数', dimension: 'SAFETY', weight: 50, rules: [{ minValue: 0, maxValue: 1, score: 100, label: '0起' }, { minValue: 1, maxValue: 2, score: 80, label: '1起' }, { minValue: 2, maxValue: null, score: 60, label: '2起及以上' }] },
    { metricKey: 'violationCount', name: '已确认违规数', dimension: 'COMPLIANCE', weight: 30, rules: [{ minValue: 0, maxValue: 1, score: 100, label: '0起' }, { minValue: 1, maxValue: 3, score: 80, label: '1—2起' }, { minValue: 3, maxValue: null, score: 60, label: '3起及以上' }] },
    { metricKey: 'onlineRate', name: '有效上报在线率', dimension: 'OPERATION', weight: 20, rules: [{ minValue: 0, maxValue: 80, score: 60, label: '低于80%' }, { minValue: 80, maxValue: 95, score: 80, label: '80%—95%' }, { minValue: 95, maxValue: null, score: 100, label: '95%及以上' }] },
];
export function validateIndicators(items: Indicator[]) {
    if (!items.length || Math.abs(items.reduce((s, i) => s + i.weight, 0) - 100) > .001)
        throw new BadRequestException('启用指标权重合计必须为100%');
    const keys = new Set<string>();
    for (const i of items) {
        if (!['accidentCount', 'violationCount', 'onlineRate', 'rectificationRate'].includes(i.metricKey) || keys.has(i.metricKey))
            throw new BadRequestException('指标不支持或重复，请选择事故、违规、联网或整改指标');
        keys.add(i.metricKey);
        if (!['SAFETY', 'COMPLIANCE', 'OPERATION'].includes(i.dimension) || !Number.isFinite(i.weight) || i.weight <= 0 || i.weight > 100 || !i.name.trim())
            throw new BadRequestException('请检查指标名称、维度和权重');
        if (!i.rules.length || i.rules.length > 20)
            throw new BadRequestException('每个指标须配置1至20个评分区间');
        const rules = [...i.rules].sort((a, b) => (a.minValue ?? 0) - (b.minValue ?? 0));
        let last = 0;
        for (let index = 0; index < rules.length; index++) {
            const r = rules[index], min = r.minValue ?? 0, max = r.maxValue ?? Infinity;
            if (min !== last || min < 0 || max <= min || !Number.isFinite(r.score) || r.score < 0 || r.score > 100 || !r.label.trim() || (index < rules.length - 1 && !Number.isFinite(max)))
                throw new BadRequestException('评分区间必须从0连续覆盖，不能重叠或留空，最后区间不设上限');
            last = max;
        }
        if (last !== Infinity)
            throw new BadRequestException('最后评分区间请留空上限');
        i.rules = rules;
    }
    return items;
}
export function evaluate(indicators: Indicator[], metrics: Record<string, number | null>, reasons: Record<string, string> = {}) {
    const breakdown = indicators.map(i => { const value = metrics[i.metricKey] ?? null, rule = value == null ? null : i.rules.find(r => value >= (r.minValue ?? 0) && (r.maxValue == null || value < r.maxValue)); return { ...i, value, score: rule?.score ?? null, rule: rule?.label ?? '待核对', issue: value == null ? reasons[i.metricKey] ?? '缺少有效数据' : !rule ? '未匹配评分区间' : null }; });
    const quality = breakdown.filter(b => b.issue).map(b => ({ metricKey: b.metricKey, name: b.name, reason: b.issue }));
    const valid = !quality.length, totalScore = valid ? round(breakdown.reduce((s, b) => s + b.score! * b.weight / 100, 0)) : null;
    const dimension = (key: string) => { const b = breakdown.filter(i => i.dimension === key), weight = b.reduce((s, i) => s + i.weight, 0); return weight && b.every(i => i.score != null) ? round(b.reduce((s, i) => s + i.score! * i.weight, 0) / weight) : null; };
    return { breakdown, quality, totalScore, grade: totalScore == null ? null : totalScore >= 90 ? 'A' : totalScore >= 80 ? 'B' : totalScore >= 70 ? 'C' : 'D', safetyScore: dimension('SAFETY'), complianceScore: dimension('COMPLIANCE'), operationScore: dimension('OPERATION') };
}
