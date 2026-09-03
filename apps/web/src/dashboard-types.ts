import type { ElectronicFenceItem, OperationPoint, OperationRegionItem } from './types';

export interface DashboardTask {
  id: string; kind: string; category: string; label: string; title: string; description: string; status: string; level: string;
  occurredAt: string; dueAt?: string | null; route: string; vehicleId?: string | null;
}
export interface DashboardAlert {
  id: string; businessNo: string; alertType: string; level: string; title: string; status: string; occurredAt: string;
  enterprise: { id: string; name: string }; organization: { id: string; name: string };
  vehicle: { id: string; name: string; businessNo: string } | null;
}
export interface DashboardShortcut { label: string; path: string; icon: string }
export interface DashboardTrendPoint { date: string; onlineRate: number; runningVehicles: number; mileage: number }
export interface DashboardAccidentPoint { id: string; businessNo?: string; title: string; level: string; longitude: number; latitude: number; vehicleId: string | null }
export interface DashboardMapData {
  vehicles: OperationPoint[]; regions: OperationRegionItem[]; fences?: ElectronicFenceItem[];
  accidents?: DashboardAccidentPoint[];
  alerts: Array<{ id: string; title: string; level: string; longitude?: number | null; latitude?: number | null; vehicleId?: string | null }>;
}

export interface RegulatorSummary {
  meta: { scopeName: string; updatedAt: string; highRisk: number; openWork: number; pendingApprovals: number };
  metrics: {
    registeredVehicles: number; activeVehicles: number; monthDelta: number; currentOnline: number; onlineRate: number;
    currentRunning: number; runningRate: number; todayAlerts: number; severeAlerts: number; pendingActions: number;
    overdueActions: number; pendingApprovals: number; overdueApprovals: number; longestWaitDays: number; longestWaitHours: number;
  };
  filters: { enterprises: Array<{ id: string; name: string; organizationId: string }>; organizations: Array<{ id: string; name: string; parentId: string | null }> };
  map: DashboardMapData;
  shortcuts: DashboardShortcut[];
}
export interface RegulatorTasks {
  total: number; items: DashboardTask[];
  buckets?: { critical: number; alerts: number; approvals: number; review: number; overdue: number };
}
export interface RegulatorRisks {
  enterprises: Array<{ id: string; name: string; score: number; tags: string[]; level: string; route?: string; alertCount?: number; openCount?: number }>;
  vehicles: Array<{ id: string; name: string; businessNo: string; enterpriseName?: string; score: number; tags: string[]; level: string }>;
  organizations: Array<{ id: string; name: string; score: number; tags?: string[]; level?: string; openCount?: number }>;
}
export interface RegulatorAlarmStats {
  today: number; severe: number; open: number; accidents: number; closedToday: number;
  types: Array<{ type: string; count: number }>;
}
export interface RegulatorTrends {
  availability: { onlineGranularity: string; hourlyOnline: boolean; note: string };
  online: DashboardTrendPoint[];
  compare: { todayOnlineRate: number; yesterdayOnlineRate: number; weekAvgOnlineRate: number; todayRunning: number; yesterdayRunning: number };
  status: { running: number; standby: number; offline: number; abnormal: number };
}
export interface RegulatorApprovals {
  available: boolean; pendingByType: Array<{ type: string; count: number; route: string }>; submittedToday: number;
  overdue: number; averageApprovalHours: number; expiringLicenses: number;
  recent?: Array<{
    id: string; businessNo: string; applicationType: string; title: string; status: string;
    currentNodeName: string | null; updatedAt: string; overdue: boolean; route: string;
  }>;
}

export interface EnterpriseSummary {
  meta: {
    enterprise: { id: string; name: string; businessNo: string; organization: { id: string; name: string } };
    updatedAt: string; abnormalVehicles: number; openSafety: number; corrections: number;
  };
  metrics: {
    registeredVehicles: number; activeVehicles: number; inactiveVehicles: number; currentOnline: number; onlineRate: number;
    todayRunning: number; todayMileage: number; todayAlerts: number; severeAlerts: number; pendingActions: number; overdueActions: number;
    pendingApplications: number; corrections: number;
  };
  map: DashboardMapData;
  shortcuts: DashboardShortcut[];
}
export interface EnterpriseVehicles {
  counts: { normal: number; running: number; standby: number; lowBattery: number; fault: number; offline: number; maintenance: number };
  attention: Array<{
    id: string; name: string; businessNo: string; onlineStatus: string; status: string; battery: number | null; heartbeatAt: string | null;
    drivingState: string; openAlertCount: number; attentionLevel: string; reason: string; score: number; route: string;
  }>;
  utilizationRate: number;
}
export interface EnterpriseRisks {
  todayAlerts: number; openAlerts: number; accidents: number; violations: number; offlineVehicles: number;
  attentionVehicles: Array<{ id: string; name: string; businessNo: string; onlineStatus: string; battery: number | null; heartbeatAt: string | null; openAlertCount: number; attentionLevel: string; reason: string; score: number }>;
  alerts: DashboardAlert[];
  operations: { trend: DashboardTrendPoint[]; todayMileage: number; utilizationRate: number; availability: { onlineGranularity: string; hourlyOnline: boolean; note: string } };
}
export interface EnterpriseApplications {
  active: number; corrections: number; approvedThisMonth: number; expiring: number;
  recent: Array<{ id: string; businessNo: string; applicationType: string; title: string; status: string; currentNodeName: string | null; updatedAt: string }>;
  expiry: { within7Days: number; within30Days: number; expired: number; items: Array<{ id: string; type: string; name: string; expiresAt: string; route: string }> };
}
