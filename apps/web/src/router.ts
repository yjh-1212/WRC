import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { defineAsyncComponent, nextTick, type Component } from 'vue';
import { useSessionStore } from './stores/session';
import { isAmapConfigured, loadAMap } from './amap';
import LoginView from './views/LoginView.vue';
import AppShell from './components/AppShell.vue';
import type { MenuItem } from './types';

const RegulatoryDashboardView = defineAsyncComponent(() => import('./views/RegulatoryDashboardView.vue'));
const CockpitView = defineAsyncComponent(() => import('./views/CockpitView.vue'));
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
const AdmissionApplicationsView = defineAsyncComponent(() => import('./views/AdmissionApplicationsView.vue'));
const ApprovalWorkbenchView = defineAsyncComponent(() => import('./views/ApprovalWorkbenchView.vue'));
const WorkflowDefinitionsView = defineAsyncComponent(() => import('./views/WorkflowDefinitionsView.vue'));
const AdmissionLicensesView = defineAsyncComponent(() => import('./views/AdmissionLicensesView.vue'));
const RealtimeOperationsView = defineAsyncComponent(() => import('./views/RealtimeOperationsView.vue'));
const VehicleDistributionView = defineAsyncComponent(() => import('./views/VehicleDistributionView.vue'));
const VehicleTrajectoryView = defineAsyncComponent(() => import('./views/VehicleTrajectoryView.vue'));
const OperationRecordsView = defineAsyncComponent(() => import('./views/OperationRecordsView.vue'));
const OnlineMonitorView = defineAsyncComponent(() => import('./views/OnlineMonitorView.vue'));
const OperationRegionsView = defineAsyncComponent(() => import('./views/OperationRegionsView.vue'));
const SafetyAlertsView = defineAsyncComponent(() => import('./views/SafetyAlertsView.vue'));
const ElectronicFencesView = defineAsyncComponent(() => import('./views/ElectronicFencesView.vue'));
const AccidentsView = defineAsyncComponent(() => import('./views/AccidentsView.vue'));
const ViolationsView = defineAsyncComponent(() => import('./views/ViolationsView.vue'));
const OfflineSupervisionView = defineAsyncComponent(() => import('./views/OfflineSupervisionView.vue'));
const EmergencyTasksView = defineAsyncComponent(() => import('./views/EmergencyTasksView.vue'));
const OperationsAnalysisView = defineAsyncComponent(() => import('./views/OperationsAnalysisView.vue'));
const SafetySituationView = defineAsyncComponent(() => import('./views/SafetySituationView.vue'));
const AccidentReconstructionView = defineAsyncComponent(() => import('./views/AccidentReconstructionView.vue'));
const EnterpriseEvaluationsView = defineAsyncComponent(() => import('./views/EnterpriseEvaluationsView.vue'));
const SafetyProfilesView = defineAsyncComponent(() => import('./views/SafetyProfilesView.vue'));
const RegulatoryReportsView = defineAsyncComponent(() => import('./views/RegulatoryReportsView.vue'));

const componentMap: Record<string, Component> = {
  '/regulatory/overview': RegulatoryDashboardView, '/regulatory/cockpit': CockpitView, '/enterprise/overview': EnterpriseDashboardView,
  '/enterprise/accounts': EnterpriseAccountsView,
  '/system/users': UsersView, '/system/roles': RolesView,
  '/system/organizations': OrganizationsView, '/system/enterprise-accounts': EnterprisesView,
  '/system/audit-logs': AuditLogsView,
  '/archives/manufacturers': ManufacturersView,
  '/archives/models': VehicleModelsView,
  '/archives/vehicle-management': VehicleManagementView,
  '/archives/vehicles': VehicleArchivesView,
  '/archives/enterprises': EnterpriseArchivesView,
  '/enterprise/vehicles/list': VehicleManagementView,
  '/enterprise/vehicles/archives': VehicleArchivesView,
  '/enterprise/profile/info': EnterpriseArchivesView,
  '/enterprise/profile/qualifications': QualificationsView,
  '/admission/onboarding': AdmissionApplicationsView,
  '/admission/road-tests': AdmissionApplicationsView,
  '/admission/approvals': ApprovalWorkbenchView,
  '/admission/licenses': AdmissionLicensesView,
  '/admission/renewals': AdmissionApplicationsView,
  '/admission/workflows': WorkflowDefinitionsView,
  '/enterprise/applications/onboarding': AdmissionApplicationsView,
  '/enterprise/applications/road-tests': AdmissionApplicationsView,
  '/enterprise/applications/mine': AdmissionApplicationsView,
  '/enterprise/applications/licenses': AdmissionLicensesView,
  '/enterprise/applications/renewals': AdmissionApplicationsView,
  '/operations/realtime': RealtimeOperationsView,
  '/operations/distribution': VehicleDistributionView,
  '/operations/trajectories': VehicleTrajectoryView,
  '/operations/records': OperationRecordsView,
  '/operations/monitor': OnlineMonitorView,
  '/operations/regions': OperationRegionsView,
  '/enterprise/operations/realtime': RealtimeOperationsView,
  '/enterprise/operations/trajectories': VehicleTrajectoryView,
  '/enterprise/operations/monitor': OnlineMonitorView,
  '/enterprise/operations/records': OperationRecordsView,
  '/safety/alerts': SafetyAlertsView,
  '/safety/accidents': AccidentsView,
  '/safety/violations': ViolationsView,
  '/safety/fences': ElectronicFencesView,
  '/safety/offline': OfflineSupervisionView,
  '/safety/emergency': EmergencyTasksView,
  '/enterprise/safety/alerts': SafetyAlertsView,
  '/enterprise/safety/accidents': AccidentsView,
  '/enterprise/safety/violations': ViolationsView,
  '/enterprise/safety/emergency': EmergencyTasksView,
  '/enterprise/safety/rectifications': ViolationsView,
  '/analytics/operations': OperationsAnalysisView,
  '/analytics/safety': SafetySituationView,
  '/analytics/accidents': AccidentReconstructionView,
  '/analytics/evaluations': EnterpriseEvaluationsView,
  '/analytics/profiles': SafetyProfilesView,
  '/analytics/reports': RegulatoryReportsView,
  '/enterprise/profile/safety': SafetyProfilesView,
  '/enterprise/evaluations/current': EnterpriseEvaluationsView,
  '/enterprise/evaluations/history': EnterpriseEvaluationsView,
  '/enterprise/evaluations/appeals': EnterpriseEvaluationsView,
};
const fixedRoutes = Object.entries(componentMap).map(([path, component]) => ({ path, name: `fixed-${path.replace(/[^a-z0-9]+/gi, '-')}`, component })) as RouteRecordRaw[];
const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/login', name: 'login', component: LoginView },
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
  if (to.path === '/login') return session.accessToken ? '/' : true;
  if (!session.accessToken) return { path: '/login', query: { redirect: to.fullPath } };
  if (!session.user) {
    try { await session.loadContext(); registerMenus(session.menus); return to.fullPath; }
    catch { session.clear(); return '/login'; }
  }
  registerMenus(session.menus);
  if (to.path === '/') return session.user.portal === 'ENTERPRISE' ? '/enterprise/overview' : '/regulatory/overview';
  if (to.path === '/regulatory/cockpit') return session.user.portal === 'REGULATORY' ? true : '/';
  // 进入监管总览时预加载高德 SDK，让驾驶舱打开时地图立即就绪
  if (['/regulatory/overview', '/enterprise/overview'].includes(to.path) && isAmapConfigured()) loadAMap().catch(() => {});
  if (!allowedPaths.has(to.path)) return '/';
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
