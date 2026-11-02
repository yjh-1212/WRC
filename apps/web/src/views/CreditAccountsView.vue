<script setup lang="ts">
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import ListPanel from '../components/ListPanel.vue';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { MinusCircle, RefreshCw, Search } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';

const session=useSessionStore(),loading=ref(false),error=ref(''),rows=ref<any[]>([]),total=ref(0),page=ref(1),q=ref(''),type=ref(''),grade=ref(''),dialog=ref(false),saving=ref(false),account=ref<any>(null);const form=reactive({severity:'GENERAL',reason:'',sourceType:'',sourceId:''});const isEnterprise=computed(()=>session.user?.portal==='ENTERPRISE');const canDeduct=computed(()=>session.user?.permissions.includes('analytics:evaluation:publish')&&!isEnterprise.value);const severityText=(v:string)=>({MINOR:'轻微（-2）',GENERAL:'一般（-5）',SERIOUS:'严重（-10）',MAJOR:'重大（-20）'} as any)[v]??v;
async function load(){loading.value=true;error.value='';try{const p=new URLSearchParams({page:String(page.value),pageSize:'20'});if(q.value)p.set('q',q.value);if(type.value)p.set('type',type.value);if(grade.value)p.set('status',grade.value);const data=await api<any>(`/governance/credit-accounts?${p}`);rows.value=data.items;total.value=data.total}catch(reason){error.value=reason instanceof Error?reason.message:'信用账户加载失败'}finally{loading.value=false}}
watch([q,type,grade],()=>{page.value=1;load()});watch(page,load);onMounted(load);
function openDeduct(row:any){account.value=row;Object.assign(form,{severity:'GENERAL',reason:'',sourceType:'',sourceId:''});dialog.value=true}
async function deduct(){if(!form.reason.trim())return ElMessage.warning('请填写扣分事实与依据');saving.value=true;try{await api(`/governance/credit-accounts/${account.value.id}/entries`,{method:'POST',body:JSON.stringify(form)});ElMessage.success('扣分已确认并写入信用流水');dialog.value=false;await load()}catch(reason){ElMessage.error(reason instanceof Error?reason.message:'扣分失败')}finally{saving.value=false}}

function resetQueryFilters() {
  q.value = '';
  type.value = '';
  grade.value = '';
  page.value = 1;
  load();
}
</script>
<template><section><PageHeader :title="isEnterprise?'企业评价':'信用评价'" :count="total"/><QueryPanel :loading="loading" @search="load" @reset="resetQueryFilters">
<QueryField label="关键词" keyword><el-input aria-label="关键词" v-model="q" :prefix-icon="Search" clearable placeholder="搜索账户、企业、车辆或统一编码"/></QueryField>
<QueryField label="对象"><el-select aria-label="对象" v-model="type" clearable placeholder="全部对象"><el-option label="企业" value="ENTERPRISE"/><el-option label="车辆" value="VEHICLE"/></el-select></QueryField>
<QueryField label="等级"><el-select aria-label="等级" v-model="grade" clearable placeholder="全部等级"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="`${x} 级`" :value="x"/></el-select></QueryField>
</QueryPanel>
<ListPanel :title="(isEnterprise?'企业评价':'信用评价') + '列表'" :total="error ? undefined : (total)">
<div v-if="error" class="error-state"><strong>信用账户暂时无法加载</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div><el-table v-else v-loading="loading" :data="rows" empty-text="暂无符合条件的信用账户"><el-table-column label="信用对象" min-width="230"><template #default="{row}"><div class="identity-cell"><strong>{{row.subjectType==='ENTERPRISE'?row.enterprise?.name:row.vehicle?.name}}</strong><span>{{row.subjectType==='ENTERPRISE'?'企业账户':row.vehicle?.unifiedCode||row.vehicle?.businessNo}} · {{row.businessNo}}</span></div></template></el-table-column><el-table-column label="对象类型" width="100"><template #default="{row}">{{row.subjectType==='ENTERPRISE'?'企业':'车辆'}}</template></el-table-column><el-table-column label="当前分" width="105"><template #default="{row}"><strong class="credit-score">{{row.currentScore}}</strong></template></el-table-column><el-table-column label="等级" width="90"><template #default="{row}"><el-tag effect="plain" :type="row.grade==='A'?'success':row.grade==='B'?'primary':row.grade==='C'?'warning':'danger'">{{row.grade}} 级</el-tag></template></el-table-column><el-table-column label="最近信用事件" min-width="310"><template #default="{row}"><div v-if="row.entries[0]" class="identity-cell"><strong>{{row.entries[0].reason}}</strong><span>{{row.entries[0].scoreChange>0?'+':''}}{{row.entries[0].scoreChange}} 分 · {{new Date(row.entries[0].createdAt).toLocaleString('zh-CN')}}</span></div><span v-else>暂无扣分记录</span></template></el-table-column><el-table-column label="监管建议" min-width="170"><template #default="{row}">{{row.grade==='A'?'常规监管':row.grade==='B'?'适度关注':row.grade==='C'?'提高抽检频次':'建议重点检查并人工复核'}}</template></el-table-column><el-table-column v-if="canDeduct" label="操作" width="105"><template #default="{row}"><el-button link type="danger" :icon="MinusCircle" @click="openDeduct(row)">确认扣分</el-button></template></el-table-column></el-table><div class="pagination-row"><span>当前显示 {{rows.length}} / {{total}}</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next"/></div>
</ListPanel>
<el-dialog v-model="dialog" :title="`确认信用扣分 · ${account?.enterprise?.name||account?.vehicle?.name||''}`" width="600px"><div class="form-grid"><el-form-item label="严重程度" required><el-select v-model="form.severity"><el-option v-for="x in ['MINOR','GENERAL','SERIOUS','MAJOR']" :key="x" :label="severityText(x)" :value="x"/></el-select></el-form-item><el-form-item label="来源类型"><el-input v-model="form.sourceType" placeholder="检查、事故、违规等"/></el-form-item><el-form-item class="form-span-2" label="事实与依据" required><el-input v-model="form.reason" type="textarea" :rows="4"/></el-form-item><el-form-item class="form-span-2" label="来源记录编号"><el-input v-model="form.sourceId"/></el-form-item></div><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="danger" :loading="saving" @click="deduct">确认扣分</el-button></template></el-dialog></section></template>
