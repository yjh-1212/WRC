import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute,useRouter } from 'vue-router';
import { api } from './api';
import { fail,params } from './safety-workspace';
export function useSafetyList(endpoint:string,fields:Record<string,string>){
 const route=useRoute(),router=useRouter(),filters=reactive({...fields}),rows=ref<any[]>([]),total=ref(0),page=ref(1),loading=ref(false),error=ref('');let applied={...fields},key='',generation=0,controller:AbortController|undefined;
 async function load(){const g=++generation;controller?.abort();controller=new AbortController();loading.value=true;error.value='';try{const r=await api<any>(`${endpoint}?${params({...applied,page:page.value,pageSize:20})}`,{signal:controller.signal});if(g!==generation)return;rows.value=r.items;total.value=r.total;}catch(e){if(g===generation&&!controller.signal.aborted)error.value=fail(e)}finally{if(g===generation)loading.value=false}}
 function search(first=true){if(first)page.value=1;const query:any={...route.query,...Object.fromEntries(Object.entries(filters).map(([k,v])=>[k,v.trim()||undefined])),page:String(page.value)};if(router.resolve({path:route.path,query}).fullPath===route.fullPath){applied={...filters};void load()}else void router.replace({path:route.path,query})}
 function reset(){Object.assign(filters,fields);search()}
 watch(()=>route.query,q=>{for(const k of Object.keys(fields))filters[k]=typeof q[k]==='string'?String(q[k]):fields[k]!;page.value=Math.max(1,Number(q.page)||1);applied={...filters};const next=String(params({...applied,page:page.value}));if(next!==key){key=next;void load()}},{immediate:true});
 onBeforeUnmount(()=>{generation++;controller?.abort()});return {filters,rows,total,page,loading,error,search,reset,load,getFilters:()=>({...applied})};
}
