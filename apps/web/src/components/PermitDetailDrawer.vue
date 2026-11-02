<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import { admissionDate, admissionTime, permitStates, permitTypes, stateTone, saveBlob } from '../admission';
import { subjectError } from '../subject-management';
import { useResponsiveDrawer } from '../province-monitoring';
import OperationsMap from './OperationsMap.vue';
const props=defineProps<{modelValue:boolean;licenseId:string}>(),emit=defineEmits<{'update:modelValue':[value:boolean]}>();
const open=computed({get:()=>props.modelValue,set:value=>emit('update:modelValue',value)}),width=useResponsiveDrawer(900),detail=ref<any>(null),loading=ref(false),error=ref(''),tab=ref('conditions');let generation=0;
const regions=computed(()=>detail.value?.conditions.regions?.filter((r:any)=>r.polygon?.length>=3).map((r:any)=>({...r,status:'ACTIVE',approvalStatus:'APPROVED',vehicles:[],organization:{name:''},enterprise:detail.value.enterprise,_count:{records:0}}))??[]);
const historyLabel:Record<string,string>={ISSUE:'许可签发',SUSPEND:'暂停许可',RESUME:'恢复许可',REVOKE:'撤销许可',CANCEL:'注销许可',EXIT:'退出注销',LICENSE_CHANGE:'许可变更',LICENSE_RENEWAL:'许可续期',UPGRADE_TO_DEMONSTRATION:'转入示范应用'};
async function load(){if(!open.value||!props.licenseId)return;const request=++generation;loading.value=true;error.value='';detail.value=null;try{const item=await api(`/admission/licenses/${props.licenseId}`);if(request===generation)detail.value=item}catch(e){if(request===generation)error.value=subjectError(e)}finally{if(request===generation)loading.value=false}}
watch(()=>[props.modelValue,props.licenseId],()=>{if(open.value){tab.value='conditions';load()}else generation++},{immediate:true});onBeforeUnmount(()=>generation++);
function download(){const d=detail.value,escape=(v:unknown)=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));const fields=[['许可编号',d.licenseNo],['业务编号',d.businessNo],['许可类型',permitTypes[d.licenseType]],['所属企业',d.enterprise.name],['车辆',d.vehicle.name],['车辆编码',d.vehicle.unifiedCode||d.vehicle.businessNo],['通行区域',d.conditions.regions?.map((r:any)=>r.name).join('、')||'历史许可未记录'],['允许时段',d.conditions.allowedHours||'未记录'],['区域限速',d.conditions.speedLimit?d.conditions.speedLimit+' km/h':'未记录'],['签发日期',admissionDate(d.issuedAt)],['有效期至',admissionDate(d.expiresAt)],['当前状态',permitStates[d.status]],['版本',d.version]];
  const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>通行许可信息单</title><style>body{font:15px/1.8 "Microsoft YaHei",sans-serif;color:#243750;max-width:800px;margin:40px auto}h1{font-size:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #dce3ec;padding:12px;text-align:left}th{width:140px;background:#f5f7fb}p{font-size:12px;color:#7c8da6}</style><h1>通行许可信息单</h1><table>'+fields.map(([label,value])=>'<tr><th>'+escape(label)+'</th><td>'+escape(value)+'</td></tr>').join('')+'</table><p>本信息单为平台记录导出，签发依据以原审批文书为准。导出时间：'+escape(admissionTime(new Date().toISOString()))+'</p></html>';
  saveBlob(new Blob([html],{type:'text/html;charset=utf-8'}),d.licenseNo+'-通行许可信息单.html');ElMessage.success('许可信息单已下载');
}
</script>
<template>
<el-drawer v-model="open" title="通行许可详情" :size="width" class="subject-drawer" destroy-on-close>
  <div v-if="error" class="subject-error" role="alert"><strong>许可详情加载失败</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div><el-skeleton v-else-if="loading" :rows="9" animated/>
  <template v-else-if="detail"><div class="subject-detail-title"><div><h2>{{detail.licenseNo}}</h2><p>{{detail.businessNo}} · 版本 {{detail.version}}</p></div><el-tag :type="stateTone(detail.status)">{{permitStates[detail.status]}}</el-tag></div>
    <dl class="subject-detail-grid"><div><dt>所属企业</dt><dd>{{detail.enterprise.name}}</dd></div><div><dt>车辆</dt><dd>{{detail.vehicle.name}}</dd></div><div><dt>车辆统一编码</dt><dd>{{detail.vehicle.unifiedCode||detail.vehicle.businessNo}}</dd></div><div><dt>许可类型</dt><dd>{{permitTypes[detail.licenseType]||'历史许可'}}</dd></div><div><dt>签发日期</dt><dd>{{admissionDate(detail.issuedAt)}}</dd></div><div><dt>有效期至</dt><dd>{{admissionDate(detail.expiresAt)}}</dd></div><div class="wide"><dt>审批来源</dt><dd>{{detail.approvalResults?.map((r:any)=>r.application.businessNo).join('、')||'历史许可'}}</dd></div></dl>
    <el-tabs v-model="tab"><el-tab-pane label="通行条件" name="conditions"/><el-tab-pane label="变更及处理记录" name="history"/></el-tabs>
    <template v-if="tab==='conditions'"><div v-if="regions.length" class="admission-map"><OperationsMap :key="licenseId" mode="regions" :regions="regions" height="100%"/></div><el-empty v-else description="历史许可尚未记录通行范围" :image-size="64"/><dl class="subject-detail-grid"><div class="wide"><dt>批准的通行区域</dt><dd>{{detail.conditions.regions?.map((r:any)=>r.name).join('、')||'未记录'}}</dd></div><div><dt>允许时段</dt><dd>{{detail.conditions.allowedHours||'未记录'}}</dd></div><div><dt>区域限速</dt><dd>{{detail.conditions.speedLimit?detail.conditions.speedLimit+' km/h':'未记录'}}</dd></div><div v-if="detail.remark" class="wide"><dt>备注</dt><dd>{{detail.remark}}</dd></div></dl><p v-if="regions.length" class="subject-detail-caption">{{detail.conditionsSource==='ISSUED_SNAPSHOT'?'地图显示本许可签发时记录的批准范围。':'历史许可未保存签发时范围快照；地图展示当前关联的有效通行范围，签发依据以原审批文书为准。'}}</p></template>
    <template v-else><el-empty v-if="!detail.history.length" description="暂无可追溯的处理记录" :image-size="64"/><el-timeline v-else class="admission-timeline"><el-timeline-item v-for="(item,index) in [...detail.history].reverse()" :key="index" :timestamp="admissionTime(item.at)" placement="top"><strong>{{historyLabel[item.action]||item.action}} · {{item.actor}}</strong><p>{{item.reason||item.applicationNo||'业务签发'}}</p><p v-if="item.snapshot" class="admission-history-before">变更前：版本 {{item.snapshot.version}} · 有效期至 {{admissionDate(item.snapshot.expiresAt)}} · {{permitStates[item.snapshot.status]}}</p></el-timeline-item></el-timeline></template>
  </template>
  <template #footer><el-button @click="open=false">关闭</el-button><el-button v-if="detail" type="primary" @click="download">下载许可信息单</el-button></template>
</el-drawer>
</template>
