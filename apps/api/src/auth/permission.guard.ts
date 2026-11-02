import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from './auth.decorators';
import { permissionModule } from './workspace-access';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const user = context.switchToHttp().getRequest().user;
    const request = context.switchToHttp().getRequest();
    const path = String(request.path ?? request.url).replace(/^\/api/, '').split('?')[0];
    const writing = !['GET','HEAD','OPTIONS'].includes(request.method);
    if (user?.accountLevel === 'PROVINCE') {
      if (user.portal === 'ENTERPRISE') throw new ForbiddenException('省级仅设监管端，企业业务应由所属城市企业账号办理');
      const localMutation = /^\/(admission|operations|safety)(\/|$)/.test(path)
        || /^\/system\/enterprises(?:\/|$)/.test(path)
        || /^\/archives\/(?!manufacturers(?:\/|$)|models(?:\/|$))/.test(path)
        || /^\/analytics\/(?!reports(?:\/|$))/.test(path)
        || /^\/governance\/(?!rules(?:\/|$))/.test(path);
      if (writing && localMutation) throw new ForbiddenException('该事项由市级监管或企业办理，省级请通过协同督办监督和跟踪');
    }
    if (user?.accountLevel === 'OPERATIONS' && !path.startsWith('/auth/') && path !== '/saas/current') throw new ForbiddenException('运维身份未获业务数据授权');
    if (path.startsWith('/province/') && user?.accountLevel !== 'PROVINCE') throw new ForbiddenException('仅省级人员可访问');
    if (user?.accountLevel !== 'PROVINCE' && user?.workspace) {
      const cityAnalyticsModule = path.startsWith('/city-analytics/credit') ? 'GOVERNANCE' : path.startsWith('/city-analytics/') && path !== '/city-analytics/options' ? 'ANALYTICS' : undefined;
      const module = cityAnalyticsModule ?? ({ archives: 'ARCHIVES', admission: 'ADMISSION', operations: 'OPERATIONS', safety: 'SAFETY', analytics: 'ANALYTICS', governance: 'GOVERNANCE' } as Record<string,string>)[path.split('/')[1]]
        ?? required.map(permissionModule).find(Boolean);
      if (module && !user.workspace.modules.includes(module)) throw new ForbiddenException('本市尚未开通此功能，请线下联系省级管理员开通');
      const expired = user.workspace.validUntil && new Date(user.workspace.validUntil) <= new Date();
      const restricted = user.workspace.status !== 'ACTIVE' || expired;
      const management = path.startsWith('/auth/') || path.startsWith('/saas/');
      const safetyContinuity = path.startsWith('/safety/') || path.startsWith('/oversight/city-tasks') || path === '/operations/telemetry';
      if (restricted && !['GET', 'HEAD'].includes(request.method) && !management && !safetyContinuity) throw new ForbiddenException('本市授权已到期或暂停，当前保留历史查询、安全处置和恢复管理');
    }
    if (!required.every((code) => user?.permissions?.includes(code))) throw new ForbiddenException('当前账号没有执行此操作的权限');
    return true;
  }
}
