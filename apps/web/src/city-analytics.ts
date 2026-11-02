import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from './api';
import { saveBlob } from './admission';
export const cityApi='/city-analytics';
export const nf=(value:unknown,digits=1)=>value==null||!Number.isFinite(Number(value))?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:digits}).format(Number(value));
export const day=(v:unknown)=>v?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(String(v))):'—';
export const time=(v:unknown)=>v?new Date(String(v)).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
export const err=(v:unknown)=>v instanceof Error?v.message:'加载失败，请稍后重试';
export const monthRange=()=>{const end=day(new Date().toISOString());return {from:end.slice(0,7)+'-01',to:end};};
export const p=(values:Record<string,unknown>)=>new URLSearchParams(Object.entries(values).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>[k,String(v)]));
export const labels:Record<string,string>={DRAFT:'待复核',DATA_PENDING:'数据待核对',REVIEWED:'复核通过',PUBLISHED:'已发布',UNDER_REVIEW:'重新核定中',CONFIRMED:'已确认',REPAIRED:'已修复',GENERATED:'已生成',REPORTED:'已上报',RESPONSIBILITY_DETERMINED:'已登记认定结果',CLOSED:'已办结',ARCHIVED:'已归档',RECTIFYING:'整改中',PROCESSING:'处置中',PENDING_CONFIRMATION:'待核查',PENDING_DETERMINATION:'待核查',PENDING_HANDLING:'待处置',RECOVERED:'已恢复',OFFLINE:'离线',PENDING:'待核查',HANDLING:'处置中',ALERT:'告警',ACCIDENT:'事故',VIOLATION:'违规',INSPECTION:'检查',OPERATION:'运行记录',ONLINE:'联网日统计',RECTIFICATION:'整改任务',SAFETY:'安全表现',COMPLIANCE:'合规情况',OPERATION_DIM:'运行表现',DAILY:'日报',WEEKLY:'周报',MONTHLY:'月报',QUARTERLY:'季报',SPECIAL:'自定义',OPERATIONS:'运行统计',COMPREHENSIVE:'综合统计',ENTERPRISE:'企业专项',MINOR:'轻微',GENERAL:'一般',SERIOUS:'严重',MAJOR:'重大',REVIEW:'复核通过',RETURN:'退回核对',PUBLISH:'发布',RECALCULATE:'重新计算',CALCULATE:'生成草稿',CONFIRM:'事项确认',REPAIR:'信用修复',ACCEPTED:'申诉已受理',REJECTED:'申诉已驳回',SUBMITTED:'待复核'};
export const text=(v:string)=>labels[v]??v??'—';
export const tone=(v:string):'info'|'success'|'warning'|'primary'|'danger'=>['PUBLISHED','REVIEWED','CONFIRMED','REPAIRED','GENERATED','CLOSED','ARCHIVED'].includes(v)?'success':['DATA_PENDING','DRAFT','UNDER_REVIEW','PENDING','SUBMITTED'].includes(v)?'warning':'info';
export const vehicleTypes=[['DELIVERY','无人配送车'],['SANITATION','无人环卫车'],['PATROL','无人巡逻车'],['RETAIL','无人零售车'],['SHUTTLE','无人接驳车']];
export function useCityQuery(defaults:Record<string,string>={}){
 const route=useRoute(),router=useRouter(),filters=reactive({...defaults});
 const narrow=ref(window.innerWidth<760),resize=()=>{narrow.value=window.innerWidth<760;};window.addEventListener('resize',resize);onBeforeUnmount(()=>window.removeEventListener('resize',resize));
 const applied=computed(()=>Object.fromEntries(Object.keys(defaults).map(k=>[k,typeof route.query[k]==='string'?route.query[k] as string:defaults[k]])));
 const page=computed(()=>Math.max(1,Number(route.query.page)||1));
 const pageSize=computed(()=>[10,20,50].includes(Number(route.query.pageSize))?Number(route.query.pageSize):20);
 const queryKey=computed(()=>JSON.stringify({...applied.value,page:page.value,pageSize:pageSize.value}));
 watch(queryKey,()=>Object.assign(filters,applied.value),{immediate:true});
 const range=computed({get:()=>[filters.from??'',filters.to??''],set:(v:string[]|null)=>{filters.from=v?.[0]??'';filters.to=v?.[1]??'';}});
 async function search(){await router.replace({path:route.path,query:{...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)),page:1,pageSize:pageSize.value}});}
 async function reset(){Object.assign(filters,defaults);await search();}
 async function paginate(value:number,size=pageSize.value){await router.replace({query:{...route.query,page:value,pageSize:size}});}
 const id=computed(()=>String(route.query.id??''));
 async function open(id:string,extra:Record<string,string|undefined>={}){await router.push({query:{...route.query,id,...extra}});}
 async function close(){await router.replace({query:{...route.query,id:undefined,focusDate:undefined,focusCategory:undefined}});}
 return {route,router,filters,applied,page,pageSize,queryKey,range,search,reset,paginate,id,open,close,narrow,params:()=>p({...applied.value,page:page.value,pageSize:pageSize.value})};
}
export async function download(path:string){const file=await api<{filename:string;content:string;mimeType:string}>(path);saveBlob(new Blob([file.content],{type:file.mimeType}),file.filename);}
export async function notifyDownload(path:string){try{await download(path);}catch(e){ElMessage.error(err(e));}}
export function draft<T extends object>(key:string,initial:T){let restored:any;try{restored=JSON.parse(localStorage.getItem(key)??'null');}catch{}const value=reactive({...initial,...(restored&&typeof restored==='object'?restored:{})}) as T;watch(value,()=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}},{deep:true});return {value,clear:()=>{Object.assign(value,JSON.parse(JSON.stringify(initial)));try{localStorage.removeItem(key);}catch{}}};}
export const chartBase={textStyle:{fontFamily:'"Microsoft YaHei","PingFang SC",sans-serif',color:'#7a90b1',fontSize:12},aria:{enabled:true},tooltip:{trigger:'axis'},grid:{left:55,right:25,top:32,bottom:55},xAxis:{type:'category',name:'日期',nameLocation:'middle',nameGap:32,axisLine:{lineStyle:{color:'#cedbed'}},axisTick:{show:false},axisLabel:{fontSize:12}},yAxis:{type:'value',axisLine:{show:false},axisLabel:{fontSize:12},splitLine:{lineStyle:{color:'#e5edf8',type:'dashed'}}}} as any;
