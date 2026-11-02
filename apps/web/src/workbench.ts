import type { ProvinceAnalysisKpis, ProvinceAnalysisRow } from './province-analysis';
export interface WorkbenchEvent { id: string; matterId: string; title: string; type: 'dispatch' | 'feedback' | 'review' | 'due'; at: string; cityName: string }
export interface WorkbenchData {
  month: string; from: string; to: string; computedAt: string;
  matters: { total: number; overdue: number; states: { status: string; label: string; color: string; value: number }[] };
  cities: { id: string; name: string; code: string; vehicles: number | null; online: number | null }[];
  enterpriseCount: number | null;
  fleet: null | { total: number; online: number; onlineRate: number | null; latestReportAt: string | null; states: { key: string; label: string; color: string; value: number }[] };
  operations: null | { kpis: ProvinceAnalysisKpis; trend: { date: string; trips: number | null; mileage: number | null; autonomousRate: number | null }[]; cities: ProvinceAnalysisRow[] };
  safety: null | { total: number; closed: number; pending: number; processing: number; closureRate: number | null; types: { key: string; name: string; value: number; color: string }[] };
  calendar: { days: { date: string; dispatch: number; feedback: number; review: number; due: number }[]; events: WorkbenchEvent[] };
  reminders: { id: string; title: string; text: string; at: string; kind: string; matterId: string }[];
  permissions: { fleet: boolean; enterprises: boolean; safety: boolean; operations: boolean };
}
export const workbenchDay = (date: Date) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const workbenchEventTypes = [
  { key: 'dispatch', label: '派发', color: '#388aff' }, { key: 'feedback', label: '反馈', color: '#2dcb91' },
  { key: 'review', label: '复核', color: '#9861f8' }, { key: 'due', label: '到期', color: '#ffab25' },
] as const;
