import { navigationFor } from './navigation';
import { AuthUser } from './auth.types';

const permissions = ['dashboard:view','regulatory:access','enterprise:access','archive:enterprise-archive:read','archive:vehicle:read','archive:manufacturer:read','archive:qualification:read','admission:application:read','admission:license:read','admission:workflow:read','operation:realtime:read','operation:region:read','operation:telemetry:write','safety:alert:read','safety:fence:read','safety:emergency:read','safety:violation:read','analytics:operation:read','analytics:safety:read','analytics:evaluation:read','analytics:report:read','system:user:read','system:organization:read','system:role:read','system:audit:read'];
function user(level:string,portal='REGULATORY'):AuthUser { return { id:'u',username:'u',displayName:'人员',portal,organizationId:'o',enterpriseId:portal==='ENTERPRISE'?'e':null,accountLevel:level,workspaceId:level==='PROVINCE'?null:'w',roles:[{id:'r',code:'CITY_ADMIN_370100',name:'管理员'}],permissions,workspace:level==='PROVINCE'?null:{id:'w',organizationId:'o',cityCode:'370100',cityName:'济南市',status:'ACTIVE',validUntil:null,modules:['ARCHIVES','ADMISSION','OPERATIONS','SAFETY','ANALYTICS','GOVERNANCE']} }; }
function flatten(items:any[]):any[]{return items.flatMap(item=>[item,...flatten(item.children??[])]);}

describe('Role-specific business navigation',()=>{
  it('gives province only oversight destinations and puts platform settings last',()=>{
    const menus=navigationFor(user('PROVINCE'));
    expect(menus.map(item=>item.name)).toEqual(['全省工作台','驾驶舱','地市管理','全省监测','协同督办','统计分析','平台管理']);
    expect(menus.find(item=>item.code==='decision')?.children.map((item:any)=>item.name)).toEqual(['省域运行分析','监管报告']);
    expect(flatten(menus).some(item=>item.path==='/province/evaluations')).toBe(false);
    expect(menus.at(-1)?.utility).toBe(true);
    expect(flatten(menus).some(item=>/^\/(enterprise|admission|city)\//.test(item.path))).toBe(false);
    expect(flatten(menus).some(item=>item.path==='/province/pilots')).toBe(false);
    expect(flatten(menus).some(item=>item.path==='/province/applications')).toBe(false);
    expect(flatten(menus).some(item=>item.path==='/province/workspaces')).toBe(true);
    expect(menus.find(item=>item.code==='monitoring')?.children.map((item:any)=>item.name)).toEqual(['运行监测','车辆监管档案']);
    expect(flatten(menus).some(item=>item.name==='综合查询'||item.name==='风险监测')).toBe(false);
    const coordination=menus.find(item=>item.name==='协同督办');
    expect(coordination?.path).toBe('/province/coordination');
    expect(coordination?.children).toEqual([]);
    expect(flatten(menus).some(item=>['/province/risk-notices','/province/supervision','/province/collaboration','/province/emergency'].includes(item.path))).toBe(false);
  });
  it('offers incident review separately when accident permission is granted',()=>{const actor=user('PROVINCE');actor.permissions=[...actor.permissions,'safety:accident:read'];expect(navigationFor(actor).find(item=>item.code==='monitoring')?.children.map((item:any)=>item.name)).toEqual(['运行监测','车辆监管档案','事故回溯']);});
  it('orders city business by lifecycle and does not list record/detail routes',()=>{
    const menus=navigationFor(user('CITY'));
    expect(menus.map(item=>item.name)).toEqual(['监管工作台','驾驶舱','主体管理','准入与许可','运行监管','安全监管','分析评价','管理设置']);
    expect(menus.find(item=>item.code==='subjects')?.children.map((item:any)=>item.name)).toEqual(['企业管理','车辆管理','安全员管理']);
    expect(menus.find(item=>item.code==='admission')?.children.map((item:any)=>item.name)).toEqual(['业务办理','通行许可','通行区域']);
    expect(flatten(menus).some(item=>item.path==='/archives/operators')).toBe(true);
    expect(flatten(menus).some(item=>/轨迹|运行记录|事故回溯|安全画像|历史记录/.test(item.name))).toBe(false);
    expect(flatten(menus).some(item=>item.path==='/analytics/credit')).toBe(true);
  });
  it('separates enterprise resources, applications, monitoring and settings',()=>{
    const menus=navigationFor(user('ENTERPRISE','ENTERPRISE'));
    expect(menus.map(item=>item.name)).toEqual(['运营工作台','基础资料','申请与许可','运行监测','安全管理','企业评价','企业设置']);
    expect(flatten(menus).some(item=>item.path.startsWith('/province/'))).toBe(false);
    expect(flatten(menus).some(item=>item.path==='/enterprise/profile/access')).toBe(true);
    expect(flatten(menus).some(item=>item.path==='/enterprise/settings/interfaces')).toBe(true);
  });
  it('removes ungranted modules and empty groups',()=>{
    const actor=user('CITY');actor.workspace!.modules=['OPERATIONS'];actor.permissions=['dashboard:view','operation:realtime:read'];
    const menus=navigationFor(actor);
    expect(menus.map(item=>item.name)).toEqual(['监管工作台','驾驶舱','运行监管','管理设置']);
    expect(flatten(menus).some(item=>item.path==='/archives/vehicles')).toBe(false);
  });
  it('does not delegate city administrator settings to ordinary staff',()=>{
    const actor=user('CITY');actor.roles=[];
    const paths=flatten(navigationFor(actor)).map(item=>item.path);
    expect(paths).not.toContain('/city/members');expect(paths).not.toContain('/city/workspace');
  });
  it('hides governance features when their backing module is not granted',()=>{
    const actor=user('CITY');actor.workspace!.modules=actor.workspace!.modules.filter(module=>module!=='GOVERNANCE');
    const paths=flatten(navigationFor(actor)).map(item=>item.path);
    expect(paths).not.toContain('/archives/operators');expect(paths).not.toContain('/safety/inspections');expect(paths).not.toContain('/analytics/credit');
  });
  it('has no province enterprise portal or operations business navigation',()=>{
    expect(navigationFor(user('PROVINCE','ENTERPRISE'))).toEqual([]);
    expect(navigationFor(user('OPERATIONS'))).toEqual([]);
  });
});
