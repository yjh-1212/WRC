<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ChevronDown, Plus, Search } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { subjectError, useSubjectList } from '../subject-management';
import CityEnterpriseDrawer from '../components/CityEnterpriseDrawer.vue';
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import '../subject-management.css';
const session=useSessionStore(),route=useRoute();
const {filters,rows,total,page,loading,error,load,search,reset}=useSubjectList('/archives/enterprises');
const canCreate=computed(()=>session.user?.permissions.includes('system:enterprise:update'));
const canEdit=computed(()=>session.user?.permissions.includes('archive:enterprise-archive:write'));
const canAccounts=computed(()=>session.user?.permissions.includes('system:user:read'));
const drawer=ref(false),detailId=ref(''),detailTab=ref('basic'),editOnOpen=ref(false);
const creating=ref(false),saving=ref(false),formRef=ref<FormInstance>(),organizations=ref<any[]>([]),optionsError=ref(''),optionsLoading=ref(false);
const defaults=()=>({businessNo:'',name:'',creditCode:'',organizationId:session.user?.organizationId??'',type:'OPERATOR',legalRepresentative:'',contactName:'',contactPhone:'',registeredAddress:''});
const form=reactive(defaults());
const rules:FormRules={businessNo:[{required:true,message:'请填写企业编号',trigger:'blur'}],name:[{required:true,message:'请填写企业名称',trigger:'blur'}],creditCode:[{required:true,message:'请填写统一社会信用代码',trigger:'blur'},{pattern:/^[0-9A-Z]{18}$/,message:'请填写18位统一社会信用代码',trigger:'blur'}],organizationId:[{required:true,message:'请选择监管机构',trigger:'change'}]};
function open(row:any,tab='basic',edit=false){detailId.value=row.id;detailTab.value=tab;editOnOpen.value=edit;drawer.value=true}
async function loadOrganizations(){optionsLoading.value=true;optionsError.value='';try{if(session.user?.permissions.includes('system:organization:read')){const r=await api<any>('/system/organizations');const flatten=(items:any[]):any[]=>items.flatMap(item=>[item,...flatten(item.children??[])]);organizations.value=flatten(Array.isArray(r)?r:r.items??[])}else{organizations.value=[{id:session.user?.organizationId,name:'当前监管机构'}]}}catch(e){optionsError.value=subjectError(e)}finally{optionsLoading.value=false}}
function startCreate(){Object.assign(form,defaults());creating.value=true;loadOrganizations()}
async function create(){if(!await formRef.value?.validate().catch(()=>false))return;saving.value=true;try{const enterprise=await api<any>('/system/enterprises',{method:'POST',body:JSON.stringify(form)});ElMessage.success('企业已登记');creating.value=false;reset();open(enterprise)}catch(e){ElMessage.error(subjectError(e))}finally{saving.value=false}}
watch(()=>route.query.enterpriseId,id=>{if(typeof id==='string'&&id)open({id})},{immediate:true});
</script>
<template>
<section class="city-subject-page" aria-label="企业管理"><h1 class="sr-only">企业管理</h1>
<QueryPanel class="subject-query" :loading="loading" @search="search" @reset="reset">
  <QueryField label="关键词" keyword><el-input v-model="filters.q" :prefix-icon="Search" clearable placeholder="搜索企业名称、编号或信用代码" aria-label="搜索企业"/></QueryField>
  <QueryField label="企业状态"><el-select v-model="filters.status" clearable placeholder="全部状态" aria-label="企业状态"><el-option label="正常运营" value="ACTIVE"/><el-option label="已停用" value="INACTIVE"/></el-select></QueryField>
</QueryPanel>
<section class="subject-list" aria-labelledby="enterprise-list-title">
  <header class="subject-list-header"><h2 id="enterprise-list-title">企业列表 <span v-if="!error" class="subject-count">{{total}}</span></h2><div class="subject-tools"><el-button v-if="canCreate" type="primary" :icon="Plus" @click="startCreate">登记企业</el-button></div></header>
  <div v-if="error" class="subject-error" role="alert"><strong>企业列表加载失败</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
  <div v-else class="subject-table-host"><el-table v-loading="loading" :data="rows" height="100%" class="subject-table" row-key="id" empty-text="没有符合条件的企业">
    <el-table-column label="企业名称 / 编号" min-width="315"><template #default="{row}"><button class="subject-identity" @click="open(row)"><strong>{{row.name}}</strong><span>{{row.businessNo}}</span></button></template></el-table-column>
    <el-table-column label="监管机构" min-width="190"><template #default="{row}">{{row.organization.name}}</template></el-table-column>
    <el-table-column label="在册车辆" min-width="105"><template #default="{row}"><span class="subject-number">{{row._count.vehicles}}</span><span class="subject-unit">辆</span></template></el-table-column>
    <el-table-column label="资质档案" min-width="125"><template #default="{row}"><span class="subject-number">{{row._count.qualifications}}</span><span class="subject-unit">项</span><el-tag v-if="!row._count.qualifications" type="warning" size="small" style="margin-left:8px">待补充</el-tag></template></el-table-column>
    <el-table-column label="企业账号" min-width="105"><template #default="{row}"><span class="subject-number">{{row._count.users}}</span><span class="subject-unit">个</span></template></el-table-column>
    <el-table-column label="状态" min-width="115"><template #default="{row}"><el-tag class="subject-pill" :type="row.status==='ACTIVE'?'success':'info'">{{row.status==='ACTIVE'?'正常运营':'已停用'}}</el-tag></template></el-table-column>
    <el-table-column label="操作" :width="canEdit||canAccounts?210:85" fixed="right"><template #default="{row}"><div class="subject-row-actions"><el-button link type="primary" :aria-label="`${row.name}详情`" @click="open(row)">详情</el-button><el-button v-if="canEdit" link type="primary" @click="open(row,'basic',true)">编辑信息</el-button><el-dropdown v-if="canAccounts" trigger="click"><el-button link type="primary" :aria-label="`${row.name}更多操作`"><ChevronDown :size="15"/></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item @click="open(row,'accounts')">账号管理</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></template></el-table-column>
  </el-table></div>
  <footer v-if="!error" class="subject-footer"><span>当前显示 {{rows.length}} 条</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" :pager-count="5" layout="total,prev,pager,next" background small/></footer>
</section>
<CityEnterpriseDrawer v-model="drawer" :enterprise-id="detailId" :initial-tab="detailTab" :edit-on-open="editOnOpen" @changed="load"/>
<el-dialog v-model="creating" title="登记企业" width="720px" class="subject-editor" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving"><div v-if="optionsError" class="subject-inline-error" role="alert">{{optionsError}}<el-button text @click="loadOrganizations">重试</el-button></div><el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="subject-form" :disabled="saving"><el-form-item label="企业编号" prop="businessNo"><el-input v-model="form.businessNo" maxlength="50" placeholder="填写企业登记编号"/></el-form-item><el-form-item label="企业名称" prop="name"><el-input v-model="form.name" maxlength="120"/></el-form-item><el-form-item label="统一社会信用代码" prop="creditCode"><el-input v-model="form.creditCode" maxlength="18"/></el-form-item><el-form-item label="监管机构" prop="organizationId"><el-select aria-label="监管机构" v-model="form.organizationId" filterable :loading="optionsLoading" :disabled="!!optionsError"><el-option v-for="org in organizations" :key="org.id" :label="org.name" :value="org.id"/></el-select></el-form-item><el-form-item label="法定代表人"><el-input v-model="form.legalRepresentative" maxlength="80"/></el-form-item><el-form-item label="企业联系人"><el-input v-model="form.contactName" maxlength="80"/></el-form-item><el-form-item label="联系电话"><el-input v-model="form.contactPhone" maxlength="32"/></el-form-item><el-form-item label="注册地址" class="wide"><el-input v-model="form.registeredAddress" type="textarea" :rows="2" maxlength="300"/></el-form-item></el-form><template #footer><el-button :disabled="saving" @click="creating=false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!!optionsError||optionsLoading" @click="create">确认登记</el-button></template></el-dialog>
</section>
</template>
