<script setup lang="ts">
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import ListPanel from '../components/ListPanel.vue';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Plus, RefreshCw, Search } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import PageHeader from '../components/PageHeader.vue';

const session=useSessionStore(),canWrite=computed(()=>session.user?.permissions.includes('admission:workflow:write'));
const loading=ref(false),error=ref(''),rows=ref<any[]>([]),total=ref(0),page=ref(1),q=ref(''),category=ref(''),status=ref(''),dialog=ref(false),saving=ref(false);const form=reactive({name:'',category:'ACCIDENT_SLA',valueText:'{}'});
const categoryText=(v:string)=>({VEHICLE:'车辆分类',SCENE:'运营场景',OPERATOR:'安全员',ACCIDENT_SLA:'事故时限',CREDIT:'信用积分',INTERFACE:'接口接入',RETENTION:'数据留存',CITY_EVALUATION:'企业评价',CITY_CREDIT:'企业信用'} as any)[v]??v;const statusText=(v:string)=>({DRAFT:'草稿',PUBLISHED:'已发布',RETIRED:'已停用'} as any)[v]??v;
async function load(){loading.value=true;error.value='';try{const p=new URLSearchParams({page:String(page.value),pageSize:'20'});if(q.value)p.set('q',q.value);if(category.value)p.set('type',category.value);if(status.value)p.set('status',status.value);const data=await api<any>(`/governance/rules?${p}`);rows.value=data.items;total.value=data.total}catch(reason){error.value=reason instanceof Error?reason.message:'业务规则加载失败'}finally{loading.value=false}}
watch([q,category,status],()=>{page.value=1;load()});watch(page,load);onMounted(load);
function openCreate(){Object.assign(form,{name:'',category:'ACCIDENT_SLA',valueText:'{\n  "参数": "值"\n}'});dialog.value=true}
async function create(){let value:any;try{value=JSON.parse(form.valueText)}catch{return ElMessage.warning('规则参数必须是有效 JSON')}if(!form.name)return ElMessage.warning('请填写规则名称');saving.value=true;try{await api('/governance/rules',{method:'POST',body:JSON.stringify({name:form.name,category:form.category,value})});ElMessage.success('规则新版本已创建');dialog.value=false;await load()}catch(reason){ElMessage.error(reason instanceof Error?reason.message:'创建失败')}finally{saving.value=false}}
async function publish(row:any){try{await ElMessageBox.confirm(`发布“${row.name}”V${row.version} 后，同类当前版本将停用。`,'发布规则',{type:'warning'});await api(`/governance/rules/${row.id}/publish`,{method:'POST'});ElMessage.success('规则已发布');await load()}catch(reason){if(reason!=='cancel')ElMessage.error(reason instanceof Error?reason.message:'发布失败')}}
function valueSummary(value:any){const text=JSON.stringify(value);return text.length>100?`${text.slice(0,100)}…`:text}

function resetQueryFilters() {
  q.value = '';
  category.value = '';
  status.value = '';
  page.value = 1;
  load();
}
</script>
<template><section><PageHeader title="业务规则" :count="total"/><QueryPanel :loading="loading" @search="load" @reset="resetQueryFilters">
<QueryField label="关键词" keyword><el-input aria-label="关键词" v-model="q" :prefix-icon="Search" clearable placeholder="搜索规则名称或编号"/></QueryField>
<QueryField label="分类"><el-select aria-label="分类" v-model="category" clearable placeholder="全部分类"><el-option v-for="x in ['VEHICLE','SCENE','OPERATOR','ACCIDENT_SLA','CREDIT','INTERFACE','RETENTION']" :key="x" :label="categoryText(x)" :value="x"/></el-select></QueryField>
<QueryField label="状态"><el-select aria-label="状态" v-model="status" clearable placeholder="全部状态"><el-option label="草稿" value="DRAFT"/><el-option label="已发布" value="PUBLISHED"/><el-option label="已停用" value="RETIRED"/></el-select></QueryField>
</QueryPanel>
<ListPanel title="业务规则列表" :total="error ? undefined : (total)">
<template #actions><el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">新增版本</el-button></template>
<div v-if="error" class="error-state"><strong>业务规则暂时无法加载</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div><el-table v-else v-loading="loading" :data="rows" empty-text="暂无符合条件的规则"><el-table-column label="规则" min-width="230"><template #default="{row}"><div class="identity-cell"><strong>{{row.name}}</strong><span>{{row.businessNo}}</span></div></template></el-table-column><el-table-column label="分类" width="120"><template #default="{row}">{{categoryText(row.category)}}</template></el-table-column><el-table-column label="版本" width="80"><template #default="{row}">V{{row.version}}</template></el-table-column><el-table-column label="参数摘要" min-width="300" show-overflow-tooltip><template #default="{row}"><code class="rule-json">{{valueSummary(row.value)}}</code></template></el-table-column><el-table-column label="生效时间" width="150"><template #default="{row}">{{row.effectiveAt?new Date(row.effectiveAt).toLocaleString('zh-CN'):'—'}}</template></el-table-column><el-table-column label="状态" width="95"><template #default="{row}"><el-tag effect="plain" :type="row.status==='PUBLISHED'?'success':row.status==='RETIRED'?'info':'warning'">{{statusText(row.status)}}</el-tag></template></el-table-column><el-table-column label="操作" width="95"><template #default="{row}"><el-button v-if="row.status==='DRAFT'&&canWrite" link type="primary" @click="publish(row)">发布</el-button></template></el-table-column></el-table><div class="pagination-row"><span>当前显示 {{rows.length}} / {{total}}</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next"/></div>
</ListPanel>
<el-dialog v-model="dialog" title="新增规则版本" width="680px"><div class="form-grid"><el-form-item label="规则名称" required><el-input v-model="form.name"/></el-form-item><el-form-item label="规则分类" required><el-select v-model="form.category"><el-option v-for="x in ['VEHICLE','SCENE','OPERATOR','ACCIDENT_SLA','CREDIT','INTERFACE','RETENTION']" :key="x" :label="categoryText(x)" :value="x"/></el-select></el-form-item><el-form-item class="form-span-2" label="规则参数（JSON）" required><el-input v-model="form.valueText" type="textarea" :rows="13" class="json-editor"/></el-form-item></div><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="create">保存草稿</el-button></template></el-dialog></section></template>
