<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ChevronDown, Download, Search } from 'lucide-vue-next';
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import PermitDetailDrawer from '../components/PermitDetailDrawer.vue';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { useSubjectList, subjectError } from '../subject-management';
import { permitTypes, permitStates, admissionDate, stateTone, useAdmissionOptions, can, exportAdmission } from '../admission';
import '../admission.css';
const session=useSessionStore(),route=useRoute(),router=useRouter(),enterprise=computed(()=>session.user?.portal==='ENTERPRISE');
const {filters,rows,total,page,loading,error,load,search,reset,getFilters}=useSubjectList('/admission/licenses',{enterpriseId:'',licenseType:''},false);
const {options,loading:optionsLoading,error:optionsError,load:loadOptions}=useAdmissionOptions('/admission/licenses/options');
const drawer=ref(false),detailId=ref(''),busy=ref(false),exporting=ref(false),selected=ref<any[]>([]);
const days=(value:string)=>Math.max(0,Math.ceil((new Date(value).getTime()-Date.now())/86400000));
function open(row:any){detailId.value=row.id;drawer.value=true}
watch(()=>route.query.licenseId,id=>{if(typeof id==='string')open({id})},{immediate:true});
function available(row:any){const state=row.status;return [{code:'SUSPEND',label:'暂停许可',states:['VALID','EXPIRING']},{code:'RESUME',label:'恢复许可',states:['SUSPENDED']},{code:'REVOKE',label:'撤销许可',states:['VALID','EXPIRING','SUSPENDED']},{code:'CANCEL',label:'注销许可',states:['VALID','EXPIRING','SUSPENDED','EXPIRED']}].filter(a=>a.states.includes(state))}
async function action(row:any,code:string){if(code.startsWith('APPLY_')){router.push({path:'/enterprise/applications',query:{type:code.slice(6),targetLicenseId:row.id}});return}const label=available(row).find(a=>a.code===code)?.label;if(!label)return;let reason='';try{const result=await ElMessageBox.prompt(`请填写${label}的处理原因及依据`,label,{inputType:'textarea',inputValidator:value=>!!value?.trim()&&value.trim().length>=2||'请至少填写2字处理原因',confirmButtonText:'确认'+label,cancelButtonText:'取消'});reason=result.value??''}catch{return}busy.value=true;try{await api(`/admission/licenses/${row.id}/action`,{method:'POST',body:JSON.stringify({action:code,reason})});ElMessage.success(label+'已完成');await load()}catch(e){ElMessage.error(subjectError(e))}finally{busy.value=false}}
async function exportRows(){exporting.value=true;try{await exportAdmission('/admission/licenses',getFilters(),[['许可编号',r=>r.licenseNo],['企业',r=>r.enterprise.name],['车辆',r=>r.vehicle.name],['统一编码',r=>r.vehicle.unifiedCode||r.vehicle.businessNo],['许可类型',r=>permitTypes[r.licenseType]],['通行区域',r=>r.conditions.regions?.map((a:any)=>a.name).join('、')],['允许时段',r=>r.conditions.allowedHours],['限速',r=>r.conditions.speedLimit],['有效期至',r=>admissionDate(r.expiresAt)],['状态',r=>permitStates[r.status]]],'通行许可台账',selected.value)}catch(e){ElMessage.error(subjectError(e))}finally{exporting.value=false}}
</script>
<template>
<section class="city-subject-page admission-page" aria-label="通行许可"><h1 class="sr-only">通行许可</h1>
  <QueryPanel class="subject-query admission-query" :loading="loading" @search="search" @reset="reset">
    <QueryField label="关键词" keyword><el-input v-model="filters.q" :prefix-icon="Search" clearable placeholder="搜索许可编号、车辆或企业" aria-label="搜索通行许可"/></QueryField>
    <QueryField v-if="!enterprise" label="企业"><el-select v-model="filters.enterpriseId" aria-label="许可企业" filterable clearable placeholder="全部企业" :loading="optionsLoading" :disabled="!!optionsError"><el-option v-for="item in options.enterprises" :key="item.id" :label="item.name" :value="item.id"/></el-select></QueryField>
    <QueryField label="许可类型"><el-select v-model="filters.licenseType" aria-label="许可类型" clearable placeholder="全部类型"><el-option v-for="(label,value) in permitTypes" :key="value" :label="label" :value="value"/></el-select></QueryField>
    <QueryField label="许可状态"><el-select v-model="filters.status" aria-label="许可状态" clearable placeholder="全部状态"><el-option v-for="(label,value) in permitStates" :key="value" :label="label" :value="value"/></el-select></QueryField>
  </QueryPanel>
  <section class="subject-list" aria-label="通行许可列表"><header class="subject-list-header"><h2>通行许可 <span v-if="!error" class="subject-count">{{total}}</span></h2><div class="subject-tools"><el-button :icon="Download" :loading="exporting" :disabled="loading||!!error" @click="exportRows">{{selected.length?'导出选中':'导出台账'}}</el-button></div></header>
    <div v-if="optionsError" class="subject-inline-error" role="alert">企业选项加载失败：{{optionsError}}<el-button text @click="loadOptions">重试</el-button></div>
    <div v-if="error" class="subject-error" role="alert"><strong>许可台账加载失败</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
    <div v-else class="subject-table-host"><el-table v-loading="loading||busy" :data="rows" row-key="id" height="100%" class="subject-table" empty-text="暂无符合条件的通行许可" @selection-change="selected=$event"><el-table-column type="selection" width="42"/>
      <el-table-column label="许可编号" min-width="230"><template #default="{row}"><button class="subject-identity" @click="open(row)"><strong>{{row.licenseNo}}</strong><span>{{row.approvalResults[0]?.application.businessNo||row.businessNo}}</span></button></template></el-table-column>
      <el-table-column :label="enterprise?'车辆 / 统一编码':'企业 / 车辆'" min-width="250"><template #default="{row}"><div class="subject-identity"><strong>{{enterprise?row.vehicle.name:row.enterprise.name}}</strong><span>{{enterprise?(row.vehicle.unifiedCode||row.vehicle.businessNo):row.vehicle.name}}</span></div></template></el-table-column>
      <el-table-column label="许可类型" min-width="110"><template #default="{row}">{{permitTypes[row.licenseType]||'历史许可'}}</template></el-table-column>
      <el-table-column label="通行区域" min-width="220"><template #default="{row}"><div class="subject-identity"><strong>{{row.conditions.regions?.map((r:any)=>r.name).join('、')||'历史许可未记录'}}</strong><span v-if="row.conditions.allowedHours">{{row.conditions.allowedHours}}<template v-if="row.conditions.speedLimit"> · 限速{{row.conditions.speedLimit}}km/h</template></span></div></template></el-table-column>
      <el-table-column label="有效期" min-width="210"><template #default="{row}">{{admissionDate(row.issuedAt)}} 至 {{admissionDate(row.expiresAt)}}</template></el-table-column>
      <el-table-column label="状态" min-width="115"><template #default="{row}"><el-tag :type="stateTone(row.status)">{{permitStates[row.status]}}</el-tag><div v-if="row.status==='EXPIRING'" class="admission-status-note">剩余 {{days(row.expiresAt)}} 天</div></template></el-table-column>
      <el-table-column label="操作" width="140" fixed="right"><template #default="{row}"><div class="subject-row-actions"><el-button link type="primary" :aria-label="`${row.licenseNo}详情`" @click="open(row)">详情</el-button><el-dropdown v-if="(enterprise&&can(session.user,'admission:application:write')&&!['CANCELLED','REVOKED'].includes(row.status))||(!enterprise&&can(session.user,'admission:license:issue')&&available(row).length)" trigger="click" @command="(code:string)=>action(row,code)"><el-button link type="primary" :aria-label="`${row.licenseNo}更多操作`">更多<ChevronDown :size="12"/></el-button><template #dropdown><el-dropdown-menu><template v-if="enterprise"><el-dropdown-item v-if="row.status!=='SUSPENDED'" command="APPLY_LICENSE_CHANGE">申请变更</el-dropdown-item><el-dropdown-item v-if="row.status!=='SUSPENDED'" command="APPLY_LICENSE_RENEWAL">申请续期</el-dropdown-item><el-dropdown-item command="APPLY_LICENSE_EXIT">申请退出</el-dropdown-item></template><el-dropdown-item v-for="item in enterprise?[]:available(row)" :key="item.code" :command="item.code">{{item.label}}</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></template></el-table-column>
    </el-table></div><footer v-if="!error" class="subject-footer"><span>{{selected.length?`已选择 ${selected.length} 项`:`当前显示 ${rows.length} 条`}}</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" :pager-count="5" layout="total,prev,pager,next" background small/></footer>
  </section><PermitDetailDrawer v-model="drawer" :license-id="detailId"/>
</section>
</template>
