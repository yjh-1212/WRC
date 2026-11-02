<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { useResponsiveDrawer } from '../province-monitoring';
import { subjectDate as date, subjectError, subjectStatus as statusText } from '../subject-management';
const props=withDefaults(defineProps<{modelValue:boolean;vehicleId:string;initialTab?:string}>(),{initialTab:'basic'});
const emit=defineEmits<{'update:modelValue':[boolean];edit:[any]}>();
const visible=computed({get:()=>props.modelValue,set:(v:boolean)=>emit('update:modelValue',v)}),session=useSessionStore(),router=useRouter(),width=useResponsiveDrawer(900);
const allowed=(code:string)=>session.user?.permissions.includes(code)??false;
const detail=ref<any>(null),loading=ref(false),error=ref(''),active=ref('basic');let generation=0,recordsGeneration=0;
const records=ref<any>({items:[],total:0}),recordPage=ref(1),recordLoading=ref(false),recordError=ref('');
async function load(){const request=++generation;recordsGeneration++;detail.value=null;loading.value=true;error.value='';active.value=props.initialTab;
  try{const result=await api<any>(`/archives/vehicles/${props.vehicleId}`);if(request!==generation)return;detail.value=result;if(active.value==='records')await loadRecords()}catch(e){if(request===generation)error.value=subjectError(e)}finally{if(request===generation)loading.value=false}}
async function loadRecords(){if(!detail.value||!allowed('operation:record:read'))return;const request=++recordsGeneration;recordLoading.value=true;recordError.value='';try{const result=await api<any>(`/operations/records?vehicleId=${detail.value.id}&page=${recordPage.value}&pageSize=10`);if(request===recordsGeneration)records.value=result}catch(e){if(request===recordsGeneration)recordError.value=subjectError(e)}finally{if(request===recordsGeneration)recordLoading.value=false}}
function permits(){visible.value=false;router.push({path:'/admission/licenses',query:{q:detail.value.businessNo}})}
function monitor(){visible.value=false;router.push({path:'/operations/realtime',query:{vehicleId:detail.value.id}})}
watch(()=>[props.modelValue,props.vehicleId] as const,()=>{if(props.modelValue&&props.vehicleId){recordPage.value=1;load()}else{generation++;recordsGeneration++}},{immediate:true});
watch(active,()=>{if(active.value==='records'&&!loading.value)loadRecords()});
const history=computed(()=>!detail.value?[]:[
  ...(detail.value.archive?.registeredAt?[{at:detail.value.archive.registeredAt,text:'车辆完成监管建档'}]:[]),
  ...(detail.value.serviceStartDate?[{at:detail.value.serviceStartDate,text:'登记投运日期'}]:[]),
  ...detail.value.licenses.map((item:any)=>({at:item.issuedAt,text:`签发许可 ${item.licenseNo}`})),
  ...(detail.value.archive?.exitedAt?[{at:detail.value.archive.exitedAt,text:'车辆退出运营'}]:[]),
].sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()));
</script>
<template>
<el-drawer v-model="visible" title="车辆详情" :size="width" class="subject-drawer" destroy-on-close>
  <div v-if="error" class="subject-error" role="alert"><strong>车辆详情加载失败</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div><el-skeleton v-else-if="loading" :rows="8" animated/>
  <template v-else-if="detail"><div class="subject-detail-title"><div><h2>{{detail.name}}</h2><p>{{detail.unifiedCode||detail.businessNo}}</p></div><span class="subject-state" :class="{online:detail.onlineStatus==='ONLINE'}"><i/>{{detail.onlineStatus==='ONLINE'?'在线':'离线'}}</span></div>
  <el-tabs v-model="active">
    <el-tab-pane label="基础档案" name="basic"><dl class="subject-detail-grid"><div><dt>车辆编号</dt><dd>{{detail.businessNo}}</dd></div><div><dt>统一编码</dt><dd>{{detail.unifiedCode||'—'}}</dd></div><div><dt>VIN</dt><dd>{{detail.vin}}</dd></div><div><dt>设备编号</dt><dd>{{detail.deviceNo}}</dd></div><div class="wide"><dt>所属企业</dt><dd>{{detail.enterprise.name}}</dd></div><div><dt>生产厂商</dt><dd>{{detail.model.manufacturer.name}}</dd></div><div><dt>车型</dt><dd>{{detail.model.name}} · {{detail.model.modelCode}}</dd></div><div><dt>车辆用途</dt><dd>{{({DELIVERY:'配送',SANITATION:'环卫',PATROL:'巡逻',RETAIL:'零售',SHUTTLE:'接驳'} as any)[detail.vehicleType]||detail.vehicleType}}</dd></div><div><dt>档案状态</dt><dd>{{detail.status==='ACTIVE'?'运营中':'已停用'}}</dd></div><div><dt>监管机构</dt><dd>{{detail.organization.name}}</dd></div><div><dt>档案编号</dt><dd>{{detail.archive?.archiveNo||'—'}}</dd></div><div><dt>车身颜色</dt><dd>{{detail.color||'—'}}</dd></div><div><dt>生产日期</dt><dd>{{date(detail.manufactureDate)}}</dd></div><div><dt>投运日期</dt><dd>{{date(detail.serviceStartDate)}}</dd></div><div><dt>自动驾驶等级</dt><dd>{{detail.model.autonomyLevel}}</dd></div><div><dt>最高车速</dt><dd>{{detail.model.maxSpeed}} km/h</dd></div><div><dt>额定续航</dt><dd>{{detail.model.ratedRange}} km</dd></div><div><dt>额定载重</dt><dd>{{detail.model.loadCapacity}} kg</dd></div><div><dt>外形尺寸</dt><dd>{{detail.model.dimensions||'—'}}</dd></div></dl></el-tab-pane>
    <el-tab-pane :label="`许可信息 ${detail.licenses.length}`" name="licenses"><el-table :data="detail.licenses" empty-text="该车辆暂无通行许可"><el-table-column label="许可编号" min-width="170"><template #default="{row}"><div class="subject-identity"><strong>{{row.licenseNo}}</strong><span>{{row.businessNo}}</span></div></template></el-table-column><el-table-column label="签发日期" min-width="115"><template #default="{row}">{{date(row.issuedAt)}}</template></el-table-column><el-table-column label="有效期至" min-width="115"><template #default="{row}">{{date(row.expiresAt)}}</template></el-table-column><el-table-column label="状态" width="95"><template #default="{row}"><el-tag :type="['VALID','EXPIRING'].includes(row.status)?'success':'info'">{{statusText(row.status)}}</el-tag></template></el-table-column></el-table><el-button v-if="allowed('admission:license:read')" style="margin-top:18px" @click="permits">前往许可办理 →</el-button></el-tab-pane>
    <el-tab-pane v-if="allowed('operation:record:read')" label="运行记录" name="records"><div v-if="recordError" class="subject-inline-error" role="alert">{{recordError}}<el-button text @click="loadRecords">重试</el-button></div><el-table v-else v-loading="recordLoading" :data="records.items" empty-text="该车辆暂无运行记录"><el-table-column prop="businessNo" label="运行编号" min-width="160"/><el-table-column label="开始日期" min-width="115"><template #default="{row}">{{date(row.startedAt)}}</template></el-table-column><el-table-column label="里程" min-width="100"><template #default="{row}">{{row.mileage ?? '—'}} km</template></el-table-column><el-table-column label="状态" width="90"><template #default="{row}">{{({RUNNING:'运行中',COMPLETED:'已完成',INTERRUPTED:'已中断'} as any)[row.status]||row.status}}</template></el-table-column></el-table><el-pagination v-if="records.total" v-model:current-page="recordPage" :total="records.total" :page-size="10" layout="total,prev,pager,next" small @current-change="loadRecords"/></el-tab-pane>
    <el-tab-pane label="变更记录" name="history"><h3 class="subject-detail-section">建档与许可记录</h3><el-timeline v-if="history.length"><el-timeline-item v-for="(item,index) in history" :key="index" :timestamp="date(item.at)">{{item.text}}</el-timeline-item></el-timeline><el-empty v-else description="暂无记录" :image-size="70"/></el-tab-pane>
  </el-tabs></template>
  <template #footer><el-button @click="visible=false">关闭</el-button><el-button v-if="detail&&allowed('operation:realtime:read')" @click="monitor">运行监测</el-button><el-button v-if="detail&&allowed('archive:vehicle:write')" type="primary" @click="visible=false;emit('edit',detail)">编辑车辆</el-button></template>
</el-drawer>
</template>
