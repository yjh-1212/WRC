<script setup lang="ts">
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import ListPanel from '../components/ListPanel.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RefreshCw, Search } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';

const route=useRoute(),router=useRouter(),session=useSessionStore(),loading=ref(false),error=ref(''),allRows=ref<any[]>([]),q=ref(String(route.query.q??'')),kind=ref(String(route.query.type??'')),level=ref(String(route.query.level??'')),status=ref(String(route.query.status??'')),page=ref(1),pageSize=20,drawer=ref(false),detail=ref<any>(null);
const isEnterprise=computed(()=>session.user?.portal==='ENTERPRISE');
const typeText=(v:string)=>({ALERT:'告警',ACCIDENT:'事故',VIOLATION:'违规',OFFLINE:'离线'} as any)[v]??v;
const levelText=(v:string)=>({LOW:'低',MEDIUM:'中',HIGH:'高',CRITICAL:'重大'} as any)[v]??v;
const statusText=(v:string)=>({PENDING_CONFIRMATION:'待确认',PENDING_HANDLING:'待处置',IN_PROGRESS:'处理中',PENDING_REVIEW:'待复核',CLOSED:'已关闭',REPORTED:'已上报',INVESTIGATING:'调查中',PENDING_DETERMINATION:'待认定',RECTIFYING:'整改中',OFFLINE:'离线中',RECOVERED:'已恢复'} as any)[v]??v;
const fmt=(v:string)=>new Date(v).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const rows=computed(()=>allRows.value.filter(row=>(!kind.value||row.kind===kind.value)&&(!level.value||row.level===level.value)&&(!status.value||row.status===status.value)&&(!q.value||[row.businessNo,row.title,row.vehicle?.name,row.enterprise?.name].some(v=>String(v??'').toLowerCase().includes(q.value.toLowerCase())))));
const pageRows=computed(()=>rows.value.slice((page.value-1)*pageSize,(page.value-1)*pageSize+pageSize));
watch([q,kind,level,status],()=>page.value=1);
async function load(){loading.value=true;error.value='';try{const suffix='?page=1&pageSize=100';const [alerts,accidents,violations,offline]=await Promise.all([session.user?.permissions.includes('safety:alert:read')?api<any>(`/safety/alerts${suffix}`):Promise.resolve({items:[]}),session.user?.permissions.includes('safety:accident:read')?api<any>(`/safety/accidents${suffix}`):Promise.resolve({items:[]}),session.user?.permissions.includes('safety:violation:read')?api<any>(`/safety/violations${suffix}`):Promise.resolve({items:[]}),session.user?.permissions.includes('safety:offline:read')?api<any>(`/safety/offline-events${suffix}`):Promise.resolve({items:[]})]);allRows.value=[...alerts.items.map((x:any)=>({...x,kind:'ALERT',eventAt:x.occurredAt})),...accidents.items.map((x:any)=>({...x,kind:'ACCIDENT',eventAt:x.occurredAt})),...violations.items.map((x:any)=>({...x,kind:'VIOLATION',eventAt:x.occurredAt})),...offline.items.map((x:any)=>({...x,kind:'OFFLINE',title:`${x.vehicle?.name??'车辆'}离线事件`,level:'MEDIUM',eventAt:x.startedAt}))].sort((a,b)=>new Date(b.eventAt).getTime()-new Date(a.eventAt).getTime())}catch(reason){error.value=reason instanceof Error?reason.message:'事件加载失败'}finally{loading.value=false}}
function open(row:any){detail.value=row;drawer.value=true}
function handleEvent(row:any,view=row.kind){router.push({path:route.path,query:{view,eventId:row.id,accidentId:view==='reconstruction'?row.id:undefined,vehicleId:row.vehicleId??row.vehicle?.id,q:row.businessNo}})}
function exportRows(){const header=['事件编号','类型','标题','企业','车辆','等级','状态','发生时间'];const lines=[header,...rows.value.map(x=>[x.businessNo,typeText(x.kind),x.title,x.enterprise?.name??'',x.vehicle?.name??'',levelText(x.level),statusText(x.status),fmt(x.eventAt)])].map(line=>line.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([`\ufeff${lines}`],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`事件中心-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);ElMessage.success('事件清单已导出')}
onMounted(load);

function resetQueryFilters() {
  q.value = '';
  kind.value = '';
  level.value = '';
  status.value = '';
  page.value = 1;
  load();
}
</script>
<template><section><PageHeader :title="isEnterprise?'事件中心':'事件中心'" :count="rows.length"/>
  <QueryPanel :loading="loading" @search="load" @reset="resetQueryFilters">
<QueryField label="关键词" keyword><el-input aria-label="关键词" v-model="q" :prefix-icon="Search" clearable placeholder="搜索编号、标题、企业或车辆"/></QueryField>
<QueryField label="事件"><el-select aria-label="事件" v-model="kind" clearable placeholder="全部事件"><el-option label="告警" value="ALERT"/><el-option label="事故" value="ACCIDENT"/><el-option label="违规" value="VIOLATION"/><el-option label="离线" value="OFFLINE"/></el-select></QueryField>
<QueryField label="等级"><el-select aria-label="等级" v-model="level" clearable placeholder="全部等级"><el-option label="重大" value="CRITICAL"/><el-option label="高" value="HIGH"/><el-option label="中" value="MEDIUM"/><el-option label="低" value="LOW"/></el-select></QueryField>
<QueryField label="状态"><el-select aria-label="状态" v-model="status" clearable placeholder="全部状态"><el-option label="待处置" value="PENDING_HANDLING"/><el-option label="处理中" value="IN_PROGRESS"/><el-option label="待复核" value="PENDING_REVIEW"/><el-option label="整改中" value="RECTIFYING"/><el-option label="已关闭" value="CLOSED"/></el-select></QueryField>
</QueryPanel>
<ListPanel :title="(isEnterprise?'事件中心':'事件中心') + '列表'" :total="error ? undefined : (rows.length)">
<template #actions><el-button @click="exportRows">导出</el-button></template>
<div v-if="error" class="error-state"><strong>事件中心暂时无法加载</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
  <el-table v-else v-loading="loading" :data="pageRows" :row-key="(row:any)=>row.kind+'-'+row.id" empty-text="暂无符合条件的事件"><el-table-column label="事件" min-width="260"><template #default="{row}"><button class="table-link" @click="open(row)"><strong>{{row.title}}</strong><span>{{row.businessNo}}</span></button></template></el-table-column><el-table-column label="类型" width="82"><template #default="{row}"><el-tag size="small" effect="plain">{{typeText(row.kind)}}</el-tag></template></el-table-column><el-table-column label="等级" width="86"><template #default="{row}"><span class="risk-level" :class="row.level?.toLowerCase()"><i></i>{{levelText(row.level)}}</span></template></el-table-column><el-table-column v-if="!isEnterprise" label="企业" min-width="190"><template #default="{row}">{{row.enterprise?.name||'—'}}</template></el-table-column><el-table-column label="车辆" min-width="150"><template #default="{row}"><div class="identity-cell"><strong>{{row.vehicle?.name||'—'}}</strong><span>{{row.vehicle?.unifiedCode||row.vehicle?.businessNo||'—'}}</span></div></template></el-table-column><el-table-column label="发生时间" width="168"><template #default="{row}">{{fmt(row.eventAt)}}</template></el-table-column><el-table-column label="状态" width="110"><template #default="{row}">{{statusText(row.status)}}</template></el-table-column><el-table-column label="操作" width="90"><template #default="{row}"><el-button link type="primary" @click="open(row)">查看</el-button></template></el-table-column></el-table>
  <div class="pagination-row"><span>当前显示 {{pageRows.length}} / {{rows.length}}</span><el-pagination v-model:current-page="page" :page-size="pageSize" :total="rows.length" layout="prev, pager, next"/></div>

</ListPanel>
<el-drawer v-model="drawer" title="事件详情" size="620px"><template v-if="detail"><dl class="detail-grid"><div><dt>事件编号</dt><dd>{{detail.businessNo}}</dd></div><div><dt>事件类型</dt><dd>{{typeText(detail.kind)}}</dd></div><div><dt>风险等级</dt><dd>{{levelText(detail.level)}}</dd></div><div><dt>当前状态</dt><dd>{{statusText(detail.status)}}</dd></div><div><dt>所属企业</dt><dd>{{detail.enterprise?.name||'—'}}</dd></div><div><dt>关联车辆</dt><dd>{{detail.vehicle?.name||'—'}}</dd></div><div class="detail-span-2"><dt>事件标题</dt><dd>{{detail.title}}</dd></div><div class="detail-span-2"><dt>事件说明</dt><dd>{{detail.description||detail.reason||detail.recoveryNote||'—'}}</dd></div><div class="detail-span-2"><dt>处置/整改</dt><dd>{{detail.lastComment||detail.disposalProgress||detail.rectification||'尚未填写'}}</dd></div></dl><div class="saas-actions"><el-button type="primary" @click="handleEvent(detail)">进入处置</el-button><el-button v-if="detail.kind==='ACCIDENT'&&session.user?.permissions.includes('analytics:accident:read')" @click="handleEvent(detail,'reconstruction')">事故回溯</el-button></div></template></el-drawer>
</section></template>
