import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { workspaceContext } from '../prisma/workspace-context';

export const BEFORE_SECONDS = 90, AFTER_SECONDS = 60;
export const EVENT_PERMISSIONS: Record<string, { read: string; write: string; model: string }> = {
  ALERT: { read: 'safety:alert:read', write: 'safety:alert:handle', model: 'safetyAlert' },
  ACCIDENT: { read: 'safety:accident:read', write: 'safety:accident:handle', model: 'accident' },
  VIOLATION: { read: 'safety:violation:read', write: 'safety:violation:review', model: 'violation' },
  OFFLINE: { read: 'safety:offline:read', write: 'safety:offline:handle', model: 'offlineEvent' },
};
export const parse = (value: string | null | undefined, fallback: any = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
export function scope(user: AuthUser): any {
  if (user.accountLevel === 'PROVINCE') { const context=workspaceContext.getStore();return context?.filteredWorkspaceId?{organizationId:{in:context.organizationIds}}:{}; }
  return { organizationId: { in: user.scopeOrganizationIds?.length ? user.scopeOrganizationIds : [user.organizationId ?? '__none__'] }, ...(user.portal === 'ENTERPRISE' ? { enterpriseId: user.enterpriseId ?? '__none__' } : {}) };
}
export function requirePermission(user: AuthUser, permission: string) { if (!user.permissions.includes(permission)) throw new ForbiddenException('当前账号没有执行此操作的权限'); }
export function regulator(user: AuthUser) { if (user.portal === 'ENTERPRISE' || ['PROVINCE', 'OPERATIONS'].includes(user.accountLevel ?? '')) throw new ForbiddenException('该操作由所属地市监管人员办理'); }
export function eventPermission(user: AuthUser, type: string, write = false) {
  const rule = EVENT_PERMISSIONS[type]; if (!rule) throw new BadRequestException('不支持的事件类型');
  requirePermission(user, write ? rule.write : rule.read); if (write) regulator(user); return rule;
}
export function evidenceWindow(occurredAt: Date | string) {
  const t = new Date(occurredAt).getTime();
  if (!Number.isFinite(t)) throw new BadRequestException('事件发生时间无效');
  return { from: new Date(t - BEFORE_SECONDS * 1000), to: new Date(t + AFTER_SECONDS * 1000), beforeSeconds: BEFORE_SECONDS, afterSeconds: AFTER_SECONDS, durationSeconds: BEFORE_SECONDS + AFTER_SECONDS };
}
export function coverage(from: number, to: number, intervals: [number, number][], tolerance = 0) {
  let end = from;
  for (const [a, b] of [...intervals].filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
    if (b < from || a > to) continue;
    if (a > end + tolerance) return false;
    end = Math.max(end, b); if (end >= to - tolerance) return true;
  }
  return end >= to - tolerance;
}
export function evidenceCompleteness(from: number, to: number, videos: any[], points: any[], now = Date.now()) {
  const usable = videos.filter(v => v.state === 'AVAILABLE' && v.startedAt && v.endedAt);
  const channels = [...new Set(usable.map(v => v.channel))];
  const videoComplete = channels.some(channel => coverage(from, to, usable.filter(v => v.channel === channel).map(v => [Date.parse(v.startedAt), Date.parse(v.endedAt)])));
  const times = [...new Set(points.map(p => Date.parse(p.recordedAt)).filter(Number.isFinite))].sort((a: number, b: number) => a - b) as number[];
  const trackComplete = times.length >= 2 && times[0] <= from + 5000 && times[times.length - 1] >= to - 5000 && times.every((t, i) => !i || t - times[i - 1] <= 10000);
  const state = now < to ? 'COLLECTING' : !usable.length ? 'PENDING_UPLOAD' : videoComplete && trackComplete ? 'COMPLETE' : 'PARTIAL';
  return { state, videoComplete, trackComplete, requiredDurationSeconds: 150, observedPoints: times.length, videoChannels: channels };
}
export function dueDate(value: string) { const result = new Date(value); if (!Number.isFinite(result.getTime()) || result <= new Date()) throw new BadRequestException('办理期限必须晚于当前时间'); return result; }
export const historyEntry = (user: AuthUser, action: string, content: string, fromStatus?: string, toStatus?: string) => ({ actorId: user.id, actorName: user.displayName, action, content, fromStatus, toStatus, createdAt: new Date().toISOString() });
export function actionState(current: string, action: string, type: 'RECTIFICATION' | 'EMERGENCY') {
  const transitions: Record<string, Record<string, string>> = { PENDING_DISPATCH: { DISPATCH: 'WAITING_RESPONSE' }, WAITING_RESPONSE: { RESPOND: 'IN_PROGRESS' }, IN_PROGRESS: { SUBMIT_FEEDBACK: 'PENDING_REVIEW' }, PENDING_REVIEW: { RETURN: 'IN_PROGRESS', CLOSE: 'CLOSED' } };
  const next = transitions[current]?.[action]; if (!next || (type === 'RECTIFICATION' && action === 'DISPATCH')) throw new BadRequestException('当前任务状态不支持该操作，请刷新后重试'); return next;
}
