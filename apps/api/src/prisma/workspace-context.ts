import { AsyncLocalStorage } from 'node:async_hooks';

export interface WorkspaceScope {
  userId: string;
  accountLevel: string;
  workspaceId: string | null;
  organizationIds: string[];
  organizationId: string | null;
  enterpriseId: string | null;
  permissions: string[];
  cityCode?: string;
  filteredWorkspaceId?: string;
}

// The scope is established from the verified database membership for every request.
// A missing context is reserved for authentication, migrations and background jobs
// which must explicitly establish their own context before operating on city data.
export const workspaceContext = new AsyncLocalStorage<WorkspaceScope>();

export function modelScope(model: string, scope: WorkspaceScope, write = false): Record<string, any> | null {
  if (scope.accountLevel === 'PROVINCE' && !scope.filteredWorkspaceId) return null;
  const id = scope.workspaceId ?? '__no_workspace__';
  const org = { in: scope.organizationIds.length ? scope.organizationIds : ['__no_organization__'] };
  const byOrganization = { organizationId: org };
  const byEnterprise = scope.enterpriseId ? { enterpriseId: scope.enterpriseId } : {};
  switch (model) {
    case 'AgentConversation': return { userId: scope.userId, workspaceId: scope.workspaceId, enterpriseId: scope.enterpriseId };
    case 'AgentTurn': return { conversation: { is: { userId: scope.userId, workspaceId: scope.workspaceId, enterpriseId: scope.enterpriseId } } };
    case 'CityWorkspace': return { id };
    case 'CityApplication': case 'WorkspaceInvitation': case 'ProvisionJob': case 'WorkspaceNotice': return { workspaceId: id };
    case 'ApplicationMaterial': return { application: { is: { workspaceId: id } } };
    case 'ProvinceMatter': return { assignments: { some: { workspaceId: id } } };
    case 'ProvinceAssignment': case 'ProvincePilot': case 'ProvinceResource': case 'ProvinceDutyEvaluation': return { workspaceId: id };
    case 'Organization': return { id: org, workspaceId: id };
    case 'User': return { workspaceId: id, ...(scope.enterpriseId ? { enterpriseId: scope.enterpriseId } : { organizationId: org }) };
    case 'Role': return write ? { workspaceId: id } : { OR: [{ workspaceId: id }, { workspaceId: null, code: { in: ['ENTERPRISE_ADMIN', 'ENTERPRISE_USER', 'ENTERPRISE_VIEWER', 'APPROVER', 'REGULATORY_USER'] } }] };
    case 'ProcessDefinition': return write ? { workspaceId: id } : { OR: [{ workspaceId: id }, { workspaceId: null }] };
    case 'Enterprise': return { ...byOrganization, ...(scope.enterpriseId ? { id: scope.enterpriseId } : {}) };
    case 'Vehicle': case 'VehicleLicense': case 'SafetyOperator': case 'RegulatoryInspection': case 'CreditAccount':
    case 'AdmissionApplication': case 'DeliveryOrder': case 'OperationRecord':
    case 'SafetyAlert': case 'Accident': case 'Violation': case 'OfflineEvent':
    case 'EmergencyTask': case 'EnterpriseEvaluation': case 'EvaluationAppeal': case 'AccidentReconstruction':
    case 'RegulatoryReport': return { ...byOrganization, ...byEnterprise };
    case 'SafetyEvidenceRevision': case 'SafetyMaterial': case 'InspectionIssue': case 'SafetyRectificationTask': return { ...byOrganization, ...byEnterprise };
    case 'BusinessRule': case 'EvaluationIndicator': case 'EvaluationTask': return byOrganization;
    case 'OperationRegion': return scope.enterpriseId?{organization:{is:{workspaceId:id}},OR:[{enterpriseId:scope.enterpriseId},{enterpriseId:null}]}:byOrganization;
    case 'ElectronicFence': return !write&&scope.enterpriseId?{organization:{is:{workspaceId:id}},OR:[{enterpriseId:scope.enterpriseId},{enterpriseId:null}]}:{...byOrganization,...byEnterprise};
    case 'FenceTrigger': return {AND:[{vehicle:{is:modelScope('Vehicle',scope,write)??{}}},{fence:{is:modelScope('ElectronicFence',scope,false)??{}}}]};
    case 'AuditLog': return { ...byOrganization, ...byEnterprise };
    case 'Manufacturer': case 'VehicleModel': case 'Permission': case 'Menu': return null;
    // Administrative boundaries are public reference data; operational snapshots are private.
    case 'CockpitRegion': return null;
    case 'CockpitRegionSnapshot': case 'CockpitRoadRight': return { region: { is: { OR: [{ code: scope.cityCode ?? '__none__' }, { parentCode: scope.cityCode ?? '__none__' }] } } };
  }
  const relations: Record<string, string[]> = {
    SafetyOperatorVehicle: ['operator:SafetyOperator', 'vehicle:Vehicle'], ExternalInterfaceConfig: ['enterprise:Enterprise'],
    CreditEntry: ['account:CreditAccount'], VehicleArchive: ['vehicle:Vehicle'], EnterpriseQualification: ['enterprise:Enterprise'],
    UserRole: ['user:User'], RolePermission: ['role:Role'], RefreshToken: ['user:User'], LoginLog: ['user:User'],
    ProcessNodeDefinition: ['processDefinition:ProcessDefinition'], AdmissionApplicationVehicle: ['application:AdmissionApplication', 'vehicle:Vehicle'],
    ProcessInstance: ['application:AdmissionApplication'], ApprovalTask: ['application:AdmissionApplication'],
    ApprovalHistory: ['application:AdmissionApplication'], ApprovalResult: ['application:AdmissionApplication'],
    VehicleRealtimeStatus: ['vehicle:Vehicle'], OperationRegionVehicle: ['region:OperationRegion', 'vehicle:Vehicle'],
    VehicleTrackPoint: ['vehicle:Vehicle', 'operationRecord:OperationRecord'], VehicleOnlineDaily: ['vehicle:Vehicle'], VehicleObservation: ['vehicle:Vehicle'],
    ElectronicFenceVehicle: ['fence:ElectronicFence', 'vehicle:Vehicle'], FenceTrigger: ['fence:ElectronicFence', 'vehicle:Vehicle'],
    EmergencyTaskLog: ['task:EmergencyTask'], EvaluationRule: ['indicator:EvaluationIndicator'],
  };
  const related = relations[model];
  if (!related) return { id: '__unregistered_private_model__' };
  return { AND: related.map((entry) => {
    const [field, target] = entry.split(':');
    return { [field]: { is: modelScope(target, scope, write) ?? {} } };
  }) };
}
