<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { subjectError } from '../subject-management';
const props=defineProps<{enterpriseId:string;organizationId:string}>();
const emit=defineEmits<{changed:[]}>();
const session=useSessionStore(),canCreate=computed(()=>session.user?.permissions.includes('system:user:create'));
const rows=ref<any[]>([]),total=ref(0),page=ref(1),loading=ref(false),error=ref(''),creating=ref(false),saving=ref(false),roles=ref<any[]>([]),formRef=ref<FormInstance>();
const form=reactive({username:'',displayName:'',password:'',roleIds:[] as string[]});
const rules:FormRules={username:[{required:true,message:'请填写登录账号',trigger:'blur'},{min:3,max:30,message:'账号长度为3至30个字符',trigger:'blur'}],displayName:[{required:true,message:'请填写姓名',trigger:'blur'}],password:[{required:true,min:8,message:'初始密码至少8位',trigger:'blur'}],roleIds:[{type:'array',required:true,min:1,message:'请选择企业角色',trigger:'change'}]};
let generation=0;
async function load(){const request=++generation;loading.value=true;error.value='';try{const r=await api<any>(`/system/users?enterpriseId=${encodeURIComponent(props.enterpriseId)}&page=${page.value}&pageSize=20`);if(request===generation){rows.value=r.items;total.value=r.total}}catch(e){if(request===generation)error.value=subjectError(e)}finally{if(request===generation)loading.value=false}}
async function startCreate(){try{const r=await api<any>('/system/users/options');roles.value=r.roles.filter((r:any)=>r.portal==='ENTERPRISE');Object.assign(form,{username:'',displayName:'',password:'',roleIds:[]});creating.value=true}catch(e){ElMessage.error(subjectError(e))}}
async function save(){if(!await formRef.value?.validate().catch(()=>false))return;saving.value=true;try{await api('/system/users',{method:'POST',body:JSON.stringify({...form,portal:'ENTERPRISE',enterpriseId:props.enterpriseId,organizationId:props.organizationId})});ElMessage.success('企业账号已创建');creating.value=false;form.password='';await load();emit('changed')}catch(e){ElMessage.error(subjectError(e))}finally{saving.value=false}}
watch(()=>props.enterpriseId,()=>{page.value=1;creating.value=false;load()},{immediate:true});watch(page,load);
</script>
<template>
  <div v-if="creating"><h3 class="subject-detail-section">新增企业账号</h3><el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="subject-form"><el-form-item label="登录账号" prop="username"><el-input v-model="form.username" maxlength="30" autocomplete="off"/></el-form-item><el-form-item label="姓名" prop="displayName"><el-input v-model="form.displayName"/></el-form-item><el-form-item label="初始密码" prop="password"><el-input v-model="form.password" type="password" show-password autocomplete="new-password"/></el-form-item><el-form-item label="企业角色" prop="roleIds"><el-select v-model="form.roleIds" multiple aria-label="企业角色"><el-option v-for="role in roles" :key="role.id" :value="role.id" :label="role.name"/></el-select></el-form-item></el-form><el-button @click="creating=false;form.password=''" :disabled="saving">取消</el-button><el-button type="primary" :loading="saving" @click="save">创建账号</el-button></div>
  <template v-else><div class="subject-detail-title"><h3 class="subject-detail-section" style="margin:0">企业账号</h3><el-button v-if="canCreate" @click="startCreate">新增账号</el-button></div><div v-if="error" class="subject-inline-error" role="alert">{{error}}<el-button text @click="load">重试</el-button></div><el-table v-else v-loading="loading" :data="rows" empty-text="该企业尚未开通账号"><el-table-column prop="username" label="账号" min-width="150"/><el-table-column prop="displayName" label="姓名" min-width="110"/><el-table-column label="角色" min-width="160"><template #default="{row}">{{row.roles.map((x:any)=>x.role.name).join('、')}}</template></el-table-column><el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.status==='ACTIVE'?'success':'info'">{{row.status==='ACTIVE'?'正常':'停用'}}</el-tag></template></el-table-column></el-table><el-pagination v-if="total" v-model:current-page="page" :total="total" :page-size="20" layout="total,prev,pager,next" small/></template>
</template>
