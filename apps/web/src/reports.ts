export const reportCategories = [
  { value: 'COMPREHENSIVE', label: '综合监管' }, { value: 'OPERATIONS', label: '运行分析' },
  { value: 'SAFETY', label: '安全态势' }, { value: 'ENTERPRISE', label: '企业专项' },
];
export const reportPeriods = [
  { value: 'DAILY', label: '日报' }, { value: 'WEEKLY', label: '周报' },
  { value: 'MONTHLY', label: '月报' }, { value: 'SPECIAL', label: '专题报' },
];
export const reportLabel = (value: string) => [...reportCategories, ...reportPeriods].find(item => item.value === value)?.label ?? value;
export const reportDay = (value?: string) => value?.slice(0, 10) ?? '—';
export const reportTime = (value?: string | null) => value ? new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value)).replaceAll('/', '-') : '—';
export const reportNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value) : '—';
export const validReportPercentage = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
export const reportError = (value: unknown) => value instanceof Error ? value.message : '请稍后重试';
