<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { api } from '../api';
import { applicationTypes, admissionDate } from '../admission';
import { subjectError } from '../subject-management';
import { useResponsiveDrawer } from '../province-monitoring';
const props=defineProps<{modelValue:boolean;application?:any;options:any;initialType?:string;initialLicenseId?:string}>();
const emit=defineEmits<{ 'update:modelValue':[value:boolean];saved:[id:string] }>();
const open=computed({get:()=>props.modelValue,set:value=>emit('update:modelValue',value)}),width=useResponsiveDrawer(900),saving=ref(false),formRef=ref<FormInstance>();let pristine='';
const defaults=()=>({applicationType:props.initialType||'ROAD_TEST',title:'',enterpriseNameSnapshot:'',creditCodeSnapshot:'',legalRepresentative:'',contactName:'',contactPhone:'',registeredAddress:'',operationPlan:'',qualificationSummary:'',roadTestStartAt:'',roadTestEndAt:'',roadTestRoute:'',testPlan:'',safetyMeasures:'',vehicleIds:[] as string[],regionIds:[] as string[],targetLicenseId:'',requestedExpiresAt:'',renewalReason:'',changeReason:'',allowedHours:'06:00-22:00',speedLimit:20});
const form=reactive(defaults()),rules:FormRules={applicationType:[{required:true,message:'请选择业务类型',trigger:'change'}],title:[{required:true,message:'请填写申请名称',trigger:'blur'},{min:2,max:120,message:'名称为2至120字',trigger:'blur'}]};
const isRun=computed(()=>['ROAD_TEST','DEMONSTRATION'].includes(form.applicationType)),isTarget=computed(()=>['LICENSE_CHANGE','LICENSE_RENEWAL','LICENSE_EXIT'].includes(form.applicationType));
const showConditions=computed(()=>isRun.value||['LICENSE_CHANGE','LICENSE_RENEWAL'].includes(form.applicationType));
watch(()=>props.modelValue,value=>{if(!value)return;Object.assign(form,defaults());const enterprise=props.options.enterprises?.[0];if(enterprise)for(const key of ['legalRepresentative','contactName','contactPhone','registeredAddress'])Object.assign(form,{[key]:enterprise[key]??''});form.enterpriseNameSnapshot=enterprise?.name??'';form.creditCodeSnapshot=enterprise?.creditCode??'';
  if(props.application){const item=props.application;for(const key of Object.keys(form))if(item[key]!==undefined&&item[key]!==null)(form as any)[key]=item[key];Object.assign(form,item.details??{});form.vehicleIds=item.vehicles?.map((v:any)=>v.vehicleId)??[];for(const key of ['roadTestStartAt','roadTestEndAt','requestedExpiresAt']){const value=(form as any)[key];(form as any)[key]=value?admissionDate(value):''}}
  if(!props.application&&props.initialLicenseId){form.targetLicenseId=props.initialLicenseId;targetChanged()}
  pristine=JSON.stringify(form);
},{immediate:true});
function targetChanged(){const license=props.options.licenses?.find((item:any)=>item.id===form.targetLicenseId);if(license){const conditions=license.conditions??{};form.regionIds=conditions.regionIds??[];form.allowedHours=conditions.allowedHours??'06:00-22:00';form.speedLimit=conditions.speedLimit??20}}
async function close(done?:()=>void){if(saving.value)return;if(JSON.stringify(form)!==pristine){try{await ElMessageBox.confirm('当前修改尚未保存，确定放弃吗？','放弃未保存修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑',type:'warning'})}catch{return}}if(done)done();else open.value=false}
async function save(){if(!await formRef.value?.validate().catch(()=>false))return;saving.value=true;try{
  const payload:any={applicationType:form.applicationType,title:form.title.trim()};
  if(form.applicationType==='ENTERPRISE_ONBOARDING')for(const key of ['enterpriseNameSnapshot','creditCodeSnapshot','legalRepresentative','contactName','contactPhone','registeredAddress','operationPlan','qualificationSummary'])payload[key]=(form as any)[key];
  if(isRun.value||form.applicationType==='VEHICLE_REGISTRATION')payload.vehicleIds=form.vehicleIds;
  if(isRun.value)for(const key of ['roadTestStartAt','roadTestEndAt','roadTestRoute','testPlan','safetyMeasures']){if((form as any)[key])payload[key]=(form as any)[key]}
  if(isTarget.value)payload.targetLicenseId=form.targetLicenseId;
  if(form.applicationType==='LICENSE_RENEWAL'){payload.requestedExpiresAt=form.requestedExpiresAt;payload.renewalReason=form.renewalReason}
  if(['LICENSE_CHANGE','LICENSE_EXIT'].includes(form.applicationType))payload.changeReason=form.changeReason;
  if(showConditions.value)Object.assign(payload,{regionIds:form.regionIds,allowedHours:form.allowedHours,speedLimit:form.speedLimit});
  const item=await api<any>(props.application?`/admission/applications/${props.application.id}`:'/admission/applications',{method:props.application?'PATCH':'POST',body:JSON.stringify(payload)});pristine=JSON.stringify(form);open.value=false;ElMessage.success('草稿已保存，可继续补充材料并提交');emit('saved',item.id??props.application.id);
}catch(e){ElMessage.error(subjectError(e))}finally{saving.value=false}}
</script>
<template>
<el-drawer v-model="open" :title="application?'编辑业务申请':'新建业务申请'" :size="width" class="subject-drawer" destroy-on-close :before-close="close" :show-close="!saving">
  <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="subject-form" :disabled="saving">
    <p class="admission-form-note">资料保存为草稿后，可在右侧详情中上传材料、检查提交条件并提交审核。</p>
    <el-form-item label="业务类型" prop="applicationType"><el-select v-model="form.applicationType" aria-label="申报业务类型" :disabled="!!application"><el-option v-for="(label,value) in applicationTypes" :key="value" :label="label" :value="value"/></el-select></el-form-item>
    <el-form-item label="申请名称" prop="title"><el-input v-model="form.title" maxlength="120" placeholder="填写本次申报事项名称"/></el-form-item>
    <template v-if="form.applicationType==='ENTERPRISE_ONBOARDING'">
      <el-form-item label="企业名称"><el-input v-model="form.enterpriseNameSnapshot"/></el-form-item><el-form-item label="统一社会信用代码"><el-input v-model="form.creditCodeSnapshot" maxlength="18"/></el-form-item><el-form-item label="法定代表人"><el-input v-model="form.legalRepresentative"/></el-form-item><el-form-item label="联系人"><el-input v-model="form.contactName"/></el-form-item><el-form-item label="联系电话"><el-input v-model="form.contactPhone"/></el-form-item><el-form-item label="注册地址"><el-input v-model="form.registeredAddress"/></el-form-item><el-form-item label="运营方案" class="wide"><el-input v-model="form.operationPlan" type="textarea" :rows="3"/></el-form-item><el-form-item label="资质材料说明" class="wide"><el-input v-model="form.qualificationSummary" type="textarea" :rows="3"/></el-form-item>
    </template>
    <el-form-item v-if="isRun||form.applicationType==='VEHICLE_REGISTRATION'" label="申报车辆" class="wide"><el-select v-model="form.vehicleIds" aria-label="申报车辆" filterable multiple collapse-tags collapse-tags-tooltip :multiple-limit="50" placeholder="选择本企业车辆，最多50辆"><el-option v-for="item in options.vehicles" :key="item.id" :value="item.id" :label="`${item.name} · ${item.businessNo}`"/></el-select></el-form-item>
    <el-form-item v-if="isTarget" label="原通行许可" class="wide"><el-select v-model="form.targetLicenseId" aria-label="原通行许可" filterable @change="targetChanged"><el-option v-for="item in options.licenses" :key="item.id" :value="item.id" :label="`${item.licenseNo} · ${item.vehicle.name}`"/></el-select></el-form-item>
    <template v-if="isRun"><el-form-item label="开始日期"><el-date-picker v-model="form.roadTestStartAt" type="date" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="结束日期"><el-date-picker v-model="form.roadTestEndAt" type="date" value-format="YYYY-MM-DD"/></el-form-item></template>
    <template v-if="showConditions"><el-form-item label="拟通行区域" class="wide"><el-select v-model="form.regionIds" aria-label="拟通行区域" multiple filterable placeholder="选择已批准的通行区域"><el-option v-for="item in options.regions" :key="item.id" :value="item.id" :label="item.name"/></el-select></el-form-item><el-form-item label="允许时段"><el-input v-model="form.allowedHours" placeholder="06:00-22:00"/></el-form-item><el-form-item label="限速（km/h）"><el-input-number v-model="form.speedLimit" :min="1" :max="80"/></el-form-item></template>
    <template v-if="isRun"><el-form-item label="路线补充说明" class="wide"><el-input v-model="form.roadTestRoute" type="textarea" :rows="2"/></el-form-item><el-form-item label="实施方案" class="wide"><el-input v-model="form.testPlan" type="textarea" :rows="3"/></el-form-item><el-form-item label="安全保障措施" class="wide"><el-input v-model="form.safetyMeasures" type="textarea" :rows="3"/></el-form-item></template>
    <template v-if="form.applicationType==='LICENSE_RENEWAL'"><el-form-item label="申请有效期至"><el-date-picker v-model="form.requestedExpiresAt" type="date" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="续期原因" class="wide"><el-input v-model="form.renewalReason" type="textarea" :rows="3"/></el-form-item></template>
    <el-form-item v-if="['LICENSE_CHANGE','LICENSE_EXIT'].includes(form.applicationType)" :label="form.applicationType==='LICENSE_EXIT'?'退出原因':'变更原因'" class="wide"><el-input v-model="form.changeReason" type="textarea" :rows="3"/></el-form-item>
  </el-form>
  <template #footer><el-button :disabled="saving" @click="close()">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存草稿</el-button></template>
</el-drawer>
</template>
