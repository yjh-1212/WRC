<script setup lang="ts">
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import ListPanel from '../components/ListPanel.vue';
import {computed,onMounted,ref} from 'vue';import {useRouter} from 'vue-router';import { Search } from 'lucide-vue-next';import {api} from '../api';import {dateText,errorText} from '../saas';import {useSessionStore} from '../stores/session';import ProvincePageState from '../components/ProvincePageState.vue';import ProvinceEntityDrawer from '../components/ProvinceEntityDrawer.vue';import './ProvincePages.css';
const router=useRouter(),session=useSessionStore(),canWrite=computed(()=>session.user?.accountLevel==='PROVINCE'&&session.user.permissions.includes('system:organization:update'));const rows=ref<any[]>([]),workspaces=ref<any[]>([]),loading=ref(false),error=ref(''),q=ref(''),status=ref(''),level=ref(''),workspaceId=ref(''),page=ref(1),total=ref(0),drawer=ref(false),selected=ref<any>(null);let generation=0;
const levels:Record<string,string>={LOW:'低',MEDIUM:'中',HIGH:'高',CRITICAL:'重大'};const statuses:Record<string,string>={PENDING_CONFIRMATION:'待确认',PROCESSING:'处理中',PENDING_REVIEW:'待复核',CLOSED:'已闭环'};
async function load(){const version=++generation;loading.value=true;error.value='';try{if(!workspaces.value.length)workspaces.value=(await api<any>('/oversight/options')).workspaces;const p=new URLSearchParams({page:String(page.value),pageSize:'20'});for(const[k,v]of Object.entries({q:q.value.trim(),status:status.value,level:level.value,workspaceId:workspaceId.value}))if(v)p.set(k,v);const r=await api<any>(`/safety/alerts?${p}`);if(version===generation){rows.value=r.items;total.value=r.total}}catch(e){if(version===generation)error.value=errorText(e)}finally{if(version===generation)loading.value=false}}
function search(){page.value=1;load()}function open(row:any){selected.value=row;drawer.value=true}function notice(row:any){router.push({path:'/province/risk-notices',query:{create:'1',title:row.title,basis:row.businessNo,level:row.level,description:row.description??'请核查关联风险情况并反馈处置措施。'}})}
onMounted(async()=>{try{workspaces.value=(await api<any>('/oversight/options')).workspaces}catch(e){error.value=errorText(e);return}await load()});

function resetQueryFilters() {
  q.value = '';
  workspaceId.value = '';
  level.value = '';
  status.value = '';
  page.value = 1;
  search();
}
</script>
<template><section class="province-page"><h1 class="sr-only">风险监测</h1><QueryPanel :loading="loading" @search="search" @reset="resetQueryFilters">
<QueryField label="关键词" keyword><el-input aria-label="关键词" v-model="q" :prefix-icon="Search" clearable placeholder="搜索风险编号、标题或车辆" /></QueryField>
<QueryField label="城市"><el-select aria-label="城市" v-model="workspaceId" clearable placeholder="全部城市" @change="search"><el-option v-for="o in workspaces" :key="o.id" :label="o.cityName" :value="o.id"/></el-select></QueryField>
<QueryField label="风险等级"><el-select aria-label="风险等级" v-model="level" clearable placeholder="全部风险等级" @change="search"><el-option v-for="(label,key) in levels" :key="key" :label="label" :value="key"/></el-select></QueryField>
<QueryField label="状态"><el-select aria-label="状态" v-model="status" clearable placeholder="全部状态" @change="search"><el-option v-for="(label,key) in statuses" :key="key" :label="label" :value="key"/></el-select></QueryField>
</QueryPanel>
<ListPanel title="风险事项列表" :total="error ? undefined : (total)">
<ProvincePageState :error="error" :loading="loading" @retry="load"><el-table :data="rows" row-key="id" empty-text="没有符合条件的风险记录"><el-table-column label="风险事项" min-width="250"><template #default="{row}"><div class="province-cell-title"><strong>{{row.title}}</strong><span>{{row.businessNo}}</span></div></template></el-table-column><el-table-column label="所属机构" min-width="170"><template #default="{row}">{{row.organization?.name??'—'}}</template></el-table-column><el-table-column label="运营企业" min-width="220"><template #default="{row}">{{row.enterprise?.name??'—'}}</template></el-table-column><el-table-column label="车辆" min-width="150"><template #default="{row}">{{row.vehicle?.businessNo??'—'}}</template></el-table-column><el-table-column label="等级" width="90"><template #default="{row}"><el-tag :type="['HIGH','CRITICAL'].includes(row.level)?'danger':'info'">{{levels[row.level]??row.level}}</el-tag></template></el-table-column><el-table-column label="处理状态" width="110"><template #default="{row}">{{statuses[row.status]??row.status}}</template></el-table-column><el-table-column label="发生时间" width="175"><template #default="{row}">{{dateText(row.occurredAt)}}</template></el-table-column><el-table-column label="操作" :width="canWrite?165:90" fixed="right"><template #default="{row}"><el-button link type="primary" @click="open(row)">查看</el-button><el-button v-if="canWrite&&row.status!=='CLOSED'" link type="primary" @click="notice(row)">发起通报</el-button></template></el-table-column></el-table><div class="province-pagination"><span>共 {{total}} 条 · 按发生时间倒序</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev,pager,next" @current-change="load"/></div></ProvincePageState>
</ListPanel>
<ProvinceEntityDrawer v-model="drawer" kind="ALERT" :row="selected"/></section></template>
