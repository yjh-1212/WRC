import { onMounted, ref } from 'vue';
import { api } from './api';
import { subjectDate, subjectError } from './subject-management';
export const applicationTypes:Record<string,string>={ENTERPRISE_ONBOARDING:'企业准入',VEHICLE_REGISTRATION:'车辆备案及增补',ROAD_TEST:'道路测试',DEMONSTRATION:'示范应用',LICENSE_CHANGE:'许可变更',LICENSE_RENEWAL:'许可续期',LICENSE_EXIT:'退出及注销'};
export const applicationStates:Record<string,string>={DRAFT:'草稿',SUBMITTED:'待受理',IN_REVIEW:'审核中',RETURNED:'待补正',APPROVED:'待签发',REJECTED:'已驳回',COMPLETED:'已办结',WITHDRAWN:'已撤回'};
export const permitTypes:Record<string,string>={ROAD_TEST:'道路测试',DEMONSTRATION:'示范应用',LEGACY:'历史许可'};
export const permitStates:Record<string,string>={VALID:'有效',EXPIRING:'即将到期',EXPIRED:'已过期',SUSPENDED:'已暂停',REVOKED:'已撤销',CANCELLED:'已注销'};
export const regionTypes:Record<string,string>={OPERATION:'示范应用',ROAD_TEST:'道路测试',TEMPORARY:'临时区域'};
export const admissionDate=subjectDate;
export const admissionTime=(value?:string|null)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
export const stateTone=(status:string)=>['VALID','COMPLETED','ACTIVE'].includes(status)?'success':['RETURNED','EXPIRING','PENDING'].includes(status)?'warning':['REJECTED','REVOKED'].includes(status)?'danger':['APPROVED','IN_REVIEW'].includes(status)?'primary':'info';
export const can=(user:any,permission:string)=>!!user?.permissions?.includes(permission);
export function useAdmissionOptions(endpoint='/admission/options'){
  const options=ref<any>({enterprises:[],vehicles:[],licenses:[],regions:[],organizations:[],approvalResults:[]}),loading=ref(false),error=ref('');
  async function load(){loading.value=true;error.value='';try{options.value=await api(endpoint)}catch(e){error.value=subjectError(e)}finally{loading.value=false}}
  onMounted(load);return {options,loading,error,load};
}
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export async function downloadMaterial(applicationId:string,material:any){
  const response=await fetch(`/api/admission/applications/${encodeURIComponent(applicationId)}/materials/${encodeURIComponent(material.id)}/download`,{headers:{Authorization:`Bearer ${sessionStorage.getItem('wrc-access-token')??''}`}});
  if(!response.ok)throw new Error('材料下载失败，请刷新后重试');saveBlob(await response.blob(),material.name);
}
export async function exportAdmission(endpoint:string,filters:Record<string,string>,columns:Array<[string,(row:any)=>unknown]>,name:string,selected:any[]=[]){
  let rows=selected;
  if(!selected.length){rows=[];for(let page=1;;page++){const params=new URLSearchParams({page:String(page),pageSize:'100'});for(const [key,value] of Object.entries(filters))if(typeof value==='string'&&value.trim())params.set(key,value.trim());const result=await api<any>(`${endpoint}?${params}`);rows.push(...result.items);if(rows.length>=result.total||!result.items.length)break;if(page>=1000)throw new Error('数据量过大，请缩小查询范围后导出')}}
  const cell=(value:unknown)=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
  const csv=[columns.map(([label])=>cell(label)).join(','),...rows.map(row=>columns.map(([,get])=>cell(get(row))).join(','))].join('\r\n');saveBlob(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),name+'.csv');
}
