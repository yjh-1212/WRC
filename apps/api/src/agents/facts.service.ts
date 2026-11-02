import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AGENTS, GENERAL_ASSISTANT, AgentCode, AgentFacts, AgentSource } from './catalog';

@Injectable()
export class AgentFactsService {
  constructor(private readonly prisma: PrismaService) {}
  available(user: AuthUser) {
    if (user.accountLevel === 'OPERATIONS' || !['REGULATORY', 'ENTERPRISE'].includes(user.portal)) return [];
    return AGENTS.filter(agent => user.permissions.includes(agent.permission) && (user.accountLevel === 'PROVINCE' || !agent.module || user.workspace?.modules.includes(agent.module)));
  }
  general(user: AuthUser) { return this.available(user).some(item => item.code === 'OVERVIEW') ? GENERAL_ASSISTANT : undefined; }
  assert(user: AuthUser, code: string) {
    const agent = code === 'GENERAL' ? this.general(user) : this.available(user).find(item => item.code === code);
    if (!agent) throw new ForbiddenException('当前账号没有使用该智能体的权限');
    return agent;
  }
  scope(user: AuthUser) { return user.accountLevel === 'PROVINCE' ? '全省授权监管范围' : user.enterpriseId ? '仅本企业授权数据' : `${user.workspace?.cityName ?? '本市'}授权辖区`; }
  private path(user: AuthUser, kind: AgentSource['kind'], id?: string) {
    if (kind === 'GUIDE') return user.accountLevel === 'PROVINCE' ? '/province/workspaces' : user.enterpriseId ? '/enterprise/profile/info' : '/city/workspace';
    if (user.accountLevel === 'PROVINCE') return kind === 'ANALYTICS' ? '/province/analysis' : `/province/search?type=${kind === 'VEHICLE' ? 'VEHICLE' : kind === 'SAFETY' ? 'INCIDENT' : 'LICENSE'}${id ? `&entityId=${encodeURIComponent(id)}` : ''}`;
    const prefix = user.enterpriseId ? '/enterprise' : '';
    return kind === 'VEHICLE' ? `${prefix || '/archives'}/vehicles${id ? `?view=archive&vehicleId=${encodeURIComponent(id)}` : ''}` : kind === 'SAFETY' ? `${prefix}/safety/events` : kind === 'ADMISSION' ? `${prefix}/admission/applications` .replace('/enterprise/admission/', '/enterprise/') : '/analytics/operations';
  }
  async read(user: AuthUser, code: AgentCode, question: string): Promise<AgentFacts> {
    this.assert(user, code);
    const facts: AgentFacts = { measuredAt: new Date().toISOString(), scope: this.scope(user), summary: '', data: {}, sources: [] };
    if (code === 'GENERAL') {
      const requested: Exclude<AgentCode, 'GENERAL'>[] = [];
      if (/车辆|离线|VIN|车牌|VEH-/i.test(question)) requested.push('VEHICLE');
      if (/告警|风险|越界|超速|事故/.test(question)) requested.push('SAFETY');
      if (/审批|许可|准入|申请/.test(question)) requested.push('ADMISSION');
      if (/里程|时长|运行记录|运行分析|能耗/.test(question)) requested.push('ANALYTICS');
      const available = this.available(user);
      const codes = ['GUIDE', ...(requested.length ? requested : ['OVERVIEW'])] as Exclude<AgentCode, 'GENERAL'>[];
      const allowed = codes.filter(code => available.some(agent => agent.code === code));
      const results = await Promise.all(allowed.map(code => this.read(user, code, question)));
      results.forEach((result, index) => { facts.data[allowed[index]] = result.data; });
      const unavailable = requested.filter(code => !available.some(agent => agent.code === code));
      if (unavailable.length) facts.data.unavailable = unavailable.map(code => AGENTS.find(agent => agent.code === code)?.name);
      facts.sources = [...new Map(results.flatMap(result => result.sources).map(source => [`${source.kind}:${source.id}`, source])).values()];
      facts.summary = `已核对平台流程${allowed.some(code => code !== 'GUIDE') ? '与当前授权记录' : ''}，未授权的业务数据不参与回答。`;
      return facts;
    }
    const source = (kind: AgentSource['kind'], id: string, label: string) => ({ kind, id, label, path: this.path(user, kind, id) });
    const quoted = question.match(/[“"「]([^”"」]{2,80})[”"」]/)?.[1];
    const term = quoted ?? question.match(/\b(?:VEH|LIC|APP|ALT|OPR)[A-Z0-9-]{3,}\b/i)?.[0];
    if (code === 'GUIDE') {
      facts.data = {
        role: user.accountLevel, portal: user.portal,
        cityOpening: '地市线下申请，具备组织管理写权限的省级人员在地市管理→城市管理点击开通城市，设置单位、联系人、管理员账号及初始密码、模块、配额和期限。成功后可直接登录，不经过线上申请、开通审核或首次激活。授权续期和调整也线下联系省级。',
        cityWork: '市级监管负责本市企业及车辆档案、准入审批、运行监管和安全处置；省级通过全省监测、综合查询、风险通报和协同督办开展监督。',
        enterpriseWork: '企业维护本企业资料和车辆，提交业务申请，查询运行与许可，响应安全事项；企业不能开通城市或访问其他企业数据。',
        evidence: '依据当前平台已实现的业务流程；不代表外部法规或法律意见。正式审批、发证和处置须在相应业务页面由有权限人员完成。',
      };
      facts.sources = [source('GUIDE', 'platform-flow', '平台办理流程与角色职责')];
      facts.summary = '已核对平台角色职责与当前办理流程。';
    } else if (code === 'OVERVIEW') {
      if (user.permissions.includes('archive:vehicle:read') && (user.accountLevel === 'PROVINCE' || user.workspace?.modules.includes('ARCHIVES'))) {
        const [vehicles, offline] = await Promise.all([this.prisma.vehicle.count({ where: { deletedAt: null } }), this.prisma.vehicle.count({ where: { deletedAt: null, onlineStatus: 'OFFLINE' } })]);
        facts.data.vehicles = { total: vehicles, offline };
      }
      if (user.permissions.includes('archive:enterprise-archive:read') && (user.accountLevel === 'PROVINCE' || user.workspace?.modules.includes('ARCHIVES'))) facts.data.enterprises = await this.prisma.enterprise.count();
      if (user.permissions.includes('safety:alert:read') && (user.accountLevel === 'PROVINCE' || user.workspace?.modules.includes('SAFETY'))) facts.data.openAlerts = await this.prisma.safetyAlert.count({ where: { status: { not: 'CLOSED' } } });
      facts.summary = '已汇总当前授权范围内的实时台账；未授权指标不参与分析。';
    } else if (code === 'VEHICLE') {
      const where = { deletedAt: null, ...(/离线|未在线/.test(question) ? { onlineStatus: 'OFFLINE' } : {}), ...(term ? { OR: [{ businessNo: { contains: term } }, { name: { contains: term } }, { vin: { contains: term } }, { unifiedCode: { contains: term } }] } : {}) };
      const [total, items] = await Promise.all([this.prisma.vehicle.count({ where }), this.prisma.vehicle.findMany({ where, take: 12, orderBy: { updatedAt: 'desc' }, select: { id: true, businessNo: true, unifiedCode: true, name: true, onlineStatus: true, status: true, updatedAt: true, enterprise: { select: { name: true } } } })]);
      facts.data = { total, returned: items.length, vehicles: items }; facts.sources = items.map(row => source('VEHICLE', row.id, `${row.name} · ${row.businessNo}`));
      facts.summary = `已查询到 ${total} 辆符合条件的车辆，本次提供前 ${items.length} 条授权记录。`;
    } else if (code === 'SAFETY') {
      const types = [...(/超速/.test(question) ? ['OVERSPEED'] : []), ...(/越界/.test(question) ? ['OUT_OF_BOUNDS'] : []), ...(/离线/.test(question) ? ['OFFLINE'] : [])];
      const where = { status: { not: 'CLOSED' }, ...(types.length ? { alertType: { in: types } } : {}), ...(/高风险|重大|严重/.test(question) ? { level: { in: ['HIGH', 'CRITICAL'] } } : {}), ...(term ? { OR: [{ businessNo: { contains: term } }, { title: { contains: term } }] } : {}) };
      const [total, items] = await Promise.all([this.prisma.safetyAlert.count({ where }), this.prisma.safetyAlert.findMany({ where, take: 12, orderBy: { occurredAt: 'desc' }, select: { id: true, businessNo: true, title: true, level: true, status: true, occurredAt: true, vehicle: { select: { name: true, businessNo: true } } } })]);
      facts.data = { total, returned: items.length, alerts: items }; facts.sources = items.map(row => source('SAFETY', row.id, `${row.title} · ${row.businessNo}`));
      facts.summary = `已读取 ${total} 条符合条件的未闭环告警，本次分析前 ${items.length} 条。`;
    } else if (code === 'ADMISSION') {
      const where = { ...(/待办理|待审批|待处理|待审核|审核中/.test(question) ? { status: 'IN_REVIEW' } : {}), ...(term ? { OR: [{ businessNo: { contains: term } }, { title: { contains: term } }] } : {}) };
      const [total, items] = await Promise.all([this.prisma.admissionApplication.count({ where }), this.prisma.admissionApplication.findMany({ where, take: 12, orderBy: { updatedAt: 'desc' }, select: { id: true, businessNo: true, title: true, applicationType: true, status: true, updatedAt: true, enterprise: { select: { name: true } } } })]);
      facts.data = { total, applications: items }; facts.sources = items.map(row => ({ ...source('ADMISSION', row.id, `${row.title} · ${row.businessNo}`), path: user.accountLevel === 'PROVINCE' ? '/province/search?type=ENTERPRISE' : user.enterpriseId ? '/enterprise/applications' : '/admission/applications' }));
      facts.summary = `已读取 ${total} 份准入申请，本次提供最近更新的 ${items.length} 份记录。`;
    } else {
      const [totals, items] = await Promise.all([this.prisma.operationRecord.aggregate({ _count: { id: true }, _sum: { mileage: true, durationMinutes: true } }), this.prisma.operationRecord.findMany({ take: 12, orderBy: { startedAt: 'desc' }, select: { id: true, businessNo: true, mileage: true, durationMinutes: true, startedAt: true, status: true, vehicle: { select: { name: true, businessNo: true } } } })]);
      facts.data = { totals, records: items, limitation: '汇总口径为当前授权范围内所有已登记运行记录；下方样本为最近12条，不代表全部记录。未接入天气、外部交通和预测服务。' };
      facts.sources = items.map(row => source('ANALYTICS', row.id, `运行记录 ${row.businessNo}`)); facts.summary = `已汇总 ${totals._count.id} 条授权运行记录，并读取最近 ${items.length} 条。`;
    }
    return facts;
  }
  async canReadSources(user: AuthUser, sources: AgentSource[]) {
    for (const source of sources) {
      if (source.kind === 'GUIDE') continue;
      const model = { VEHICLE: 'vehicle', SAFETY: 'safetyAlert', ADMISSION: 'admissionApplication', ANALYTICS: 'operationRecord' }[source.kind] as 'vehicle' | 'safetyAlert' | 'admissionApplication' | 'operationRecord';
      if (!model || !await (this.prisma[model] as any).findFirst({ where: { id: source.id }, select: { id: true } })) return false;
    }
    return true;
  }
}
