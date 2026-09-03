import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fencePolygons, headingBetween, pois, regionPolygons, routeForVehicle, samplePath, takeTrack } from './hangzhou-geo';

const prisma = new PrismaClient();

const phase1Permissions = [
  ['dashboard:view', '查看首页', 'dashboard'],
  ['regulatory:access', '访问监管端', 'portal'],
  ['enterprise:access', '访问企业端', 'portal'],
  ['system:user:read', '查询用户', 'system'],
  ['system:user:create', '新增用户', 'system'],
  ['system:user:update', '修改用户', 'system'],
  ['system:role:read', '查询角色', 'system'],
  ['system:role:update', '角色授权', 'system'],
  ['system:organization:read', '查询组织', 'system'],
  ['system:organization:update', '维护组织', 'system'],
  ['system:enterprise:read', '查询企业', 'system'],
  ['system:enterprise:update', '维护企业', 'system'],
  ['system:audit:read', '查询日志', 'system'],
] as const;

const archivePermissions = [
  ['archive:manufacturer:read', '查询厂商', 'archive'],
  ['archive:manufacturer:write', '维护厂商', 'archive'],
  ['archive:model:read', '查询车型', 'archive'],
  ['archive:model:write', '维护车型', 'archive'],
  ['archive:vehicle:read', '查询车辆', 'archive'],
  ['archive:vehicle:write', '维护车辆', 'archive'],
  ['archive:license:read', '查询牌照', 'archive'],
  ['archive:license:write', '维护牌照', 'archive'],
  ['archive:vehicle-archive:read', '查询车辆档案', 'archive'],
  ['archive:enterprise-archive:read', '查询企业档案', 'archive'],
  ['archive:enterprise-archive:write', '维护企业档案', 'archive'],
  ['archive:qualification:read', '查询企业资质', 'archive'],
  ['archive:qualification:write', '维护企业资质', 'archive'],
] as const;

const admissionPermissions = [
  ['admission:application:read', '查询准入申请', 'admission'],
  ['admission:application:write', '维护并提交准入申请', 'admission'],
  ['admission:approval:read', '查询审批任务', 'admission'],
  ['admission:approval:handle', '处理审批任务', 'admission'],
  ['admission:workflow:read', '查询审批流程', 'admission'],
  ['admission:workflow:write', '配置审批流程', 'admission'],
  ['admission:license:read', '查询准入牌照', 'admission'],
  ['admission:license:issue', '发放准入牌照', 'admission'],
] as const;

const operationPermissions = [
  ['operation:realtime:read', '查看车辆实时运行', 'operation'],
  ['operation:distribution:read', '查看车辆分布', 'operation'],
  ['operation:trajectory:read', '查询车辆轨迹', 'operation'],
  ['operation:record:read', '查询运行记录', 'operation'],
  ['operation:monitor:read', '查看在线监测', 'operation'],
  ['operation:region:read', '查询运行区域', 'operation'],
  ['operation:region:write', '维护运行区域', 'operation'],
  ['operation:telemetry:write', '接入车辆遥测', 'operation'],
] as const;

const safetyPermissions = [
  ['safety:alert:read', '查询安全告警', 'safety'],
  ['safety:alert:write', '上报安全告警', 'safety'],
  ['safety:alert:handle', '处置安全告警', 'safety'],
  ['safety:fence:read', '查询电子围栏', 'safety'],
  ['safety:fence:write', '维护电子围栏', 'safety'],
  ['safety:accident:read', '查询事故', 'safety'],
  ['safety:accident:report', '上报事故', 'safety'],
  ['safety:accident:handle', '处理事故', 'safety'],
  ['safety:violation:read', '查询违规', 'safety'],
  ['safety:violation:write', '认定违规', 'safety'],
  ['safety:violation:review', '处理整改与复核', 'safety'],
  ['safety:offline:read', '查询离线事件', 'safety'],
  ['safety:offline:handle', '处理离线事件', 'safety'],
  ['safety:emergency:read', '查询应急任务', 'safety'],
  ['safety:emergency:dispatch', '派发应急任务', 'safety'],
  ['safety:emergency:respond', '响应应急任务', 'safety'],
  ['safety:emergency:review', '复核应急任务', 'safety'],
] as const;

const analyticsPermissions = [
  ['analytics:operation:read', '查看运行分析', 'analytics'],
  ['analytics:safety:read', '查看安全态势', 'analytics'],
  ['analytics:accident:read', '查看事故回溯', 'analytics'],
  ['analytics:accident:write', '维护事故回溯结论', 'analytics'],
  ['analytics:evaluation:read', '查看企业评价', 'analytics'],
  ['analytics:evaluation:config', '配置评价指标与规则', 'analytics'],
  ['analytics:evaluation:generate', '发起企业评价', 'analytics'],
  ['analytics:evaluation:publish', '发布企业评价', 'analytics'],
  ['analytics:evaluation:appeal', '提交评价申诉', 'analytics'],
  ['analytics:evaluation:review', '复核评价申诉', 'analytics'],
  ['analytics:profile:read', '查看企业安全画像', 'analytics'],
  ['analytics:report:read', '查看监管报表', 'analytics'],
  ['analytics:report:generate', '生成监管报表', 'analytics'],
  ['analytics:report:export', '导出监管报表', 'analytics'],
] as const;

const permissionDefs = [...phase1Permissions, ...archivePermissions, ...admissionPermissions, ...operationPermissions, ...safetyPermissions, ...analyticsPermissions] as const;
const archiveRead = archivePermissions.filter(([code]) => code.endsWith(':read')).map(([code]) => code);
const admissionRead = admissionPermissions.filter(([code]) => code.endsWith(':read')).map(([code]) => code);
const operationRead = operationPermissions.filter(([code]) => code.endsWith(':read')).map(([code]) => code);
const enterpriseOperationRead = operationRead.filter((code) => code !== 'operation:distribution:read');
const safetyRead = safetyPermissions.filter(([code]) => code.endsWith(':read')).map(([code]) => code);
const analyticsRead = analyticsPermissions.filter(([code]) => code.endsWith(':read')).map(([code]) => code);

const roleDefs = [
  { code: 'SUPER_ADMIN', name: '超级管理员', portal: 'REGULATORY', permissions: permissionDefs.map(([code]) => code) },
  { code: 'REGULATORY_ADMIN', name: '监管管理员', portal: 'REGULATORY', permissions: permissionDefs.filter(([c]) => c !== 'enterprise:access').map(([c]) => c) },
  { code: 'REGULATORY_USER', name: '监管工作人员', portal: 'REGULATORY', permissions: ['dashboard:view', 'regulatory:access', 'system:user:read', 'system:role:read', 'system:organization:read', 'system:enterprise:read', ...archiveRead, ...admissionRead, ...operationRead, ...safetyRead, ...analyticsRead, 'analytics:accident:write', 'analytics:evaluation:generate', 'analytics:evaluation:publish', 'analytics:evaluation:review', 'analytics:report:generate', 'analytics:report:export', 'safety:alert:handle', 'safety:accident:report', 'safety:accident:handle', 'safety:violation:write', 'safety:violation:review', 'safety:offline:handle', 'safety:emergency:dispatch', 'safety:emergency:review'] },
  { code: 'APPROVER', name: '审批人员', portal: 'REGULATORY', permissions: ['dashboard:view', 'regulatory:access', 'system:organization:read', 'system:enterprise:read', 'archive:vehicle:read', 'archive:license:read', 'archive:vehicle-archive:read', 'archive:enterprise-archive:read', ...admissionRead, ...operationRead, ...safetyRead, ...analyticsRead, 'admission:approval:handle', 'admission:license:issue'] },
  { code: 'ENTERPRISE_ADMIN', name: '企业管理员', portal: 'ENTERPRISE', permissions: ['dashboard:view', 'enterprise:access', 'system:user:read', 'system:user:create', 'system:user:update', ...archiveRead, 'archive:vehicle:write', 'archive:license:write', 'archive:enterprise-archive:write', 'archive:qualification:write', 'admission:application:read', 'admission:application:write', 'admission:license:read', ...enterpriseOperationRead, 'operation:telemetry:write', 'safety:alert:read', 'safety:alert:write', 'safety:alert:handle', 'safety:accident:read', 'safety:accident:report', 'safety:violation:read', 'safety:violation:review', 'safety:offline:read', 'safety:offline:handle', 'safety:emergency:read', 'safety:emergency:respond', 'analytics:evaluation:read', 'analytics:evaluation:appeal', 'analytics:profile:read'] },
  { code: 'ENTERPRISE_USER', name: '企业普通用户', portal: 'ENTERPRISE', permissions: ['dashboard:view', 'enterprise:access', ...archiveRead, 'admission:application:read', 'admission:license:read', ...enterpriseOperationRead, 'safety:alert:read', 'safety:alert:write', 'safety:accident:read', 'safety:accident:report', 'safety:violation:read', 'safety:offline:read', 'safety:emergency:read', 'analytics:evaluation:read', 'analytics:profile:read'] },
];

async function main() {
  await prisma.evaluationAppeal.deleteMany();
  await prisma.enterpriseEvaluation.deleteMany();
  await prisma.evaluationTask.deleteMany();
  await prisma.evaluationRule.deleteMany();
  await prisma.evaluationIndicator.deleteMany();
  await prisma.accidentReconstruction.deleteMany();
  await prisma.regulatoryReport.deleteMany();
  await prisma.emergencyTaskLog.deleteMany();
  await prisma.emergencyTask.deleteMany();
  await prisma.accident.deleteMany();
  await prisma.violation.deleteMany();
  await prisma.fenceTrigger.deleteMany();
  await prisma.offlineEvent.deleteMany();
  await prisma.safetyAlert.deleteMany();
  await prisma.electronicFenceVehicle.deleteMany();
  await prisma.electronicFence.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.loginLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.vehicleTrackPoint.deleteMany();
  await prisma.operationRecord.deleteMany();
  await prisma.operationRegionVehicle.deleteMany();
  await prisma.operationRegion.deleteMany();
  await prisma.vehicleOnlineDaily.deleteMany();
  await prisma.vehicleRealtimeStatus.deleteMany();
  await prisma.approvalResult.deleteMany();
  await prisma.approvalHistory.deleteMany();
  await prisma.approvalTask.deleteMany();
  await prisma.processInstance.deleteMany();
  await prisma.admissionApplicationVehicle.deleteMany();
  await prisma.admissionApplication.deleteMany();
  await prisma.processNodeDefinition.deleteMany();
  await prisma.processDefinition.deleteMany();
  await prisma.vehicleLicense.deleteMany();
  await prisma.vehicleArchive.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.vehicleModel.deleteMany();
  await prisma.manufacturer.deleteMany();
  await prisma.enterpriseQualification.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.enterprise.deleteMany();
  await prisma.organization.deleteMany();

  const city = await prisma.organization.create({ data: { code: 'HZJT', name: '杭州市交通运输局' } });
  const district = await prisma.organization.create({ data: { code: 'YHJT', name: '余杭区交通运输局', parentId: city.id } });
  const [enterpriseA, enterpriseB, enterpriseC] = await Promise.all([
    prisma.enterprise.create({ data: { businessNo: 'ENT-2026-001', name: '杭城智运科技有限公司', creditCode: '91330100DEMO000001', legalRepresentative: '陈启明', contactName: '周林', contactPhone: '13800001001', registeredAddress: '杭州市余杭区未来科技城海创园', organizationId: district.id } }),
    prisma.enterprise.create({ data: { businessNo: 'ENT-2026-002', name: '西湖无人配送有限公司', creditCode: '91330100DEMO000002', legalRepresentative: '沈言', contactName: '李婧', contactPhone: '13800001002', registeredAddress: '杭州市西湖区云栖小镇', organizationId: city.id } }),
    prisma.enterprise.create({ data: { businessNo: 'ENT-2026-003', name: '钱塘末端物流科技有限公司', creditCode: '91330100DEMO000003', legalRepresentative: '许峰', contactName: '王一', contactPhone: '13800001003', registeredAddress: '杭州市钱塘区下沙街道', organizationId: city.id, status: 'INACTIVE' } }),
  ]);

  const permissionMap = new Map<string, string>();
  for (const [code, name, module] of permissionDefs) {
    const permission = await prisma.permission.create({ data: { code, name, module } });
    permissionMap.set(code, permission.id);
  }

  const roleMap = new Map<string, string>();
  for (const roleDef of roleDefs) {
    const role = await prisma.role.create({ data: { code: roleDef.code, name: roleDef.name, portal: roleDef.portal } });
    roleMap.set(roleDef.code, role.id);
    await prisma.rolePermission.createMany({ data: roleDef.permissions.map((code) => ({ roleId: role.id, permissionId: permissionMap.get(code)! })) });
  }

  const menus = [
    { code: 'reg-overview', name: '监管总览', path: '/regulatory/overview', icon: 'Gauge', portal: 'REGULATORY', orderNo: 10, permissionCode: 'dashboard:view' },
    { code: 'operations', name: '运行监管', path: '/operations', icon: 'RadioTower', portal: 'REGULATORY', orderNo: 20, permissionCode: 'regulatory:access' },
    { code: 'operations-realtime', name: '实时运行', path: '/operations/realtime', icon: 'MapPinned', portal: 'REGULATORY', orderNo: 21, permissionCode: 'operation:realtime:read', parentCode: 'operations' },
    { code: 'operations-distribution', name: '车辆分布', path: '/operations/distribution', icon: 'Map', portal: 'REGULATORY', orderNo: 22, permissionCode: 'operation:distribution:read', parentCode: 'operations' },
    { code: 'operations-trajectories', name: '车辆轨迹', path: '/operations/trajectories', icon: 'Route', portal: 'REGULATORY', orderNo: 23, permissionCode: 'operation:trajectory:read', parentCode: 'operations' },
    { code: 'operations-records', name: '运行记录', path: '/operations/records', icon: 'ListTree', portal: 'REGULATORY', orderNo: 24, permissionCode: 'operation:record:read', parentCode: 'operations' },
    { code: 'operations-monitor', name: '在线监测', path: '/operations/monitor', icon: 'Activity', portal: 'REGULATORY', orderNo: 25, permissionCode: 'operation:monitor:read', parentCode: 'operations' },
    { code: 'operations-regions', name: '运行区域', path: '/operations/regions', icon: 'Spline', portal: 'REGULATORY', orderNo: 26, permissionCode: 'operation:region:read', parentCode: 'operations' },
    { code: 'safety', name: '安全监管', path: '/safety', icon: 'ShieldAlert', portal: 'REGULATORY', orderNo: 30, permissionCode: 'regulatory:access' },
    { code: 'safety-alerts', name: '告警中心', path: '/safety/alerts', icon: 'Siren', portal: 'REGULATORY', orderNo: 31, permissionCode: 'safety:alert:read', parentCode: 'safety' },
    { code: 'safety-accidents', name: '事故管理', path: '/safety/accidents', icon: 'ShieldX', portal: 'REGULATORY', orderNo: 32, permissionCode: 'safety:accident:read', parentCode: 'safety' },
    { code: 'safety-violations', name: '违规管理', path: '/safety/violations', icon: 'BadgeAlert', portal: 'REGULATORY', orderNo: 33, permissionCode: 'safety:violation:read', parentCode: 'safety' },
    { code: 'safety-fences', name: '电子围栏', path: '/safety/fences', icon: 'Pentagon', portal: 'REGULATORY', orderNo: 34, permissionCode: 'safety:fence:read', parentCode: 'safety' },
    { code: 'safety-offline', name: '离线监管', path: '/safety/offline', icon: 'WifiOff', portal: 'REGULATORY', orderNo: 35, permissionCode: 'safety:offline:read', parentCode: 'safety' },
    { code: 'safety-emergency', name: '应急处置', path: '/safety/emergency', icon: 'BriefcaseMedical', portal: 'REGULATORY', orderNo: 36, permissionCode: 'safety:emergency:read', parentCode: 'safety' },
    { code: 'admission', name: '准入与审批', path: '/admission', icon: 'ClipboardCheck', portal: 'REGULATORY', orderNo: 40, permissionCode: 'regulatory:access' },
    { code: 'admission-onboarding', name: '企业入驻', path: '/admission/onboarding', icon: 'Building2', portal: 'REGULATORY', orderNo: 41, permissionCode: 'admission:application:read', parentCode: 'admission' },
    { code: 'admission-road-tests', name: '路测申请', path: '/admission/road-tests', icon: 'Route', portal: 'REGULATORY', orderNo: 42, permissionCode: 'admission:application:read', parentCode: 'admission' },
    { code: 'admission-approvals', name: '许可审批', path: '/admission/approvals', icon: 'ListChecks', portal: 'REGULATORY', orderNo: 43, permissionCode: 'admission:approval:read', parentCode: 'admission' },
    { code: 'admission-licenses', name: '牌照管理', path: '/admission/licenses', icon: 'BadgeCheck', portal: 'REGULATORY', orderNo: 44, permissionCode: 'admission:license:read', parentCode: 'admission' },
    { code: 'admission-renewals', name: '续期管理', path: '/admission/renewals', icon: 'CalendarClock', portal: 'REGULATORY', orderNo: 45, permissionCode: 'admission:application:read', parentCode: 'admission' },
    { code: 'admission-workflows', name: '流程配置', path: '/admission/workflows', icon: 'Workflow', portal: 'REGULATORY', orderNo: 46, permissionCode: 'admission:workflow:read', parentCode: 'admission' },
    { code: 'archives', name: '监管档案', path: '/archives', icon: 'Archive', portal: 'REGULATORY', orderNo: 50, permissionCode: 'regulatory:access' },
    { code: 'archive-enterprises', name: '企业档案', path: '/archives/enterprises', icon: 'Building2', portal: 'REGULATORY', orderNo: 51, permissionCode: 'archive:enterprise-archive:read', parentCode: 'archives' },
    { code: 'archive-vehicles', name: '车辆档案', path: '/archives/vehicles', icon: 'Files', portal: 'REGULATORY', orderNo: 52, permissionCode: 'archive:vehicle-archive:read', parentCode: 'archives' },
    { code: 'archive-vehicle-management', name: '车辆管理', path: '/archives/vehicle-management', icon: 'Truck', portal: 'REGULATORY', orderNo: 53, permissionCode: 'archive:vehicle:read', parentCode: 'archives' },
    { code: 'archive-manufacturers', name: '厂商管理', path: '/archives/manufacturers', icon: 'Factory', portal: 'REGULATORY', orderNo: 54, permissionCode: 'archive:manufacturer:read', parentCode: 'archives' },
    { code: 'archive-models', name: '车型管理', path: '/archives/models', icon: 'Boxes', portal: 'REGULATORY', orderNo: 55, permissionCode: 'archive:model:read', parentCode: 'archives' },
    { code: 'analytics', name: '分析研判', path: '/analytics', icon: 'ChartNoAxesCombined', portal: 'REGULATORY', orderNo: 60, permissionCode: 'regulatory:access' },
    { code: 'analytics-operations', name: '运行分析', path: '/analytics/operations', icon: 'ChartSpline', portal: 'REGULATORY', orderNo: 61, permissionCode: 'analytics:operation:read', parentCode: 'analytics' },
    { code: 'analytics-safety', name: '安全态势', path: '/analytics/safety', icon: 'ShieldCheck', portal: 'REGULATORY', orderNo: 62, permissionCode: 'analytics:safety:read', parentCode: 'analytics' },
    { code: 'analytics-accidents', name: '事故回溯', path: '/analytics/accidents', icon: 'History', portal: 'REGULATORY', orderNo: 63, permissionCode: 'analytics:accident:read', parentCode: 'analytics' },
    { code: 'analytics-evaluations', name: '企业评价', path: '/analytics/evaluations', icon: 'ClipboardList', portal: 'REGULATORY', orderNo: 64, permissionCode: 'analytics:evaluation:read', parentCode: 'analytics' },
    { code: 'analytics-profiles', name: '企业安全画像', path: '/analytics/profiles', icon: 'ScanSearch', portal: 'REGULATORY', orderNo: 65, permissionCode: 'analytics:profile:read', parentCode: 'analytics' },
    { code: 'analytics-reports', name: '监管报表', path: '/analytics/reports', icon: 'FileChartColumn', portal: 'REGULATORY', orderNo: 66, permissionCode: 'analytics:report:read', parentCode: 'analytics' },
    { code: 'system', name: '系统管理', path: '/system', icon: 'Settings', portal: 'REGULATORY', orderNo: 70, permissionCode: 'system:user:read' },
    { code: 'system-users', name: '用户管理', path: '/system/users', icon: 'Users', portal: 'REGULATORY', orderNo: 71, permissionCode: 'system:user:read', parentCode: 'system' },
    { code: 'system-roles', name: '角色管理', path: '/system/roles', icon: 'KeyRound', portal: 'REGULATORY', orderNo: 72, permissionCode: 'system:role:read', parentCode: 'system' },
    { code: 'system-organizations', name: '组织机构', path: '/system/organizations', icon: 'Network', portal: 'REGULATORY', orderNo: 73, permissionCode: 'system:organization:read', parentCode: 'system' },
    { code: 'system-enterprises', name: '企业账号', path: '/system/enterprise-accounts', icon: 'Building2', portal: 'REGULATORY', orderNo: 74, permissionCode: 'system:enterprise:read', parentCode: 'system' },
    { code: 'system-audit', name: '日志审计', path: '/system/audit-logs', icon: 'ScrollText', portal: 'REGULATORY', orderNo: 75, permissionCode: 'system:audit:read', parentCode: 'system' },
    { code: 'ent-overview', name: '企业运营工作台', path: '/enterprise/overview', icon: 'Gauge', portal: 'ENTERPRISE', orderNo: 10, permissionCode: 'dashboard:view' },
    { code: 'ent-operations', name: '运行管理', path: '/enterprise/operations', icon: 'RadioTower', portal: 'ENTERPRISE', orderNo: 20, permissionCode: 'enterprise:access' },
    { code: 'ent-operations-realtime', name: '实时车辆', path: '/enterprise/operations/realtime', icon: 'MapPinned', portal: 'ENTERPRISE', orderNo: 21, permissionCode: 'operation:realtime:read', parentCode: 'ent-operations' },
    { code: 'ent-operations-trajectories', name: '车辆轨迹', path: '/enterprise/operations/trajectories', icon: 'Route', portal: 'ENTERPRISE', orderNo: 22, permissionCode: 'operation:trajectory:read', parentCode: 'ent-operations' },
    { code: 'ent-operations-monitor', name: '在线情况', path: '/enterprise/operations/monitor', icon: 'Activity', portal: 'ENTERPRISE', orderNo: 23, permissionCode: 'operation:monitor:read', parentCode: 'ent-operations' },
    { code: 'ent-operations-records', name: '运行记录', path: '/enterprise/operations/records', icon: 'ListTree', portal: 'ENTERPRISE', orderNo: 24, permissionCode: 'operation:record:read', parentCode: 'ent-operations' },
    { code: 'ent-vehicles', name: '车辆管理', path: '/enterprise/vehicles', icon: 'Truck', portal: 'ENTERPRISE', orderNo: 30, permissionCode: 'enterprise:access' },
    { code: 'ent-vehicle-list', name: '我的车辆', path: '/enterprise/vehicles/list', icon: 'ListFilter', portal: 'ENTERPRISE', orderNo: 31, permissionCode: 'archive:vehicle:read', parentCode: 'ent-vehicles' },
    { code: 'ent-vehicle-archives', name: '车辆档案', path: '/enterprise/vehicles/archives', icon: 'Files', portal: 'ENTERPRISE', orderNo: 32, permissionCode: 'archive:vehicle-archive:read', parentCode: 'ent-vehicles' },
    { code: 'ent-applications', name: '申请与许可', path: '/enterprise/applications', icon: 'ClipboardCheck', portal: 'ENTERPRISE', orderNo: 40, permissionCode: 'enterprise:access' },
    { code: 'ent-app-onboarding', name: '企业入驻', path: '/enterprise/applications/onboarding', icon: 'Building2', portal: 'ENTERPRISE', orderNo: 41, permissionCode: 'admission:application:read', parentCode: 'ent-applications' },
    { code: 'ent-app-road-tests', name: '路测申请', path: '/enterprise/applications/road-tests', icon: 'Route', portal: 'ENTERPRISE', orderNo: 42, permissionCode: 'admission:application:read', parentCode: 'ent-applications' },
    { code: 'ent-app-mine', name: '我的申请', path: '/enterprise/applications/mine', icon: 'FileText', portal: 'ENTERPRISE', orderNo: 43, permissionCode: 'admission:application:read', parentCode: 'ent-applications' },
    { code: 'ent-app-licenses', name: '牌照信息', path: '/enterprise/applications/licenses', icon: 'BadgeCheck', portal: 'ENTERPRISE', orderNo: 44, permissionCode: 'admission:license:read', parentCode: 'ent-applications' },
    { code: 'ent-app-renewals', name: '续期申请', path: '/enterprise/applications/renewals', icon: 'CalendarClock', portal: 'ENTERPRISE', orderNo: 45, permissionCode: 'admission:application:read', parentCode: 'ent-applications' },
    { code: 'ent-safety', name: '安全管理', path: '/enterprise/safety', icon: 'ShieldAlert', portal: 'ENTERPRISE', orderNo: 50, permissionCode: 'enterprise:access' },
    { code: 'ent-safety-alerts', name: '我的告警', path: '/enterprise/safety/alerts', icon: 'Siren', portal: 'ENTERPRISE', orderNo: 51, permissionCode: 'safety:alert:read', parentCode: 'ent-safety' },
    { code: 'ent-safety-accidents', name: '事故上报', path: '/enterprise/safety/accidents', icon: 'ShieldX', portal: 'ENTERPRISE', orderNo: 52, permissionCode: 'safety:accident:read', parentCode: 'ent-safety' },
    { code: 'ent-safety-violations', name: '违规记录', path: '/enterprise/safety/violations', icon: 'BadgeAlert', portal: 'ENTERPRISE', orderNo: 53, permissionCode: 'safety:violation:read', parentCode: 'ent-safety' },
    { code: 'ent-safety-emergency', name: '应急处置', path: '/enterprise/safety/emergency', icon: 'BriefcaseMedical', portal: 'ENTERPRISE', orderNo: 54, permissionCode: 'safety:emergency:read', parentCode: 'ent-safety' },
    { code: 'ent-safety-rectifications', name: '整改反馈', path: '/enterprise/safety/rectifications', icon: 'ClipboardPenLine', portal: 'ENTERPRISE', orderNo: 55, permissionCode: 'safety:violation:read', parentCode: 'ent-safety' },
    { code: 'ent-profile', name: '企业档案', path: '/enterprise/profile', icon: 'Building2', portal: 'ENTERPRISE', orderNo: 60, permissionCode: 'enterprise:access' },
    { code: 'ent-profile-info', name: '企业信息', path: '/enterprise/profile/info', icon: 'Building', portal: 'ENTERPRISE', orderNo: 61, permissionCode: 'archive:enterprise-archive:read', parentCode: 'ent-profile' },
    { code: 'ent-profile-qualifications', name: '企业资质', path: '/enterprise/profile/qualifications', icon: 'BadgeCheck', portal: 'ENTERPRISE', orderNo: 62, permissionCode: 'archive:qualification:read', parentCode: 'ent-profile' },
    { code: 'ent-profile-safety', name: '安全画像', path: '/enterprise/profile/safety', icon: 'ScanSearch', portal: 'ENTERPRISE', orderNo: 63, permissionCode: 'analytics:profile:read', parentCode: 'ent-profile' },
    { code: 'ent-evaluations', name: '企业评价', path: '/enterprise/evaluations', icon: 'ChartNoAxesCombined', portal: 'ENTERPRISE', orderNo: 70, permissionCode: 'enterprise:access' },
    { code: 'ent-evaluations-current', name: '本期评价', path: '/enterprise/evaluations/current', icon: 'Gauge', portal: 'ENTERPRISE', orderNo: 71, permissionCode: 'analytics:evaluation:read', parentCode: 'ent-evaluations' },
    { code: 'ent-evaluations-history', name: '历史评价', path: '/enterprise/evaluations/history', icon: 'History', portal: 'ENTERPRISE', orderNo: 72, permissionCode: 'analytics:evaluation:read', parentCode: 'ent-evaluations' },
    { code: 'ent-evaluations-appeals', name: '评价申诉', path: '/enterprise/evaluations/appeals', icon: 'MessageSquareWarning', portal: 'ENTERPRISE', orderNo: 73, permissionCode: 'analytics:evaluation:read', parentCode: 'ent-evaluations' },
    { code: 'ent-accounts', name: '账号管理', path: '/enterprise/accounts', icon: 'Users', portal: 'ENTERPRISE', orderNo: 80, permissionCode: 'system:user:read' },
  ];
  const menuIds = new Map<string, string>();
  for (const menu of menus.filter((menu) => !menu.parentCode)) {
    const created = await prisma.menu.create({ data: { code: menu.code, name: menu.name, path: menu.path, icon: menu.icon, portal: menu.portal, orderNo: menu.orderNo, permissionCode: menu.permissionCode } });
    menuIds.set(menu.code, created.id);
  }
  for (const menu of menus.filter((menu) => menu.parentCode)) {
    await prisma.menu.create({ data: { code: menu.code, name: menu.name, path: menu.path, icon: menu.icon, portal: menu.portal, orderNo: menu.orderNo, permissionCode: menu.permissionCode, parentId: menuIds.get(menu.parentCode!) } });
  }

  const passwordHash = await bcrypt.hash('Wrc@2026!', 12);
  const users = [
    ['admin', '平台超级管理员', 'SUPER_ADMIN', 'REGULATORY', city.id, null],
    ['reg_admin', '监管管理员', 'REGULATORY_ADMIN', 'REGULATORY', city.id, null],
    ['reg_user', '监管工作人员', 'REGULATORY_USER', 'REGULATORY', district.id, null],
    ['approver', '审批专员', 'APPROVER', 'REGULATORY', city.id, null],
    ['ent_admin', '企业管理员', 'ENTERPRISE_ADMIN', 'ENTERPRISE', district.id, enterpriseA.id],
    ['ent_user', '企业普通用户', 'ENTERPRISE_USER', 'ENTERPRISE', district.id, enterpriseA.id],
  ] as const;
  const userMap = new Map<string, string>();
  for (const [username, displayName, roleCode, portal, organizationId, enterpriseId] of users) {
    const user = await prisma.user.create({ data: { username, displayName, passwordHash, portal, organizationId, enterpriseId, roles: { create: { roleId: roleMap.get(roleCode)! } } } });
    userMap.set(username, user.id);
  }
  await prisma.auditLog.create({ data: {
    userId: userMap.get('admin'), roleNames: '超级管理员', organizationId: city.id,
    module: 'system', objectType: 'Platform', action: 'SEED_INITIALIZE', result: 'SUCCESS',
    detail: 'Phase 7 标准演示数据初始化。',
  } });

  const manufacturers = [];
  for (const data of [
    { businessNo: 'MFR-001', name: '新石器慧通（北京）科技有限公司', shortName: '新石器', creditCode: '91110108DEMO100001', contactName: '王工', contactPhone: '13910001001', address: '北京市海淀区' },
    { businessNo: 'MFR-002', name: '九识智能科技有限公司', shortName: '九识智能', creditCode: '91320214DEMO100002', contactName: '张工', contactPhone: '13910001002', address: '江苏省无锡市' },
    { businessNo: 'MFR-003', name: '白犀牛智达（北京）科技有限公司', shortName: '白犀牛', creditCode: '91110113DEMO100003', contactName: '刘工', contactPhone: '13910001003', address: '北京市顺义区' },
    { businessNo: 'MFR-004', name: '驭势科技（北京）有限公司', shortName: '驭势科技', creditCode: '91110114DEMO100004', contactName: '陈工', contactPhone: '13910001004', address: '北京市房山区' },
  ]) manufacturers.push(await prisma.manufacturer.create({ data }));

  const models = [];
  const modelDefs = [
    [0, 'X3 标准型', 'NEO-X3', 25, 120, 1000, '3600×1500×1950mm'], [0, 'X3 冷链型', 'NEO-X3C', 20, 100, 800, '3600×1500×2050mm'],
    [1, 'Z5 城配版', 'JIUSHI-Z5', 25, 150, 1500, '4200×1650×2150mm'], [1, 'Z2 末端版', 'JIUSHI-Z2', 20, 100, 600, '3000×1400×1850mm'],
    [2, 'R5 无人配送车', 'WHITE-R5', 25, 120, 1000, '3750×1550×2000mm'], [2, 'R3 轻量版', 'WHITE-R3', 20, 90, 500, '2850×1380×1800mm'],
    [3, 'UiBox 城市服务车', 'UISEE-BOX', 25, 130, 1200, '3900×1600×2100mm'], [3, 'UiVan 园区版', 'UISEE-VAN', 20, 110, 900, '3500×1500×1980mm'],
  ] as const;
  for (let index = 0; index < modelDefs.length; index++) {
    const [manufacturerIndex, name, modelCode, maxSpeed, ratedRange, loadCapacity, dimensions] = modelDefs[index];
    models.push(await prisma.vehicleModel.create({ data: { businessNo: `MOD-${String(index + 1).padStart(3, '0')}`, name, modelCode, manufacturerId: manufacturers[manufacturerIndex].id, maxSpeed, ratedRange, loadCapacity, dimensions } }));
  }

  const enterprises = [enterpriseA, enterpriseB, enterpriseC];
  const vehicles = [];
  const licenses = [];
  for (let index = 0; index < 30; index++) {
    const enterprise = enterprises[index % enterprises.length];
    const model = models[index % models.length];
    const serial = String(index + 1).padStart(3, '0');
    const vehicle = await prisma.vehicle.create({ data: {
      businessNo: `VEH-2026-${serial}`, vin: `LWRCD2026${String(index + 1).padStart(8, '0')}`, deviceNo: `DEV-HZ-${serial}`,
      name: `无人配送车 ${serial}`, modelId: model.id, enterpriseId: enterprise.id, organizationId: enterprise.organizationId,
      color: index % 3 === 0 ? '科技蓝' : index % 3 === 1 ? '云杉白' : '岩石灰', manufactureDate: new Date(2025, index % 12, 2 + (index % 20)), serviceStartDate: new Date(2026, index % 8, 5 + (index % 18)),
      status: index >= 28 ? 'INACTIVE' : 'ACTIVE', onlineStatus: index % 4 === 0 ? 'OFFLINE' : 'ONLINE',
    } });
    vehicles.push(vehicle);
    await prisma.vehicleArchive.create({ data: { archiveNo: `ARC-2026-${serial}`, vehicleId: vehicle.id, registeredAt: new Date(2026, index % 8, 5 + (index % 18)), lifecycleStatus: index >= 28 ? 'SUSPENDED' : 'IN_SERVICE' } });
    if (index < 27) licenses.push(await prisma.vehicleLicense.create({ data: { businessNo: `LIC-BIZ-${serial}`, licenseNo: `浙杭无配${serial}`, vehicleId: vehicle.id, enterpriseId: enterprise.id, organizationId: enterprise.organizationId, issuedAt: new Date(2026, 0, 15), expiresAt: new Date(2027, 0, 14), status: index === 26 ? 'SUSPENDED' : 'VALID' } }));
  }

  const qualifications = [
    [enterpriseA.id, '道路运输经营许可', '浙交运管许可A001', '杭州市交通运输局', '2025-03-01', '2028-02-28'],
    [enterpriseA.id, '无人配送运营备案', '杭无配备案A006', '余杭区交通运输局', '2026-01-10', '2027-01-09'],
    [enterpriseB.id, '道路运输经营许可', '浙交运管许可B002', '杭州市交通运输局', '2025-06-01', '2028-05-31'],
    [enterpriseB.id, '无人配送运营备案', '杭无配备案B008', '杭州市交通运输局', '2026-02-12', '2027-02-11'],
    [enterpriseC.id, '道路运输经营许可', '浙交运管许可C003', '杭州市交通运输局', '2024-08-01', '2027-07-31'],
  ] as const;
  for (let index = 0; index < qualifications.length; index++) {
    const [enterpriseId, qualificationType, certificateNo, issuedBy, issuedAt, expiresAt] = qualifications[index];
    await prisma.enterpriseQualification.create({ data: { businessNo: `QUAL-${String(index + 1).padStart(3, '0')}`, enterpriseId, qualificationType, certificateNo, issuedBy, issuedAt: new Date(issuedAt), expiresAt: new Date(expiresAt), status: enterpriseId === enterpriseC.id ? 'SUSPENDED' : 'VALID' } });
  }

  const onboardingFlow = await prisma.processDefinition.create({ data: {
    businessNo: 'PROC-2026-ENT-001', code: 'ENTERPRISE_ONBOARDING_V1', name: '企业入驻标准审批流程', applicationType: 'ENTERPRISE_ONBOARDING', version: 1, status: 'ACTIVE', description: '企业材料初审后由监管管理员复核。',
    nodes: { create: [
      { nodeCode: 'MATERIAL_REVIEW', name: '材料初审', orderNo: 1, approvalRoleCode: 'APPROVER', timeLimitHours: 24 },
      { nodeCode: 'BUSINESS_REVIEW', name: '业务复核', orderNo: 2, approvalRoleCode: 'REGULATORY_ADMIN', timeLimitHours: 48 },
    ] },
  }, include: { nodes: { orderBy: { orderNo: 'asc' } } } });
  const roadFlow = await prisma.processDefinition.create({ data: {
    businessNo: 'PROC-2026-ROAD-001', code: 'ROAD_TEST_V1', name: '路测许可审批流程', applicationType: 'ROAD_TEST', version: 1, status: 'ACTIVE', description: '路测材料受理与安全合规复核。',
    nodes: { create: [
      { nodeCode: 'ROAD_MATERIAL_REVIEW', name: '路测材料初审', orderNo: 1, approvalRoleCode: 'APPROVER', timeLimitHours: 24 },
      { nodeCode: 'SAFETY_REVIEW', name: '安全合规复核', orderNo: 2, approvalRoleCode: 'REGULATORY_ADMIN', timeLimitHours: 48 },
    ] },
  }, include: { nodes: { orderBy: { orderNo: 'asc' } } } });
  const renewalFlow = await prisma.processDefinition.create({ data: {
    businessNo: 'PROC-2026-REN-001', code: 'LICENSE_RENEWAL_V1', name: '牌照续期审批流程', applicationType: 'LICENSE_RENEWAL', version: 1, status: 'ACTIVE', description: '核验现有牌照与续期材料后完成许可复核。',
    nodes: { create: [
      { nodeCode: 'RENEWAL_ACCEPT', name: '续期受理', orderNo: 1, approvalRoleCode: 'APPROVER', timeLimitHours: 24 },
      { nodeCode: 'LICENSE_REVIEW', name: '许可复核', orderNo: 2, approvalRoleCode: 'REGULATORY_ADMIN', timeLimitHours: 48 },
    ] },
  }, include: { nodes: { orderBy: { orderNo: 'asc' } } } });

  const approvedRoad = await prisma.admissionApplication.create({ data: {
    businessNo: 'APP-ROAD-2026-001', applicationType: 'ROAD_TEST', title: '未来科技城末端配送路测申请', applicantUserId: userMap.get('ent_admin')!, enterpriseId: enterpriseA.id, organizationId: enterpriseA.organizationId,
    status: 'APPROVED', submittedAt: new Date('2026-08-20T01:30:00Z'), completedAt: new Date('2026-08-22T08:00:00Z'), roadTestStartAt: new Date('2026-09-10'), roadTestEndAt: new Date('2026-10-10'),
    roadTestRoute: '未来科技城文一西路—良睦路—海创园内部道路', testPlan: '分低峰、平峰两个时段验证自主通行、临停避让和末端装卸能力。', safetyMeasures: '配置远程安全员、电子围栏和异常停车预案。',
    vehicles: { create: [{ vehicleId: vehicles[27].id }] },
  } });
  const approvedRoadInstance = await prisma.processInstance.create({ data: { businessNo: 'FLOW-ROAD-2026-001', applicationId: approvedRoad.id, processDefinitionId: roadFlow.id, status: 'APPROVED', currentNodeOrder: 2, startedAt: new Date('2026-08-20T01:30:00Z'), completedAt: new Date('2026-08-22T08:00:00Z') } });
  const approvedRoadTask1 = await prisma.approvalTask.create({ data: { businessNo: 'TASK-ROAD-2026-001', applicationId: approvedRoad.id, processInstanceId: approvedRoadInstance.id, nodeDefinitionId: roadFlow.nodes[0].id, assigneeRoleCode: 'APPROVER', status: 'APPROVED', handlerUserId: userMap.get('approver')!, dueAt: new Date('2026-08-21T01:30:00Z'), handledAt: new Date('2026-08-20T06:00:00Z'), comment: '材料齐全，进入安全复核。' } });
  const approvedRoadTask2 = await prisma.approvalTask.create({ data: { businessNo: 'TASK-ROAD-2026-002', applicationId: approvedRoad.id, processInstanceId: approvedRoadInstance.id, nodeDefinitionId: roadFlow.nodes[1].id, assigneeRoleCode: 'REGULATORY_ADMIN', status: 'APPROVED', handlerUserId: userMap.get('reg_admin')!, dueAt: new Date('2026-08-22T06:00:00Z'), handledAt: new Date('2026-08-22T08:00:00Z'), comment: '安全措施满足限定区域路测要求。' } });
  await prisma.approvalHistory.createMany({ data: [
    { applicationId: approvedRoad.id, processInstanceId: approvedRoadInstance.id, actorUserId: userMap.get('ent_admin')!, actorName: '企业管理员', action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'IN_REVIEW', nodeName: roadFlow.nodes[0].name, comment: '提交审批', createdAt: new Date('2026-08-20T01:30:00Z') },
    { applicationId: approvedRoad.id, processInstanceId: approvedRoadInstance.id, taskId: approvedRoadTask1.id, actorUserId: userMap.get('approver')!, actorName: '审批专员', action: 'APPROVE_NODE', fromStatus: 'IN_REVIEW', toStatus: 'IN_REVIEW', nodeName: roadFlow.nodes[0].name, comment: approvedRoadTask1.comment, createdAt: new Date('2026-08-20T06:00:00Z') },
    { applicationId: approvedRoad.id, processInstanceId: approvedRoadInstance.id, taskId: approvedRoadTask2.id, actorUserId: userMap.get('reg_admin')!, actorName: '监管管理员', action: 'APPROVE', fromStatus: 'IN_REVIEW', toStatus: 'APPROVED', nodeName: roadFlow.nodes[1].name, comment: approvedRoadTask2.comment, createdAt: new Date('2026-08-22T08:00:00Z') },
  ] });
  const approvedRoadResult = await prisma.approvalResult.create({ data: { businessNo: 'RESULT-ROAD-2026-001', applicationId: approvedRoad.id, resultType: 'ROAD_TEST', documentNo: '杭无配路测许字〔2026〕001号', issuedAt: new Date('2026-08-22T08:00:00Z'), validFrom: new Date('2026-09-10'), validTo: new Date('2026-10-10'), content: '批准在限定路线和时段开展道路测试。' } });

  const pendingRoad = await prisma.admissionApplication.create({ data: {
    businessNo: 'APP-ROAD-2026-002', applicationType: 'ROAD_TEST', title: '云栖小镇支线配送路测申请', applicantUserId: userMap.get('ent_admin')!, enterpriseId: enterpriseA.id, organizationId: enterpriseA.organizationId,
    status: 'IN_REVIEW', currentNodeName: roadFlow.nodes[0].name, submittedAt: new Date('2026-09-01T02:00:00Z'), roadTestStartAt: new Date('2026-09-15'), roadTestEndAt: new Date('2026-10-15'), roadTestRoute: '云栖小镇园区内部道路及河山街连接段', testPlan: '完成 500 公里累计测试并记录人工接管事件。', safetyMeasures: '全程远程监控，恶劣天气暂停测试。', vehicles: { create: [{ vehicleId: vehicles[0].id }] },
  } });
  const pendingRoadInstance = await prisma.processInstance.create({ data: { businessNo: 'FLOW-ROAD-2026-002', applicationId: pendingRoad.id, processDefinitionId: roadFlow.id, currentNodeOrder: 1, startedAt: new Date('2026-09-01T02:00:00Z') } });
  await prisma.approvalTask.create({ data: { businessNo: 'TASK-ROAD-2026-003', applicationId: pendingRoad.id, processInstanceId: pendingRoadInstance.id, nodeDefinitionId: roadFlow.nodes[0].id, assigneeRoleCode: 'APPROVER', dueAt: new Date('2026-09-03T02:00:00Z') } });
  await prisma.approvalHistory.create({ data: { applicationId: pendingRoad.id, processInstanceId: pendingRoadInstance.id, actorUserId: userMap.get('ent_admin')!, actorName: '企业管理员', action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'IN_REVIEW', nodeName: roadFlow.nodes[0].name, comment: '提交审批', createdAt: new Date('2026-09-01T02:00:00Z') } });

  const returnedOnboarding = await prisma.admissionApplication.create({ data: {
    businessNo: 'APP-ENT-2026-001', applicationType: 'ENTERPRISE_ONBOARDING', title: '无人配送运营主体入驻补正', applicantUserId: userMap.get('ent_admin')!, enterpriseId: enterpriseA.id, organizationId: enterpriseA.organizationId,
    status: 'RETURNED', enterpriseNameSnapshot: enterpriseA.name, creditCodeSnapshot: enterpriseA.creditCode, legalRepresentative: enterpriseA.legalRepresentative, contactName: enterpriseA.contactName, contactPhone: enterpriseA.contactPhone, registeredAddress: enterpriseA.registeredAddress, operationPlan: '开展余杭区末端配送和园区接驳业务。', qualificationSummary: '已提交道路运输经营许可，需补充安全生产制度附件。', submittedAt: new Date('2026-08-28T03:00:00Z'),
  } });
  const returnedInstance = await prisma.processInstance.create({ data: { businessNo: 'FLOW-ENT-2026-001', applicationId: returnedOnboarding.id, processDefinitionId: onboardingFlow.id, status: 'RETURNED', currentNodeOrder: 1, startedAt: new Date('2026-08-28T03:00:00Z'), completedAt: new Date('2026-08-29T03:30:00Z') } });
  const returnedTask = await prisma.approvalTask.create({ data: { businessNo: 'TASK-ENT-2026-001', applicationId: returnedOnboarding.id, processInstanceId: returnedInstance.id, nodeDefinitionId: onboardingFlow.nodes[0].id, assigneeRoleCode: 'APPROVER', status: 'RETURNED', handlerUserId: userMap.get('approver')!, dueAt: new Date('2026-08-29T03:00:00Z'), handledAt: new Date('2026-08-29T03:30:00Z'), comment: '请补充安全生产责任制度和应急联络表。' } });
  await prisma.approvalHistory.createMany({ data: [
    { applicationId: returnedOnboarding.id, processInstanceId: returnedInstance.id, actorUserId: userMap.get('ent_admin')!, actorName: '企业管理员', action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'IN_REVIEW', nodeName: onboardingFlow.nodes[0].name, comment: '提交审批', createdAt: new Date('2026-08-28T03:00:00Z') },
    { applicationId: returnedOnboarding.id, processInstanceId: returnedInstance.id, taskId: returnedTask.id, actorUserId: userMap.get('approver')!, actorName: '审批专员', action: 'RETURN', fromStatus: 'IN_REVIEW', toStatus: 'RETURNED', nodeName: onboardingFlow.nodes[0].name, comment: returnedTask.comment, createdAt: new Date('2026-08-29T03:30:00Z') },
  ] });

  const renewal = await prisma.admissionApplication.create({ data: {
    businessNo: 'APP-REN-2026-001', applicationType: 'LICENSE_RENEWAL', title: '浙杭无配001牌照续期申请', applicantUserId: userMap.get('ent_admin')!, enterpriseId: enterpriseA.id, organizationId: enterpriseA.organizationId, status: 'IN_REVIEW', currentNodeName: renewalFlow.nodes[1].name, submittedAt: new Date('2026-08-30T04:00:00Z'), targetLicenseId: licenses[0].id, requestedExpiresAt: new Date('2028-01-14'), renewalReason: '车辆持续投入运营，年度安全检查合格，申请延长有效期一年。',
  } });
  const renewalInstance = await prisma.processInstance.create({ data: { businessNo: 'FLOW-REN-2026-001', applicationId: renewal.id, processDefinitionId: renewalFlow.id, currentNodeOrder: 2, startedAt: new Date('2026-08-30T04:00:00Z') } });
  const renewalTask1 = await prisma.approvalTask.create({ data: { businessNo: 'TASK-REN-2026-001', applicationId: renewal.id, processInstanceId: renewalInstance.id, nodeDefinitionId: renewalFlow.nodes[0].id, assigneeRoleCode: 'APPROVER', status: 'APPROVED', handlerUserId: userMap.get('approver')!, dueAt: new Date('2026-08-31T04:00:00Z'), handledAt: new Date('2026-08-30T08:00:00Z'), comment: '续期材料齐全。' } });
  await prisma.approvalTask.create({ data: { businessNo: 'TASK-REN-2026-002', applicationId: renewal.id, processInstanceId: renewalInstance.id, nodeDefinitionId: renewalFlow.nodes[1].id, assigneeRoleCode: 'REGULATORY_ADMIN', dueAt: new Date('2026-09-01T08:00:00Z') } });
  await prisma.approvalHistory.createMany({ data: [
    { applicationId: renewal.id, processInstanceId: renewalInstance.id, actorUserId: userMap.get('ent_admin')!, actorName: '企业管理员', action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'IN_REVIEW', nodeName: renewalFlow.nodes[0].name, comment: '提交审批', createdAt: new Date('2026-08-30T04:00:00Z') },
    { applicationId: renewal.id, processInstanceId: renewalInstance.id, taskId: renewalTask1.id, actorUserId: userMap.get('approver')!, actorName: '审批专员', action: 'APPROVE_NODE', fromStatus: 'IN_REVIEW', toStatus: 'IN_REVIEW', nodeName: renewalFlow.nodes[0].name, comment: renewalTask1.comment, createdAt: new Date('2026-08-30T08:00:00Z') },
  ] });

  const regionA = await prisma.operationRegion.create({ data: {
    businessNo: 'REGION-2026-001', name: '未来科技城示范运营区', regionType: 'OPERATION', enterpriseId: enterpriseA.id, organizationId: district.id,
    approvalResultId: approvedRoadResult.id, polygonJson: JSON.stringify(regionPolygons[0]), validFrom: new Date('2026-09-01'), validTo: new Date('2027-08-31'), speedLimit: 20, allowedHours: '06:00-22:00',
    ruleDescription: '仅限获批车辆开展末端配送；学校周边限速 10km/h。', vehicles: { create: vehicles.filter((_, index) => index % 3 === 0).slice(0, 8).map((vehicle) => ({ vehicleId: vehicle.id })) },
  } });
  const regionB = await prisma.operationRegion.create({ data: {
    businessNo: 'REGION-2026-002', name: '云栖小镇配送运营区', regionType: 'OPERATION', enterpriseId: enterpriseB.id, organizationId: city.id,
    polygonJson: JSON.stringify(regionPolygons[1]), validFrom: new Date('2026-06-01'), validTo: new Date('2027-05-31'), speedLimit: 18, allowedHours: '07:00-21:00',
    ruleDescription: '园区主路运行，早晚高峰避开公交站点。', vehicles: { create: vehicles.filter((_, index) => index % 3 === 1).slice(0, 8).map((vehicle) => ({ vehicleId: vehicle.id })) },
  } });
  const regionC = await prisma.operationRegion.create({ data: {
    businessNo: 'REGION-2026-003', name: '下沙末端配送试运行区', regionType: 'TEMPORARY', enterpriseId: enterpriseC.id, organizationId: city.id,
    polygonJson: JSON.stringify(regionPolygons[2]), validFrom: new Date('2026-04-01'), validTo: new Date('2026-09-30'), status: 'INACTIVE', approvalStatus: 'APPROVED', speedLimit: 15,
    allowedHours: '09:00-17:00', ruleDescription: '整改期间暂停运行，恢复前需完成设备复核。', vehicles: { create: vehicles.filter((_, index) => index % 3 === 2).slice(0, 6).map((vehicle) => ({ vehicleId: vehicle.id })) },
  } });
  const regionCity = await prisma.operationRegion.create({ data: {
    businessNo: 'REGION-2026-004', name: '城西科创大走廊联运区', regionType: 'ROAD_TEST', organizationId: city.id,
    polygonJson: JSON.stringify(regionPolygons[3]), validFrom: new Date('2026-09-01'), validTo: new Date('2026-12-31'), approvalStatus: 'PENDING', status: 'INACTIVE', speedLimit: 20,
    allowedHours: '10:00-16:00', ruleDescription: '跨区联运方案待联合审批，未启用。',
  } });
  const vehicleRegions = [regionA, regionB, regionC];
  const now = new Date();
  for (let index = 0; index < vehicles.length; index++) {
    const route = routeForVehicle(index);
    const sampled = samplePath(route, 0.08 + (index % 9) * 0.09);
    const isOnline = index % 4 !== 0 && index < 28;
    const drivingState = !isOnline ? 'OFFLINE' : index % 3 === 0 ? 'RUNNING' : index % 3 === 1 ? 'IDLE' : 'PARKED';
    await prisma.vehicleRealtimeStatus.create({ data: {
      vehicleId: vehicles[index].id, longitude: sampled.point.longitude, latitude: sampled.point.latitude, speed: drivingState === 'RUNNING' ? 8 + index % 11 : 0,
      heading: sampled.heading, battery: 18 + (index * 7) % 81, drivingState,
      autonomousState: !isOnline ? 'STANDBY' : index % 9 === 0 ? 'REMOTE_TAKEOVER' : index % 7 === 0 ? 'MANUAL' : 'AUTO',
      signalStrength: isOnline ? 68 + index % 31 : 0, mileageToday: isOnline ? 12.5 + index * 1.7 : 0,
      locationTime: new Date(now.getTime() - (isOnline ? index % 6 : 45 + index) * 60_000),
      heartbeatAt: new Date(now.getTime() - (isOnline ? index % 6 : 45 + index) * 60_000),
    } });
    await prisma.vehicle.update({ where: { id: vehicles[index].id }, data: { onlineStatus: isOnline ? 'ONLINE' : 'OFFLINE' } });

    const region = vehicleRegions[index % 3]; const running = isOnline && index % 5 === 0;
    const startedAt = new Date(now.getTime() - (running ? 74 : 180 + index * 13) * 60_000);
    const track = takeTrack(route, 52); const durationMinutes = running ? 74 : 62 + index % 38;
    const record = await prisma.operationRecord.create({ data: {
      businessNo: `RUN-20260902-${String(index + 1).padStart(3, '0')}`, vehicleId: vehicles[index].id,
      enterpriseId: vehicles[index].enterpriseId, organizationId: vehicles[index].organizationId, regionId: region.id,
      startedAt, endedAt: running ? undefined : new Date(startedAt.getTime() + durationMinutes * 60_000),
      startAddress: index % 3 === 0 ? '海创园' : index % 3 === 1 ? '云栖小镇国际会展中心' : '下沙高教园区',
      endAddress: index % 3 === 0 ? '梦想小镇创业大街' : index % 3 === 1 ? '河山街配送站' : '金沙湖服务点',
      mileage: 8.4 + index * 0.46, durationMinutes, avgSpeed: 10.2 + index % 7, maxSpeed: 16 + index % 8,
      energyUsed: 5.8 + index % 6, status: running ? 'RUNNING' : index % 11 === 0 ? 'INTERRUPTED' : 'COMPLETED',
      autonomousMiles: 7.8 + index * 0.41, manualTakeovers: index % 8 === 0 ? 1 : 0,
    } });
    await prisma.vehicleTrackPoint.createMany({ data: track.map((point, sequence) => {
      const progress = sequence / Math.max(track.length - 1, 1);
      const next = track[Math.min(track.length - 1, sequence + 1)];
      return {
        operationRecordId: record.id, vehicleId: vehicles[index].id, sequence: sequence + 1,
        longitude: point.longitude, latitude: point.latitude,
        speed: sequence === 8 || sequence === 23 ? 0 : 7 + ((sequence * 3 + index) % 14),
        battery: Math.max(8, 94 - Math.floor(progress * (18 + index % 12))), heading: headingBetween(point, next),
        autonomousState: sequence === 18 && index % 8 === 0 ? 'REMOTE_TAKEOVER' : 'AUTO',
        pointType: sequence === 8 || sequence === 23 ? 'STOP' : sequence === 18 && index % 8 === 0 ? 'ALERT' : 'NORMAL',
        recordedAt: new Date(startedAt.getTime() + Math.floor(progress * durationMinutes) * 60_000),
      };
    }) });
  }

  const metricStart = new Date(now); metricStart.setUTCHours(0, 0, 0, 0); metricStart.setUTCDate(metricStart.getUTCDate() - 6);
  for (let day = 0; day < 7; day++) {
    const metricDate = new Date(metricStart); metricDate.setUTCDate(metricStart.getUTCDate() + day);
    await prisma.vehicleOnlineDaily.createMany({ data: vehicles.map((vehicle, index) => {
      const enterprisePenalty = index % 3 === 2 ? 14 : index % 3 === 1 ? 5 : 0;
      const rate = Math.max(55, 96 - enterprisePenalty - ((index * 3 + day * 5) % 17));
      const onlineMinutes = Math.round(1440 * rate / 100);
      return { vehicleId: vehicle.id, metricDate, onlineMinutes, totalMinutes: 1440, onlineRate: rate,
        firstOnlineAt: new Date(metricDate.getTime() + 6 * 3_600_000 + (index % 4) * 600_000),
        lastOnlineAt: new Date(metricDate.getTime() + 20 * 3_600_000 + (index % 3) * 600_000) };
    }) });
  }

  const fenceNoEntry = await prisma.electronicFence.create({ data: {
    businessNo: 'FENCE-2026-001', name: '未来科技城校园禁行区', fenceType: 'NO_ENTRY', organizationId: district.id,
    polygonJson: JSON.stringify(fencePolygons.campusNoEntry),
    validFrom: new Date('2026-09-01'), active: true, allowedHours: '00:00-24:00', ruleDescription: '校园核心区全天禁入，触发后立即生成高等级告警。',
  } });
  const fenceSpeed = await prisma.electronicFence.create({ data: {
    businessNo: 'FENCE-2026-002', name: '文一西路学校周边限速区', fenceType: 'SPEED_LIMIT', enterpriseId: enterpriseA.id, organizationId: district.id,
    polygonJson: JSON.stringify(fencePolygons.schoolSpeed),
    validFrom: new Date('2026-09-01'), active: true, speedLimit: 10, allowedHours: '07:00-19:00', ruleDescription: '学校周边限速 10km/h。', vehicles: { create: vehicles.slice(0, 10).map((vehicle) => ({ vehicleId: vehicle.id })) },
  } });
  await prisma.electronicFence.create({ data: {
    businessNo: 'FENCE-2026-003', name: '云栖会展临时管制区', fenceType: 'TEMPORARY', enterpriseId: enterpriseB.id, organizationId: city.id,
    polygonJson: JSON.stringify(fencePolygons.yunqiExpo),
    validFrom: new Date('2026-09-02'), validTo: new Date('2026-09-12'), active: false, ruleDescription: '会展期间临时管制，启用后进入即告警。',
  } });

  const alert1 = await prisma.safetyAlert.create({ data: { businessNo: 'ALT-20260902-001', alertType: 'OVERSPEED', source: 'FENCE_RULE', level: 'HIGH', title: '余杭配送 01 触发限速围栏', description: '文一西路学校周边速度 18km/h，规则上限 10km/h。', enterpriseId: enterpriseA.id, organizationId: vehicles[0].organizationId, vehicleId: vehicles[0].id, longitude: pois.schoolGate.longitude, latitude: pois.schoolGate.latitude, occurredAt: new Date(now.getTime() - 35 * 60_000), status: 'PENDING_CONFIRMATION' } });
  await prisma.fenceTrigger.create({ data: { businessNo: 'FTR-20260902-001', fenceId: fenceSpeed.id, vehicleId: vehicles[0].id, alertId: alert1.id, triggerType: 'OVERSPEED', longitude: pois.schoolGate.longitude, latitude: pois.schoolGate.latitude, speed: 18, occurredAt: alert1.occurredAt } });
  const alert2 = await prisma.safetyAlert.create({ data: { businessNo: 'ALT-20260902-002', alertType: 'NO_ENTRY', source: 'FENCE_RULE', level: 'CRITICAL', title: '余杭配送 04 进入校园禁行区', description: '车辆进入全天禁行区域，需要立即核实。', enterpriseId: enterpriseA.id, organizationId: vehicles[3].organizationId, vehicleId: vehicles[3].id, longitude: pois.campusGate.longitude, latitude: pois.campusGate.latitude, occurredAt: new Date(now.getTime() - 90 * 60_000), status: 'IN_PROGRESS', responsibleUserId: userMap.get('reg_user'), confirmedAt: new Date(now.getTime() - 80 * 60_000), lastComment: '已联系企业安全负责人，车辆已远程停车。' } });
  await prisma.fenceTrigger.create({ data: { businessNo: 'FTR-20260902-002', fenceId: fenceNoEntry.id, vehicleId: vehicles[3].id, alertId: alert2.id, triggerType: 'ENTER', longitude: pois.campusGate.longitude, latitude: pois.campusGate.latitude, speed: 7, occurredAt: alert2.occurredAt } });
  const alert3 = await prisma.safetyAlert.create({ data: { businessNo: 'ALT-20260902-003', alertType: 'AUTONOMOUS_ABNORMAL', source: 'VEHICLE_REPORT', level: 'HIGH', title: '自动驾驶系统降级并触发远程接管', description: '感知置信度降低，车辆已切换远程接管。', enterpriseId: enterpriseA.id, organizationId: vehicles[6].organizationId, vehicleId: vehicles[6].id, longitude: pois.haichuangGate.longitude, latitude: pois.haichuangGate.latitude, occurredAt: new Date(now.getTime() - 4 * 3_600_000), status: 'PENDING_REVIEW', responsibleUserId: userMap.get('reg_user'), confirmedAt: new Date(now.getTime() - 3.8 * 3_600_000), lastComment: '企业已完成传感器清洁与自检，请求复核。' } });
  const alert4 = await prisma.safetyAlert.create({ data: { businessNo: 'ALT-20260902-004', alertType: 'VEHICLE_FAULT', source: 'ENTERPRISE_REPORT', level: 'MEDIUM', title: '制动系统传感器间歇异常', description: '企业巡检发现制动压力传感器偶发跳变。', enterpriseId: enterpriseA.id, organizationId: vehicles[9].organizationId, vehicleId: vehicles[9].id, longitude: pois.mengxiangTown.longitude, latitude: pois.mengxiangTown.latitude, occurredAt: new Date(now.getTime() - 26 * 3_600_000), status: 'CLOSED', responsibleUserId: userMap.get('reg_user'), confirmedAt: new Date(now.getTime() - 25 * 3_600_000), closedAt: new Date(now.getTime() - 20 * 3_600_000), lastComment: '更换传感器并完成道路复测，复核关闭。' } });
  const offlineVehicle = vehicles[12];
  const alert5 = await prisma.safetyAlert.create({ data: { businessNo: 'ALT-20260902-005', alertType: 'OFFLINE', source: 'OFFLINE_RULE', level: 'MEDIUM', title: `${offlineVehicle.name}持续离线`, description: '车辆心跳超过 10 分钟未更新。', enterpriseId: offlineVehicle.enterpriseId, organizationId: offlineVehicle.organizationId, vehicleId: offlineVehicle.id, longitude: pois.yunqiExpo.longitude, latitude: pois.yunqiExpo.latitude, occurredAt: new Date(now.getTime() - 75 * 60_000), status: 'PENDING_HANDLING' } });
  await prisma.offlineEvent.create({ data: { businessNo: 'OFF-20260902-001', vehicleId: offlineVehicle.id, enterpriseId: offlineVehicle.enterpriseId, organizationId: offlineVehicle.organizationId, alertId: alert5.id, startedAt: alert5.occurredAt, durationMinutes: 75, status: 'OFFLINE' } });

  const record0 = await prisma.operationRecord.findFirstOrThrow({ where: { vehicleId: vehicles[0].id }, orderBy: { startedAt: 'desc' } });
  const accident = await prisma.accident.create({ data: { businessNo: 'ACC-20260901-001', source: 'ENTERPRISE_REPORT', accidentType: 'PROPERTY_DAMAGE', level: 'MEDIUM', title: '园区装卸区轻微刮擦事故', description: '车辆低速倒车时与隔离栏发生刮擦，无人员受伤。', enterpriseId: enterpriseA.id, organizationId: vehicles[0].organizationId, vehicleId: vehicles[0].id, operationRecordId: record0.id, reporterUserId: userMap.get('ent_admin'), longitude: pois.haichuangGate.longitude, latitude: pois.haichuangGate.latitude, address: '海创园装卸区', occurredAt: new Date(record0.startedAt.getTime() + 38 * 60_000), damageDescription: '右后侧外壳轻微划痕，隔离栏无结构损坏。', status: 'INVESTIGATING', investigation: '已调取运行记录和现场照片，等待设备日志。' } });
  await prisma.accident.create({ data: { businessNo: 'ACC-20260826-001', source: 'REGULATORY_ENTRY', accidentType: 'COLLISION', level: 'HIGH', title: '配送车与非机动车轻微碰撞', description: '路口避让过程中发生低速接触，一人轻微擦伤。', enterpriseId: enterpriseB.id, organizationId: city.id, vehicleId: vehicles[1].id, reporterUserId: userMap.get('reg_user'), longitude: pois.heshanJunction.longitude, latitude: pois.heshanJunction.latitude, address: '云栖小镇河山街路口', occurredAt: new Date(now.getTime() - 7 * 86400000), casualties: 1, status: 'CLOSED', responsibility: '企业车辆承担次要责任。', disposalProgress: '伤者已完成检查，企业完成赔付与驾驶策略整改。', closedAt: new Date(now.getTime() - 3 * 86400000) } });

  await prisma.violation.create({ data: { businessNo: 'VIO-20260902-001', violationType: 'OVERSPEED', level: 'MEDIUM', title: '学校周边超速运行', description: '围栏限速 10km/h，实测 18km/h。', enterpriseId: enterpriseA.id, organizationId: vehicles[0].organizationId, vehicleId: vehicles[0].id, operationRecordId: record0.id, alertId: alert1.id, longitude: pois.schoolGate.longitude, latitude: pois.schoolGate.latitude, occurredAt: alert1.occurredAt, status: 'PENDING_DETERMINATION' } });
  await prisma.violation.create({ data: { businessNo: 'VIO-20260831-001', violationType: 'OUT_OF_BOUNDS', level: 'HIGH', title: '超出批准运营区域', description: '车辆偏离批准区域约 240 米。', enterpriseId: enterpriseA.id, organizationId: vehicles[3].organizationId, vehicleId: vehicles[3].id, alertId: alert2.id, longitude: pois.campusGate.longitude, latitude: pois.campusGate.latitude, occurredAt: alert2.occurredAt, status: 'RECTIFYING', determination: '轨迹与围栏证据确认越界成立。' } });
  await prisma.violation.create({ data: { businessNo: 'VIO-20260820-001', violationType: 'OVERTIME', level: 'LOW', title: '超出许可时段运行', description: '许可截止 21:00，车辆于 21:18 仍处于运行状态。', enterpriseId: enterpriseB.id, organizationId: city.id, vehicleId: vehicles[4].id, occurredAt: new Date(now.getTime() - 13 * 86400000), status: 'CLOSED', determination: '违规成立。', rectification: '企业已调整调度系统时段校验。', reviewComment: '整改通过。', closedAt: new Date(now.getTime() - 10 * 86400000) } });

  await prisma.accidentReconstruction.create({ data: {
    accidentId: accident.id, enterpriseId: enterpriseA.id, organizationId: district.id, windowMinutes: 30,
    evidenceJson: JSON.stringify({ trackPoints: 31, alerts: 1, violations: 1, maxSpeed: 18, minBattery: 72, takeovers: 0 }),
    causeJson: JSON.stringify({ primaryCause: '低速倒车阶段的障碍物边缘识别延迟', contributingFactor: '装卸区隔离栏反光标识不完整' }),
    conclusion: '事故发生前车辆处于低速自动驾驶状态，未出现远程接管；结合轨迹和设备告警，认定为感知盲区与场地标识共同导致的轻微财产损失事故。',
    recommendation: '优化倒车策略并补充装卸区反光标识，完成同场景 20 次回归测试后恢复该点位自动倒车。', status: 'COMPLETED',
    analystId: userMap.get('reg_user')!, analystName: '监管工作人员', completedAt: new Date(now.getTime() - 35 * 60_000),
  } });

  const indicatorSeeds = [
    { code: 'SAFE_ALERT_RATE', name: '百次运行告警数', dimension: 'SAFETY', metricKey: 'alertRate', description: '统计周期内每百次运行产生的安全告警数量。', weight: 20, direction: 'LOWER_BETTER', rules: [{ minValue: 0, maxValue: 10, score: 95, label: '低于 10 次', orderNo: 1 }, { minValue: 10, maxValue: 20, score: 85, label: '10–20 次', orderNo: 2 }, { minValue: 20, maxValue: 40, score: 70, label: '20–40 次', orderNo: 3 }, { minValue: 40, score: 50, label: '40 次及以上', orderNo: 4 }] },
    { code: 'SAFE_ACCIDENT', name: '事故发生数', dimension: 'SAFETY', metricKey: 'accidentCount', description: '统计周期内已上报事故数量。', weight: 20, direction: 'LOWER_BETTER', rules: [{ minValue: 0, maxValue: 1, score: 100, label: '无事故', orderNo: 1 }, { minValue: 1, maxValue: 2, score: 75, label: '1 起事故', orderNo: 2 }, { minValue: 2, score: 45, label: '2 起及以上', orderNo: 3 }] },
    { code: 'COMP_VIOLATION', name: '违规发生数', dimension: 'COMPLIANCE', metricKey: 'violationCount', description: '统计周期内监管认定的违规数量。', weight: 20, direction: 'LOWER_BETTER', rules: [{ minValue: 0, maxValue: 1, score: 100, label: '无违规', orderNo: 1 }, { minValue: 1, maxValue: 3, score: 75, label: '1–2 次违规', orderNo: 2 }, { minValue: 3, score: 45, label: '3 次及以上', orderNo: 3 }] },
    { code: 'COMP_ONLINE', name: '平均在线率', dimension: 'COMPLIANCE', metricKey: 'onlineRate', description: '车辆联网在线分钟数占统计分钟数比例。', weight: 15, direction: 'HIGHER_BETTER', rules: [{ minValue: 90, score: 95, label: '90% 及以上', orderNo: 1 }, { minValue: 80, maxValue: 90, score: 85, label: '80%–90%', orderNo: 2 }, { minValue: 0, maxValue: 80, score: 65, label: '低于 80%', orderNo: 3 }] },
    { code: 'OPS_AUTONOMY', name: '自主运行率', dimension: 'OPERATION', metricKey: 'autonomousRate', description: '自主运行里程占总运行里程比例。', weight: 15, direction: 'HIGHER_BETTER', rules: [{ minValue: 95, score: 96, label: '95% 及以上', orderNo: 1 }, { minValue: 85, maxValue: 95, score: 86, label: '85%–95%', orderNo: 2 }, { minValue: 0, maxValue: 85, score: 68, label: '低于 85%', orderNo: 3 }] },
    { code: 'OPS_EFFICIENCY', name: '平均运行效率', dimension: 'OPERATION', metricKey: 'operationEfficiency', description: '统计周期内平均每小时运行里程。', weight: 10, direction: 'HIGHER_BETTER', rules: [{ minValue: 10, score: 95, label: '10km/h 及以上', orderNo: 1 }, { minValue: 7, maxValue: 10, score: 82, label: '7–10km/h', orderNo: 2 }, { minValue: 0, maxValue: 7, score: 65, label: '低于 7km/h', orderNo: 3 }] },
  ];
  for (const item of indicatorSeeds) {
    const { rules, ...indicator } = item;
    await prisma.evaluationIndicator.create({ data: { ...indicator, organizationId: city.id, rules: { create: rules } } });
  }

  const currentTask = await prisma.evaluationTask.create({ data: { businessNo: 'EVT-202608-001', name: '2026 年 8 月无人配送企业综合评价', periodType: 'MONTHLY', periodStart: new Date('2026-08-01T00:00:00Z'), periodEnd: new Date('2026-08-31T23:59:59Z'), organizationId: city.id, status: 'PUBLISHED', createdById: userMap.get('reg_admin')!, createdByName: '监管管理员', generatedAt: new Date('2026-09-01T01:30:00Z'), publishedAt: new Date('2026-09-01T03:00:00Z') } });
  const previousTask = await prisma.evaluationTask.create({ data: { businessNo: 'EVT-202607-001', name: '2026 年 7 月无人配送企业综合评价', periodType: 'MONTHLY', periodStart: new Date('2026-07-01T00:00:00Z'), periodEnd: new Date('2026-07-31T23:59:59Z'), organizationId: city.id, status: 'PUBLISHED', createdById: userMap.get('reg_admin')!, createdByName: '监管管理员', generatedAt: new Date('2026-08-01T01:30:00Z'), publishedAt: new Date('2026-08-01T03:00:00Z') } });
  const breakdownA = [{ code: 'SAFE_ALERT_RATE', name: '百次运行告警数', dimension: 'SAFETY', weight: 20, value: 8.4, score: 95, rule: '低于 10 次' }, { code: 'SAFE_ACCIDENT', name: '事故发生数', dimension: 'SAFETY', weight: 20, value: 1, score: 75, rule: '1 起事故' }, { code: 'COMP_VIOLATION', name: '违规发生数', dimension: 'COMPLIANCE', weight: 20, value: 2, score: 75, rule: '1–2 次违规' }, { code: 'COMP_ONLINE', name: '平均在线率', dimension: 'COMPLIANCE', weight: 15, value: 91.6, score: 95, rule: '90% 及以上' }, { code: 'OPS_AUTONOMY', name: '自主运行率', dimension: 'OPERATION', weight: 15, value: 93.1, score: 86, rule: '85%–95%' }, { code: 'OPS_EFFICIENCY', name: '平均运行效率', dimension: 'OPERATION', weight: 10, value: 8.8, score: 82, rule: '7–10km/h' }];
  const breakdownB = [{ code: 'SAFE_ALERT_RATE', name: '百次运行告警数', dimension: 'SAFETY', weight: 20, value: 4.2, score: 95, rule: '低于 10 次' }, { code: 'SAFE_ACCIDENT', name: '事故发生数', dimension: 'SAFETY', weight: 20, value: 1, score: 75, rule: '1 起事故' }, { code: 'COMP_VIOLATION', name: '违规发生数', dimension: 'COMPLIANCE', weight: 20, value: 1, score: 75, rule: '1–2 次违规' }, { code: 'COMP_ONLINE', name: '平均在线率', dimension: 'COMPLIANCE', weight: 15, value: 86.4, score: 85, rule: '80%–90%' }, { code: 'OPS_AUTONOMY', name: '自主运行率', dimension: 'OPERATION', weight: 15, value: 92.5, score: 86, rule: '85%–95%' }, { code: 'OPS_EFFICIENCY', name: '平均运行效率', dimension: 'OPERATION', weight: 10, value: 9.4, score: 82, rule: '7–10km/h' }];
  const currentEvaluationA = await prisma.enterpriseEvaluation.create({ data: { businessNo: 'EVA-202608-001', taskId: currentTask.id, enterpriseId: enterpriseA.id, organizationId: district.id, totalScore: 84.2, grade: 'B', riskLevel: 'MEDIUM', safetyScore: 85, complianceScore: 83.6, operationScore: 84.4, breakdownJson: JSON.stringify(breakdownA), status: 'PUBLISHED', conclusion: '总体运行稳定，需持续降低违规发生数并完善装卸区倒车风险控制。', publishedAt: currentTask.publishedAt } });
  await prisma.enterpriseEvaluation.create({ data: { businessNo: 'EVA-202608-002', taskId: currentTask.id, enterpriseId: enterpriseB.id, organizationId: city.id, totalScore: 83.4, grade: 'B', riskLevel: 'MEDIUM', safetyScore: 85, complianceScore: 79.3, operationScore: 84.4, breakdownJson: JSON.stringify(breakdownB), status: 'PUBLISHED', conclusion: '运行效率良好，建议提升车辆在线稳定性并完成路口策略复盘。', publishedAt: currentTask.publishedAt } });
  const previousEvaluationA = await prisma.enterpriseEvaluation.create({ data: { businessNo: 'EVA-202607-001', taskId: previousTask.id, enterpriseId: enterpriseA.id, organizationId: district.id, totalScore: 79.6, grade: 'C', riskLevel: 'HIGH', safetyScore: 76, complianceScore: 79, operationScore: 85.2, breakdownJson: JSON.stringify(breakdownA.map((item) => ({ ...item, score: Math.max(60, item.score - 6) }))), status: 'PUBLISHED', conclusion: '告警闭环速度与在线稳定性有待提升，列入阶段性关注企业。', publishedAt: previousTask.publishedAt } });
  await prisma.evaluationAppeal.create({ data: { businessNo: 'APL-202607-001', evaluationId: previousEvaluationA.id, enterpriseId: enterpriseA.id, organizationId: district.id, reason: '7 月 18 日通信基站故障造成的批量离线不应全部计入企业责任。', evidence: '运营商故障证明、车辆本地运行日志与恢复时间清单。', status: 'REJECTED', submittedById: userMap.get('ent_admin')!, submittedByName: '企业管理员', reviewerId: userMap.get('reg_admin')!, reviewerName: '监管管理员', reviewComment: '故障证明已纳入人工复核，但按现行规则仍应计入在线率；建议在后续规则修订中增加不可抗力剔除条件。', reviewedAt: new Date('2026-08-04T06:30:00Z'), createdAt: new Date('2026-08-03T02:20:00Z') } });

  await prisma.regulatoryReport.createMany({ data: [
    { businessNo: 'RPT-20260901-001', reportType: 'MONTHLY', category: 'COMPREHENSIVE', title: '2026 年 8 月无人快递车监管月报', periodStart: new Date('2026-08-01T00:00:00Z'), periodEnd: new Date('2026-08-31T23:59:59Z'), organizationId: city.id, summaryJson: JSON.stringify({ operations: { kpis: { vehicles: 20, trips: 30, mileage: 453.9, durationHours: 40.8, autonomousRate: 92.7 } }, safety: { kpis: { alerts: 5, accidents: 2, violations: 3, closureRate: 20 } } }), status: 'DISTRIBUTED', recipient: '市交通运输局相关处室、各区县监管机构', generatedById: userMap.get('reg_admin')!, generatedByName: '监管管理员', generatedAt: new Date('2026-09-01T04:00:00Z'), distributedAt: new Date('2026-09-01T05:00:00Z') },
    { businessNo: 'RPT-20260902-001', reportType: 'WEEKLY', category: 'SAFETY', title: '第 35 周安全态势专题周报', periodStart: new Date('2026-08-24T00:00:00Z'), periodEnd: new Date('2026-08-30T23:59:59Z'), organizationId: city.id, summaryJson: JSON.stringify({ safety: { kpis: { alerts: 3, accidents: 1, violations: 1, closureRate: 33.3 } } }), status: 'GENERATED', generatedById: userMap.get('reg_user')!, generatedByName: '监管工作人员', generatedAt: new Date('2026-09-02T02:00:00Z') },
    { businessNo: 'RPT-20260902-002', reportType: 'MONTHLY', category: 'ENTERPRISE', title: '杭城智运 8 月运营安全报告', periodStart: new Date('2026-08-01T00:00:00Z'), periodEnd: new Date('2026-08-31T23:59:59Z'), enterpriseId: enterpriseA.id, organizationId: district.id, summaryJson: JSON.stringify({ operations: { kpis: { vehicles: 10, trips: 10, mileage: 168.2, durationHours: 13.6, autonomousRate: 93.1 } }, safety: { kpis: { alerts: 4, accidents: 1, violations: 2, closureRate: 25 } } }), status: 'GENERATED', generatedById: userMap.get('reg_user')!, generatedByName: '监管工作人员', generatedAt: new Date('2026-09-02T03:00:00Z') },
  ] });

  const emergency1 = await prisma.emergencyTask.create({ data: { businessNo: 'EMG-20260902-001', alertId: alert2.id, enterpriseId: enterpriseA.id, organizationId: alert2.organizationId, level: 'CRITICAL', title: '校园禁行区车辆紧急撤离', requirement: '立即远程停车，确认周边安全后沿原路撤离；2 小时内反馈处置记录。', assigneeUserId: userMap.get('reg_user'), responseMode: 'REMOTE', dueAt: new Date(now.getTime() + 40 * 60_000), status: 'IN_PROGRESS', dispatchedAt: new Date(now.getTime() - 78 * 60_000), respondedAt: new Date(now.getTime() - 72 * 60_000), logs: { create: [{ actorUserId: userMap.get('reg_user'), actorName: '监管工作人员', action: 'CREATE', toStatus: 'PENDING_DISPATCH', content: '禁行区高等级告警转应急处置。', createdAt: new Date(now.getTime() - 82 * 60_000) }, { actorUserId: userMap.get('reg_user'), actorName: '监管工作人员', action: 'DISPATCH', fromStatus: 'PENDING_DISPATCH', toStatus: 'WAITING_RESPONSE', content: '派发至企业安全负责人。', createdAt: new Date(now.getTime() - 78 * 60_000) }, { actorUserId: userMap.get('ent_admin'), actorName: '企业管理员', action: 'RESPOND', fromStatus: 'WAITING_RESPONSE', toStatus: 'IN_PROGRESS', content: '已远程停车，现场安全员赶往车辆位置。', createdAt: new Date(now.getTime() - 72 * 60_000) }] } } });
  await prisma.emergencyTask.create({ data: { businessNo: 'EMG-20260902-002', alertId: alert3.id, enterpriseId: enterpriseA.id, organizationId: alert3.organizationId, level: 'HIGH', title: '自动驾驶降级事件复核', requirement: '完成传感器诊断、路测验证并上传处置说明。', assigneeUserId: userMap.get('reg_user'), responseMode: 'REMOTE', dueAt: new Date(now.getTime() + 5 * 3_600_000), status: 'PENDING_REVIEW', dispatchedAt: new Date(now.getTime() - 3.5 * 3_600_000), respondedAt: new Date(now.getTime() - 3.2 * 3_600_000), feedback: '已清洁前向感知组件并完成 8 公里复测，未再出现降级。', logs: { create: [{ actorUserId: userMap.get('reg_user'), actorName: '监管工作人员', action: 'CREATE', toStatus: 'PENDING_DISPATCH' }, { actorUserId: userMap.get('ent_admin'), actorName: '企业管理员', action: 'SUBMIT_FEEDBACK', fromStatus: 'IN_PROGRESS', toStatus: 'PENDING_REVIEW', content: '提交处置反馈。' }] } } });
  await prisma.emergencyTask.create({ data: { businessNo: 'EMG-20260828-001', alertId: alert4.id, enterpriseId: enterpriseA.id, organizationId: alert4.organizationId, level: 'MEDIUM', title: '制动传感器异常整改', requirement: '更换故障件并完成复测。', assigneeUserId: userMap.get('reg_user'), responseMode: 'FIELD', dueAt: new Date(now.getTime() - 18 * 3_600_000), status: 'CLOSED', dispatchedAt: new Date(now.getTime() - 25 * 3_600_000), respondedAt: new Date(now.getTime() - 24 * 3_600_000), feedback: '完成更换和复测。', evaluationScore: 5, evaluation: '响应及时，整改证据完整。', closedAt: new Date(now.getTime() - 20 * 3_600_000), logs: { create: [{ actorUserId: userMap.get('reg_user'), actorName: '监管工作人员', action: 'CLOSE', fromStatus: 'PENDING_REVIEW', toStatus: 'CLOSED', content: '复核通过，任务关闭。' }] } } });

  console.log(`Seeded ${users.length} users, ${roleDefs.length} roles, 30 vehicles, 4 admission applications, 4 operation regions, 3 fences, 5 alerts and ${emergency1 ? 3 : 0} emergency tasks.`);
}

main().finally(() => prisma.$disconnect());
