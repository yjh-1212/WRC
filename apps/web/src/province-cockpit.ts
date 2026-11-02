export interface ProvinceCockpitCity {
  code: string; name: string; longitude: number; latitude: number; workspaceId: string | null;
  connected: boolean; status: string; registered: number; online: number; onlineRate: number;
  enterprises: number; openRisks: number; highRisks: number;
}
export interface ProvinceCockpitData {
  updatedAt: string;
  scope: { cityCode: string | null; name: string; connected: boolean; workspaceId: string | null };
  coverage: { connected: number; total: number }; cities: ProvinceCockpitCity[];
  summary: { registered: number; online: number; offline: number; onlineRate: number; enterprises: number; running: number; mileageToday: number | null; telemetryAt: string | null };
  usage: Array<{ code: string; name: string; color: string; count: number; percentage: number }>;
  risks: { total: number; high: number; today: number; levels: Array<{ code: string; name: string; color: string; count: number }>; items: Array<{ id: string; businessNo: string; title: string; level: string; status: string; occurredAt: string; cityCode?: string; cityName: string }> };
  collaboration: { total: number; closed: number; open: number; overdue: number; completionRate: number; states: Array<{ status: string; count: number }>; items: Array<{ id: string; title: string; kind: string; status: string; dueAt: string | null }> };
}
