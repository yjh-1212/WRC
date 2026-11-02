import { ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from '../auth/permission.guard';
describe('City analytics module authorization',()=>{
 const user={accountLevel:'CITY',portal:'REGULATORY',permissions:['analytics:evaluation:read','analytics:operation:read'],workspace:{status:'ACTIVE',modules:['GOVERNANCE']}};
 const context=(path:string)=>({getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>({path,method:'GET',user})})}) as any;
 const reflector={getAllAndOverride:jest.fn((key:string)=>key==='isPublic'?false:['analytics:evaluation:read'])};
 const guard=new PermissionGuard(reflector as any);
 it('uses the governance license for enterprise credit',()=>{expect(guard.canActivate(context('/api/city-analytics/credit'))).toBe(true);});
 it('does not let the new endpoint prefix bypass the analytics license',()=>{expect(()=>guard.canActivate(context('/api/city-analytics/evaluations'))).toThrow(ForbiddenException);});
});
