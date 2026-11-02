<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { MoreHorizontal, Plus, Search } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { useResponsiveDrawer } from '../province-monitoring';
import { subjectError, subjectStatus, useSubjectList } from '../subject-management';
import VehicleDetailDrawer from '../components/VehicleDetailDrawer.vue';
import VehicleEditorDialog from '../components/VehicleEditorDialog.vue';
import ManufacturersView from './ManufacturersView.vue';
import VehicleModelsView from './VehicleModelsView.vue';
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import '../subject-management.css';
const session=useSessionStore(),route=useRoute(),router=useRouter(),catalogWidth=useResponsiveDrawer(1120);
const {filters,rows,total,page,loading,error,load,search,reset}=useSubjectList('/archives/vehicles',{enterpriseId:'',vehicleType:'',onlineStatus:''});
const allowed=(code:string)=>session.user?.permissions.includes(code)??false;
const canWrite=computed(()=>allowed('archive:vehicle:write'));
const detailId=ref(''),detailTab=ref('basic'),drawer=ref(false),editor=ref(false),editingVehicle=ref<any>(null),catalog=ref(false),catalogTab=ref('models');
const options=ref<any>({models:[],enterprises:[]}),optionsLoading=ref(false),optionsError=ref(''),selected=ref<any[]>([]),changing=ref(false);
const types:Record<string,string>={DELIVERY:'配送',SANITATION:'环卫',PATROL:'巡逻',RETAIL:'零售',SHUTTLE:'接驳'};
async function loadOptions(){optionsLoading.value=true;optionsError.value='';try{options.value=await api('/archives/options')}catch(e){optionsError.value=subjectError(e)}finally{optionsLoading.value=false}}
function open(row:any,tab='basic'){detailId.value=row.id;detailTab.value=tab;drawer.value=true}
function edit(row?:any){editingVehicle.value=row??null;if(row?.model&&!options.value.models.some((m:any)=>m.id===row.modelId))options.value.models.push(row.model);if(row?.enterprise&&!options.value.enterprises.some((e:any)=>e.id===row.enterpriseId))options.value.enterprises.push(row.enterprise);editor.value=true}
async function setStatus(targets:any[],status:string){if(!targets.length)return;try{await ElMessageBox.confirm(`确定${status==='ACTIVE'?'启用':'停用'}选中的 ${targets.length} 辆车辆？`,'车辆状态调整',{confirmButtonText:'确认',cancelButtonText:'取消',type:'warning'})}catch{return}changing.value=true;try{const results=await Promise.allSettled(targets.map(row=>api(`/archives/vehicles/${row.id}/status`,{method:'PATCH',body:JSON.stringify({status})})));const failed=results.filter(result=>result.status==='rejected');if(failed.length)ElMessage.warning(`${results.length-failed.length} 辆已更新，${failed.length} 辆未成功，请核对后重试`);else ElMessage.success('车辆状态已更新');selected.value=[];await load()}finally{changing.value=false}}
async function remove(row:any){try{await ElMessageBox.confirm(`确定将“${row.name}”退出运营？退出后保留历史档案，相关许可同步注销。`,'退出运营',{confirmButtonText:'确认退出',cancelButtonText:'取消',type:'warning'})}catch{return}try{await api(`/archives/vehicles/${row.id}`,{method:'DELETE'});ElMessage.success('车辆已退出运营');await load()}catch(e){ElMessage.error(subjectError(e))}}
function monitor(row:any){router.push({path:'/operations/realtime',query:{vehicleId:row.id}})}
function command(row:any,value:string){if(value==='edit')edit(row);if(value==='status')setStatus([row],row.status==='ACTIVE'?'INACTIVE':'ACTIVE');if(value==='delete')remove(row);if(value==='license')open(row,'licenses')}
watch(()=>route.query.vehicleId,id=>{if(typeof id==='string'&&id)open({id})},{immediate:true});
if(typeof route.query.enterpriseId==='string')filters.enterpriseId=route.query.enterpriseId;
watch(()=>route.query.enterpriseId,id=>{filters.enterpriseId=typeof id==='string'?id:'';search()});
onMounted(loadOptions);
</script>
<template>
<section class="city-subject-page" aria-label="车辆管理"><h1 class="sr-only">车辆管理</h1>
<QueryPanel class="subject-query subject-query--vehicles" :loading="loading" @search="search" @reset="reset">
  <QueryField label="关键词" keyword><el-input v-model="filters.q" :prefix-icon="Search" clearable placeholder="搜索车辆、统一编码或VIN" aria-label="搜索车辆"/></QueryField>
  <QueryField label="企业"><el-select v-model="filters.enterpriseId" filterable clearable placeholder="全部企业" aria-label="所属企业" :loading="optionsLoading" :disabled="!!optionsError"><el-option v-for="item in options.enterprises" :key="item.id" :value="item.id" :label="item.name"/></el-select></QueryField>
  <QueryField label="车辆类型"><el-select v-model="filters.vehicleType" clearable placeholder="全部类型" aria-label="车辆类型"><el-option v-for="(label,code) in types" :key="code" :value="code" :label="label"/></el-select></QueryField>
  <QueryField label="连接状态"><el-select v-model="filters.onlineStatus" clearable placeholder="全部连接状态" aria-label="连接状态"><el-option value="ONLINE" label="在线"/><el-option value="OFFLINE" label="离线"/></el-select></QueryField>
</QueryPanel>
<section class="subject-list" aria-labelledby="vehicle-list-title">
  <header class="subject-list-header"><h2 id="vehicle-list-title">车辆列表 <span v-if="!error" class="subject-count">{{total}}</span></h2><div class="subject-tools"><el-button v-if="allowed('archive:manufacturer:read')&&allowed('archive:model:read')" @click="catalog=true">厂商与车型</el-button><el-button v-if="canWrite" type="primary" :icon="Plus" :disabled="!!optionsError||optionsLoading" @click="edit()">新增车辆</el-button></div></header>
  <div v-if="optionsError" class="subject-inline-error" role="alert">筛选及建档选项加载失败：{{optionsError}}<el-button text @click="loadOptions">重试</el-button></div>
  <div v-if="selected.length&&canWrite" class="subject-bulk"><span>已选择 {{selected.length}} 辆</span><el-button size="small" :loading="changing" @click="setStatus(selected,'ACTIVE')">启用</el-button><el-button size="small" :disabled="changing" @click="setStatus(selected,'INACTIVE')">停用</el-button><el-button text size="small" :disabled="changing" @click="selected=[];load()">取消选择</el-button></div>
  <div v-if="error" class="subject-error" role="alert"><strong>车辆列表加载失败</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
  <div v-else class="subject-table-host"><el-table v-loading="loading" :data="rows" row-key="id" height="100%" class="subject-table" empty-text="没有符合条件的车辆" @selection-change="selected=$event"><el-table-column v-if="canWrite" type="selection" width="42"/>
    <el-table-column label="车辆 / 统一编码" min-width="220"><template #default="{row}"><button class="subject-identity" @click="open(row)"><strong>{{row.name}}</strong><span>{{row.unifiedCode||row.businessNo}}</span></button></template></el-table-column>
    <el-table-column label="所属企业" min-width="200" show-overflow-tooltip><template #default="{row}">{{row.enterprise.name}}</template></el-table-column>
    <el-table-column label="厂商 / 车型" min-width="180"><template #default="{row}"><div class="subject-identity"><strong>{{row.model.manufacturer.shortName||row.model.manufacturer.name}}</strong><span>{{row.model.name}}</span></div></template></el-table-column>
    <el-table-column label="用途" min-width="80"><template #default="{row}">{{types[row.vehicleType]||row.vehicleType}}</template></el-table-column>
    <el-table-column label="通行许可" min-width="155"><template #default="{row}"><div v-if="row.licenses[0]" class="subject-identity"><strong>{{row.licenses[0].licenseNo}}</strong><span>{{subjectStatus(row.licenses[0].status)}}</span></div><span v-else>未签发</span></template></el-table-column>
    <el-table-column label="连接状态" min-width="105"><template #default="{row}"><span class="subject-state" :class="{online:row.onlineStatus==='ONLINE'}"><i/>{{row.onlineStatus==='ONLINE'?'在线':'离线'}}</span></template></el-table-column>
    <el-table-column label="档案状态" min-width="105"><template #default="{row}"><el-tag class="subject-pill" :type="row.status==='ACTIVE'?'success':'info'">{{row.status==='ACTIVE'?'运营中':'已停用'}}</el-tag></template></el-table-column>
    <el-table-column label="操作" :width="allowed('operation:realtime:read')?175:110" fixed="right"><template #default="{row}"><div class="subject-row-actions"><el-button link type="primary" :aria-label="`${row.name}详情`" @click="open(row)">详情</el-button><el-button v-if="allowed('operation:realtime:read')" link type="primary" @click="monitor(row)">运行监测</el-button><el-dropdown trigger="click" @command="(value:string)=>command(row,value)"><el-button link type="primary" :aria-label="`${row.name}更多操作`"><MoreHorizontal :size="17"/></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="license">许可信息</el-dropdown-item><el-dropdown-item v-if="canWrite" command="edit">编辑车辆</el-dropdown-item><el-dropdown-item v-if="canWrite" command="status">{{row.status==='ACTIVE'?'停用车辆':'启用车辆'}}</el-dropdown-item><el-dropdown-item v-if="canWrite" command="delete" divided>退出运营</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></template></el-table-column>
  </el-table></div><footer v-if="!error" class="subject-footer"><span>当前显示 {{rows.length}} 条</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" :pager-count="5" layout="total,prev,pager,next" background small/></footer>
</section>
<VehicleDetailDrawer v-model="drawer" :vehicle-id="detailId" :initial-tab="detailTab" @edit="edit"/>
<VehicleEditorDialog v-model="editor" :vehicle="editingVehicle" :options="options" @saved="load"/>
<el-drawer v-model="catalog" title="厂商与车型" :size="catalogWidth" class="subject-drawer subject-catalog" destroy-on-close><el-tabs v-model="catalogTab"><el-tab-pane label="车型目录" name="models"/><el-tab-pane label="厂商目录" name="manufacturers"/></el-tabs><VehicleModelsView v-if="catalogTab==='models'"/><ManufacturersView v-else/></el-drawer>
</section>
</template>
