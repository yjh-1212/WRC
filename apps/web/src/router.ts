import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { defineAsyncComponent, nextTick, type Component } from 'vue';
import { useSessionStore } from './stores/session';
import { isAmapConfigured, loadAMap } from './amap';
import LoginView from './views/LoginView.vue';
import AppShell from './components/AppShell.vue';
import type { MenuItem } from './types';

const RegulatoryDashboardView = defineAsyncComponent(() => import('./views/RegulatoryDashboardView.vue'));
const CockpitView = defineAsyncComponent(() => import('./views/CockpitView.vue'));
const ProvinceCockpitView = defineAsyncComponent(() => import('./views/ProvinceCockpitView.vue'));
const EnterpriseDashboardView = defineAsyncComponent(() => import('./views/EnterpriseDashboardView.vue'));
const EnterpriseAccountsView = defineAsyncComponent(() => import('./views/EnterpriseAccountsView.vue'));
const UsersView = defineAsyncComponent(() => import('./views/UsersView.vue'));
const RolesView = defineAsyncComponent(() => import('./views/RolesView.vue'));
const OrganizationsView = defineAsyncComponent(() => import('./views/OrganizationsView.vue'));
const EnterprisesView = defineAsyncComponent(() => import('./views/EnterprisesView.vue'));
const AuditLogsView = defineAsyncComponent(() => import('./views/AuditLogsView.vue'));
const PlaceholderView = defineAsyncComponent(() => import('./views/PlaceholderView.vue'));
const ManufacturersView = defineAsyncComponent(() => import('./views/ManufacturersView.vue'));
const VehicleModelsView = defineAsyncComponent(() => import('./views/VehicleModelsView.vue'));
const VehicleManagementView = defineAsyncComponent(() => import('./views/VehicleManagementView.vue'));
const VehicleArchivesView = defineAsyncComponent(() => import('./views/VehicleArchivesView.vue'));
const EnterpriseArchivesView = defineAsyncComponent(() => import('./views/EnterpriseArchivesView.vue'));
const QualificationsView = defineAsyncComponent(() => import('./views/QualificationsView.vue'));
const AdmissionApplicationsView = defineAsyncComponent(() => import('./views/AdmissionBusinessView.vue'));
const ApprovalWorkbenchView = defineAsyncComponent(() => import('./views/ApprovalWorkbenchView.vue'));
const WorkflowDefinitionsView = defineAsyncComponent(() => import('./views/WorkflowDefinitionsView.vue'));
const AdmissionLicensesView = defineAsyncComponent(() => import('./views/PermitWorkspaceView.vue'));
const RealtimeOperationsView = defineAsyncComponent(() => import('./views/RealtimeOperationsView.vue'));
const VehicleDistributionView = defineAsyncComponent(() => import('./views/VehicleDistributionView.vue'));
const VehicleTrajectoryView = defineAsyncComponent(() => import('./views/VehicleTrajectoryView.vue'));
const OperationRecordsView = defineAsyncComponent(() => import('./views/OperationRecordsView.vue'));
const OnlineMonitorView = defineAsyncComponent(() => import('./views/OnlineMonitorView.vue'));
const OperationRegionsView = defineAsyncComponent(() => import('./views/PassageAreasView.vue'));
const SafetyAlertsView = defineAsyncComponent(() => import('./views/SafetyAlertsView.vue'));
const ElectronicFencesView = defineAsyncComponent(() => import('./views/ElectronicFencesView.vue'));
const AccidentsView = defineAsyncComponent(() => import('./views/AccidentsView.vue'));
const ViolationsView = defineAsyncComponent(() => import('./views/ViolationsView.vue'));
const OfflineSupervisionView = defineAsyncComponent(() => import('./views/OfflineSupervisionView.vue'));
const EmergencyTasksView = defineAsyncComponent(() => import('./views/SafetyTasksWorkspaceView.vue'));
const OperationsAnalysisView = defineAsyncComponent(() => import('./views/OperationsAnalysisView.vue'));
const CityAnalysisView = defineAsyncComponent(() => import('./views/CityAnalysisView.vue'));
const CityEvaluationsView = defineAsyncComponent(() => import('./views/CityEvaluationsView.vue'));
const CityCreditView = defineAsyncComponent(() => import('./views/CityCreditView.vue'));
const CityReportsView = defineAsyncComponent(() => import('./views/CityReportsView.vue'));
const ProvinceAnalysisView = defineAsyncComponent(() => import('./views/ProvinceAnalysisView.vue'));
const SafetySituationView = defineAsyncComponent(() => import('./views/SafetySituationView.vue'));
const AccidentReconstructionView = defineAsyncComponent(() => import('./views/AccidentReconstructionView.vue'));
const EnterpriseEvaluationsView = defineAsyncComponent(() => import('./views/EnterpriseEvaluationsView.vue'));
const SafetyProfilesView = defineAsyncComponent(() => import('./views/SafetyProfilesView.vue'));
const RegulatoryReportsView = defineAsyncComponent(() => import('./views/RegulatoryReportsView.vue'));
const EventCenterView = defineAsyncComponent(() => import('./views/EventCenterView.vue'));
const InterfaceSettingsView = defineAsyncComponent(() => import('./views/InterfaceSettingsView.vue'));
const SafetyOperatorsView = defineAsyncComponent(() => import('./views/SafetyOperatorsView.vue'));
const InspectionsView = defineAsyncComponent(() => import('./views/SafetyInspectionsWorkspaceView.vue'));
const BusinessRulesView = defineAsyncComponent(() => import('./views/BusinessRulesView.vue'));
const CreditAccountsView = defineAsyncComponent(() => import('./views/CreditAccountsView.vue'));
const VehicleCatalogView = defineAsyncComponent(() => import('./views/VehicleCatalogView.vue'));
const SaasOfflineNoticeView = defineAsyncComponent(() => import('./views/SaasOfflineNoticeView.vue'));
const SaasActivationView = defineAsyncComponent(() => import('./views/SaasActivationView.vue'));
const SaasWorkspacesView = defineAsyncComponent(() => import('./views/SaasWorkspacesView.vue'));
const SaasCurrentView = defineAsyncComponent(() => import('./views/SaasCurrentView.vue'));
const SaasMembersView = defineAsyncComponent(() => import('./views/SaasMembersView.vue'));
const SaasRequestsView = defineAsyncComponent(() => import('./views/SaasRequestsView.vue'));
const SettingsRulesView = defineAsyncComponent(() => import('./views/SettingsRulesView.vue'));
const CityAdmissionView = defineAsyncComponent(() => import('./views/CityAdmissionView.vue'));
const OperationsBusinessView = defineAsyncComponent(() => import('./views/OperationsBusinessView.vue'));
const EventBusinessView = defineAsyncComponent(() => import('./views/EventBusinessView.vue'));
const EnterpriseProfileView = defineAsyncComponent(() => import('./views/EnterpriseProfileView.vue'));
const EnterpriseEvaluationHubView = defineAsyncComponent(() => import('./views/EnterpriseEvaluationHubView.vue'));
const CityAuthorizationView = defineAsyncComponent(() => import('./views/CityAuthorizationView.vue'));
const SubjectEnterpriseView = defineAsyncComponent(() => import('./views/SubjectEnterpriseView.vue'));
const VehicleBusinessView = defineAsyncComponent(() => import('./views/VehicleBusinessView.vue'));
const CityTasksView = defineAsyncComponent(() => import('./views/CityTasksView.vue'));
const ProvinceOverviewView = defineAsyncComponent(() => import('./views/ProvinceOverviewView.vue'));
const ProvinceRisksView = defineAsyncComponent(() => import('./views/ProvinceRisksView.vue'));
const ProvinceSearchView = defineAsyncComponent(() => import('./views/ProvinceSearchView.vue'));
const ProvinceMonitoringView = defineAsyncComponent(() => import('./views/ProvinceMonitoringView.vue'));
const ProvinceVehiclesView = defineAsyncComponent(() => import('./views/ProvinceVehiclesView.vue'));
const ProvinceAccidentsView = defineAsyncComponent(() => import('./views/ProvinceAccidentsView.vue'));
const ProvinceMattersView = defineAsyncComponent(() => import('./views/ProvinceMattersView.vue'));
const ProvinceEmergencyView = defineAsyncComponent(() => import('./views/ProvinceEmergencyView.vue'));
const ProvinceDirectoryView = defineAsyncComponent(() => import('./views/ProvinceDirectoryView.vue'));
const AgentCenterView = defineAsyncComponent(() => import('./views/AgentCenterView.vue'));


const componentMap: Record<string, Component> = {
  '/province/cockpit': ProvinceCockpitView,
  '/province/overview': ProvinceOverviewView,
  '/province/monitoring': ProvinceMonitoringView, '/province/vehicles': ProvinceVehiclesView, '/province/accidents': ProvinceAccidentsView,
  '/province/risks': ProvinceRisksView, '/province/search': ProvinceSearchView,
  '/province/coordination': ProvinceMattersView,
  '/province/risk-notices': ProvinceMattersView, '/province/supervision': ProvinceMattersView, '/province/collaboration': ProvinceMattersView,
  '/province/emergency': ProvinceEmergencyView, '/province/analysis': ProvinceAnalysisView,
  '/province/reports': RegulatoryReportsView, '/province/directory': ProvinceDirectoryView,

  '/province/workspaces': SaasWorkspacesView,
  '/city/workspace': CityAuthorizationView, '/city/members': SaasMembersView, '/city/requests': SaasRequestsView,
  '/regulatory/overview': RegulatoryDashboardView, '/regulatory/cockpit': CockpitView, '/enterprise/overview': EnterpriseDashboardView,
  '/enterprise/accounts': EnterpriseAccountsView,
  '/system/users': UsersView, '/system/roles': RolesView,
  '/system/organizations': OrganizationsView, '/system/enterprise-accounts': EnterprisesView,
  '/system/audit-logs': AuditLogsView,
  '/archives/manufacturers': ManufacturersView,
  '/archives/models': VehicleModelsView,
  '/archives/catalog': VehicleCatalogView,
  '/archives/operators': SafetyOperatorsView,
  '/archives/vehicle-management': VehicleManagementView,
  '/archives/vehicles': VehicleBusinessView,
  '/archives/enterprises': SubjectEnterpriseView,
  '/enterprise/vehicles/list': VehicleManagementView,
  '/enterprise/vehicles/archives': VehicleArchivesView,
  '/enterprise/vehicles': VehicleBusinessView,
  '/enterprise/profile/info': EnterpriseProfileView,
  '/enterprise/profile/qualifications': QualificationsView,
  '/admission/onboarding': AdmissionApplicationsView,
  '/admission/road-tests': AdmissionApplicationsView,
  '/admission/applications': CityAdmissionView,
  '/admission/approvals': ApprovalWorkbenchView,
  '/admission/licenses': AdmissionLicensesView,
  '/admission/renewals': AdmissionApplicationsView,
  '/admission/workflows': WorkflowDefinitionsView,
  '/enterprise/applications/onboarding': AdmissionApplicationsView,
  '/enterprise/applications/road-tests': AdmissionApplicationsView,
  '/enterprise/applications/mine': AdmissionApplicationsView,
  '/enterprise/applications/licenses': AdmissionLicensesView,
  '/enterprise/applications/renewals': AdmissionApplicationsView,
  '/enterprise/applications': AdmissionApplicationsView,
  '/enterprise/licenses': AdmissionLicensesView,
  '/operations/realtime': OperationsBusinessView,
  '/operations/distribution': VehicleDistributionView,
  '/operations/trajectories': VehicleTrajectoryView,
  '/operations/records': OperationRecordsView,
  '/operations/monitor': OnlineMonitorView,
  '/operations/regions': OperationRegionsView,
  '/enterprise/operations/realtime': OperationsBusinessView,
  '/enterprise/operations/trajectories': VehicleTrajectoryView,
  '/enterprise/operations/monitor': OnlineMonitorView,
  '/enterprise/operations/records': OperationRecordsView,
  '/safety/alerts': SafetyAlertsView,
  '/safety/accidents': AccidentsView,
  '/safety/violations': ViolationsView,
  '/safety/fences': ElectronicFencesView,
  '/safety/offline': OfflineSupervisionView,
  '/safety/emergency': EmergencyTasksView,
  '/safety/events': EventBusinessView,
  '/safety/inspections': InspectionsView,
  '/enterprise/safety/alerts': SafetyAlertsView,
  '/enterprise/safety/accidents': AccidentsView,
  '/enterprise/safety/violations': ViolationsView,
  '/enterprise/safety/emergency': EmergencyTasksView,
  '/enterprise/safety/rectifications': ViolationsView,
  '/enterprise/safety/events': EventBusinessView,
  '/analytics/operations': CityAnalysisView,
  '/analytics/safety': CityAnalysisView,
  '/analytics/accidents': AccidentReconstructionView,
  '/analytics/evaluations': CityEvaluationsView,
  '/analytics/credit': CityCreditView,
  '/analytics/evaluation-periods': CityEvaluationsView,
  '/analytics/profiles': SafetyProfilesView,
  '/analytics/reports': CityReportsView,
  '/enterprise/profile/safety': SafetyProfilesView,
  '/enterprise/profile/access': SafetyOperatorsView,
  '/enterprise/settings/interfaces': InterfaceSettingsView,
  '/enterprise/evaluations': EnterpriseEvaluationHubView,
  '/oversight/city-tasks': CityTasksView,
  '/enterprise/evaluations/current': EnterpriseEvaluationsView,
  '/enterprise/evaluations/history': EnterpriseEvaluationsView,
  '/enterprise/evaluations/appeals': EnterpriseEvaluationsView,
  '/system/business-rules': SettingsRulesView,
};
const fixedRoutes = Object.entries(componentMap).map(([path, component]) => ({ path, name: `fixed-${path.replace(/[^a-z0-9]+/gi, '-')}`, component })) as RouteRecordRaw[];
fixedRoutes.push({ path: '/province/pilots', redirect: '/province/workspaces' });
fixedRoutes.push({ path: '/province/applications', redirect: '/province/workspaces' });
fixedRoutes.push({ path: '/province/evaluations', redirect: '/province/analysis' });
const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/agents', name: 'agent-center', component: AgentCenterView, meta: { title: '鲁行智助 · AI智能体中心' } },
  { path: '/apply', name: 'city-application', component: SaasOfflineNoticeView },
  { path: '/application-status', name: 'city-application-status', component: SaasOfflineNoticeView },
  { path: '/activate', name: 'workspace-activation', component: SaasActivationView },
  { path: '/', name: 'shell', component: AppShell, children: fixedRoutes },
  { path: '/:pathMatch(.*)*', redirect: '/' },
] });
const added = new Set<string>(Object.keys(componentMap));
let allowedPaths = new Set<string>();
function registerMenus(menus: MenuItem[]) {
  allowedPaths = new Set<string>();
  const walk = (menu: MenuItem) => {
    allowedPaths.add(menu.path);
    if (!added.has(menu.path)) {
      router.addRoute('shell', { path: menu.path, name: `menu-${menu.code}`, component: componentMap[menu.path] ?? PlaceholderView, meta: { title: menu.name } } as RouteRecordRaw);
      added.add(menu.path);
    }
    menu.children?.forEach(walk);
  };
  menus.forEach(walk);
}
router.beforeEach(async (to) => {
  const session = useSessionStore();
  if (['/apply', '/application-status', '/activate'].includes(to.path)) return true;
  if (to.path === '/login') return session.accessToken ? '/' : true;
  if (!session.accessToken) return { path: '/login', query: { redirect: to.fullPath } };
  if (!session.user) {
    try { await session.loadContext(); registerMenus(session.menus); return to.fullPath; }
    catch { session.clear(); return '/login'; }
  }
  registerMenus(session.menus);
  if (to.path === '/agents') return session.user.accountLevel !== 'OPERATIONS' && session.user.permissions.includes('dashboard:view') ? true : '/';
  if (to.path === '/') return session.user.accountLevel === 'PROVINCE' ? '/province/overview' : session.user.portal === 'ENTERPRISE' ? '/enterprise/overview' : '/regulatory/overview';
  if (to.path.startsWith('/province/') && session.user.accountLevel !== 'PROVINCE') return '/';
  if (session.user.accountLevel === 'PROVINCE') {
    const coordinationKinds: Record<string, string> = { '/province/risk-notices': 'RISK_NOTICE', '/province/supervision': 'SUPERVISION', '/province/collaboration': 'CROSS_CITY', '/province/emergency': 'EMERGENCY' };
    if (coordinationKinds[to.path]) return { path: '/province/coordination', query: { ...to.query, kind: coordinationKinds[to.path], ...(to.query.view === 'resources' ? { panel: 'resources' } : {}) } };
    if (to.path === '/province/risks') return { path: '/province/monitoring', query: { ...to.query, riskLevel: to.query.level ?? to.query.riskLevel, view: 'alerts' } };
    if (to.path === '/province/search') {
      const { type, entityId, eventType, ...query } = to.query;
      if (type === 'VEHICLE') return { path: '/province/vehicles', query: { ...query, vehicleId: entityId ?? query.vehicleId } };
      if (type === 'INCIDENT' && eventType === 'ACCIDENT') return { path: '/province/accidents', query: { ...query, accidentId: entityId ?? query.accidentId } };
      if (type === 'INCIDENT' && (!eventType || eventType === 'ALERT')) return { path: '/province/monitoring', query: { ...query, view: 'alerts', alertId: entityId } };
    }
    if (to.path === '/province/monitoring' && to.query.view === 'trajectory') return { path: '/province/vehicles', query: { ...to.query, vehicleId: to.query.vehicleId, tab: 'tracks' } };
    if (to.path === '/province/monitoring' && to.query.view === 'records') return { path: '/province/vehicles', query: { ...to.query, vehicleId: to.query.vehicleId, tab: 'records' } };
    if (to.path === '/province/monitoring' && to.query.view !== 'alerts' && !session.user.permissions.includes('operation:realtime:read') && session.user.permissions.includes('safety:alert:read')) return { path: to.path, query: { ...to.query, view: 'alerts' } };
  }
  if (to.path.startsWith('/city/') && (!session.user.workspaceId || session.user.portal === 'ENTERPRISE')) return '/';
  if (session.user.accountLevel === 'PROVINCE' && ['/archives/manufacturers','/archives/models','/archives/catalog'].includes(to.path)) return {path:'/system/business-rules',query:{...to.query,view:'catalog',tab:to.path.endsWith('/models')?'models':String(to.query.tab??'manufacturers')}};
  if (session.user.accountLevel === 'PROVINCE' && !to.path.startsWith('/province/') && !to.path.startsWith('/system/')) {
    if (to.path.startsWith('/operations/')) return { path: '/province/monitoring', query: { ...to.query, ...(to.path.endsWith('/trajectories') ? { view: 'trajectory' } : to.path.endsWith('/records') ? { view: 'records' } : {}) } };
    if (to.path.startsWith('/safety/')) {
      const entityId = to.query.eventId ?? to.query.accidentId ?? to.query.id;
      const eventType = to.query.view ?? to.query.type ?? (to.path.includes('accident') ? 'ACCIDENT' : to.path.includes('violation') ? 'VIOLATION' : 'ALERT');
      return entityId ? { path: '/province/search', query: { ...to.query, type: 'INCIDENT', entityId, eventType } } : { path: '/province/risks', query: to.query };
    }
    if (to.path === '/analytics/accidents' && (to.query.accidentId || to.query.id)) return { path: '/province/search', query: { ...to.query, type: 'INCIDENT', entityId: to.query.accidentId ?? to.query.id, eventType: 'ACCIDENT' } };
    if (to.path.includes('/archives/vehicle')) return { path: '/province/search', query: { ...to.query, type: 'VEHICLE', entityId: to.query.vehicleId ?? to.query.id } };
    if (to.path.includes('/archives/enterprises') || to.path === '/analytics/profiles') return { path: '/province/search', query: { ...to.query, type: 'ENTERPRISE', entityId: to.query.enterpriseId ?? to.query.id } };
    if (to.path === '/admission/licenses') return { path: '/province/search', query: { ...to.query, type: 'LICENSE', entityId: to.query.licenseId ?? to.query.id } };
    if (to.path === '/analytics/operations') return { path: '/province/analysis', query: to.query };
    if (to.path === '/analytics/reports') return { path: '/province/reports', query: to.query };
    if (to.path.startsWith('/archives/') || to.path.startsWith('/admission/') || to.path.startsWith('/analytics/')) return { path: '/province/search', query: to.query };
    return '/province/overview';
  }
  if (to.path.startsWith('/oversight/') && session.user.accountLevel !== 'CITY') return '/';
  if (to.path === '/regulatory/cockpit') return session.user.portal === 'REGULATORY' ? true : '/';
  // 进入监管总览时预加载高德 SDK，让驾驶舱打开时地图立即就绪
  if (['/enterprise/overview', '/province/overview'].includes(to.path) && isAmapConfigured()) loadAMap().catch(() => {});
  const legacy: Record<string, { path: string; query?: Record<string, string> }> = {
    '/system/enterprise-accounts': { path: '/archives/enterprises' },
    '/operations/trajectories': { path: '/operations/realtime', query: { view: 'trajectory' } },
    '/operations/records': { path: '/operations/realtime', query: { view: 'records' } },
    '/enterprise/operations/trajectories': { path: '/enterprise/operations/realtime', query: { view: 'trajectory' } },
    '/enterprise/operations/records': { path: '/enterprise/operations/realtime', query: { view: 'records' } },
    '/admission/approvals': { path: '/admission/applications', query: { view: 'tasks' } },
    '/analytics/evaluation-periods': { path: '/analytics/evaluations' },
    '/analytics/accidents': { path: '/safety/events', query: { view: 'reconstruction' } },
    '/analytics/profiles': { path: '/archives/enterprises', query: { view: 'profile' } },
    '/enterprise/profile/qualifications': { path: '/enterprise/profile/info', query: { view: 'qualifications' } },
    '/enterprise/profile/safety': { path: '/enterprise/evaluations', query: { context: 'profile' } },
    '/city/requests': { path: '/city/workspace', query: { view: 'requests' } },
    '/operations/distribution': { path: '/operations/realtime' }, '/operations/monitor': { path: '/operations/realtime' },
    '/enterprise/operations/monitor': { path: '/enterprise/operations/realtime' },
    '/archives/vehicle-management': { path: '/archives/vehicles' }, '/archives/manufacturers': { path: '/archives/catalog', query: { tab: 'manufacturers' } }, '/archives/models': { path: '/archives/catalog', query: { tab: 'models' } },
    '/enterprise/vehicles/list': { path: '/enterprise/vehicles' }, '/enterprise/vehicles/archives': { path: '/enterprise/vehicles', query: { view: 'archive' } },
    '/admission/onboarding': { path: '/admission/applications', query: { type: 'ENTERPRISE_ONBOARDING' } }, '/admission/road-tests': { path: '/admission/applications', query: { type: 'ROAD_TEST' } }, '/admission/renewals': { path: '/admission/applications', query: { type: 'LICENSE_RENEWAL' } }, '/admission/workflows': { path: '/system/business-rules', query: { view: 'workflows' } },
    '/enterprise/applications/onboarding': { path: '/enterprise/applications', query: { type: 'ENTERPRISE_ONBOARDING' } }, '/enterprise/applications/road-tests': { path: '/enterprise/applications', query: { type: 'ROAD_TEST' } }, '/enterprise/applications/mine': { path: '/enterprise/applications' }, '/enterprise/applications/licenses': { path: '/enterprise/licenses' }, '/enterprise/applications/renewals': { path: '/enterprise/applications', query: { type: 'LICENSE_RENEWAL' } },
    '/safety/alerts': { path: '/safety/events', query: { view: 'ALERT' } }, '/safety/accidents': { path: '/safety/events', query: { view: 'ACCIDENT' } }, '/safety/violations': { path: '/safety/events', query: { view: 'VIOLATION' } }, '/safety/offline': { path: '/safety/events', query: { view: 'OFFLINE' } },
    '/enterprise/safety/alerts': { path: '/enterprise/safety/events', query: { view: 'ALERT' } }, '/enterprise/safety/accidents': { path: '/enterprise/safety/events', query: { view: 'ACCIDENT' } }, '/enterprise/safety/violations': { path: '/enterprise/safety/events', query: { view: 'VIOLATION' } }, '/enterprise/safety/rectifications': { path: '/enterprise/safety/emergency', query: { status: 'RECTIFYING' } },
    '/enterprise/evaluations/current': { path: '/enterprise/evaluations', query: { view: 'current' } }, '/enterprise/evaluations/history': { path: '/enterprise/evaluations', query: { view: 'history' } }, '/enterprise/evaluations/appeals': { path: '/enterprise/evaluations', query: { view: 'appeals' } },
  };
  if (legacy[to.path]) return { path: legacy[to.path].path, query: { ...to.query, ...legacy[to.path].query } };
  if (to.path === '/system/users' && session.user.accountLevel === 'CITY') return { path: '/city/members', query: to.query };
  const explicitPermissions: Record<string, string[]> = {
    '/system/business-rules': to.query.view==='catalog' ? ['archive:manufacturer:read','archive:model:read'] : ['admission:workflow:read'],
    '/province/monitoring': [to.query.view === 'alerts' ? 'safety:alert:read' : 'operation:realtime:read'],
    '/province/vehicles': ['archive:vehicle:read'],
    '/province/accidents': ['safety:accident:read'],
    '/province/search': [({ ENTERPRISE: 'archive:enterprise-archive:read', VEHICLE: 'archive:vehicle:read', LICENSE: 'admission:license:read', INCIDENT: to.query.eventType === 'VIOLATION' ? 'safety:violation:read' : to.query.eventType === 'ACCIDENT' ? 'safety:accident:read' : 'safety:alert:read' } as Record<string,string>)[String(to.query.type ?? 'ENTERPRISE')] ?? 'archive:enterprise-archive:read'],
    '/operations/realtime': [to.query.view === 'trajectory' ? 'operation:trajectory:read' : to.query.view === 'records' ? 'operation:record:read' : 'operation:realtime:read'],
    '/enterprise/operations/realtime': [to.query.view === 'trajectory' ? 'operation:trajectory:read' : to.query.view === 'records' ? 'operation:record:read' : 'operation:realtime:read'],
    '/admission/applications': [to.query.view === 'tasks' ? 'admission:approval:read' : 'admission:application:read'],
    '/safety/events': [({ALERT:'safety:alert:read',ACCIDENT:'safety:accident:read',VIOLATION:'safety:violation:read',OFFLINE:'safety:offline:read',reconstruction:'analytics:accident:read'} as Record<string,string>)[String(to.query.view)] ?? 'safety:alert:read'],
    '/enterprise/safety/events': [({ALERT:'safety:alert:read',ACCIDENT:'safety:accident:read',VIOLATION:'safety:violation:read',OFFLINE:'safety:offline:read'} as Record<string,string>)[String(to.query.view)] ?? 'safety:alert:read'],
    '/archives/enterprises': [to.query.view === 'profile' ? 'analytics:profile:read' : 'archive:enterprise-archive:read'],
    '/enterprise/profile/info': [to.query.view === 'qualifications' ? 'archive:qualification:read' : 'archive:enterprise-archive:read'],
    '/enterprise/evaluations': [to.query.context === 'profile' ? 'analytics:profile:read' : 'analytics:evaluation:read'],
    '/system/organizations': ['system:organization:read'],
    '/oversight/city-tasks': ['dashboard:view'],
  };
  const required = explicitPermissions[to.path];
  if (required && !required.every(permission => session.user!.permissions.includes(permission))) return '/';
  if (!allowedPaths.has(to.path) && !required) return '/';
  return true;
});
router.afterEach((to) => {
  nextTick(() => {
    const heading = document.querySelector<HTMLElement>('.page-canvas h1');
    const label = heading?.textContent?.trim() || String(to.meta.title ?? '无人快递车监管平台');
    document.title = label === '无人快递车监管平台' ? label : `${label} · 无人快递车监管平台`;
    heading?.setAttribute('tabindex', '-1');
  });
});
export default router;
