import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '../auth/auth.types';
import { workspaceContext } from '../prisma/workspace-context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspaceScopeInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    // Authentication handlers address only the verified current user, including
    // operations identities without city business membership.
    if (String(request.path ?? '').replace(/^\/api/, '').startsWith('/auth/')) return next.handle();
    if (!user) return next.handle();
    const requested = request.method === 'GET' && typeof request.query?.workspaceId === 'string' ? request.query.workspaceId : undefined;
    if (requested && user.accountLevel !== 'PROVINCE' && requested !== user.workspaceId) throw new ForbiddenException('不能查询其他城市的数据');
    const filtered = user.accountLevel === 'PROVINCE' && requested ? await this.prisma.cityWorkspace.findUnique({ where: { id: requested } }) : null;
    if (requested && user.accountLevel === 'PROVINCE' && !filtered) throw new ForbiddenException('所选城市不存在或尚未开通');
    const organizations = filtered ? await this.prisma.organization.findMany({ where: { workspaceId: filtered.id }, select: { id:true } }) : null;
    return new Observable((subscriber) => workspaceContext.run({
      userId: user.id, accountLevel: user.accountLevel ?? 'CITY', workspaceId: filtered?.id ?? user.workspaceId ?? null,
      organizationIds: organizations?.map(org=>org.id) ?? user.scopeOrganizationIds ?? [], organizationId: user.organizationId,
      enterpriseId: user.enterpriseId, permissions: user.permissions, cityCode: filtered?.cityCode ?? user.workspace?.cityCode,
      filteredWorkspaceId:filtered?.id,
    }, () => next.handle().subscribe(subscriber)));
  }
}
