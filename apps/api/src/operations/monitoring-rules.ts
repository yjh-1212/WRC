export type Coordinate={longitude:number;latitude:number};
export const STALE_MS=10*60_000;
export function json<T=any>(value:string|null|undefined,fallback:T={} as T):T{try{return JSON.parse(value||'') as T}catch{return fallback}}
export function inPolygon(p:Coordinate,polygon:Coordinate[]){
 if(polygon.length<3)return false;let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],cross=(p.longitude-a.longitude)*(b.latitude-a.latitude)-(p.latitude-a.latitude)*(b.longitude-a.longitude);
  if(Math.abs(cross)<1e-10&&p.longitude>=Math.min(a.longitude,b.longitude)&&p.longitude<=Math.max(a.longitude,b.longitude)&&p.latitude>=Math.min(a.latitude,b.latitude)&&p.latitude<=Math.max(a.latitude,b.latitude))return true;
  if((b.latitude>p.latitude)!==(a.latitude>p.latitude)&&p.longitude<(a.longitude-b.longitude)*(p.latitude-b.latitude)/(a.latitude-b.latitude)+b.longitude)inside=!inside;
 }return inside;
}
export function validHours(value?:string|null){return !value||/^(?:[01]\d|2[0-3]):[0-5]\d-(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(value)}
export function inHours(value:string|null|undefined,at:Date){if(!value)return true;if(!validHours(value))return null;const start=value.slice(0,5),end=value.slice(6);const local=new Date(at.getTime()+8*3600_000).toISOString().slice(11,16);return start<=end?local>=start&&local<end:local>=start||local<end}
export function effectiveLicense(licenses:any[],at=new Date()){
 const sorted=[...licenses].sort((a,b)=>+new Date(b.issuedAt)-+new Date(a.issuedAt));
 return sorted.find(l=>['VALID','EXPIRING'].includes(l.status)&&+new Date(l.issuedAt)<=+at&&+new Date(l.expiresAt)>=+at)??sorted[0]??null;
}
export function licenseState(l:any,at=new Date()){if(!l)return 'NONE';if(['SUSPENDED','REVOKED','CANCELLED'].includes(l.status))return l.status;if(+new Date(l.issuedAt)>+at)return 'PENDING';if(+new Date(l.expiresAt)<+at)return 'EXPIRED';return +new Date(l.expiresAt)-+at<=30*86400000?'EXPIRING':'VALID'}
export function healthOf(realtime:any,at=new Date()){
 const heartbeatAge=realtime?Math.max(0,+at-+new Date(realtime.heartbeatAt)):null;
 const locationAge=realtime?Math.max(0,+at-+new Date(realtime.locationTime)):null;
 const stale=heartbeatAge===null||heartbeatAge>STALE_MS;
 const locationValid=!!realtime&&Number.isFinite(realtime.longitude)&&Number.isFinite(realtime.latitude)&&Math.abs(realtime.longitude)<=180&&Math.abs(realtime.latitude)<=90&&(realtime.longitude!==0||realtime.latitude!==0);
 return {heartbeatAge,locationAge,locationValid,stale,locationStale:locationAge===null||locationAge>STALE_MS,onlineStatus:stale?'OFFLINE':'ONLINE',state:stale?'OFFLINE':realtime.drivingState==='RUNNING'?'RUNNING':realtime.drivingState==='IDLE'?'IDLE':'PARKED'};
}
export function permitFindings(license:any,point:Coordinate&{speed:number},at:Date){
 const status=licenseState(license,at),conditions=json<any>(license?.conditionsJson),findings:Array<{type:string;title:string;actual:any;expected:any}>=[];
 if(!['VALID','EXPIRING'].includes(status)){findings.push({type:'PERMIT_INVALID',title:'车辆运行时无有效许可',actual:status,expected:'有效通行许可'});return findings}
 const areas=(conditions.regions??[]).filter((r:any)=>Array.isArray(r.polygon)&&r.polygon.length>=3);
 if(areas.length&&!areas.some((r:any)=>inPolygon(point,r.polygon)))findings.push({type:'OUT_OF_BOUNDS',title:'疑似驶出许可通行范围',actual:point,expected:areas.map((a:any)=>({id:a.id,name:a.name,polygon:a.polygon}))});
 if(inHours(conditions.allowedHours,at)===false)findings.push({type:'OUT_OF_HOURS',title:'疑似超许可时段运行',actual:at.toISOString(),expected:conditions.allowedHours});
 if(Number.isFinite(conditions.speedLimit)&&point.speed>conditions.speedLimit)findings.push({type:'OVERSPEED',title:'疑似超许可限速',actual:point.speed,expected:conditions.speedLimit});
 return findings;
}
