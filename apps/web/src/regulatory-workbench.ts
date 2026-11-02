import type { EChartsCoreOption } from 'echarts/core';
export interface WorkbenchDistribution { key: string; name: string; value: number; share: number }
export interface RegulatoryWorkbench {
  period: { from: string; to: string; days: number }; scopeName: string; computedAt: string;
  permissions: { fleet: boolean; operations: boolean; enterprises: boolean; safety: boolean };
  fleet: { total: number; running: number; idle: number; offline: number; online: number; onlineRate: number | null } | null;
  operations: { trips: number; mileage: number | null; qualityIssue: boolean; trend: { date: string; trips: number; mileage: number | null }[] } | null;
  vehicleTypes: WorkbenchDistribution[] | null; manufacturers: WorkbenchDistribution[] | null; districts: WorkbenchDistribution[] | null;
  safety: { total: number; closed: number; pending: number; processing: number; review: number; closureRate: number | null; types: { key: string; name: string; value: number }[] } | null;
  enterprises: { id: string; name: string; vehicles: number | null; online: number | null; running: number | null; mileage: number | null; trips: number | null }[] | null;
  reminders: { applications: number | null; events: number | null; rectifications: number | null; expiringVehicles: number | null };
}
export const rwbNumber = (value: number | null | undefined, digits = 0) => value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits });
export const rwbDay = (date = new Date()) => new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
export function rwbPreset(key: 'today' | 'week' | 'month'): [string, string] {
  const today = rwbDay(), date = new Date(today + 'T00:00:00+08:00');
  return [key === 'month' ? today.slice(0, 7) + '-01' : key === 'week' ? rwbDay(new Date(date.getTime() - 6 * 86_400_000)) : today, today];
}
export const rwbColors: Record<string, string> = { DELIVERY: '#327cff', SANITATION: '#22c894', PATROL: '#9868f9', RETAIL: '#7dc9ff', SHUTTLE: '#9bafcd', UNKNOWN: '#bbc6d8' };
const axis = { color: '#8293ae', fontSize: 12, fontFamily: 'Microsoft YaHei, sans-serif' };
const line = { color: '#dce5f2' }, gridLine = { color: '#eaf0f8', type: 'dashed' as const };
const tooltip = { trigger: 'axis', renderMode: 'richText', backgroundColor: '#fff', borderColor: '#e0e8f3', textStyle: { color: '#193250', fontSize: 12 } };
export function rwbTrend(data: RegulatoryWorkbench['operations'], metric: 'mileage' | 'trips'): EChartsCoreOption {
  const points = data?.trend ?? [], name = metric === 'mileage' ? '运行里程' : '运行次数', unit = metric === 'mileage' ? '里程（km）' : '次数（次）';
  return { aria: { enabled: true }, color: ['#327cff'], tooltip: { ...tooltip, valueFormatter: (value: unknown) => value == null ? '待核对' : `${rwbNumber(Number(value), metric === 'mileage' ? 1 : 0)} ${metric === 'mileage' ? 'km' : '次'}` },
    grid: { left: 54, right: 20, top: 32, bottom: 48 },
    xAxis: { type: 'category', name: '日期', nameLocation: 'middle', nameGap: 32, nameTextStyle: axis, data: points.map(row => row.date.slice(5).replace('-', '/')), boundaryGap: false,
      axisLine: { lineStyle: line }, axisTick: { show: false }, axisLabel: { ...axis, showMinLabel: true, showMaxLabel: true, hideOverlap: true } },
    yAxis: { type: 'value', min: 0, minInterval: metric === 'trips' ? 1 : undefined, name: unit, nameTextStyle: axis, nameGap: 14, splitNumber: 3,
      axisLine: { show: true, lineStyle: line }, axisLabel: axis, splitLine: { lineStyle: gridLine } },
    series: [{ type: 'line', name, data: points.map(row => row[metric]), smooth: .18, connectNulls: false, symbol: 'circle', symbolSize: 6, showSymbol: points.length <= 10,
      lineStyle: { width: 2.5 }, itemStyle: { color: '#327cff', borderWidth: 2, borderColor: '#fff' }, areaStyle: { color: 'rgba(50,124,255,.13)' } }],
  };
}
export function rwbBars(rows: { name: string; value: number }[], horizontal = true): EChartsCoreOption {
  const valueAxis = { type: 'value' as const, min: 0, minInterval: 1, splitNumber: 3, name: horizontal ? '车辆数（辆）' : '事件数（起）', nameLocation: horizontal ? 'middle' as const : 'end' as const,
    nameGap: horizontal ? 29 : 14, nameTextStyle: axis, axisLabel: axis, axisLine: { show: true, lineStyle: line }, splitLine: { lineStyle: gridLine } };
  const categoryAxis = { type: 'category' as const, data: rows.map(row => row.name), inverse: horizontal, axisTick: { show: false }, axisLine: { show: !horizontal, lineStyle: line },
    axisLabel: { ...axis, width: horizontal ? 100 : 62, overflow: 'truncate' as const, interval: 0 } };
  return { aria: { enabled: true }, color: ['#4386ff'], tooltip: { ...tooltip, axisPointer: { type: 'shadow' } },
    grid: horizontal ? { left: 108, right: 38, top: 12, bottom: 44 } : { left: 35, right: 8, top: 34, bottom: 32 },
    xAxis: horizontal ? valueAxis : categoryAxis, yAxis: horizontal ? categoryAxis : valueAxis,
    series: [{ type: 'bar', name: horizontal ? '车辆数' : '事件数', data: rows.map(row => row.value), barMaxWidth: horizontal ? 16 : 30,
      showBackground: horizontal, backgroundStyle: { color: '#eef3fb', borderRadius: 3 }, itemStyle: { borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
      label: { show: true, position: horizontal ? 'right' : 'top', color: '#193250', fontSize: 12, distance: 7 } }],
  };
}
