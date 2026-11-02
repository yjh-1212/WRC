import { useSessionStore } from './stores/session';
import { saveBlob } from './admission';
export const safetyLabels:Record<string,string>={ALERT:'告警',ACCIDENT:'事故',VIOLATION:'违规待核查',OFFLINE:'离线',EMERGENCY:'应急处置',RECTIFICATION:'整改任务',INSPECTION_ISSUE:'检查问题',COLLECTING:'采集中',PENDING_UPLOAD:'待补传',PARTIAL:'部分缺失',COMPLETE:'完整',REPORTED:'已上报',ACCEPTED:'已受理',INVESTIGATING:'调查中',RESPONSIBILITY_DETERMINED:'已登记认定结果',PROCESSING:'处置中',CLOSED:'已办结',ARCHIVED:'已归档',RECOVERED:'已恢复',PENDING_CONFIRMATION:'待核查',PENDING_HANDLING:'待处置',PENDING_DETERMINATION:'待核查',CONFIRMED:'已核查',IN_PROGRESS:'办理中',PENDING_REVIEW:'待复核',RECTIFYING:'整改中',INVESTIGATING_OFFLINE:'原因排查中',PENDING_DISPATCH:'待派发',WAITING_RESPONSE:'待响应',PLANNED:'待检查',COMPLETED:'已完成',ROUTINE:'例行检查',SPECIAL:'专项检查',RANDOM:'随机抽查',LOW:'低',MEDIUM:'一般',HIGH:'高',CRITICAL:'重大',AUTO:'自动驾驶',STANDBY:'待机',REMOTE_TAKEOVER:'远程接管',MANUAL:'人工接管',REPORT:'登记上报',CREATE:'创建',DISPATCH:'派发任务',RESPOND:'确认响应',SUBMIT_FEEDBACK:'提交反馈',RETURN:'退回补正',CLOSE:'复核通过',ACCEPT:'登记受理',INVESTIGATE:'开始调查',REGISTER_DETERMINATION:'登记认定结果',DETERMINE:'登记认定结果',PROCESS:'记录处置',ARCHIVE:'归档',CONFIRM:'核查确认',START:'开始处置',SUBMIT_REVIEW:'提交复核',REOPEN:'重新打开',ADD_VIDEO:'补充录像',PRESERVE_EVIDENCE:'保全证据',RECORD_RESULT:'登记检查结果',APPROVE:'复核通过'};
export const sl=(v?:string|null)=>v?safetyLabels[v]??v:'—';
export const sf=(v?:string|number|null,timeOnly=false)=>v&&Number.isFinite(new Date(v).getTime())?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,...(timeOnly?{hour:'2-digit',minute:'2-digit',second:'2-digit'}:{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}):'—';
export const fail=(e:unknown)=>e instanceof Error?e.message:'请求失败，请稍后重试';
export const permission=(user:any,p:string)=>!!user?.permissions?.includes(p);
export const statusTone=(s:string):'success'|'warning'|'danger'|'primary'|'info'=>['CLOSED','ARCHIVED','RECOVERED','COMPLETE','COMPLETED'].includes(s)?'success':['PARTIAL','PENDING_UPLOAD','PENDING_CONFIRMATION','PENDING_HANDLING','REPORTED','WAITING_RESPONSE','RECTIFYING'].includes(s)?'warning':['CRITICAL','OVERDUE'].includes(s)?'danger':['IN_PROGRESS','PENDING_REVIEW','INVESTIGATING','PROCESSING'].includes(s)?'primary':'info';
export const overdue=(t:any)=>t.status!=='CLOSED'&&Date.parse(t.dueAt)<Date.now();
export async function binary(path:string,retry=true):Promise<Blob>{
 const session=useSessionStore(),response=await fetch('/api'+path,{headers:{Authorization:`Bearer ${session.accessToken??''}`}});
 if(response.status===401&&retry&&session.refreshToken&&await session.refresh())return binary(path,false);
 if(!response.ok){let message='文件读取失败，请重试';try{const b=await response.json();message=Array.isArray(b.message)?b.message.join('；'):b.message??message}catch{}throw new Error(message)}return response.blob();
}
export async function safetyDownload(material:any){saveBlob(await binary(`/safety/workspace/materials/${encodeURIComponent(material.id)}/content`),material.name)}
export const params=(v:Record<string,unknown>)=>new URLSearchParams(Object.entries(v).filter(([,x])=>x!=null&&x!=='').map(([k,x])=>[k,String(x)]));
