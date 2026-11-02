<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ChevronDown, Plus, Search } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { useResponsiveDrawer } from '../province-monitoring';
import { subjectDate as date, subjectError, useSubjectList } from '../subject-management';
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import '../subject-management.css';

const MAX_VEHICLES=5, session=useSessionStore(),width=useResponsiveDrawer(900);
const isEnterprise=computed(()=>session.user?.portal==='ENTERPRISE');
const canWrite=computed(()=>session.user?.permissions.includes('archive:qualification:write')??false);
const {filters,rows,total,page,loading,error,load,search,reset}=useSubjectList('/governance/operators',{enterpriseId:''});
interface VehicleOption {id:string;name:string;businessNo?:string;unifiedCode?:string;enterpriseId:string}
const options=ref<{enterprises:Array<{id:string;name:string}>;vehicles:VehicleOption[]}>({enterprises:[],vehicles:[]});
const optionsLoading=ref(false),optionsError=ref('');
const editor=ref(false),saving=ref(false),editingId=ref(''),editingStatus=ref('PENDING'),formRef=ref<FormInstance>();
const detailOpen=ref(false),detail=ref<any>(null),detailLoading=ref(false),detailError=ref(''),detailId=ref('');let generation=0;
const defaults=()=>({name:'',idNumberMasked:'',phone:'',enterpriseId:isEnterprise.value?session.user?.enterpriseId??'':'',qualificationNo:'',expiresAt:'',trainingCompleted:false,shiftStart:'08:00',shiftEnd:'18:00',onDuty:false,vehicleIds:[] as string[]});
const form=reactive(defaults());
const rules:FormRules={name:[{required:true,message:'请填写安全员姓名',trigger:'blur'}],enterpriseId:[{required:true,message:'请选择所属企业',trigger:'change'}],vehicleIds:[{validator:(_rule,value,callback)=>callback(Array.isArray(value)&&value.length>MAX_VEHICLES?new Error('每位安全员最多负责5台车辆'):undefined),trigger:'change'}]};
const vehicleOptions=computed(()=>options.value.vehicles.filter(vehicle=>vehicle.enterpriseId===form.enterpriseId));
const statusText=(status:string)=>({PENDING:'待审核',APPROVED:'已通过',REJECTED:'已驳回',SUSPENDED:'已暂停'} as Record<string,string>)[status]??status;
const statusTone=(status:string)=>status==='APPROVED'?'success':status==='REJECTED'?'danger':status==='SUSPENDED'?'info':'warning';
async function loadOptions(){optionsLoading.value=true;optionsError.value='';try{options.value=await api('/governance/operators/options')}catch(e){optionsError.value=subjectError(e)}finally{optionsLoading.value=false}}
function openEditor(row?:any){detailOpen.value=false;generation++;editingId.value=row?.id??'';editingStatus.value=row?.status??'PENDING';Object.assign(form,defaults());
  if(row){Object.assign(form,{name:row.name,idNumberMasked:row.idNumberMasked==='未登记'?'':row.idNumberMasked,phone:row.phone??'',enterpriseId:row.enterpriseId,qualificationNo:row.qualificationNo??'',expiresAt:row.expiresAt?date(row.expiresAt):'',trainingCompleted:row.trainingCompleted,shiftStart:row.shiftStart??'08:00',shiftEnd:row.shiftEnd??'18:00',onDuty:row.onDuty,vehicleIds:row.vehicles.map((item:any)=>item.vehicleId)});
    for(const item of row.vehicles)if(!options.value.vehicles.some(v=>v.id===item.vehicleId))options.value.vehicles.push(item.vehicle);
  }
  editor.value=true;
}
async function save(){if(!await formRef.value?.validate().catch(()=>false))return;if(form.vehicleIds.length>MAX_VEHICLES)return ElMessage.warning('每位安全员最多负责5台车辆');saving.value=true;
  try{await api(editingId.value?`/governance/operators/${editingId.value}`:'/governance/operators',{method:editingId.value?'PATCH':'POST',body:JSON.stringify({...form,name:form.name.trim(),expiresAt:form.expiresAt||null,idNumberMasked:form.idNumberMasked||'未登记'})});ElMessage.success(editingId.value?'安全员信息已更新':'安全员已登记');editor.value=false;await load()}
  catch(e){ElMessage.error(subjectError(e))}finally{saving.value=false}
}
async function loadDetail(){const request=++generation;detail.value=null;detailLoading.value=true;detailError.value='';try{const row=await api<any>(`/governance/operators/${detailId.value}`);if(request===generation)detail.value=row}catch(e){if(request===generation)detailError.value=subjectError(e)}finally{if(request===generation)detailLoading.value=false}}
function openDetail(row:any){detailId.value=row.id;detailOpen.value=true;loadDetail()}
async function review(row:any,status:string){let comment='';try{const result=await ElMessageBox.prompt('填写本次处理意见','安全员资格审核',{inputValue:status==='APPROVED'?'资料核验通过':'',confirmButtonText:'确认',cancelButtonText:'取消'});comment=result.value??''}catch{return}
  try{await api(`/governance/operators/${row.id}/review`,{method:'POST',body:JSON.stringify({status,comment})});ElMessage.success('审核结果已保存');await load();if(detailOpen.value&&detailId.value===row.id)await loadDetail()}catch(e){ElMessage.error(subjectError(e))}
}
function closeDetail(){if(!detailOpen.value)detail.value=null}
watch(detailOpen,open=>{if(!open)generation++});
onMounted(loadOptions);onBeforeUnmount(()=>generation++);
</script>

<template>
<section class="city-subject-page" aria-label="安全员管理"><h1 class="sr-only">安全员管理</h1>
<QueryPanel class="subject-query" :loading="loading" @search="search" @reset="reset">
  <QueryField label="关键词" keyword><el-input v-model="filters.q" :prefix-icon="Search" clearable placeholder="搜索姓名、编号、电话或资格编号" aria-label="搜索安全员"/></QueryField>
  <QueryField v-if="!isEnterprise" label="企业"><el-select v-model="filters.enterpriseId" clearable filterable placeholder="全部企业" aria-label="所属企业" :disabled="!!optionsError" :loading="optionsLoading"><el-option v-for="item in options.enterprises" :key="item.id" :value="item.id" :label="item.name"/></el-select></QueryField>
  <QueryField label="审核状态"><el-select v-model="filters.status" clearable placeholder="全部状态" aria-label="安全员状态"><el-option v-for="s in ['PENDING','APPROVED','REJECTED','SUSPENDED']" :key="s" :value="s" :label="statusText(s)"/></el-select></QueryField>
</QueryPanel>
<section class="subject-list" aria-labelledby="operator-list-title">
  <header class="subject-list-header"><h2 id="operator-list-title">安全员列表 <span v-if="!error" class="subject-count">{{total}}</span></h2><div class="subject-tools"><el-button v-if="canWrite" type="primary" :icon="Plus" :disabled="optionsLoading||!!optionsError" @click="openEditor()">新增安全员</el-button></div></header>
  <div v-if="optionsError" class="subject-inline-error" role="alert">企业与车辆选项加载失败：{{optionsError}}<el-button text @click="loadOptions">重试</el-button></div>
  <div v-if="error" class="subject-error" role="alert"><strong>安全员列表加载失败</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
  <div v-else class="subject-table-host"><el-table v-loading="loading" :data="rows" row-key="id" height="100%" class="subject-table" empty-text="暂无符合条件的安全员">
    <el-table-column label="安全员 / 编号" min-width="185"><template #default="{row}"><button class="subject-identity" @click="openDetail(row)"><strong>{{row.name}}</strong><span>{{row.businessNo}}</span></button></template></el-table-column>
    <el-table-column v-if="!isEnterprise" label="所属企业" min-width="220" show-overflow-tooltip><template #default="{row}">{{row.enterprise.name}}</template></el-table-column>
    <el-table-column prop="phone" label="联系电话" min-width="130"><template #default="{row}">{{row.phone||'—'}}</template></el-table-column>
    <el-table-column label="负责车辆" min-width="215"><template #default="{row}"><div class="subject-identity"><strong>{{row.vehicles.length}} / 5 台</strong><span>{{row.vehicles.map((item:any)=>item.vehicle.name).join('、')||'未分配车辆'}}</span></div></template></el-table-column>
    <el-table-column label="资格 / 有效期" min-width="170"><template #default="{row}"><div class="subject-identity"><strong>{{row.qualificationNo||'待补充'}}</strong><span>{{date(row.expiresAt)}}</span></div></template></el-table-column>
    <el-table-column label="培训" min-width="85"><template #default="{row}">{{row.trainingCompleted?'已完成':'未完成'}}</template></el-table-column>
    <el-table-column label="状态" min-width="100"><template #default="{row}"><el-tag :type="statusTone(row.status)">{{statusText(row.status)}}</el-tag></template></el-table-column>
    <el-table-column label="操作" :width="canWrite?(isEnterprise?130:180):75" fixed="right"><template #default="{row}"><div class="subject-row-actions"><el-button link type="primary" :aria-label="`${row.name}详情`" @click="openDetail(row)">详情</el-button><el-button v-if="canWrite" link type="primary" :aria-label="`编辑${row.name}`" @click="openEditor(row)">编辑</el-button><el-dropdown v-if="canWrite&&!isEnterprise" trigger="click"><el-button link type="primary" :aria-label="`审核${row.name}`">审核<ChevronDown :size="12"/></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item v-if="row.status!=='APPROVED'" @click="review(row,'APPROVED')">通过</el-dropdown-item><el-dropdown-item v-if="row.status!=='APPROVED'" @click="review(row,'REJECTED')">驳回</el-dropdown-item><el-dropdown-item v-if="row.status==='APPROVED'" @click="review(row,'SUSPENDED')">暂停</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></template></el-table-column>
  </el-table></div><footer v-if="!error" class="subject-footer"><span>每位安全员最多负责 5 台车辆</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" :pager-count="5" layout="total,prev,pager,next" background small/></footer>
</section>

<el-drawer v-model="editor" :title="editingId?'编辑安全员':'新增安全员'" :size="width" class="subject-drawer" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
  <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="subject-form" :disabled="saving">
    <el-form-item label="姓名" prop="name"><el-input v-model="form.name" maxlength="80"/></el-form-item>
    <el-form-item v-if="!isEnterprise" label="所属企业" prop="enterpriseId"><el-select v-model="form.enterpriseId" aria-label="安全员所属企业" filterable @change="form.vehicleIds=[]"><el-option v-for="item in options.enterprises" :key="item.id" :label="item.name" :value="item.id"/></el-select></el-form-item>
    <el-form-item label="联系电话"><el-input v-model="form.phone" maxlength="32"/></el-form-item>
    <el-form-item label="脱敏身份号"><el-input v-model="form.idNumberMasked" maxlength="40" placeholder="选填，如 37************1234"/></el-form-item>
    <el-form-item label="资格编号"><el-input v-model="form.qualificationNo" maxlength="80"/></el-form-item>
    <el-form-item label="资格有效期至"><el-date-picker v-model="form.expiresAt" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item>
    <el-form-item label="培训状态"><el-switch v-model="form.trainingCompleted" active-text="已完成培训"/></el-form-item>
    <el-form-item label="在岗状态"><el-switch v-model="form.onDuty" :disabled="editingStatus!=='APPROVED'" active-text="在岗"/></el-form-item>
    <el-form-item label="班次开始"><el-time-select v-model="form.shiftStart" start="00:00" end="23:30" step="00:30" style="width:100%"/></el-form-item>
    <el-form-item label="班次结束"><el-time-select v-model="form.shiftEnd" start="00:00" end="23:30" step="00:30" style="width:100%"/></el-form-item>
    <el-form-item label="负责车辆" prop="vehicleIds" class="wide"><el-select v-model="form.vehicleIds" aria-label="负责车辆" multiple filterable :multiple-limit="MAX_VEHICLES" :disabled="!form.enterpriseId" placeholder="请选择负责车辆，最多5台"><el-option v-for="vehicle in vehicleOptions" :key="vehicle.id" :value="vehicle.id" :label="`${vehicle.name} · ${vehicle.unifiedCode||vehicle.businessNo}`" :disabled="form.vehicleIds.length>=MAX_VEHICLES&&!form.vehicleIds.includes(vehicle.id)"/></el-select><p class="subject-detail-caption" aria-live="polite">已选择 {{form.vehicleIds.length}} / 5 台，仅可选择所属企业车辆。</p></el-form-item>
  </el-form>
  <template #footer><el-button :disabled="saving" @click="editor=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存安全员</el-button></template>
</el-drawer>

<el-drawer v-model="detailOpen" title="安全员详情" :size="width" class="subject-drawer" destroy-on-close @closed="closeDetail">
  <div v-if="detailError" class="subject-error" role="alert"><strong>安全员详情加载失败</strong><span>{{detailError}}</span><el-button @click="loadDetail">重试</el-button></div><el-skeleton v-else-if="detailLoading" :rows="8" animated/>
  <template v-else-if="detail"><div class="subject-detail-title"><div><h2>{{detail.name}}</h2><p>{{detail.businessNo}}</p></div><el-tag :type="statusTone(detail.status)">{{statusText(detail.status)}}</el-tag></div><dl class="subject-detail-grid"><div><dt>所属企业</dt><dd>{{detail.enterprise.name}}</dd></div><div><dt>联系电话</dt><dd>{{detail.phone||'—'}}</dd></div><div><dt>脱敏身份号</dt><dd>{{detail.idNumberMasked}}</dd></div><div><dt>资格编号</dt><dd>{{detail.qualificationNo||'—'}}</dd></div><div><dt>资格有效期至</dt><dd>{{date(detail.expiresAt)}}</dd></div><div><dt>培训状态</dt><dd>{{detail.trainingCompleted?'已完成':'未完成'}}</dd></div><div><dt>班次 / 在岗</dt><dd>{{detail.shiftStart||'—'}}–{{detail.shiftEnd||'—'}} · {{detail.onDuty?'在岗':'离岗'}}</dd></div><div><dt>负责车辆</dt><dd>{{detail.vehicles.length}} / 5 台</dd></div></dl><h3 class="subject-detail-section">负责车辆</h3><el-table :data="detail.vehicles" empty-text="尚未分配负责车辆"><el-table-column label="车辆名称" min-width="190"><template #default="{row}">{{row.vehicle.name}}</template></el-table-column><el-table-column label="统一编码" min-width="190"><template #default="{row}">{{row.vehicle.unifiedCode||row.vehicle.businessNo}}</template></el-table-column></el-table><h3 class="subject-detail-section">最近审核</h3><dl class="subject-detail-grid"><div><dt>审核日期</dt><dd>{{date(detail.reviewedAt)}}</dd></div><div class="wide"><dt>审核意见</dt><dd>{{detail.reviewComment||'暂无审核意见'}}</dd></div></dl></template>
  <template #footer><el-button @click="detailOpen=false">关闭</el-button><el-button v-if="detail&&canWrite" type="primary" @click="openEditor(detail)">编辑安全员</el-button></template>
</el-drawer>
</section>
</template>
