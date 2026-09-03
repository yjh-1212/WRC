export interface Role { id: string; code: string; name: string }
export interface AuthUser {
  id: string; username: string; displayName: string; portal: 'REGULATORY' | 'ENTERPRISE';
  organizationId: string | null; enterpriseId: string | null; roles: Role[]; permissions: string[];
}
export interface MenuItem { id: string; code: string; name: string; path: string; icon?: string; children: MenuItem[] }
export interface ApiEnvelope<T> { code: number; message: string; data: T; timestamp: string; requestId: string }
export interface PageData<T> { page: number; pageSize: number; total: number; items: T[] }

export interface OperationPoint {
  id: string; name: string; businessNo: string; onlineStatus: string; enterpriseId: string; organizationId: string;
  enterprise: { id: string; name: string }; organization: { id: string; name: string };
  model?: { name: string; maxSpeed: number; autonomyLevel: string };
  regions?: Array<{ id: string; name: string }>;
  realtimeStatus: null | {
    longitude: number; latitude: number; speed: number; heading: number; battery: number; drivingState: string;
    autonomousState: string; signalStrength: number; mileageToday: number; locationTime: string; heartbeatAt: string;
  };
  openAlertCount?: number;
  attentionLevel?: 'NORMAL' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  currentAlert?: null | { id: string; title: string; level: string; status: string };
}
export interface TrackPoint {
  id: string; sequence: number; longitude: number; latitude: number; speed: number; battery: number; heading: number;
  autonomousState: string; pointType: string; recordedAt: string;
  operationRecord?: { id: string; businessNo: string; startedAt: string; endedAt: string | null; status: string };
}
export interface OperationRegionItem {
  id: string; businessNo: string; name: string; regionType: string; enterpriseId: string | null; organizationId: string;
  enterprise: { id: string; name: string } | null; organization: { id: string; name: string };
  approvalResult: { id: string; documentNo: string } | null; approvalStatus: string; status: string;
  validFrom: string; validTo: string | null; speedLimit: number; allowedHours: string | null; ruleDescription: string | null;
  polygon: Array<{ longitude: number; latitude: number }>;
  vehicles: Array<{ vehicle: { id: string; name: string; businessNo: string } }>;
  _count: { records: number };
}

export interface ElectronicFenceItem {
  id: string; businessNo: string; name: string; fenceType: string; enterpriseId: string | null; organizationId: string;
  enterprise: { id: string; name: string } | null; organization: { id: string; name: string };
  validFrom: string; validTo: string | null; active: boolean; speedLimit: number | null; allowedHours: string | null;
  ruleDescription: string | null; polygon: Array<{ longitude: number; latitude: number }>;
  vehicles: Array<{ vehicle: { id: string; name: string; businessNo: string } }>;
  triggers: Array<{ id: string; triggerType: string; occurredAt: string; status: string; vehicle: { name: string } }>;
  _count: { triggers: number };
}

export interface AnalyticsOption { id: string; name: string; businessNo?: string; enterpriseId?: string; organizationId?: string }
export interface AnalyticsOptions { enterprises: AnalyticsOption[]; organizations: AnalyticsOption[]; vehicles: AnalyticsOption[]; accidents: Array<AnalyticsOption & { title: string; occurredAt: string }> }
export interface RiskPoint { id: string; longitude: number; latitude: number; weight: number; kind: 'ALERT' | 'ACCIDENT' | 'VIOLATION'; title: string; level: string }
export interface OperationAnalysis {
  period: { from: string; to: string };
  kpis: { vehicles: number; trips: number; mileage: number; durationHours: number; efficiency: number; energyUsed: number; autonomousRate: number; manualTakeovers: number };
  trend: Array<{ date: string; mileage: number; trips: number; durationHours: number; energy: number }>;
  enterprises: Array<{ id: string; name: string; mileage: number; durationHours: number; trips: number; energy: number; efficiency: number; autonomousRate: number }>;
  regions: Array<{ id: string; name: string; mileage: number; trips: number }>;
}
export interface SafetyAnalysis {
  period: { from: string; to: string };
  kpis: { alerts: number; openAlerts: number; accidents: number; violations: number; critical: number; closureRate: number };
  trend: Array<{ date: string; alerts: number; accidents: number; violations: number }>;
  types: Array<{ name: string; value: number }>;
  enterprises: Array<{ id: string; name: string; alerts: number; accidents: number; violations: number; riskScore: number }>;
  riskPoints: RiskPoint[];
}
export interface AccidentAnalysisItem {
  id: string; businessNo: string; title: string; accidentType: string; level: string; status: string; occurredAt: string; address: string | null;
  enterprise: { id: string; name: string }; vehicle: { id: string; name: string; businessNo: string };
  operationRecord: { id: string; businessNo: string } | null; reconstruction: { id: string; status: string; analystName: string; updatedAt: string } | null;
}
export interface EvaluationItem {
  id: string; businessNo: string; totalScore: number; grade: string; riskLevel: string; safetyScore: number; complianceScore: number; operationScore: number; status: string; conclusion: string | null; publishedAt: string | null;
  enterprise: { id: string; name: string }; task: { id: string; name: string; periodType: string; periodStart: string; periodEnd: string; status: string };
  appeals: EvaluationAppeal[]; breakdown?: EvaluationBreakdown[];
}
export interface EvaluationBreakdown { code: string; name: string; dimension: string; weight: number; value: number; score: number; rule: string }
export interface EvaluationAppeal { id: string; businessNo: string; reason: string; evidence: string | null; status: string; reviewComment: string | null; createdAt: string; enterprise?: { id: string; name: string }; evaluation?: EvaluationItem }
export interface EvaluationTask { id: string; businessNo: string; name: string; periodType: string; periodStart: string; periodEnd: string; status: string; createdByName: string; generatedAt: string | null; publishedAt: string | null; organization: { id: string; name: string }; evaluations: EvaluationItem[]; _count: { evaluations: number } }
export interface EvaluationIndicator { id: string; code: string; name: string; dimension: string; metricKey: string; description: string | null; weight: number; direction: string; status: string; organization: { id: string; name: string }; rules: Array<{ id: string; minValue: number | null; maxValue: number | null; score: number; label: string; orderNo: number }> }
export interface SafetyProfile { enterprise: { id: string; name: string; businessNo: string; legalRepresentative: string; contactName: string; contactPhone: string }; evaluation: EvaluationItem | null; metrics: { vehicleCount: number; alerts: number; accidents: number; violations: number; offline: number; mileage: number }; dimensions: null | { safety: number; compliance: number; operation: number; onlineStability: number; emergencyResponse: number; autonomy: number }; tags: string[] }
export interface RegulatoryReport { id: string; businessNo: string; reportType: string; category: string; title: string; periodStart: string; periodEnd: string; status: string; recipient: string | null; generatedByName: string; generatedAt: string; distributedAt: string | null; enterprise: { id: string; name: string } | null; organization: { id: string; name: string }; summary?: Record<string, any> }
