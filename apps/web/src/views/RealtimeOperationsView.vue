<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { BatteryLow, CircleParking, Radio, RefreshCw, Route, Search, Signal, Truck } from 'lucide-vue-next';
import { api } from '../api';
import OperationsMap from '../components/OperationsMap.vue';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';
import type { OperationPoint, OperationRegionItem, PageData } from '../types';

const session=useSessionStore(),router=useRouter(),loading=ref(false),error=ref(''),items=ref<OperationPoint[]>([]),selectedId=ref('');
const regions=ref<OperationRegionItem[]>([]);
const q=ref(''),enterpriseId=ref(''),drivingState=ref(''),status=ref('');
const options=reactive<{enterprises:any[]}>({enterprises:[]});
const summary=reactive({online:0,offline:0,running:0,parked:0,lowBattery:0,stale:0});
const selected=computed(()=>items.value.find(item=>item.id===selectedId.value)??items.value[0]);
const isEnterprise=computed(()=>session.user?.portal==='ENTERPRISE'); let debounce:number|undefined; let refreshTimer:number|undefined;
async function loadOptions(){Object.assign(options,await api<any>('/operations/options'))}
async function loadRegions(){regions.value=(await api<PageData<OperationRegionItem>>('/operations/regions?page=1&pageSize=100&status=ACTIVE')).items}
async function load(silent=false){if(!silent)loading.value=true;error.value='';try{const p=new URLSearchParams();if(q.value)p.set('q',q.value);if(enterpriseId.value)p.set('enterpriseId',enterpriseId.value);if(drivingState.value)p.set('drivingState',drivingState.value);if(status.value)p.set('status',status.value);const data=await api<any>(`/operations/realtime?${p}`);items.value=data.items;Object.assign(summary,data.summary);if(!items.value.some(item=>item.id===selectedId.value))selectedId.value=items.value[0]?.id??''}catch(reason){error.value=reason instanceof Error?reason.message:'实时车辆加载失败'}finally{loading.value=false}}
watch([q,enterpriseId,drivingState,status],()=>{clearTimeout(debounce);debounce=window.setTimeout(()=>load(),180)});
onMounted(async()=>{await Promise.all([load(),loadOptions(),loadRegions()]);refreshTimer=window.setInterval(()=>load(true),30000)});onUnmounted(()=>{clearInterval(refreshTimer);clearTimeout(debounce)});
function age(value?:string){if(!value)return'无上报';const minutes=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/60000));return minutes<1?'刚刚':`${minutes} 分钟前`}
function stateText(value?:string){return({RUNNING:'运行中',IDLE:'临停',PARKED:'停驶',OFFLINE:'离线'}as any)[value??'']??'未知'}
function autonomyText(value?:string){return({AUTO:'自动驾驶',MANUAL:'人工驾驶',REMOTE_TAKEOVER:'远程接管',STANDBY:'待机'}as any)[value??'']??'未知'}
function openTrack(){if(!selected.value)return;router.push({path:isEnterprise.value?'/enterprise/operations/trajectories':'/operations/trajectories',query:{vehicleId:selected.value.id}})}
</script>
<template>
  <PageHeader :title="isEnterprise?'实时车辆':'实时运行'" :description="isEnterprise?'掌握本企业车辆位置、连接与自动驾驶状态。':'从城市运行态势下钻到单车实时状态，地图与列表保持联动。'" :count="items.length"><el-button :icon="RefreshCw" :loading="loading" @click="load()">刷新</el-button></PageHeader>
  <div class="operation-metrics"><div><Radio/><span>当前在线</span><strong>{{summary.online}}</strong><small>离线 {{summary.offline}}</small></div><div><Truck/><span>运行中</span><strong>{{summary.running}}</strong><small>在线停驶 {{summary.parked}}</small></div><div><BatteryLow/><span>低电量</span><strong>{{summary.lowBattery}}</strong><small>低于 25%</small></div><div><Signal/><span>心跳超时</span><strong>{{summary.stale}}</strong><small>超过 10 分钟</small></div></div>
  <div class="table-toolbar operation-toolbar"><el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索车辆、VIN 或设备号" aria-label="搜索实时车辆"/><el-select v-if="!isEnterprise" v-model="enterpriseId" clearable filterable placeholder="全部企业" aria-label="所属企业"><el-option v-for="item in options.enterprises" :key="item.id" :label="item.name" :value="item.id"/></el-select><el-select v-model="drivingState" clearable placeholder="全部运行状态" aria-label="运行状态"><el-option label="运行中" value="RUNNING"/><el-option label="临停" value="IDLE"/><el-option label="停驶" value="PARKED"/><el-option label="离线" value="OFFLINE"/></el-select><el-select v-model="status" clearable placeholder="全部连接状态" aria-label="连接状态"><el-option label="在线" value="ONLINE"/><el-option label="离线" value="OFFLINE"/></el-select></div>
  <div v-if="error" class="error-state"><strong>实时运行数据暂时无法加载</strong><span>{{error}}</span><el-button @click="load()">重试</el-button></div>
  <div v-else class="map-workspace"><OperationsMap :points="items" :selected-id="selectedId" mode="realtime" :regions="regions" @select="selectedId=$event"/><aside class="vehicle-rail"><div class="rail-title"><div><strong>车辆列表</strong><span>30 秒自动刷新</span></div><el-tag size="small" effect="plain">{{items.length}} 辆</el-tag></div><div v-if="!items.length" class="rail-empty">暂无符合条件的车辆</div><button v-for="item in items" :key="item.id" class="vehicle-list-item" :class="{active:selected?.id===item.id}" @click="selectedId=item.id"><span class="vehicle-state" :class="item.onlineStatus.toLowerCase()"></span><span><strong>{{item.name}}</strong><small>{{item.businessNo}} · {{item.enterprise.name}}</small></span><b>{{item.realtimeStatus?.speed??0}}<small>km/h</small></b></button></aside></div>
  <section v-if="selected" class="selected-vehicle-panel"><div class="selected-heading"><div><span class="vehicle-state" :class="selected.onlineStatus.toLowerCase()"></span><div><strong>{{selected.name}}</strong><small>{{selected.businessNo}} · {{selected.model?.name}}</small></div></div><el-button :icon="Route" @click="openTrack">查看轨迹</el-button></div><dl class="selected-data"><div><dt>运行状态</dt><dd>{{stateText(selected.realtimeStatus?.drivingState)}}</dd></div><div><dt>实时速度</dt><dd>{{selected.realtimeStatus?.speed??0}} km/h</dd></div><div><dt>剩余电量</dt><dd>{{selected.realtimeStatus?.battery??'--'}}%</dd></div><div><dt>驾驶模式</dt><dd>{{autonomyText(selected.realtimeStatus?.autonomousState)}}</dd></div><div><dt>信号强度</dt><dd>{{selected.realtimeStatus?.signalStrength??0}}%</dd></div><div><dt>今日里程</dt><dd>{{selected.realtimeStatus?.mileageToday??0}} km</dd></div><div><dt>所属区域</dt><dd>{{selected.regions?.map(r=>r.name).join('、')||'未关联'}}</dd></div><div><dt>最后心跳</dt><dd>{{age(selected.realtimeStatus?.heartbeatAt)}}</dd></div></dl></section>
</template>
