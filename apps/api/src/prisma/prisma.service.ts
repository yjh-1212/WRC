import { ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { modelScope, workspaceContext, WorkspaceScope } from './workspace-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    const base = this;
    const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
    const list = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
    const merge = (where: any, filter: any) => filter ? { ...(where ?? {}), AND: [...list(where?.AND), filter] } : where;
    const reads = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy']);
    const shared = new Set(['Manufacturer', 'VehicleModel', 'Permission', 'Menu', 'CockpitRegion', 'CockpitRegionSnapshot', 'CockpitRoadRight']);
    const delegate = (model: string) => (base as any)[model[0].toLowerCase() + model.slice(1)];

    const constrainSelection = (model: string, selection: any, scope: WorkspaceScope) => {
      if (!selection || typeof selection !== 'object') return;
      for (const [key, value] of Object.entries(selection)) {
        if (key === '_count' && value && typeof value === 'object') {
          constrainSelection(model, (value as any).select, scope);
          continue;
        }
        const relation = models.get(model)?.fields.find((field) => field.name === key && field.kind === 'object');
        if (!relation || !value) continue;
        const filter = modelScope(relation.type, scope);
        if (relation.isList && filter) {
          const options = value === true ? {} : value as any;
          options.where = merge(options.where, filter);
          selection[key] = options;
        }
        const options = selection[key];
        if (options && typeof options === 'object') {
          constrainSelection(relation.type, options.include, scope);
          constrainSelection(relation.type, options.select, scope);
        }
      }
    };

    const checkReference = async (model: string, where: any, scope: WorkspaceScope) => {
      const filter = modelScope(model, scope);
      if (!filter) return;
      const found = await delegate(model).findFirst({ where: merge(where, filter) });
      // A newly created parent in the current interactive transaction is not yet
      // visible on the base connection. Existing foreign rows must still be denied;
      // missing targets are checked by the database foreign-key/Prisma constraint.
      if (!found && await delegate(model).findFirst({ where })) throw new ForbiddenException('关联对象超出当前城市、辖区的数据范围');
    };

    const checkData = async (model: string, data: any, scope: WorkspaceScope, creating: boolean, depth = 0): Promise<void> => {
      if (!data || typeof data !== 'object' || depth > 12) return;
      for (const item of list(data)) {
        const fields = models.get(model)?.fields ?? [];
        if (['User', 'Organization', 'Role', 'ProcessDefinition'].includes(model)) {
          if (item.workspaceId !== undefined && item.workspaceId !== scope.workspaceId) throw new ForbiddenException('不能修改对象所属城市');
          if (creating) item.workspaceId = scope.workspaceId;
        }
        if (item.organizationId !== undefined && item.organizationId !== null && !scope.organizationIds.includes(item.organizationId)) throw new ForbiddenException('所选机构超出授权辖区');
        if (scope.enterpriseId && item.enterpriseId !== undefined && item.enterpriseId !== scope.enterpriseId) throw new ForbiddenException('不能跨企业关联业务');
        if (model === 'User' && item.accountLevel && !['CITY', 'ENTERPRISE'].includes(item.accountLevel)) throw new ForbiddenException('市级不能授予省级或平台运维身份');
        if (model === 'Role' && /^(SUPER_ADMIN|PROVINCE|OPERATIONS)/i.test(item.code ?? '')) throw new ForbiddenException('不能创建上级管理角色');
        for (const relation of fields.filter((field) => field.kind === 'object' && field.relationFromFields?.length)) {
          for (let index = 0; index < (relation.relationFromFields ?? []).length; index++) {
            const scalar = relation.relationFromFields![index];
            const value = item[scalar];
            if (value === undefined || value === null) continue;
            const targetKey = relation.relationToFields?.[index] ?? 'id';
            await checkReference(relation.type, { [targetKey]: typeof value === 'object' ? value.set : value }, scope);
          }
        }
        for (const relation of fields.filter((field) => field.kind === 'object')) {
          const nested = item[relation.name];
          if (!nested || typeof nested !== 'object') continue;
          for (const connected of list(nested.connect)) await checkReference(relation.type, connected, scope);
          for (const op of ['create', 'update', 'createMany', 'updateMany', 'upsert', 'connectOrCreate']) {
            for (const change of list(nested[op])) {
              if (op === 'createMany') await checkData(relation.type, change.data, scope, true, depth + 1);
              else if (op === 'upsert' || op === 'connectOrCreate') {
                await checkData(relation.type, change.create, scope, true, depth + 1);
                await checkData(relation.type, change.update, scope, false, depth + 1);
                if (change.where) await checkReference(relation.type, change.where, scope);
              } else await checkData(relation.type, change.data ?? change, scope, op === 'create', depth + 1);
            }
          }
          // Prisma nested deleteMany/updateMany use ScalarWhereInput, not the
          // relation-aware top-level where. They are already constrained to the
          // selected parent; its write predicate above is tenant-scoped. Inserting
          // a relation predicate here would reject legitimate role changes.
        }
      }
    };

    const extended = this.$extends({ query: { $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const scope = workspaceContext.getStore();
        if (!scope || (scope.accountLevel === 'PROVINCE' && (!scope.filteredWorkspaceId || !reads.has(operation)))) return query(args);
        if (!scope.workspaceId || scope.accountLevel === 'OPERATIONS') throw new ForbiddenException('当前身份没有业务数据访问授权');
        const writing = !reads.has(operation);
        if (writing && shared.has(model)) throw new ForbiddenException('共享基础目录由省级统一维护');
        const filter = modelScope(model, scope, writing);
        const input = args as any;
        if (!['create', 'createMany', 'createManyAndReturn'].includes(operation)) input.where = merge(input.where, filter);
        constrainSelection(model, input.include, scope);
        constrainSelection(model, input.select, scope);
        if (writing) {
          await checkData(model, input.data, scope, operation.startsWith('create'));
          await checkData(model, input.create, scope, true);
          await checkData(model, input.update, scope, false);
        }
        return query(args);
      },
    } } });
    return new Proxy(this, {
      get(target, property, receiver) {
        if (property === '$transaction') return (extended.$transaction as any).bind(extended);
        if (typeof property === 'string' && models.has(property[0]?.toUpperCase() + property.slice(1))) return (extended as any)[property];
        return Reflect.get(target, property, receiver);
      },
    });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
