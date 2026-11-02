export const matterKinds: Record<string, string> = { RISK_NOTICE: '风险通报', SUPERVISION: '督办任务', CROSS_CITY: '跨市协同', EMERGENCY: '应急统筹' };
export const matterStatuses: Record<string, string> = { DRAFT: '草稿', DISPATCHED: '已派发', RESPONDING: '办理中', PENDING_REVIEW: '待复核', CLOSED: '已办结' };
export const assignmentStatuses: Record<string, string> = { WAITING: '待响应', PROCESSING: '办理中', SUBMITTED: '待省级复核', CLOSED: '已办结' };
export const matterLevels: Record<string, string> = { LOW: '一般', MEDIUM: '关注', HIGH: '重要', CRITICAL: '紧急' };
export const assignmentRoles: Record<string, string> = { LEAD: '牵头市', SUPPORT: '配合市', PARTICIPANT: '承办市' };
export const checkStatuses: Record<string, string> = { NORMAL: '正常', ISSUE: '发现问题', NOT_APPLICABLE: '不适用' };
export const relatedTypes: Record<string, string> = { VEHICLE: '车辆档案', ALERT: '风险告警', ACCIDENT: '事故记录' };
export const relatedPermissions: Record<string, string> = { VEHICLE: 'archive:vehicle:read', ALERT: 'safety:alert:read', ACCIDENT: 'safety:accident:read' };
export const matterType = (row: any) => row?.template === 'SPECIAL_INSPECTION' ? '专项排查' : matterKinds[row?.kind] || '协同事项';
export const overdue = (row: any) => row?.status !== 'CLOSED' && row?.status !== 'DRAFT' && row?.dueAt && Date.parse(row.dueAt) < Date.now();
export const dateTime = (value?: string | number | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
export const progress = (row: any) => ({ submitted: row.assignments?.filter((a: any) => ['SUBMITTED', 'CLOSED'].includes(a.status)).length || 0, total: row.assignments?.length || 0 });
export interface InspectionCheck { id: string; label: string }
export interface InspectionResult { itemId: string; status: string; note: string }
export interface InspectionReport { enterprises: number; vehicles: number; problemVehicles: number; rectifiedVehicles: number; checks: InspectionResult[] }
export function defaultChecklist(): InspectionCheck[] { return ['车辆通信与定位上报是否正常', '车辆通行许可与实际运营范围是否一致', '历史告警和事故资料是否处理完整', '发现的问题车辆是否完成整改'].map((label, index) => ({ id: `check-${index + 1}`, label })); }
export function newReport(checklist: InspectionCheck[]): InspectionReport { return { enterprises: 0, vehicles: 0, problemVehicles: 0, rectifiedVehicles: 0, checks: checklist.map(item => ({ itemId: item.id, status: '', note: '' })) }; }
export function reportError(report: InspectionReport) {
  if (['enterprises', 'vehicles', 'problemVehicles', 'rectifiedVehicles'].some(key => !Number.isInteger((report as any)[key]) || (report as any)[key] < 0 || (report as any)[key] > 1000000)) return '请填写0至1000000的整数统计数量';
  if (report.problemVehicles > report.vehicles || report.rectifiedVehicles > report.problemVehicles) return '已整改车辆数不能超过问题车辆数，问题车辆数不能超过排查车辆数';
  if (report.checks.some(item => !checkStatuses[item.status] || item.status !== 'NORMAL' && item.note.trim().length < 2)) return '请完成全部检查项，发现问题或不适用时补充说明';
  return '';
}
export function loadLocalDraft(key: string) { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value && typeof value === 'object' ? value : null; } catch { return null; } }
export function saveLocalDraft(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Saving to the server remains available if browser storage is full. */ } }
export function clearLocalDraft(key: string) { try { localStorage.removeItem(key); } catch { /* No browser draft to clear. */ } }
