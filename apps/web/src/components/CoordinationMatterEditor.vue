<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Trash2 } from 'lucide-vue-next';
import { api } from '../api';
import { post, patch } from '../saas';
import { useSessionStore } from '../stores/session';
import { params, useResponsiveDrawer } from '../province-monitoring';
import { clearLocalDraft, defaultChecklist, loadLocalDraft, matterKinds, matterLevels, relatedPermissions, relatedTypes, saveLocalDraft, type InspectionCheck } from '../coordination';
const props=defineProps<{modelValue:boolean;preset:any;workspaces:any[]}>();
const emit=defineEmits<{'update:modelValue':[value:boolean];saved:[row:any]}>();
const session=useSessionStore(), width=useResponsiveDrawer(920), saving=ref(false), restored=ref(false), relatedLoading=ref(false), relatedError=ref(''), relatedOptions=ref<any[]>([]);
const form=reactive({kind:'SUPERVISION',template:'STANDARD',title:'',description:'',level:'MEDIUM',dueAt:null as string|null,basis:'',workspaceIds:[] as string[],leadWorkspaceId:null as string|null,resourceIds:[] as string[],relatedType:null as string|null,relatedId:null as string|null,checklist:[] as InspectionCheck[]});
let baseline='',draftKey='',relatedVersion=0,initializing=false;
const special=computed(()=>form.template==='SPECIAL_INSPECTION');
const selectedCities=computed(()=>props.workspaces.filter(city=>form.workspaceIds.includes(city.id)));
const relationTypes=computed(()=>Object.entries(relatedTypes).filter(([type])=>session.user?.permissions.includes(relatedPermissions[type]!)));
const dirty=computed(()=>JSON.stringify(form)!==baseline);
function close(done?:()=>void){if(saving.value)return;const finish=()=>{emit('update:modelValue',false);done?.();};if(!dirty.value){finish();return;}void ElMessageBox.confirm('未保存的内容会保留在当前浏览器，下次新建或编辑同一事项时可恢复。','关闭事项编辑',{confirmButtonText:'保留并关闭',cancelButtonText:'继续编辑'}).then(finish).catch(()=>{});}
function changeKind(){if(form.kind!=='SUPERVISION')form.template='STANDARD';if(form.kind!=='CROSS_CITY')form.leadWorkspaceId=null;if(form.kind!=='EMERGENCY')form.resourceIds=[];}
function changeTemplate(){if(special.value){form.kind='SUPERVISION';form.resourceIds=[];form.leadWorkspaceId=null;if(!form.checklist.length)form.checklist=defaultChecklist();}}
function changeCities(){if(form.leadWorkspaceId&&!form.workspaceIds.includes(form.leadWorkspaceId))form.leadWorkspaceId=null;form.resourceIds=[];if(form.relatedId){relatedError.value='责任地市已变更，保存时会重新校验关联资料范围';}void searchRelated('');}
async function searchRelated(q:string){const current=++relatedVersion;if(!form.relatedType){relatedOptions.value=[];return;}relatedLoading.value=true;try{const result=await api<any>(`/oversight/related-options?${params({type:form.relatedType,q,workspaceIds:form.workspaceIds.join(',')})}`);if(current===relatedVersion){const selected=relatedOptions.value.find(row=>row.id===form.relatedId)||props.preset?.related;relatedOptions.value=[...(selected&&selected.id===form.relatedId&&!result.items.some((row:any)=>row.id===selected.id)?[selected]:[]),...result.items];relatedError.value='';}}catch(reason){if(current===relatedVersion)relatedError.value=reason instanceof Error?reason.message:'关联资料读取失败';}finally{if(current===relatedVersion)relatedLoading.value=false;}}
function changeRelatedType(){form.relatedId=null;relatedOptions.value=[];relatedError.value='';void searchRelated('');}
function addCheck(){if(form.checklist.length<30)form.checklist.push({id:`check-${Date.now()}-${form.checklist.length}`,label:''});}
async function save(){
  if(saving.value)return;
  const warning=!form.title.trim()||form.title.trim().length<2?'请填写至少2字的事项名称':form.description.trim().length<5?'请填写至少5字的办理要求':!form.workspaceIds.length?'请选择责任地市':form.kind==='CROSS_CITY'&&(form.workspaceIds.length<2||!form.leadWorkspaceId)?'跨市协同需选择至少两个地市并指定牵头市':special.value&&!form.dueAt?'请设置专项排查完成期限':special.value&&(!form.checklist.length||form.checklist.some(row=>row.label.trim().length<2))?'请填写完整检查清单，每项至少2字':form.relatedType&&!form.relatedId?'请选择关联记录，或清空关联资料类型':'';
  if(warning){ElMessage.warning(warning);return;}if(form.dueAt&&Date.parse(form.dueAt)<=Date.now()){ElMessage.warning('办理期限应晚于当前时间');return;}
  saving.value=true;
  try{const body={...form,title:form.title.trim(),description:form.description.trim(),leadWorkspaceId:form.kind==='CROSS_CITY'?form.leadWorkspaceId:null,resourceIds:[],checklist:special.value?form.checklist:[],dueAt:form.dueAt||null};const row=props.preset?.id?await patch<any>(`/oversight/matters/${props.preset.id}`,body):await post<any>('/oversight/matters',body);clearLocalDraft(draftKey);baseline=JSON.stringify(form);emit('update:modelValue',false);emit('saved',row);ElMessage.success('事项草稿已保存，可在详情中确认派发');}
  catch(reason){ElMessage.error(reason instanceof Error?reason.message:'事项保存失败，填写内容已保留');}finally{saving.value=false;}
}
watch(()=>props.modelValue,open=>{if(!open){relatedVersion++;return;}initializing=true;const row=props.preset||{};Object.assign(form,{kind:row.kind||'SUPERVISION',template:row.template||'STANDARD',title:row.title||'',description:row.description||'',level:row.level||'MEDIUM',dueAt:row.dueAt||null,basis:row.basis||'',workspaceIds:[...(row.workspaceIds||row.assignments?.map((a:any)=>a.workspaceId)||[])],leadWorkspaceId:row.leadWorkspaceId||null,resourceIds:[...(row.resourceIds||[])],relatedType:row.relatedType||null,relatedId:row.relatedId||null,checklist:row.checklist?row.checklist.map((item:any)=>({id:item.id,label:item.label})):row.template==='SPECIAL_INSPECTION'?defaultChecklist():[]});baseline=JSON.stringify(form);draftKey=`wrc-coordination-editor:${session.user?.id}:${row.id||`${form.kind}:${form.template}:${form.relatedType||''}:${form.relatedId||''}:${row.basis||''}`}`;const draft=loadLocalDraft(draftKey);restored.value=!!draft;if(draft)Object.assign(form,draft);relatedOptions.value=row.related?[row.related]:[];relatedError.value='';initializing=false;if(form.relatedType)void searchRelated(row.related?.businessNo||'');},{immediate:true});
watch(form,()=>{if(props.modelValue&&!initializing&&draftKey&&dirty.value)saveLocalDraft(draftKey,form);},{deep:true,flush:'sync'});
</script>
<template>
<el-dialog :model-value="modelValue" :width="width" :title="preset?.id?'编辑协同事项':'新建协同事项'" class="coord-editor" :close-on-click-modal="false" :before-close="close" destroy-on-close @update:model-value="emit('update:modelValue',$event)">
  <el-alert v-if="restored" title="已恢复当前浏览器中未保存的填写内容" type="info" :closable="false"/>
  <el-form label-position="top" :disabled="saving">
    <div class="coord-form-grid">
      <el-form-item label="事项类型" required><el-select v-model="form.kind" aria-label="新建事项类型" @change="changeKind"><el-option v-for="(name,key) in matterKinds" :key="key" :value="key" :label="name"/></el-select></el-form-item>
      <el-form-item v-if="form.kind==='SUPERVISION'" label="填报模板"><el-select v-model="form.template" aria-label="填报模板" @change="changeTemplate"><el-option value="STANDARD" label="普通事项"/><el-option value="SPECIAL_INSPECTION" label="专项排查"/></el-select></el-form-item>
      <el-form-item v-else label="事项级别"><el-select v-model="form.level" aria-label="事项级别"><el-option v-for="(name,key) in matterLevels" :key="key" :value="key" :label="name"/></el-select></el-form-item>
      <el-form-item label="事项名称" required class="full"><el-input v-model="form.title" aria-label="事项名称" maxlength="120" show-word-limit placeholder="填写要协调办理的具体事项"/></el-form-item>
      <el-form-item label="责任地市" required class="full"><el-select v-model="form.workspaceIds" aria-label="责任地市选择" multiple filterable placeholder="选择一个或多个承接地市" @change="changeCities"><el-option v-for="city in workspaces" :key="city.id" :value="city.id" :label="city.cityName" :disabled="city.status==='PENDING_ACTIVATION'"/></el-select></el-form-item>
      <el-form-item v-if="form.kind==='CROSS_CITY'" label="牵头地市" required><el-select v-model="form.leadWorkspaceId" aria-label="牵头地市" placeholder="从责任地市中指定牵头市"><el-option v-for="city in selectedCities" :key="city.id" :value="city.id" :label="city.cityName"/></el-select></el-form-item>
      <el-form-item label="完成期限" :required="special"><el-date-picker v-model="form.dueAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" aria-label="完成期限" placeholder="选择办理截止时间"/></el-form-item>
      <el-form-item v-if="form.kind==='SUPERVISION'" label="事项级别"><el-select v-model="form.level" aria-label="事项级别"><el-option v-for="(name,key) in matterLevels" :key="key" :value="key" :label="name"/></el-select></el-form-item>
      <el-form-item label="办理要求" required class="full"><el-input v-model="form.description" aria-label="办理要求" type="textarea" :rows="4" maxlength="4000" show-word-limit placeholder="写清需要核查、办理或整改的内容，以及反馈要求"/></el-form-item>
      <el-form-item label="关联线索类型"><el-select v-model="form.relatedType" aria-label="关联线索类型" clearable placeholder="可选：车辆、告警或事故" @change="changeRelatedType"><el-option v-for="[key,name] in relationTypes" :key="key" :value="key" :label="name"/></el-select></el-form-item>
      <el-form-item v-if="form.relatedType" label="关联记录"><el-select v-model="form.relatedId" aria-label="关联记录" filterable remote :remote-method="searchRelated" :loading="relatedLoading" clearable placeholder="输入编号、名称或车辆编号搜索"><el-option v-for="row in relatedOptions" :key="row.id" :value="row.id" :label="`${row.businessNo||''} · ${row.title||''}`"><div class="coord-related-option"><strong>{{row.businessNo}} · {{row.title}}</strong><small>{{row.cityName}}</small></div></el-option></el-select><span v-if="relatedError" class="coord-field-hint">{{relatedError}}</span></el-form-item>
      <el-form-item label="依据或补充线索" class="full"><el-input v-model="form.basis" aria-label="依据或补充线索" type="textarea" :rows="2" maxlength="2000" placeholder="填写原事项编号、依据或其他核查线索"/></el-form-item>
    </div>
    <section v-if="special" class="coord-checklist-editor"><header><div><h3>统一检查清单</h3><p>各地市逐项填报结果，并提交企业、车辆及整改数量。</p></div><el-button :icon="Plus" :disabled="form.checklist.length>=30" @click="addCheck">添加检查项</el-button></header><div v-for="(item,index) in form.checklist" :key="item.id" class="coord-check-editor-row"><span>{{index+1}}</span><el-input v-model="item.label" :aria-label="`检查项${index+1}`" maxlength="200" placeholder="填写需要核查的内容"/><el-button :icon="Trash2" :aria-label="`删除检查项${index+1}`" @click="form.checklist.splice(index,1)"/></div></section>
    <p class="coord-form-note">保存后生成草稿，确认派发后由责任地市办理。省级可退回补充或复核办结。</p>
  </el-form>
  <template #footer><el-button :disabled="saving" @click="close()">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存草稿</el-button></template>
</el-dialog>
</template>
