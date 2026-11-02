<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Download, Plus, Search } from 'lucide-vue-next';
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import AdmissionApplicationDrawer from '../components/AdmissionApplicationDrawer.vue';
import AdmissionApplicationEditor from '../components/AdmissionApplicationEditor.vue';
import { useSessionStore } from '../stores/session';
import { useSubjectList, subjectError } from '../subject-management';
import { applicationTypes, applicationStates, stateTone, admissionTime, useAdmissionOptions, exportAdmission, can } from '../admission';
import '../admission.css';
const session=useSessionStore(),route=useRoute(),enterprise=computed(()=>session.user?.portal==='ENTERPRISE');
const {filters,rows,total,page,loading,error,load,search,reset,summary,getFilters}=useSubjectList('/admission/applications',{enterpriseId:'',applicationType:'',view:'all'},false);
const {options,loading:optionsLoading,error:optionsError,load:loadOptions}=useAdmissionOptions();
const drawer=ref(false),detailId=ref(''),editor=ref(false),editing=ref<any>(null),exporting=ref(false),selected=ref<any[]>([]),initialType=ref('ROAD_TEST'),initialLicenseId=ref('');
const title=computed(()=>enterprise.value?'业务申请':'业务办理');
function open(row:any){detailId.value=row.id;drawer.value=true}
function edit(item?:any){editing.value=item??null;initialType.value=item?.applicationType??'ROAD_TEST';initialLicenseId.value='';drawer.value=false;editor.value=true}
function saved(id:string){load();detailId.value=id;drawer.value=true}
function switchView(value:string){filters.view=value;search()}
let handledLink='';watch(()=>[route.fullPath,optionsLoading.value],()=>{if(!enterprise.value||optionsLoading.value||!options.value.enterprises?.length||handledLink===route.fullPath)return;const type=String(route.query.type??'');if(applicationTypes[type]){handledLink=route.fullPath;editing.value=null;initialType.value=type;initialLicenseId.value=String(route.query.targetLicenseId??'');editor.value=true}},{immediate:true});
async function exportRows(){exporting.value=true;try{await exportAdmission('/admission/applications',getFilters(),[['申请编号',r=>r.businessNo],['申请事项',r=>r.title],['企业',r=>r.enterprise?.name],['业务类型',r=>applicationTypes[r.applicationType]],['关联车辆',r=>r.vehicles.map((v:any)=>v.vehicle.name).join('、')],['当前环节',r=>r.currentNodeName||applicationStates[r.status]],['提交时间',r=>admissionTime(r.submittedAt)],['办理状态',r=>applicationStates[r.status]]],title.value,selected.value)}catch(e){ElMessage.error(subjectError(e))}finally{exporting.value=false}}
</script>
<template>
<section class="city-subject-page admission-page" :aria-label="title"><h1 class="sr-only">{{title}}</h1>
  <QueryPanel class="subject-query admission-query" :loading="loading" @search="search" @reset="reset">
    <QueryField label="关键词" keyword><el-input v-model="filters.q" :prefix-icon="Search" clearable placeholder="搜索申请编号、企业或车辆" aria-label="搜索业务"/></QueryField>
    <QueryField v-if="!enterprise" label="企业"><el-select v-model="filters.enterpriseId" aria-label="申请企业" filterable clearable placeholder="全部企业" :loading="optionsLoading" :disabled="!!optionsError"><el-option v-for="item in options.enterprises" :key="item.id" :label="item.name" :value="item.id"/></el-select></QueryField>
    <QueryField label="业务类型"><el-select v-model="filters.applicationType" aria-label="业务类型" clearable placeholder="全部类型"><el-option v-for="(label,value) in applicationTypes" :key="value" :label="label" :value="value"/></el-select></QueryField>
    <QueryField label="办理状态"><el-select v-model="filters.status" aria-label="办理状态" clearable placeholder="全部状态"><el-option v-for="(label,value) in applicationStates" :key="value" :label="label" :value="value"/></el-select></QueryField>
  </QueryPanel>
  <section class="subject-list" :aria-label="title+'列表'"><header class="subject-list-header"><h2>{{title}} <span v-if="!error" class="subject-count">{{total}}</span></h2><div class="subject-tools"><el-button :icon="Download" :loading="exporting" :disabled="loading||!!error" @click="exportRows">{{selected.length?'导出选中':'导出'}}</el-button><el-button v-if="enterprise&&can(session.user,'admission:application:write')" :icon="Plus" type="primary" :disabled="optionsLoading||!!optionsError" @click="edit()">新建申请</el-button></div></header>
    <div v-if="!enterprise" class="admission-queue" role="group" aria-label="业务视图"><button :class="{active:filters.view==='pending'}" :aria-pressed="filters.view==='pending'" @click="switchView('pending')">待办事项 <span v-if="!error&&summary.pendingTotal!==undefined" class="subject-count">{{summary.pendingTotal}}</span></button><button :class="{active:filters.view==='all'}" :aria-pressed="filters.view==='all'" @click="switchView('all')">全部申请 <span v-if="!error" class="subject-count">{{summary.totalAll??total}}</span></button></div>
    <div v-if="optionsError" class="subject-inline-error" role="alert">查询及申报选项加载失败：{{optionsError}}<el-button text @click="loadOptions">重试</el-button></div>
    <div v-if="error" class="subject-error" role="alert"><strong>业务列表加载失败</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
    <div v-else class="subject-table-host"><el-table v-loading="loading" :data="rows" row-key="id" height="100%" class="subject-table" empty-text="暂无符合条件的业务申请" @selection-change="selected=$event"><el-table-column type="selection" width="42"/>
      <el-table-column label="申请事项 / 编号" min-width="235"><template #default="{row}"><button class="subject-identity" @click="open(row)"><strong>{{row.title}}</strong><span>{{row.businessNo}}</span></button></template></el-table-column>
      <el-table-column v-if="!enterprise" label="申请企业" min-width="220" show-overflow-tooltip><template #default="{row}">{{row.enterprise?.name||row.enterpriseNameSnapshot}}</template></el-table-column>
      <el-table-column label="业务类型" min-width="125"><template #default="{row}">{{applicationTypes[row.applicationType]||row.applicationType}}</template></el-table-column>
      <el-table-column label="关联车辆" min-width="150"><template #default="{row}"><div class="subject-identity"><strong>{{row.vehicles[0]?.vehicle.name||row.targetLicense?.licenseNo||'—'}}</strong><span v-if="row.vehicles.length>1">等 {{row.vehicles.length}} 辆</span></div></template></el-table-column>
      <el-table-column label="当前环节" min-width="125"><template #default="{row}">{{row.currentNodeName||(row.status==='APPROVED'?'结果签发':applicationStates[row.status])}}</template></el-table-column>
      <el-table-column label="提交时间" min-width="172"><template #default="{row}">{{admissionTime(row.submittedAt)}}</template></el-table-column>
      <el-table-column label="办理状态" min-width="105"><template #default="{row}"><el-tag :type="stateTone(row.status)">{{applicationStates[row.status]||row.status}}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="140" fixed="right"><template #default="{row}"><div class="subject-row-actions"><el-button v-if="row.canHandle||row.canIssue" link type="primary" :aria-label="`办理${row.title}`" @click="open(row)">{{row.canIssue?'签发':'办理'}}</el-button><el-button v-else-if="enterprise&&['DRAFT','RETURNED'].includes(row.status)&&can(session.user,'admission:application:write')" link type="primary" :aria-label="`编辑${row.title}`" @click="edit(row)">编辑</el-button><el-button link type="primary" :aria-label="`${row.title}详情`" @click="open(row)">详情</el-button></div></template></el-table-column>
    </el-table></div><footer v-if="!error" class="subject-footer"><span>{{selected.length?`已选择 ${selected.length} 项`:`当前显示 ${rows.length} 条`}}</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" :pager-count="5" layout="total,prev,pager,next" background small/></footer>
  </section>
  <AdmissionApplicationDrawer v-model="drawer" :application-id="detailId" :options="options" @changed="load" @edit="edit"/>
  <AdmissionApplicationEditor v-model="editor" :application="editing" :options="options" :initial-type="initialType" :initial-license-id="initialLicenseId" @saved="saved"/>
</section>
</template>
