<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Search } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { params } from '../province-monitoring';
import { dateTime, matterKinds, matterStatuses, matterType, overdue, progress } from '../coordination';
import QueryPanel from './QueryPanel.vue';
import QueryField from './QueryField.vue';
import ProvincePageState from './ProvincePageState.vue';
import CoordinationMatterEditor from './CoordinationMatterEditor.vue';
import CoordinationMatterDetail from './CoordinationMatterDetail.vue';
import '../province-monitoring.css';
import '../coordination.css';
const props = defineProps<{ kind?: string; title?: string; hideHeading?: boolean }>();
const route = useRoute(), router = useRouter(), session = useSessionStore();
const canWrite = computed(() => session.user?.accountLevel === 'PROVINCE' && session.user.permissions.includes('system:organization:update'));
const rows = ref<any[]>([]), total = ref(0), counts = ref<Record<string, number>>({}), options = ref<{workspaces:any[];resources:any[]}>({workspaces:[],resources:[]}), loading = ref(false), error = ref('');
const q = ref(''), kind = ref(''), workspaceId = ref(''), status = ref(''), dateRange = ref<[string,string] | null>(null), bucket = ref('ALL'), page = ref(1), template = ref('');
const createdMonth = ref('');
const editorOpen = ref(false), preset = ref<any>({}), detailOpen = ref(false), detailId = ref('');
let version = 0, controller: AbortController | undefined, queryKey = '', handledCreate = '';
async function loadOptions() { options.value = await api('/oversight/options'); }
function values() { return { q:q.value.trim(), kind:kind.value, workspaceId:workspaceId.value, status:status.value, dueFrom:dateRange.value?.[0], dueTo:dateRange.value?.[1], createdMonth:createdMonth.value, bucket:bucket.value, template:template.value, page:page.value }; }
async function load() {
  const current = ++version; controller?.abort(); controller = new AbortController(); loading.value = true; error.value = '';
  try { if (!options.value.workspaces.length) await loadOptions(); const result = await api<any>(`/oversight/matters?${params(values())}`, {signal:controller.signal}); if(current===version) { rows.value=result.items;total.value=result.total;counts.value=result.counts; } }
  catch(reason) { if(current===version&&!controller.signal.aborted) error.value=reason instanceof Error?reason.message:'协同事项读取失败'; }
  finally { if(current===version) loading.value=false; }
}
function search(reset=true) { if(reset) page.value=1; const query=Object.fromEntries(params(values())); const next=router.resolve({path:'/province/coordination',query}); if(next.fullPath===route.fullPath) void load(); else void router.replace(next.fullPath); }
function reset() { q.value=kind.value=workspaceId.value=status.value=template.value=createdMonth.value=''; dateRange.value=null;bucket.value='ALL'; search(); }
function show(row:any) { void router.replace({path:'/province/coordination',query:{...route.query,matterId:row.id}}); }
function closeDetail(value:boolean) { detailOpen.value=value; if(!value&&route.query.matterId) { const {matterId:_id,...query}=route.query;void router.replace({path:route.path,query}); } }
function openEditor(row:any={}, selectedTemplate='STANDARD') { preset.value=row.id?row:{kind:selectedTemplate==='SPECIAL_INSPECTION'?'SUPERVISION':kind.value||'SUPERVISION',template:selectedTemplate,...row}; editorOpen.value=true; }
async function saved(row:any) { await load(); await loadOptions(); show(row); }
function followUp(data:any) {
  const sameCity = data.related?.cityName===data.assignment.cityName;
  openEditor({kind:'SUPERVISION',title:`${data.assignment.cityName}整改督办`,description:`请依据“${data.title}”排查反馈，对发现的问题继续核查和整改，并反馈处理结果。`,basis:`${data.businessNo} · ${data.title}`,level:data.level,workspaceIds:[data.assignment.workspaceId],relatedType:sameCity?data.relatedType:null,relatedId:sameCity?data.relatedId:null,related:sameCity?data.related:null});
}
watch(()=>route.query, query=>{
  createdMonth.value=String(query.createdMonth??'');
  q.value=String(query.q??'');kind.value=String(query.kind??props.kind??'');workspaceId.value=String(query.workspaceId??'');status.value=String(query.status??'');dateRange.value=query.dueFrom&&query.dueTo?[String(query.dueFrom),String(query.dueTo)]:null;bucket.value=['ALL','WAITING','PROCESSING','REVIEW','OVERDUE'].includes(String(query.bucket))?String(query.bucket):'ALL';template.value=String(query.template??'');page.value=Math.max(1,Number(query.page)||1);
  const key=String(params(values()));if(key!==queryKey){queryKey=key;void load();}
  detailId.value=typeof query.matterId==='string'?query.matterId:'';detailOpen.value=!!detailId.value;
  if(query.create==='1'&&canWrite.value&&handledCreate!==route.fullPath){handledCreate=route.fullPath;openEditor({title:String(query.title??''),description:String(query.description??''),basis:String(query.basis??''),kind:kind.value||'SUPERVISION',level:String(query.level??'MEDIUM'),workspaceIds:workspaceId.value?[workspaceId.value]:[],relatedType:query.relatedType||null,relatedId:query.relatedId||null,related:query.relatedId?{id:query.relatedId,type:query.relatedType,title:query.title,businessNo:query.basis}:null});const{create:_create,title:_title,description:_description,basis:_basis,level:_level,relatedType:_type,relatedId:_related,...remaining}=query;void router.replace({path:route.path,query:remaining});}
},{immediate:true});
onBeforeUnmount(()=>{version++;controller?.abort();});
</script>
<template>
<section class="pm-page pm-fill-page coordination-page">
  <h1 class="sr-only">协同督办</h1>
  <div v-if="createdMonth" class="pm-toolbar"><el-tag closable @close="createdMonth='';search()">创建月份：{{createdMonth}}</el-tag></div>
  <QueryPanel :loading="loading" @search="search()" @reset="reset">
    <QueryField label="关键词" keyword><el-input v-model="q" aria-label="事项关键词" :prefix-icon="Search" clearable placeholder="事项编号、名称或关联线索"/></QueryField>
    <QueryField label="事项类型"><el-select v-model="kind" aria-label="事项类型" clearable placeholder="全部类型"><el-option v-for="(name,key) in matterKinds" :key="key" :value="key" :label="name"/></el-select></QueryField>
    <QueryField label="责任地市"><el-select v-model="workspaceId" aria-label="责任地市" clearable placeholder="全部地市"><el-option v-for="city in options.workspaces" :key="city.id" :label="city.cityName" :value="city.id"/></el-select></QueryField>
    <QueryField label="办理状态"><el-select v-model="status" aria-label="办理状态" clearable placeholder="全部状态"><el-option v-for="(name,key) in matterStatuses" :key="key" :value="key" :label="name"/></el-select></QueryField>
    <QueryField label="截止日期" wide><el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="截止日期范围"/></QueryField>
  </QueryPanel>
  <div class="pm-toolbar"><div class="pm-buckets"><button v-for="[key,name] in [['ALL','全部事项'],['WAITING','待响应'],['PROCESSING','办理中'],['REVIEW','待复核'],['OVERDUE','已逾期']]" :key="key" type="button" :aria-pressed="bucket===key" @click="bucket=key!;search()">{{name}}<b v-if="counts[key!]!=null">{{counts[key!]}}</b></button></div>
    <div class="pm-toolbar-actions"><el-dropdown v-if="canWrite" split-button type="primary" @click="openEditor()" @command="(value:string)=>openEditor({},value)"><Plus :size="14"/>新建事项<template #dropdown><el-dropdown-menu><el-dropdown-item command="STANDARD">普通事项</el-dropdown-item><el-dropdown-item command="SPECIAL_INSPECTION">专项排查</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div>
  </div>
  <ProvincePageState class="pm-fill-body" :loading="loading" :error="error" @retry="load">
    <section class="pm-list-surface" aria-label="协同督办事项列表"><el-table :data="rows" height="100%" row-key="id" empty-text="暂无符合条件的协同事项" :row-class-name="({row}:any)=>overdue(row)?'coord-overdue-row':''">
      <el-table-column label="事项" min-width="300"><template #default="{row}"><el-button link type="primary" @click="show(row)">{{row.title}}</el-button><small class="pm-subline">{{row.businessNo}}<span v-if="row.related"> · {{row.related.businessNo}}</span></small></template></el-table-column>
      <el-table-column label="类型" width="115"><template #default="{row}"><el-tag effect="plain" :type="row.template==='SPECIAL_INSPECTION'?'primary':'info'">{{matterType(row)}}</el-tag></template></el-table-column>
      <el-table-column label="责任地市" min-width="200"><template #default="{row}"><div class="coord-city-labels"><span v-for="city in row.assignments" :key="city.id">{{city.cityName}}<small v-if="city.role==='LEAD'">牵头</small></span></div></template></el-table-column>
      <el-table-column label="反馈进度" width="145"><template #default="{row}"><span>{{progress(row).submitted}} / {{progress(row).total}} 市已反馈</span><el-progress :percentage="progress(row).total?progress(row).submitted/progress(row).total*100:0" :show-text="false" :stroke-width="4"/></template></el-table-column>
      <el-table-column label="完成期限" width="165"><template #default="{row}"><span :class="{'coord-overdue':overdue(row)}">{{dateTime(row.dueAt)}}</span><small v-if="overdue(row)" class="pm-subline coord-overdue">已超过办理期限</small></template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='CLOSED'?'success':row.status==='PENDING_REVIEW'?'warning':'info'">{{matterStatuses[row.status]||'待核查'}}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="145" fixed="right"><template #default="{row}"><el-button link type="primary" @click="show(row)">{{row.assignments?.some((a:any)=>a.status==='SUBMITTED')?'查看 / 复核':'查看'}}</el-button><el-button v-if="canWrite&&row.status==='DRAFT'" link type="primary" @click="openEditor(row)">编辑</el-button></template></el-table-column>
    </el-table><footer class="pm-pagination"><span>共 {{total}} 条事项</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev,pager,next" @current-change="search(false)"/></footer></section>
  </ProvincePageState>
  <CoordinationMatterEditor v-model="editorOpen" :preset="preset" :workspaces="options.workspaces" @saved="saved"/>
  <CoordinationMatterDetail :model-value="detailOpen" :matter-id="detailId" @update:model-value="closeDetail" @edit="openEditor" @follow-up="followUp" @changed="load();loadOptions()"/>
</section>
</template>
