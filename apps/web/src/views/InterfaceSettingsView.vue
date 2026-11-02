<script setup lang="ts">
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import ListPanel from '../components/ListPanel.vue';
import PageHeader from '../components/PageHeader.vue';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { CheckCircle2, Plus, Search } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import '../saas.css';
const session=useSessionStore();
const isEnterprise=computed(()=>session.user?.portal==='ENTERPRISE');
const loading=ref(false), error=ref(''), rows=ref<any[]>([]), total=ref(0), page=ref(1), q=ref(''), status=ref('');
const dialog=ref(false), saving=ref(false), editing=ref<any>(null);
const options=reactive<{enterprises:Array<{id:string;name:string}>}>({enterprises:[]});
const defaults=()=>({name:'',enterpriseId:isEnterprise.value?session.user?.enterpriseId??'':'',interfaceType:'TELEMETRY',endpoint:'',authType:'SIGNATURE',protocolVersion:'1.0',contactName:'',contactPhone:'',capabilities:[] as string[]});
const interfaceForm=reactive(defaults());
const statusText=(v:string)=>({UNVERIFIED:'待检查',VERIFIED:'已联通',CONFIGURED:'配置已检查',FAILED:'联调失败'} as Record<string,string>)[v]??v;
async function load(){
  loading.value=true;error.value='';
  try{const p=new URLSearchParams({page:String(page.value),pageSize:'20'});if(q.value)p.set('q',q.value);if(status.value)p.set('status',status.value);
    const data=await api<any>(`/governance/interfaces?${p}`);rows.value=data.items;total.value=data.total;
  }catch(reason){error.value=reason instanceof Error?reason.message:'数据加载失败'}finally{loading.value=false}
}
watch([q,status],()=>{page.value=1;load()});watch(page,load);
function open(row?:any){editing.value=row??null;Object.assign(interfaceForm,row?{...defaults(),name:row.name,enterpriseId:row.enterpriseId,interfaceType:row.interfaceType,endpoint:row.endpoint,authType:row.authType,protocolVersion:row.protocolVersion,contactName:row.contactName??'',contactPhone:row.contactPhone??'',capabilities:[...(row.capabilities??[])]}:defaults());dialog.value=true}
async function save(){
  if(!interfaceForm.name||(!isEnterprise.value&&!interfaceForm.enterpriseId))return ElMessage.warning('请完整填写名称和所属企业');
  if(!interfaceForm.endpoint)return ElMessage.warning('请填写接口地址');
  saving.value=true;
  try{await api(editing.value?`/governance/interfaces/${editing.value.id}`:'/governance/interfaces',{method:editing.value?'PATCH':'POST',body:JSON.stringify(interfaceForm)});ElMessage.success('保存成功');dialog.value=false;await load()}
  catch(reason){ElMessage.error(reason instanceof Error?reason.message:'保存失败')}finally{saving.value=false}
}
async function testInterface(row:any){try{const receipt=await api<any>(`/governance/interfaces/${row.id}/test`,{method:'POST'});ElMessage.success(`配置检查通过，待验证连通性；回执 ${receipt.requestId}`);await load()}catch(reason){ElMessage.error(reason instanceof Error?reason.message:'联调失败')}}
function resetQueryFilters(){q.value='';status.value='';page.value=1;load()}
onMounted(async()=>{try{Object.assign(options,await api('/governance/options'));await load()}catch(reason){error.value=reason instanceof Error?reason.message:'接入配置加载失败'}});
</script>
<template>
<section class="saas-page"><h1 class="sr-only">接入配置</h1><PageHeader title="接入配置" :count="total" />
<QueryPanel :loading="loading" @search="load" @reset="resetQueryFilters">
  <QueryField label="关键词" keyword><el-input aria-label="关键词" v-model="q" :prefix-icon="Search" clearable placeholder="搜索接口名称、编号或地址" /></QueryField>
  <QueryField label="状态"><el-select aria-label="状态" v-model="status" clearable placeholder="全部状态"><el-option label="待检查" value="UNVERIFIED"/><el-option label="配置已检查" value="CONFIGURED"/><el-option label="联调失败" value="FAILED"/></el-select></QueryField>
</QueryPanel>
<ListPanel title="接入配置列表" :total="error ? undefined : total">
  <template #actions><el-button type="primary" :icon="Plus" @click="open()">新增接口</el-button></template>
  <div v-if="error" class="error-state"><strong>数据暂时无法加载</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
  <template v-else>
  <el-table v-loading="loading" :data="rows" empty-text="暂无接口配置"><el-table-column label="接口" min-width="220"><template #default="{row}"><div class="identity-cell"><strong>{{row.name}}</strong><span>{{row.businessNo}}</span></div></template></el-table-column><el-table-column label="类型" width="120"><template #default="{row}">{{row.interfaceType==='TELEMETRY'?'遥测接入':'远程操作接口'}}</template></el-table-column><el-table-column label="地址" prop="endpoint" min-width="260" show-overflow-tooltip/><el-table-column label="协议 / 鉴权" width="150"><template #default="{row}">{{row.protocolVersion}} · {{row.authType}}</template></el-table-column><el-table-column label="能力声明" min-width="180"><template #default="{row}">{{row.capabilities?.join('、')||'—'}}</template></el-table-column><el-table-column label="状态" width="105"><template #default="{row}"><el-tag effect="plain" :type="row.status==='VERIFIED'?'success':'warning'">{{statusText(row.status)}}</el-tag></template></el-table-column><el-table-column fixed="right" label="操作" width="150"><template #default="{row}"><el-button link @click="open(row)">编辑</el-button><el-button link type="primary" :icon="CheckCircle2" @click="testInterface(row)">配置检查</el-button></template></el-table-column></el-table>
  <div class="pagination-row"><span>当前显示 {{rows.length}} / {{total}}</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next"/></div>
  </template>
</ListPanel>
<el-dialog v-model="dialog" :title="editing?'编辑接口':'新增接口'" width="680px"><div class="form-grid"><el-form-item label="接口名称" required><el-input v-model="interfaceForm.name"/></el-form-item><el-form-item v-if="!isEnterprise" label="所属企业" required><el-select v-model="interfaceForm.enterpriseId"><el-option v-for="x in options.enterprises" :key="x.id" :label="x.name" :value="x.id"/></el-select></el-form-item><el-form-item label="接口类型"><el-select v-model="interfaceForm.interfaceType"><el-option label="遥测接入" value="TELEMETRY"/><el-option label="远程操作接口" value="REMOTE_OPERATION"/></el-select></el-form-item><el-form-item label="协议版本"><el-input v-model="interfaceForm.protocolVersion"/></el-form-item><el-form-item class="form-span-2" label="接口地址" required><el-input v-model="interfaceForm.endpoint" placeholder="https://api.example.com/v1/callback"/></el-form-item><el-form-item label="鉴权方式"><el-select v-model="interfaceForm.authType"><el-option label="签名" value="SIGNATURE"/><el-option label="OAuth 2.0" value="OAUTH2"/><el-option label="API Key" value="API_KEY"/></el-select></el-form-item><el-form-item label="联系人"><el-input v-model="interfaceForm.contactName"/></el-form-item><el-form-item class="form-span-2" label="能力声明"><el-select v-model="interfaceForm.capabilities" multiple allow-create filterable><el-option label="遥测上报" value="TELEMETRY"/><el-option label="停车" value="STOP"/><el-option label="恢复" value="RESUME"/><el-option label="降级" value="DEGRADE"/><el-option label="靠边停靠" value="PULL_OVER"/></el-select></el-form-item></div><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template></el-dialog>
</section>
</template>
