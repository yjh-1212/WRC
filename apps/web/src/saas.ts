import { api } from './api';
import { useSessionStore } from './stores/session';

export const moduleNames: Record<string, string> = { ARCHIVES: '监管档案', ADMISSION: '准入与审批', OPERATIONS: '运行监测', SAFETY: '安全处置', ANALYTICS: '分析研判', GOVERNANCE: '治理与信用' };
export const statusNames: Record<string, string> = { SUBMITTED: '待审核', RETURNED: '待补正', REJECTED: '已驳回', APPROVED: '已批准', WITHDRAWN: '已撤回', PENDING_ACTIVATION: '待激活', ACTIVE: '已开通', SUSPENDED: '已暂停', PENDING: '待执行', RUNNING: '开通中', SUCCEEDED: '开通成功', FAILED: '开通失败', DISABLED: '已停用' };
export const kindNames: Record<string, string> = { NEW: '首次开通', EXTEND: '功能扩展', RENEW: '授权续期', ADMIN_CHANGE: '管理员变更' };
export const statusText = (value?: string) => statusNames[value ?? ''] ?? value ?? '—';
export const kindText = (value?: string) => kindNames[value ?? ''] ?? value ?? '—';
export const dateText = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
export const errorText = (e: unknown) => e instanceof Error ? e.message : '请求未完成，请重试';
export const moduleText = (values?: string[]) => (values ?? []).map(value => moduleNames[value] ?? value).join('、') || '—';
export const post = <T = any>(path: string, data: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(data) });
export const patch = <T = any>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
export interface SaasCatalog { cities: Array<{ code: string; name: string }>; modules: Array<{ code: string; name: string }> }
export interface ApplicationForm { cityCode: string; unitName: string; contactName: string; contactPhone: string; adminName: string; adminUsername: string; modules: string[]; expectedVehicles: number; materialNote: string }
export const newApplication = (): ApplicationForm => ({ cityCode: '', unitName: '', contactName: '', contactPhone: '', adminName: '', adminUsername: '', modules: Object.keys(moduleNames), expectedVehicles: 100, materialNote: '' });
export const validateApplication = (form: ApplicationForm) => !form.cityCode ? '请选择申请城市' : !form.unitName.trim() ? '请填写申请单位' : !form.contactName.trim() || !form.contactPhone.trim() ? '请填写联系人和联系电话' : !form.adminName.trim() || !form.adminUsername.trim() ? '请填写管理员姓名和账号' : !/^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/.test(form.adminUsername) ? '管理员账号须以字母开头，由3至40位字母、数字、点、下划线或短横线组成' : !form.modules.length ? '请至少选择一个业务模块' : !form.materialNote.trim() ? '请填写授权函编号及材料摘要' : '';
export const validPassword = (value: string) => value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
export function activationUrl(invitation: any) { return `${window.location.origin}/activate?token=${encodeURIComponent(invitation.activationToken ?? '')}`; }
export function validateMaterials(files: File[]) {
  if (files.length > 3) return '每次最多选择3份材料';
  for (const file of files) {
    if (file.size > 2 * 1024 * 1024) return `${file.name} 超过2MB，请压缩后重新选择`;
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) return '材料仅支持PDF、PNG或JPG格式';
  }
  return '';
}
export async function uploadMaterial(id: string, secret: string, file: File) {
  const body = new FormData(); body.set('file', file); body.set('trackingSecret', secret);
  const response = await fetch(`/api/saas/applications/${id}/materials`, { method: 'POST', body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '材料上传未完成，请重新上传');
  return result.data;
}
export async function downloadMaterial(applicationId: string, material: any, trackingSecret?: string) {
  const session = useSessionStore();
  const response = await fetch(`/api/saas/applications/${applicationId}/materials/${material.id}/download`, trackingSecret ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackingSecret }) } : { headers: { Authorization: `Bearer ${session.accessToken}` } });
  if (!response.ok) { const result = await response.json(); throw new Error(result.message || '材料下载失败'); }
  const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = material.originalName || material.name || '申请材料'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
