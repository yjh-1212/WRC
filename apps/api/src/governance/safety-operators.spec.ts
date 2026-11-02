import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GovernanceService } from './governance.service';
import { AuthUser } from '../auth/auth.types';
import { CreateSafetyOperatorDto, UpdateSafetyOperatorDto } from './dto';

const user=(portal='REGULATORY')=>({id:'u',username:'u',displayName:'管理员',portal,accountLevel:portal==='ENTERPRISE'?'ENTERPRISE':'CITY',workspaceId:'city',organizationId:'org',enterpriseId:portal==='ENTERPRISE'?'enterprise':null,roles:[{id:'r',code:'CITY_ADMIN_370100',name:'管理员'}],permissions:[]} as AuthUser);
const five=['v1','v2','v3','v4','v5'];
describe('安全员负责车辆上限',()=>{
  let prisma:any,auth:any,service:GovernanceService;
  beforeEach(()=>{
    prisma={enterprise:{findFirst:jest.fn().mockResolvedValue({id:'enterprise',organizationId:'org'})},vehicle:{count:jest.fn(async(args:any)=>args.where.id.in.length)},safetyOperator:{findFirst:jest.fn().mockResolvedValue({id:'operator',enterpriseId:'enterprise',status:'APPROVED',trainingCompleted:true,qualificationNo:'Q1',expiresAt:new Date('2099-01-01'),vehicles:five.map(vehicleId=>({vehicleId}))}),create:jest.fn(async({data}:any)=>({id:'operator',vehicles:data.vehicles.create})),update:jest.fn(async({data}:any)=>({id:'operator',...data,vehicles:data.vehicles?.create??five.map(vehicleId=>({vehicleId}))}))}};
    prisma.$transaction=jest.fn(async(callback:any)=>callback(prisma));auth={audit:jest.fn()};service=new GovernanceService(prisma,auth);
  });
  it('DTO阻止新增和修改超过5台及重复车辆',async()=>{
    for(const dto of [plainToInstance(CreateSafetyOperatorDto,{name:'安全员',vehicleIds:[...five,'v6']}),plainToInstance(UpdateSafetyOperatorDto,{vehicleIds:[...five,'v6']}),plainToInstance(UpdateSafetyOperatorDto,{vehicleIds:['v1','v1']})])expect((await validate(dto)).some(error=>error.property==='vehicleIds')).toBe(true);
  });
  it('允许恰好5台并使用事务建立关联',async()=>{
    const result=await service.createOperator(user(),{name:'安全员',enterpriseId:'enterprise',vehicleIds:five});expect(result.vehicles).toHaveLength(5);expect(prisma.$transaction).toHaveBeenCalled();
  });
  it('即使跳过DTO直接调用服务，6台仍不能创建',async()=>{
    await expect(service.createOperator(user(),{name:'安全员',enterpriseId:'enterprise',vehicleIds:[...five,'v6']})).rejects.toBeInstanceOf(BadRequestException);expect(prisma.safetyOperator.create).not.toHaveBeenCalled();
  });
  it('超限修改不覆盖已有5台',async()=>{
    await expect(service.updateOperator(user(),'operator',{vehicleIds:[...five,'v6']})).rejects.toBeInstanceOf(BadRequestException);expect(prisma.safetyOperator.update).not.toHaveBeenCalled();
  });
  it('重新调配是整体替换，不能累加旧关联',async()=>{
    await service.updateOperator(user(),'operator',{vehicleIds:['v4','v5','v6','v7','v8']});const data=prisma.safetyOperator.update.mock.calls[0][0].data;expect(data.vehicles.deleteMany).toEqual({});expect(data.vehicles.create).toHaveLength(5);
  });
  it('允许取消全部分配',async()=>{
    await service.updateOperator(user(),'operator',{vehicleIds:[]});expect(prisma.safetyOperator.update.mock.calls[0][0].data.vehicles.create).toEqual([]);
  });
  it('拒绝其他企业及已退出运营车辆',async()=>{
    prisma.vehicle.count.mockResolvedValue(4);await expect(service.createOperator(user(),{name:'安全员',enterpriseId:'enterprise',vehicleIds:five})).rejects.toBeInstanceOf(BadRequestException);expect(prisma.safetyOperator.create).not.toHaveBeenCalled();
  });
  it('企业端不能把安全员归属到其他企业',async()=>{
    await expect(service.createOperator(user('ENTERPRISE'),{name:'安全员',enterpriseId:'other',vehicleIds:[]})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('企业调配车辆不改变既有资格审核，变更资格资料需重新审核',async()=>{
    await service.updateOperator(user('ENTERPRISE'),'operator',{vehicleIds:['v1']});expect(prisma.safetyOperator.update.mock.calls[0][0].data.status).toBe('APPROVED');
    await service.updateOperator(user('ENTERPRISE'),'operator',{qualificationNo:'Q2'});expect(prisma.safetyOperator.update.mock.calls[1][0].data.status).toBe('PENDING');
  });
});
