import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from './api';
import { safetyTypeLabels } from './safety-labels';
export const text: Record<string, string> = { ...safetyTypeLabels, ONLINE: '上报在线', OFFLINE: '离线', RUNNING: '运行中', IDLE: '临停', PARKED: '停驶', LOW: '低', MEDIUM: '一般', HIGH: '高', CRITICAL: '重大', VALID: '有效', EXPIRED: '已到期', CANCELLED: '已注销', SUSPENDED: '已暂停', ACTIVE: '有效', INACTIVE: '已停用', REPORTED: '已上报', ACCEPTED: '已受理', INVESTIGATING: '调查中', RESPONSIBILITY_DETERMINED: '已认定责任', PROCESSING: '处理中', CLOSED: '已闭环', ARCHIVED: '已归档', PENDING_CONFIRMATION: '待确认', PENDING_HANDLING: '待处置', IN_PROGRESS: '处置中', PENDING_REVIEW: '待复核', UNHANDLED: '待处理', CONFIRMED: '已认定', RECTIFYING: '整改中', DELIVERY: '城市配送', SANITATION: '环卫清扫', PATROL: '安防巡逻', RETAIL: '无人零售', SHUTTLE: '短途接驳', OTHER: '其他', IN_SERVICE: '在役', EXITED: '已退出', AUTO: '自动驾驶', REMOTE_TAKEOVER: '远程接管', COMPLETED: '已完成', FRONT: '前视', BACK: '后视', REAR: '后视', SIDE: '侧视', LEFT: '左侧', RIGHT: '右侧', UNKNOWN: '其他通道' };
export const label = (value?: string | null) => value ? text[value] ?? value : '—';
export const number = (value?: number | null, unit = '') => value == null || !Number.isFinite(value) ? '—' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}${unit}`;
export const stamp = (value?: string | number | null, timeOnly = false) => !value || !Number.isFinite(new Date(value).getTime()) ? '—' : new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, ...(timeOnly ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) });
export const stale = (row: any) => !row.realtimeStatus?.heartbeatAt || Date.now() - Date.parse(row.realtimeStatus.heartbeatAt) > 600000;
export function params(values: Record<string, unknown>) { return new URLSearchParams(Object.entries(values).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)])); }
export function useMonitoringOptions() {
  const options = ref<{ workspaces: any[]; enterprises: any[] }>({ workspaces: [], enterprises: [] });
  async function loadOptions() { options.value = await api('/province/monitoring/options'); }
  return { options, loadOptions };
}
export interface PageResult { items: any[]; total: number; page: number; pageSize: number }
export interface VideoClip { id: string; name: string; channel: string; url: string | null; startedAt: string | null; endedAt: string | null; state: 'AVAILABLE' | 'NO_TIME' | 'UNAVAILABLE'; source: string | null }
export function useResponsiveDrawer(max: number) { const width = ref(Math.min(max, window.innerWidth * .94)); const resize = () => { width.value = Math.min(max, window.innerWidth * .94); }; onMounted(() => window.addEventListener('resize', resize)); onBeforeUnmount(() => window.removeEventListener('resize', resize)); return width; }
