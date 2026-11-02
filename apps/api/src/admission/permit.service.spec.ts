import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PermitService, localDate, ownerScope, permitStatus, permitScopeView } from './permit.service';

describe('Permit lifecycle invariants',()=>{
  const now=new Date('2026-10-30T04:00:00Z');
  it('保留已签发范围快照，不能随当前道路范围变化而重写',()=>{
    const original={id:'issued',polygon:[{longitude:117,latitude:36}]};const result=permitScopeView({conditionsJson:JSON.stringify({regions:[original]}),approvalResults:[{operationRegions:[{id:'current',status:'ACTIVE',approvalStatus:'APPROVED'}]}]},now);
    expect(result.conditions.regions).toEqual([original]);expect(result.conditionsSource).toBe('ISSUED_SNAPSHOT');
  });
  it('历史许可无快照时只展示当前有效的关联道路，排除停用大面并去重',()=>{
    const active={id:'road',status:'ACTIVE',approvalStatus:'APPROVED',polygonJson:'[]'};
    const result=permitScopeView({conditionsJson:'{}',approvalResults:[{operationRegions:[active,{...active,id:'old-block',status:'INACTIVE'},{...active,id:'pending',approvalStatus:'PENDING'}]},{operationRegions:[active]}]},now);
    expect(result.conditions.regions.map((row:any)=>row.id)).toEqual(['road']);expect(result.conditionsSource).toBe('CURRENT_REGIONS');
  });
  it('computes expiry from dates even when the stored flag is stale',()=>{
    expect(permitStatus({status:'VALID',expiresAt:'2026-10-29T04:00:00Z'},now)).toBe('EXPIRED');
    expect(permitStatus({status:'EXPIRED',expiresAt:'2026-11-02T04:00:00Z'},now)).toBe('EXPIRING');
    expect(permitStatus({status:'VALID',expiresAt:'2027-01-01T04:00:00Z'},now)).toBe('VALID');
  });
  it.each(['SUSPENDED','REVOKED','CANCELLED'])('does not erase %s when the end date passes',status=>{
    expect(permitStatus({status,expiresAt:'2026-01-01T00:00:00Z'},now)).toBe(status);
  });
  it('treats a date-only expiry as the end of that day in China',()=>{
    expect(localDate('2026-10-30',true).toISOString()).toBe('2026-10-30T15:59:59.999Z');
    expect(localDate('2026-10-30').toISOString()).toBe('2026-10-29T16:00:00.000Z');
  });
  it('keeps city administrators scoped to their own workspace',()=>{
    const user:any={portal:'REGULATORY',accountLevel:'CITY',workspaceId:'jinan',roles:[{code:'CITY_ADMIN_370100'}]};
    expect(ownerScope(user)).toEqual({organization:{is:{workspaceId:'jinan'}}});
  });
  it('rejects direct enterprise changes and cannot restore an expired suspended permit',async()=>{
    const prisma:any={$transaction:async(fn:any)=>fn({vehicleLicense:{findFirst:async()=>({status:'SUSPENDED',expiresAt:new Date('2000-01-01')})}})};
    const service=new PermitService(prisma,{} as any);
    await expect(service.action({portal:'ENTERPRISE'} as any,'id',{action:'RESUME',reason:'申请恢复'})).rejects.toThrow(ForbiddenException);
    const user:any={portal:'REGULATORY',accountLevel:'CITY',workspaceId:'w',roles:[],scopeOrganizationIds:['o']};
    await expect(service.action(user,'id',{action:'RESUME',reason:'整改通过'})).rejects.toThrow(BadRequestException);
  });
});
