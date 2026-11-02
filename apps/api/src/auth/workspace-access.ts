import { AuthUser } from './auth.types';

export const isProvince = (user: AuthUser) => user.accountLevel === 'PROVINCE' || (!user.accountLevel && user.roles.some((role) => role.code === 'SUPER_ADMIN'));
export const isCityAdmin = (user: AuthUser) => user.accountLevel === 'CITY' && user.roles.some((role) => /^CITY_ADMIN(?:_|$)/.test(role.code));
export const isScopedAdministrator = (user: AuthUser) => isProvince(user) || isCityAdmin(user);
export const MODULE_PERMISSIONS: Record<string, string> = {
  archive: 'ARCHIVES', admission: 'ADMISSION', operation: 'OPERATIONS', safety: 'SAFETY', analytics: 'ANALYTICS',
};
export function permissionModule(code: string): string | undefined { return MODULE_PERMISSIONS[code.split(':')[0]]; }
