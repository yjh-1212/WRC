export interface ProvinceAnalysisKpis {
  hasRecords: boolean; enterprises: number; vehicles: number; trips: number;
  mileage: number | null; durationHours: number | null; autonomousRate: number | null;
  energyUsed: number | null; energyPer100: number | null; qualityIssue: boolean;
}
export interface ProvinceAnalysisRow extends ProvinceAnalysisKpis { id: string; name: string; share: number | null; cityCode?: string; businessNo?: string }
export interface ProvinceAnalysisData {
  period: { from: string; to: string; days: number; previousFrom: string; previousTo: string };
  computedAt: string; latestRecordAt: string | null;
  scope: { cityCount: number; citiesWithRecords: number; workspaceId: string | null; enterpriseId: string | null };
  kpis: ProvinceAnalysisKpis; previousKpis: ProvinceAnalysisKpis;
  trend: { date: string; previousDate: string; current: ProvinceAnalysisKpis; previous: ProvinceAnalysisKpis }[];
  cities: ProvinceAnalysisRow[]; enterprises: ProvinceAnalysisRow[]; vehicles: ProvinceAnalysisRow[];
}
export interface ProvinceAnalysisOptions { cities: { id: string; cityName: string; cityCode: string }[]; enterprises: { id: string; name: string; workspaceId: string }[] }
const DAY = 86400000;
export const analysisDay = (date: Date) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export function analysisPeriod(days = 30) {
  const end = new Date(`${analysisDay(new Date())}T00:00:00+08:00`);
  return [analysisDay(new Date(end.getTime() - days * DAY)), analysisDay(new Date(end.getTime() - DAY))];
}
