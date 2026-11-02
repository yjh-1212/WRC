import {effectiveLicense,healthOf,inHours,inPolygon,permitFindings} from './monitoring-rules';
const at=new Date('2026-10-30T04:00:00Z'),polygon=[{longitude:117,latitude:36},{longitude:118,latitude:36},{longitude:118,latitude:37},{longitude:117,latitude:37}];
const license=(conditions:any={},extra:any={})=>({id:'permit',status:'VALID',issuedAt:'2026-10-01T00:00:00Z',expiresAt:'2026-12-01T00:00:00Z',conditionsJson:JSON.stringify({regions:[{id:'area',polygon}],speedLimit:20,allowedHours:'06:00-22:00',...conditions}),...extra});
describe('运行监测规则',()=>{
 it('已超时的RUNNING上报不代表车辆当前运行',()=>{const h=healthOf({drivingState:'RUNNING',heartbeatAt:'2026-10-30T01:00:00Z',locationTime:'2026-10-30T01:00:00Z',longitude:117.5,latitude:36.5},at);expect(h.state).toBe('OFFLINE');expect(h.locationStale).toBe(true)});
 it('无定位不是零速正常车辆',()=>expect(healthOf(null,at)).toMatchObject({stale:true,locationValid:false,state:'OFFLINE'}));
 it('以中国时区核验跨日生效时段',()=>{expect(inHours('22:00-06:00',new Date('2026-10-30T15:00:00Z'))).toBe(true);expect(inHours('22:00-06:00',at)).toBe(false);expect(inHours('bad',at)).toBeNull()});
 it('边界上的车辆属于区域内',()=>{expect(inPolygon({longitude:117,latitude:36.5},polygon)).toBe(true);expect(inPolygon({longitude:116.9,latitude:36.5},polygon)).toBe(false)});
 it('多块许可区域取并集，进入任意一块不误报越界',()=>{const shifted=polygon.map(p=>({...p,longitude:p.longitude+2}));expect(permitFindings(license({regions:[{id:'one',polygon},{id:'two',polygon:shifted}]}),{longitude:119.5,latitude:36.5,speed:18},at)).toEqual([])});
 it('超速与超时段分别保存实际值及条件',()=>{const f=permitFindings(license({allowedHours:'06:00-10:00'}),{longitude:117.5,latitude:36.5,speed:25},at);expect(f.map(x=>x.type)).toEqual(['OUT_OF_HOURS','OVERSPEED']);expect(f[1]).toMatchObject({actual:25,expected:20})});
 it('暂停许可不得用于车辆运行',()=>expect(permitFindings(license({}, {status:'SUSPENDED'}),{longitude:117.5,latitude:36.5,speed:5},at)[0].type).toBe('PERMIT_INVALID'));
 it('历史许可缺失范围时不伪造越界判断',()=>expect(permitFindings(license({regions:[],speedLimit:null,allowedHours:null}),{longitude:0,latitude:0,speed:5},at)).toEqual([]));
 it('优先采用有效许可，忽略较新但已暂停的另一许可',()=>expect(effectiveLicense([license({}, {id:'paused',status:'SUSPENDED',issuedAt:'2026-10-20T00:00:00Z'}),license()],at).id).toBe('permit'));
});
