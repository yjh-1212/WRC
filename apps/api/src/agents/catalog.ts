export const AGENTS = [
  { code: 'OVERVIEW', name: '监管态势总览', icon: 'Gauge', color: '#2f73df', permission: 'dashboard:view', module: '', brief: '汇总授权范围内的车辆、企业和风险，梳理当前关注事项。', examples: ['汇总当前监管范围内的运行与风险情况。', '现在有哪些需要优先关注的事项？'] },
  { code: 'VEHICLE', name: '车辆档案查询', icon: 'Truck', color: '#14a69a', permission: 'archive:vehicle:read', module: 'ARCHIVES', brief: '查询车辆台账、在线状态和所属企业，定位需要关注的车辆。', examples: ['有哪些离线车辆需要关注？', '查询车辆“VEH-2026-001”的档案和在线情况。'] },
  { code: 'SAFETY', name: '风险事件研判', icon: 'ShieldAlert', color: '#ef9a38', permission: 'safety:alert:read', module: 'SAFETY', brief: '梳理未闭环告警与风险等级，提供处置建议和来源。', examples: ['汇总未闭环的高风险告警，给出核查建议。', '有哪些超速或越界告警需要跟进？'] },
  { code: 'ADMISSION', name: '准入审批助手', icon: 'ClipboardCheck', color: '#7d69d9', permission: 'admission:application:read', module: 'ADMISSION', brief: '查找准入申请与审批状态，梳理申请记录和办理进展。', examples: ['梳理当前待办理的准入申请。', '查看最近的车辆许可申请及处理状态。'] },
  { code: 'ANALYTICS', name: '运行分析助手', icon: 'ChartNoAxesCombined', color: '#30a575', permission: 'analytics:operation:read', module: 'ANALYTICS', brief: '基于运行记录汇总里程与时长，辅助分析车辆运行表现。', examples: ['分析最近的车辆运行里程和运行时长。', '从现有运行记录中找出需要进一步核查的情况。'] },
  { code: 'GUIDE', name: '平台办事指引', icon: 'BookOpen', color: '#428fc0', permission: 'dashboard:view', module: '', brief: '解释平台办理入口、角色职责和操作步骤。', examples: ['省级如何根据线下申请开通地市平台？', '车辆备案、准入许可和风险处置分别在哪里办理？'] },
] as const;
export const GENERAL_ASSISTANT = { code: 'GENERAL', name: 'AI助手', icon: 'Sparkles', color: '#3678cb', brief: '直接提问，查询授权数据、了解平台流程和梳理工作事项。', examples: ['汇总当前需要关注的事项。', '如何查询车辆档案和运行记录？'] } as const;
export type AgentCode = typeof AGENTS[number]['code'] | 'GENERAL';
export interface AgentSource { kind: 'VEHICLE' | 'SAFETY' | 'ADMISSION' | 'ANALYTICS' | 'GUIDE'; id: string; label: string; path: string }
export interface AgentFacts { measuredAt: string; scope: string; summary: string; data: Record<string, unknown>; sources: AgentSource[] }
