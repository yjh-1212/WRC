import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProvinceAnalysisQueryDto as Query } from './province-analysis.dto';

const DAY = 86400000;
const day = (value: Date) => new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const recordSelect = { id: true, organizationId: true, enterpriseId: true, vehicleId: true, startedAt: true,
  mileage: true, durationMinutes: true, energyUsed: true, autonomousMiles: true,
  enterprise: { select: { name: true } }, vehicle: { select: { name: true, businessNo: true } },
} satisfies Prisma.OperationRecordSelect;
type Row = Prisma.OperationRecordGetPayload<{ select: typeof recordSelect }>;

@Injectable()
export class ProvinceAnalysisService {
  constructor(private readonly prisma: PrismaService) {}
  private require(user: AuthUser) {
    if (user.accountLevel !== 'PROVINCE' || user.portal !== 'REGULATORY' || !user.permissions.includes('analytics:operation:read')) throw new ForbiddenException('仅授权省级监管人员可访问省域运行分析');
  }
  private async scope(user: AuthUser, workspaceId?: string) {
    this.require(user);
    const cities = await this.prisma.cityWorkspace.findMany({
      where: { cityCode: { startsWith: '37' }, status: { in: ['ACTIVE', 'SUSPENDED', 'EXPIRED'] } },
      select: { id: true, cityCode: true, cityName: true, organizationId: true }, orderBy: { cityCode: 'asc' },
    });
    if (workspaceId && !cities.some(city => city.id === workspaceId)) throw new ForbiddenException('所选地市不在已开通监管范围');
    const selected = cities.filter(city => !workspaceId || city.id === workspaceId);
    const organizations = await this.prisma.organization.findMany({ where: { OR: [
      { workspaceId: { in: selected.map(city => city.id) } }, { id: { in: selected.map(city => city.organizationId) } },
    ] }, select: { id: true, workspaceId: true } });
    const cityByOrganization = new Map<string, string>(selected.map(city => [city.organizationId, city.id]));
    for (const org of organizations) if (org.workspaceId && selected.some(city => city.id === org.workspaceId)) cityByOrganization.set(org.id, org.workspaceId);
    return { cities: selected, cityByOrganization, organizationIds: [...cityByOrganization.keys()] };
  }
  private range(query: Query) {
    const today = new Date(`${day(new Date())}T00:00:00+08:00`);
    const from = query.from ?? day(new Date(today.getTime() - 30 * DAY));
    const to = query.to ?? day(new Date(today.getTime() - DAY));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new BadRequestException('请选择有效的统计日期');
    const start = new Date(`${from}T00:00:00+08:00`), end = new Date(`${to}T00:00:00+08:00`);
    const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
    if (!Number.isFinite(days) || days < 1 || days > 366) throw new BadRequestException('统计周期须为1至366天，开始日期不能晚于结束日期');
    if (end > today) throw new BadRequestException('统计结束日期不能晚于今天');
    const previousStart = new Date(start.getTime() - days * DAY);
    return { from, to, start, endExclusive: new Date(end.getTime() + DAY), days, previousStart,
      previousFrom: day(previousStart), previousTo: day(new Date(start.getTime() - DAY)) };
  }
  private summarize(rows: Row[]) {
    const hasRecords = rows.length > 0;
    const valid = (key: 'mileage' | 'durationMinutes' | 'energyUsed' | 'autonomousMiles') => rows.every(row => Number.isFinite(row[key]) && row[key] >= 0);
    const sum = (key: 'mileage' | 'durationMinutes' | 'energyUsed' | 'autonomousMiles') => rows.reduce((total, row) => total + row[key], 0);
    const mileage = hasRecords && valid('mileage') ? sum('mileage') : null;
    const energy = hasRecords && valid('energyUsed') ? sum('energyUsed') : null;
    const autonomousValid = valid('autonomousMiles') && valid('mileage') && rows.every(row => row.autonomousMiles <= row.mileage);
    return { hasRecords, enterprises: new Set(rows.map(row => row.enterpriseId)).size, vehicles: new Set(rows.map(row => row.vehicleId)).size,
      trips: rows.length, mileage: mileage === null ? null : round(mileage),
      durationHours: hasRecords && valid('durationMinutes') ? round(sum('durationMinutes') / 60) : null,
      energyUsed: energy === null ? null : round(energy), autonomousRate: mileage && autonomousValid ? round(sum('autonomousMiles') / mileage * 100) : null,
      energyPer100: mileage && energy !== null ? round(energy / mileage * 100) : null,
      qualityIssue: hasRecords && (!valid('mileage') || !valid('durationMinutes') || !valid('energyUsed') || !autonomousValid),
    };
  }
  async options(user: AuthUser) {
    const scope = await this.scope(user);
    const enterprises = await this.prisma.enterprise.findMany({ where: { organizationId: { in: scope.organizationIds } },
      select: { id: true, name: true, organizationId: true }, orderBy: { name: 'asc' } });
    return { cities: scope.cities.map(({ organizationId: _org, ...city }) => city),
      enterprises: enterprises.map(row => ({ id: row.id, name: row.name, workspaceId: scope.cityByOrganization.get(row.organizationId) })) };
  }
  async analysis(user: AuthUser, query: Query) {
    const scope = await this.scope(user, query.workspaceId), range = this.range(query);
    const enterprise = query.enterpriseId ? await this.prisma.enterprise.findFirst({ where: { id: query.enterpriseId, organizationId: { in: scope.organizationIds } }, select: { id: true, name: true } }) : null;
    if (query.enterpriseId && !enterprise) throw new ForbiddenException('所选企业不在当前地市监管范围');
    const rows = await this.prisma.operationRecord.findMany({ where: { organizationId: { in: scope.organizationIds }, enterpriseId: query.enterpriseId,
      startedAt: { gte: range.previousStart, lt: range.endExclusive } }, select: recordSelect, orderBy: { startedAt: 'asc' } });
    const current = rows.filter(row => row.startedAt >= range.start), previous = rows.filter(row => row.startedAt < range.start);
    const kpis = this.summarize(current), previousKpis = this.summarize(previous);
    const daily = new Map<string, Row[]>();
    for (const row of rows) { const key = day(row.startedAt), bucket = daily.get(key) ?? []; bucket.push(row); daily.set(key, bucket); }
    const trend = Array.from({ length: range.days }, (_, index) => {
      const date = day(new Date(range.start.getTime() + index * DAY)), previousDate = day(new Date(range.previousStart.getTime() + index * DAY));
      return { date, previousDate, current: this.summarize(daily.get(date) ?? []), previous: this.summarize(daily.get(previousDate) ?? []) };
    });
    const byCity = new Map<string, Row[]>(), byEnterprise = new Map<string, Row[]>(), byVehicle = new Map<string, Row[]>();
    for (const row of current) {
      for (const [map, key] of [[byCity, scope.cityByOrganization.get(row.organizationId)], [byEnterprise, row.enterpriseId], [byVehicle, row.vehicleId]] as const) {
        if (!key) continue; const bucket = map.get(key) ?? []; bucket.push(row); map.set(key, bucket);
      }
    }
    const totalMileage = current.every(row => Number.isFinite(row.mileage) && row.mileage >= 0) ? current.reduce((sum, row) => sum + row.mileage, 0) : null;
    const share = (records: Row[]) => totalMileage && records.length ? round(records.reduce((sum, row) => sum + row.mileage, 0) / totalMileage * 100) : null;
    const cities = scope.cities.map(city => { const records = byCity.get(city.id) ?? [], values = this.summarize(records); return { id: city.id, name: city.cityName, cityCode: city.cityCode, ...values, share: share(records) }; });
    const enterprises = [...byEnterprise].map(([id, records]) => { const values = this.summarize(records); return { id, name: records[0].enterprise.name, ...values, share: share(records) }; }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const vehicles = query.enterpriseId ? [...byVehicle].map(([id, records]) => { const values = this.summarize(records); return { id, name: records[0].vehicle.name, businessNo: records[0].vehicle.businessNo, ...values, share: share(records) }; }).sort((a, b) => a.businessNo.localeCompare(b.businessNo)) : [];
    return { period: { from: range.from, to: range.to, days: range.days, previousFrom: range.previousFrom, previousTo: range.previousTo },
      computedAt: new Date().toISOString(), latestRecordAt: current.at(-1)?.startedAt.toISOString() ?? null,
      scope: { cityCount: cities.length, citiesWithRecords: cities.filter(city => city.hasRecords).length, workspaceId: query.workspaceId ?? null, enterpriseId: query.enterpriseId ?? null,
        workspaceName: query.workspaceId ? cities.find(city => city.id === query.workspaceId)?.name : null, enterpriseName: enterprise?.name ?? null },
      kpis, previousKpis, trend, cities, enterprises, vehicles };
  }
  async export(user: AuthUser, query: Query) {
    if (!user.permissions.includes('analytics:report:export')) throw new ForbiddenException('当前账号没有导出统计数据的权限');
    const data = await this.analysis(user, query);
    const level = query.enterpriseId ? '车辆' : query.workspaceId ? '企业' : '地市';
    const rows = query.enterpriseId ? data.vehicles : query.workspaceId ? data.enterprises : data.cities;
    const selected = rows.filter(row => !query.q?.trim() || row.name.includes(query.q.trim()) || ('businessNo' in row && String(row.businessNo).includes(query.q.trim())));
    const cell = (value: unknown) => { const text = value == null ? '—' : String(value); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`; };
    const lines: unknown[][] = [['省域运行分析', `${data.period.from} 至 ${data.period.to}`], ['对比周期', `${data.period.previousFrom} 至 ${data.period.previousTo}`],
      ['统计更新时间', data.computedAt], ['范围', `${data.scope.cityCount}个已开通城市，${data.scope.citiesWithRecords}个有运行记录`],
      ['地市筛选', data.scope.workspaceName ?? query.workspaceId ?? '全部'], ['企业筛选', data.scope.enterpriseName ?? query.enterpriseId ?? '全部'], ['明细检索', query.q?.trim() || '全部'],
      [level, '运行企业数', '运行车辆数', '运行次数', '累计里程(km)', '累计时长(h)', '里程占比(%)', '自主运行里程占比(%)', '累计能耗(kWh)', '百公里能耗(kWh)', '记录情况'],
      ...selected.map(row => [row.name, row.hasRecords ? row.enterprises : null, row.hasRecords ? row.vehicles : null, row.hasRecords ? row.trips : null,
        row.mileage, row.durationHours, row.share, row.autonomousRate, row.energyUsed, row.energyPer100, !row.hasRecords ? '未查询到运行记录' : row.qualityIssue ? '源数据口径待核对' : '已入库运行记录']),
      ['筛选范围汇总（不受明细检索影响）', data.kpis.hasRecords ? data.kpis.enterprises : null, data.kpis.hasRecords ? data.kpis.vehicles : null, data.kpis.hasRecords ? data.kpis.trips : null, data.kpis.mileage, data.kpis.durationHours, data.kpis.mileage ? 100 : null, data.kpis.autonomousRate, data.kpis.energyUsed, data.kpis.energyPer100],
      ['统计口径', '按北京时间运行开始日期归集；主体按周期去重；自主运行里程占比=自主里程/总里程；汇总比例按原始分子分母计算；无记录不代表未发生业务'],
    ];
    return { filename: `省域运行分析-${data.period.from}-${data.period.to}.csv`, mimeType: 'text/csv;charset=utf-8', content: '\ufeff' + lines.map(line => line.map(cell).join(',')).join('\r\n') };
  }
}
