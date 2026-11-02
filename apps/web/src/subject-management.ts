import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { api } from './api';
import type { PageData } from './types';

export const subjectDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) : '—';
export const subjectError = (error: unknown) => error instanceof Error ? error.message : '数据加载失败，请重试';
export const subjectStatus = (value?: string) => ({ ACTIVE:'正常运营', INACTIVE:'已停用', VALID:'有效', EXPIRING:'即将到期', EXPIRED:'已到期', SUSPENDED:'已暂停', CANCELLED:'已注销', DRAFT:'草稿', SUBMITTED:'已提交', IN_REVIEW:'审核中', RETURNED:'待补正', APPROVED:'已通过', REJECTED:'已驳回', COMPLETED:'已完成', PENDING_CONFIRMATION:'待确认', PENDING_HANDLING:'待处置', IN_PROGRESS:'处置中', PENDING_REVIEW:'待复核', CLOSED:'已闭环' } as Record<string,string>)[value ?? ''] ?? value ?? '—';

export function useSubjectList(endpoint: string, initial: Record<string,string> = {}, withSort = true) {
  const filters = reactive<Record<string,string>>({ q:'', status:'', ...initial });
  const rows=ref<any[]>([]), total=ref(0), page=ref(1), loading=ref(false), error=ref('');
  const summary=ref<any>({});
  let appliedFilters = { ...filters }, generation=0;
  let controller: AbortController | undefined;
  async function load() {
    controller?.abort(); controller=new AbortController();
    const request=++generation; loading.value=true; error.value='';
    try {
      const params=new URLSearchParams({ page:String(page.value), pageSize:'20' });
      if(withSort){params.set('sort','createdAt');params.set('order','asc')}
      for (const [key,value] of Object.entries(appliedFilters)) if (typeof value==='string'&&value.trim()) params.set(key,value.trim());
      const result=await api<PageData<any>>(`${endpoint}?${params}`, { signal:controller.signal });
      if(request!==generation)return;
      if (!result.items.length && result.total>0 && page.value>1) { page.value=Math.max(1,Math.ceil(result.total/20)); return; }
      rows.value=result.items;total.value=result.total;summary.value=result;
    }catch(reason){if(request===generation)error.value=subjectError(reason)}
    finally{if(request===generation)loading.value=false}
  }
  watch(page,load);
  function search(){appliedFilters={...filters};if(page.value!==1)page.value=1;else return load()}
  function reset(){Object.assign(filters,{q:'',status:'',...initial});return search()}
  onMounted(()=>{appliedFilters={...filters};load()});onBeforeUnmount(()=>{generation++;controller?.abort()});
  return {filters,rows,total,page,loading,error,load,search,reset,summary,getFilters:()=>({...appliedFilters})};
}
