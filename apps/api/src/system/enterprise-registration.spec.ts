import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SystemService } from './system.service';
import { AuthUser } from '../auth/auth.types';

const actor=(overrides={})=>({id:'city-user',username:'city-user',displayName:'市级管理员',enterpriseId:null,portal:'REGULATORY',accountLevel:'CITY',workspaceId:'jinan',organizationId:'org-jinan',scopeOrganizationIds:['org-jinan','org-lixia'],roles:[{id:'role',name:'市级管理员',code:'CITY_ADMIN_370100'}],permissions:[],...overrides} as AuthUser);
const dto={businessNo:'ENT-TEST',name:'测试企业',creditCode:'913701001234567890',organizationId:'org-lixia'};
describe('市级企业登记与企业账号筛选',()=>{
  let prisma:any,auth:any,service:SystemService;
  beforeEach(()=>{prisma={organization:{findFirst:jest.fn().mockResolvedValue({id:'org-lixia',workspaceId:'jinan'})},enterprise:{create:jest.fn().mockResolvedValue({id:'enterprise'})},user:{count:jest.fn().mockResolvedValue(0),findMany:jest.fn().mockResolvedValue([])}};prisma.$transaction=jest.fn(async(values:any[])=>Promise.all(values));auth={audit:jest.fn()};service=new SystemService(prisma,auth)});
  it('省级及企业端不能登记属地企业',async()=>{
    await expect(service.createEnterprise(actor({accountLevel:'PROVINCE'}),dto)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createEnterprise(actor({portal:'ENTERPRISE',accountLevel:'ENTERPRISE'}),dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.enterprise.create).not.toHaveBeenCalled();
  });
  it('拒绝其他城市或越权机构，不写入企业',async()=>{
    prisma.organization.findFirst.mockResolvedValue(null);
    await expect(service.createEnterprise(actor(),dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.organization.findFirst.mock.calls[0][0].where).toMatchObject({id:'org-lixia',workspaceId:'jinan'});
    expect(prisma.enterprise.create).not.toHaveBeenCalled();
  });
  it('普通人员仅能选择授权机构，登记保留联系信息并审计',async()=>{
    await service.createEnterprise(actor({roles:[]}),{...dto,contactName:'企业联系人',contactPhone:'0531-12345678'});
    expect(prisma.organization.findFirst.mock.calls[0][0].where.AND).toEqual([{id:{in:['org-jinan','org-lixia']}}]);
    expect(prisma.enterprise.create.mock.calls[0][0].data.contactName).toBe('企业联系人');
    expect(auth.audit).toHaveBeenCalled();
  });
  it('重复登记返回可理解的冲突信息',async()=>{
    prisma.enterprise.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique',{code:'P2002',clientVersion:'6.15.0'}));
    await expect(service.createEnterprise(actor(),dto)).rejects.toBeInstanceOf(ConflictException);
  });
  it('企业账号筛选不能覆盖企业端自身归属约束',async()=>{
    await service.users(actor({portal:'ENTERPRISE',enterpriseId:'own-enterprise'}),{enterpriseId:'another-enterprise',page:1,pageSize:20});
    const where=prisma.user.findMany.mock.calls[0][0].where;
    expect(where.enterpriseId).toBe('own-enterprise');expect(where.AND).toEqual([{enterpriseId:'another-enterprise'}]);
  });
});
