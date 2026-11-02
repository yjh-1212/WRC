<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Download } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import AnalyticsChart from '../components/AnalyticsChart.vue';
import CityAnalyticsDrawer from '../components/CityAnalyticsDrawer.vue';
import { chartBase, cityApi, day, err, monthRange, nf, notifyDownload, p, text, time, tone, useCityQuery, vehicleTypes } from '../city-analytics';
import '../city-analytics.css';
const route=useRoute(),session=useSessionStore();
const safety=computed(()=>route.path.endsWith('/safety')),title=computed(()=>safety.value?'安全分析':'运行分析');
const c=useCityQuery({...monthRange(),enterpriseId:'',vehicleType:'',manufacturerId:'',eventType:'',queue:'',confirmation:'',sort:'',order:''});
const data=ref<any>(),options=ref<any>({enterprises:[],manufacturers:[]}),error=ref(''),optionsError=ref(''),loading=ref(false),metric=ref('mileage'),rate=ref(false);
const detail=ref<any>(),detailError=ref(''),detailLoading=ref(false),detailPage=ref(1),record=ref<any>();let generation=0,detailGeneration=0;
const mode=computed(()=>safety.value?'safety':'operations');
const listRows=computed(()=>(data.value?.enterprises??[]).slice((c.page.value-1)*c.pageSize.value,c.page.value*c.pageSize.value));
const visible=computed({get:()=>!!c.id.value,set:(v:boolean)=>{if(!v)void c.close();}});
const metricInfo=computed(()=>({mileage:{name:'运行里程',unit:'km'},durationHours:{name:'运行时长',unit:'h'},trips:{name:'运行记录',unit:'条'}}[metric.value]??{name:'运行里程',unit:'km'}));
const trend=computed(()=>{
 const rows=data.value?.trend??[],info=metricInfo.value;
 return {...chartBase,grid:{left:55,right:26,top:30,bottom:58},tooltip:{trigger:'axis',valueFormatter:(v:any)=>nf(v)},xAxis:{...chartBase.xAxis,data:rows.map((x:any)=>x.date.slice(5).replace('-','/'))},
 yAxis:{...chartBase.yAxis,name:safety.value?'事件数（起）':`${info.name}（${info.unit}）`,min:0,minInterval:safety.value||metric.value==='trips'?1:undefined},
 series:[{name:safety.value?'已登记事件':info.name,type:'line',smooth:false,connectNulls:false,showSymbol:true,showAllSymbol:true,symbol:'circle',symbolSize:7,data:rows.map((x:any)=>safety.value?x.total:x.reported?x[metric.value]:null),itemStyle:{color:'#327cff'},lineStyle:{width:2},areaStyle:{color:'rgba(50,124,255,.1)'}}]};
});
const distribution=computed(()=>{
 const rows=safety.value?data.value?.types??[]:data.value?.districts??[];
 return {...chartBase,tooltip:{trigger:'axis'},grid:{left:90,right:55,top:28,bottom:54},xAxis:{type:'value',name:safety.value?'事件数（起）':'运行里程（km）',nameLocation:'middle',nameGap:32,minInterval:safety.value?1:undefined,axisLine:{lineStyle:{color:'#cedbed'}},splitLine:chartBase.yAxis.splitLine},yAxis:{type:'category',inverse:true,data:rows.map((x:any)=>x.name),axisLine:{show:false},axisTick:{show:false}},series:[{type:'bar',barMaxWidth:30,data:rows.map((x:any,i:number)=>({value:safety.value?x.value:x.mileage,itemStyle:{color:safety.value?['#327cff','#ffab43','#9b73ff','#a9b9d0','#f46b75'][i%5]:'#327cff',borderRadius:[0,3,3,0]}})),label:{show:true,position:'right',formatter:(v:any)=>nf(v.value)}}]};
});
async function load(){const n=++generation;loading.value=true;error.value='';try{const value=await api<any>(`${cityApi}/${mode.value}?${c.params()}`);if(n===generation){data.value=value;if(c.page.value>1&&!listRows.value.length)void c.paginate(1);}}catch(e){if(n===generation)error.value=err(e);}finally{if(n===generation)loading.value=false;}}
async function loadOptions(){optionsError.value='';try{options.value=await api(`${cityApi}/options`);}catch(e){optionsError.value=err(e);}}
async function search(){const old=c.queryKey.value;await c.search();if(old===c.queryKey.value)await load();}
async function reset(){metric.value='mileage';rate.value=false;const old=c.queryKey.value;await c.reset();if(old===c.queryKey.value)await load();}
async function loadDetail(){const n=++detailGeneration;record.value=null;detail.value=null;detailError.value='';if(!c.id.value)return;detailLoading.value=true;try{
 const q:any={...c.applied.value,page:detailPage.value,pageSize:10,enterpriseId:c.id.value==='ALL'?c.applied.value.enterpriseId:c.id.value};
 if(route.query.focusDate){q.from=route.query.focusDate;q.to=route.query.focusDate;}if(route.query.focusCategory)q.category=route.query.focusCategory;
 const result=await api(`${cityApi}/${mode.value}/${safety.value?'events':'records'}?${p(q)}`);if(n===detailGeneration)detail.value=result;
 }catch(e){if(n===detailGeneration)detailError.value=err(e);}finally{if(n===detailGeneration)detailLoading.value=false;}}
async function drill(id='ALL',extra:Record<string,string|undefined>={}){detailPage.value=1;await c.open(id,extra);}
async function openRecord(id:string){record.value=null;detailLoading.value=true;detailError.value='';try{record.value=await api(`${cityApi}/operations/records/${id}`);}catch(e){detailError.value=err(e);}finally{detailLoading.value=false;}}
function canEvent(kind:string){return session.user?.permissions.includes(({ALERT:'safety:alert:read',ACCIDENT:'safety:accident:read',VIOLATION:'safety:violation:read',OFFLINE:'safety:offline:read'} as any)[kind]);}
function openEvent(row:any){void c.router.push({path:'/safety/events',query:{eventKind:row.kind,eventId:row.id}});}
function chartClick(value:any){if(value.componentType==='series'){if(value.seriesType==='line'){const point=data.value?.trend[value.dataIndex];if(point)void drill('ALL',{focusDate:point.date});}else if(safety.value){void drill('ALL',{focusCategory:value.name});}}}
// Expose a semantic click contract without rebuilding the ECharts renderer.
const summary=computed(()=>data.value?.kpis);
watch(()=>[route.path,c.queryKey.value],()=>{data.value=undefined;void load();},{immediate:true});
watch(()=>[c.id.value,route.query.focusDate,route.query.focusCategory],()=>{detailPage.value=1;void loadDetail();},{immediate:true});
watch(detailPage,()=>void loadDetail());void loadOptions();
</script>

<template>
 <section class="ca-page ca-analysis" :class="{'ca-has-detail':!!c.id.value}" :style="{'--ca-detail-width':'800px'}" :aria-label="title">
  <QueryPanel :loading="loading" @search="search" @reset="reset">
   <QueryField label="日期范围" wide><el-date-picker v-model="c.range.value" type="daterange" value-format="YYYY-MM-DD" range-separator="—" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="日期范围"/></QueryField>
   <QueryField label="企业"><el-select v-model="c.filters.enterpriseId" clearable filterable placeholder="全部企业" aria-label="企业"><el-option v-for="e in options.enterprises" :key="e.id" :label="e.name" :value="e.id"/></el-select></QueryField>
   <template v-if="!safety"><QueryField label="车辆类型"><el-select v-model="c.filters.vehicleType" clearable placeholder="全部类型" aria-label="车辆类型"><el-option v-for="[key,label] in vehicleTypes" :key="key" :label="label" :value="key"/></el-select></QueryField><QueryField label="厂商"><el-select v-model="c.filters.manufacturerId" clearable placeholder="全部厂商" aria-label="厂商"><el-option v-for="m in options.manufacturers" :key="m.id" :label="m.name" :value="m.id"/></el-select></QueryField></template>
   <template v-else><QueryField label="事件类型"><el-select v-model="c.filters.eventType" clearable placeholder="全部类型" aria-label="事件类型"><el-option v-for="kind in ['ALERT','ACCIDENT','VIOLATION','OFFLINE']" :key="kind" :label="text(kind)" :value="kind"/></el-select></QueryField><QueryField label="处置状态"><el-select v-model="c.filters.queue" clearable placeholder="全部状态" aria-label="处置状态"><el-option v-for="v in ['PENDING','HANDLING','CLOSED']" :key="v" :label="text(v)" :value="v"/></el-select></QueryField></template>
  </QueryPanel>
  <div v-if="optionsError" class="ca-form-error" role="alert">筛选选项加载失败：{{optionsError}} <el-button link type="primary" @click="loadOptions">重试</el-button></div>
  <div v-if="error" class="ca-card ca-error" role="alert"><strong>{{title}}暂时无法加载</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
  <div v-else-if="loading&&!data" class="ca-card ca-loading"><el-skeleton :rows="12" animated/></div>
  <template v-else-if="data">
   <div class="ca-analysis-grid" v-loading="loading">
    <article class="ca-card"><header class="ca-card-title"><h2>{{safety?'安全事件趋势':'运行趋势'}}</h2><div class="ca-tools"><el-button v-if="safety" link type="primary" @click="drill()">查看事件记录 ›</el-button><el-radio-group v-else v-model="metric" size="small" aria-label="趋势指标"><el-radio-button value="mileage">里程</el-radio-button><el-radio-button value="durationHours">时长</el-radio-button><el-radio-button value="trips">运行记录</el-radio-button></el-radio-group></div></header>
     <div v-if="safety" class="ca-inline"><span>事件总数<strong>{{nf(summary.total,0)}}</strong><small>起</small></span><span>已闭环<strong class="green">{{nf(summary.closed,0)}}</strong><small>起</small></span><span>闭环率<strong class="green">{{nf(summary.closureRate)}}</strong><small>%</small></span></div>
     <div v-else class="ca-inline"><span>累计里程<strong>{{nf(summary.mileage)}}</strong><small>km</small></span><span>运行时长<strong>{{nf(summary.durationHours)}}</strong><small>h</small></span><span>运行记录<strong>{{nf(summary.trips,0)}}</strong><small>条</small></span></div>
     <div class="ca-chart"><AnalyticsChart :option="trend" :aria-label="safety?'每日安全事件数量趋势图':'每日运行趋势图'" height="100%" @chart-click="chartClick"/></div>
     <p class="ca-note" v-if="!safety&&data.quality.missingDays">{{data.quality.missingDays}}天没有运行记录，趋势保留缺口；有效记录中的0按0显示。</p><p v-else-if="safety" class="ca-note">同一来源事件按最终类型统计，不重复计数；闭环率为{{summary.closed}} / {{summary.total}}。点击日期可查看记录。</p>
    </article>
    <article class="ca-card"><header class="ca-card-title"><h2>{{safety?'事件类型分布':'辖区运行里程'}}</h2><span v-if="!safety" class="ca-tools ca-muted">{{data.scopeName}}</span></header><div v-if="(safety?data.types:data.districts).length" class="ca-chart"><AnalyticsChart :option="distribution" :aria-label="safety?'安全事件类型分布图':'辖区运行里程分布图'" height="100%" @chart-click="chartClick"/></div><el-empty v-else description="当前条件暂无记录" :image-size="70"/></article>
   </div>
   <article class="ca-card ca-compare"><header class="ca-card-title"><h2>{{safety?'企业安全对比':'企业运行对比'}}</h2><span class="ca-count">{{data.enterprises.length}}</span><el-radio-group v-if="safety" v-model="rate" size="small" aria-label="安全比较指标"><el-radio-button :value="false">事件数量</el-radio-button><el-radio-button :value="true">单位里程事件数</el-radio-button></el-radio-group><div class="ca-tools"><el-button :icon="Download" @click="notifyDownload(`${cityApi}/${mode}/export?${c.params()}`)">导出数据</el-button></div></header>
    <div class="ca-table"><el-table :data="listRows" height="100%" empty-text="当前条件暂无企业记录" @sort-change="(v:any)=>{c.filters.sort=v.prop;c.filters.order=v.order==='ascending'?'asc':'desc';search();}">
     <el-table-column label="运营企业" prop="name" min-width="250" sortable="custom"><template #default="{row}"><el-button link class="ca-company" @click="drill(row.id)">{{row.name}}</el-button></template></el-table-column>
     <template v-if="!safety"><el-table-column label="接入车辆（辆）" prop="vehicles" width="155" align="right"/><el-table-column label="运行记录（条）" prop="trips" width="155" align="right"/><el-table-column label="运行里程（km）" prop="mileage" min-width="155" align="right" sortable="custom"><template #default="{row}">{{nf(row.mileage)}}</template></el-table-column><el-table-column label="运行时长（h）" prop="durationHours" min-width="145" align="right"><template #default="{row}">{{nf(row.durationHours)}}</template></el-table-column></template>
     <template v-else><el-table-column label="事件总数（起）" prop="total" width="155" align="right"/><el-table-column v-if="rate" label="事件数（起/千公里）" min-width="195" align="right"><template #default="{row}">{{nf(row.eventRate,2)}}</template></el-table-column><template v-else><el-table-column label="待核查" prop="pending" width="105" align="right"/><el-table-column label="处置中" prop="handling" width="105" align="right"/><el-table-column label="已闭环" prop="closed" width="105" align="right"/></template><el-table-column label="事故（起）" prop="accidents" width="110" align="right"/></template>
     <el-table-column label="操作" :width="c.narrow.value?110:220" fixed="right"><template #default="{row}"><el-button link type="primary" @click="drill(row.id)">{{safety?'查看事件':'查看明细'}}</el-button></template></el-table-column>
    </el-table></div>
    <footer class="ca-foot"><span>{{safety?'统计周期内发生且纳入筛选的事件；单位里程比较须有有效里程。':'接入车辆按当前档案；运行指标按所选周期。'}} 数据截至{{time(data.computedAt)}}</span><el-pagination :current-page="c.page.value" :page-size="c.pageSize.value" :total="data.enterprises.length" layout="total, prev, pager, next" @current-change="c.paginate"/></footer>
   </article>
  </template>
  <CityAnalyticsDrawer v-model="visible" :title="safety?'事件记录':'企业运行明细'" width="800px">
   <div v-if="detailError" class="ca-error" role="alert"><strong>明细暂时无法加载</strong><span>{{detailError}}</span><el-button @click="loadDetail">重试</el-button></div>
   <div v-else-if="detailLoading" class="ca-loading"><el-skeleton :rows="9" animated/></div>
   <template v-else-if="record"><h2 class="ca-detail-title">{{record.businessNo}}</h2><dl class="ca-detail-meta"><dt>运营企业</dt><dd>{{record.enterprise.name}}</dd><dt>车辆</dt><dd>{{record.vehicle.name}} · {{record.vehicle.businessNo}}</dd><dt>开始时间</dt><dd>{{time(record.startedAt)}}</dd><dt>结束时间</dt><dd>{{time(record.endedAt)}}</dd><dt>运行里程</dt><dd>{{nf(record.mileage)}} km</dd><dt>运行时长</dt><dd>{{nf(record.durationMinutes)}} 分钟</dd><dt>起点</dt><dd>{{record.startAddress||'—'}}</dd><dt>终点</dt><dd>{{record.endAddress||'—'}}</dd><dt>关联区域</dt><dd>{{record.region?.name||'—'}}</dd><dt>轨迹点</dt><dd>{{record._count.trackPoints}} 个</dd></dl><el-button @click="record=null">返回记录列表</el-button></template>
   <template v-else-if="detail"><p class="ca-note">{{c.id.value==='ALL'?'全部筛选企业':options.enterprises.find((e:any)=>e.id===c.id.value)?.name}} · {{route.query.focusDate||`${c.applied.value.from} — ${c.applied.value.to}`}} {{route.query.focusCategory||''}}</p>
    <el-table :data="detail.items" empty-text="当前条件暂无记录"><el-table-column label="记录名称 / 编号" min-width="220"><template #default="{row}"><strong>{{safety?row.title:row.businessNo}}</strong><span class="ca-secondary">{{safety?row.businessNo:row.vehicle?.name}}</span></template></el-table-column><el-table-column :label="safety?'发生时间':'开始时间'" width="175"><template #default="{row}">{{time(safety?row.occurredAt:row.startedAt)}}</template></el-table-column><el-table-column v-if="!safety" label="里程（km）" width="105" align="right"><template #default="{row}">{{nf(row.mileage)}}</template></el-table-column><el-table-column v-else label="状态" width="110"><template #default="{row}"><el-tag :type="tone(row.queue)">{{text(row.queue)}}</el-tag></template></el-table-column><el-table-column label="操作" width="100" fixed="right"><template #default="{row}"><el-button v-if="!safety" link type="primary" @click="openRecord(row.id)">详情</el-button><el-button v-else-if="canEvent(row.kind)" link type="primary" @click="openEvent(row)">查看证据</el-button><span v-else class="ca-muted">需事件权限</span></template></el-table-column></el-table><footer class="ca-foot"><el-pagination v-model:current-page="detailPage" :page-size="10" :total="detail.total" layout="total, prev, pager, next"/></footer>
   </template><template #footer><el-button @click="visible=false">关闭</el-button></template>
  </CityAnalyticsDrawer>
 </section>
</template>
