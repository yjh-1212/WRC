<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CheckCircle2, Clock3, CornerUpLeft, RefreshCw, Search, XCircle } from 'lucide-vue-next';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';
import type { PageData } from '../types';

const session=useSessionStore(),route=useRoute(),rows=ref<any[]>([]),total=ref(0),loading=ref(false),error=ref(''),q=ref(String(route.query.q??'')),tab=ref('PENDING'),page=ref(1),pageSize=20;
const drawer=ref(false),detail=ref<any>(null),detailLoading=ref(false),handleDialog=ref(false),handling=ref(false),activeTask=ref<any>(null),handleForm=reactive({action:'APPROVE',comment:''});let timer:number|undefined;
const canHandle=computed(()=>session.user?.permissions.includes('admission:approval:handle'));
const roles=computed(()=>session.user?.roles.map(item=>item.code)??[]);
const typeLabel=(value:string)=>({ENTERPRISE_ONBOARDING:'企业入驻',ROAD_TEST:'路测申请',LICENSE_RENEWAL:'牌照续期'} as any)[value]??value;
const taskStatus=(value:string)=>({PENDING:'待处理',APPROVED:'已通过',RETURNED:'已退回',REJECTED:'已驳回'} as any)[value]??value;
const dateTime=(value?:string)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—';
const overdue=(row:any)=>row.status==='PENDING'&&new Date(row.dueAt).getTime()<Date.now();
const canHandleRow=(row:any)=>canHandle.value&&row.status==='PENDING'&&(roles.value.includes('SUPER_ADMIN')||roles.value.includes(row.assigneeRoleCode));

async function load(){loading.value=true;error.value='';try{const p=new URLSearchParams({page:String(page.value),pageSize:String(pageSize)});if(q.value)p.set('q',q.value);if(tab.value)p.set('status',tab.value);const data=await api<PageData<any>>(`/admission/tasks?${p}`);rows.value=data.items;total.value=data.total}catch(reason){error.value=reason instanceof Error?reason.message:'审批任务加载失败'}finally{loading.value=false}}
watch(q,()=>{page.value=1;clearTimeout(timer);timer=window.setTimeout(load,180)});watch([tab,page],()=>{page.value=tab.value?1:page.value;load()});onMounted(load);
async function openDetail(row:any){drawer.value=true;detailLoading.value=true;activeTask.value=row;try{detail.value=await api<any>(`/admission/applications/${row.applicationId}`)}catch(reason){ElMessage.error(reason instanceof Error?reason.message:'申请详情加载失败')}finally{detailLoading.value=false}}
function openHandle(row:any,action='APPROVE'){activeTask.value=row;Object.assign(handleForm,{action,comment:''});handleDialog.value=true}
async function handle(){if(['RETURN','REJECT'].includes(handleForm.action)&&!handleForm.comment.trim())return ElMessage.warning('退回或驳回必须填写处理意见');const actionName=handleForm.action==='APPROVE'?'通过':handleForm.action==='RETURN'?'退回补正':'驳回';try{await ElMessageBox.confirm(`确认${actionName}“${activeTask.value.application.title}”？`,'审批确认',{confirmButtonText:`确认${actionName}`,type:handleForm.action==='APPROVE'?'success':'warning'});handling.value=true;await api(`/admission/tasks/${activeTask.value.id}/handle`,{method:'POST',body:JSON.stringify(handleForm)});ElMessage.success(`审批已${actionName}`);handleDialog.value=false;drawer.value=false;await load()}catch(reason){if(reason!=='cancel')ElMessage.error(reason instanceof Error?reason.message:'审批处理失败')}finally{handling.value=false}}
</script>

<template>
  <PageHeader title="许可审批" description="按当前角色处理企业入驻、路测与牌照续期待办。" :count="total"><el-button :icon="RefreshCw" @click="load">刷新</el-button></PageHeader>
  <el-tabs v-model="tab" class="queue-tabs"><el-tab-pane label="待办" name="PENDING"/><el-tab-pane label="全部" name=""/><el-tab-pane label="已通过" name="APPROVED"/><el-tab-pane label="退回补正" name="RETURNED"/><el-tab-pane label="已驳回" name="REJECTED"/></el-tabs>
  <div class="table-toolbar"><el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索任务、申请编号或名称" aria-label="搜索审批任务"/><el-button v-if="q" text @click="q=''">清除搜索</el-button></div>
  <div v-if="error" class="error-state"><strong>审批工作台暂时无法加载</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
  <el-table v-else v-loading="loading" :data="rows" row-key="id" empty-text="当前没有符合条件的审批任务">
    <el-table-column label="审批任务" min-width="280"><template #default="{row}"><button class="table-link" @click="openDetail(row)"><strong>{{row.application.title}}</strong><span>{{row.businessNo}} · {{row.application.businessNo}}</span></button></template></el-table-column>
    <el-table-column label="申请类型" width="120"><template #default="{row}">{{typeLabel(row.application.applicationType)}}</template></el-table-column>
    <el-table-column label="申请企业" min-width="170"><template #default="{row}">{{row.application.enterprise?.name}}</template></el-table-column>
    <el-table-column label="当前节点" min-width="150"><template #default="{row}"><strong>{{row.nodeDefinition.name}}</strong><span class="cell-meta">{{row.assigneeRoleCode}}</span></template></el-table-column>
    <el-table-column label="截止时间" width="175"><template #default="{row}"><span :class="{overdue:overdue(row)}">{{dateTime(row.dueAt)}}</span><span v-if="overdue(row)" class="cell-meta overdue">已逾期</span></template></el-table-column>
    <el-table-column label="状态" width="100"><template #default="{row}"><el-tag size="small" effect="plain" :type="row.status==='PENDING'?'primary':row.status==='APPROVED'?'success':row.status==='REJECTED'?'danger':'warning'">{{taskStatus(row.status)}}</el-tag></template></el-table-column>
    <el-table-column label="操作" width="104"><template #default="{row}"><el-button v-if="canHandleRow(row)" type="primary" link @click="openHandle(row)">处理</el-button><el-button v-else link @click="openDetail(row)">查看</el-button></template></el-table-column>
  </el-table>
  <div class="pagination-row"><span>当前显示 {{rows.length}} / {{total}}</span><el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next"/></div>

  <el-drawer v-model="drawer" size="min(780px,96vw)"><template #header><div class="archive-drawer-title"><div><span>{{activeTask?.businessNo}}</span><h2>{{activeTask?.application.title}}</h2></div><el-tag v-if="activeTask" effect="plain">{{activeTask.nodeDefinition.name}}</el-tag></div></template><div v-loading="detailLoading" v-if="detail"><div class="approval-decision"><div><Clock3 :size="18"/><span>需要完成的决定</span><strong>{{activeTask.nodeDefinition.name}}</strong><p>请依据申请材料给出通过、退回补正或驳回决定。</p></div><div class="decision-actions" v-if="canHandleRow(activeTask)"><el-button :icon="CornerUpLeft" @click="openHandle(activeTask,'RETURN')">退回补正</el-button><el-button type="danger" plain :icon="XCircle" @click="openHandle(activeTask,'REJECT')">驳回</el-button><el-button type="primary" :icon="CheckCircle2" @click="openHandle(activeTask,'APPROVE')">审批通过</el-button></div></div>
    <dl class="detail-grid"><div><dt>申请编号</dt><dd>{{detail.businessNo}}</dd></div><div><dt>申请类型</dt><dd>{{typeLabel(detail.applicationType)}}</dd></div><div><dt>申请企业</dt><dd>{{detail.enterprise?.name}}</dd></div><div><dt>申请人</dt><dd>{{detail.applicantUser?.displayName}}</dd></div><template v-if="detail.applicationType==='ROAD_TEST'"><div><dt>测试车辆</dt><dd>{{detail.vehicles.map((item:any)=>item.vehicle.name).join('、')}}</dd></div><div><dt>测试日期</dt><dd>{{detail.roadTestStartAt?.slice(0,10)}} 至 {{detail.roadTestEndAt?.slice(0,10)}}</dd></div><div class="detail-span-2"><dt>测试路线</dt><dd>{{detail.roadTestRoute}}</dd></div><div class="detail-span-2"><dt>测试计划</dt><dd>{{detail.testPlan}}</dd></div><div class="detail-span-2"><dt>安全措施</dt><dd>{{detail.safetyMeasures}}</dd></div></template><template v-if="detail.applicationType==='LICENSE_RENEWAL'"><div><dt>目标牌照</dt><dd>{{detail.targetLicense?.licenseNo}}</dd></div><div><dt>申请有效期至</dt><dd>{{detail.requestedExpiresAt?.slice(0,10)}}</dd></div><div class="detail-span-2"><dt>续期原因</dt><dd>{{detail.renewalReason}}</dd></div></template><template v-if="detail.applicationType==='ENTERPRISE_ONBOARDING'"><div><dt>法定代表人</dt><dd>{{detail.legalRepresentative}}</dd></div><div><dt>联系人</dt><dd>{{detail.contactName}} · {{detail.contactPhone}}</dd></div><div class="detail-span-2"><dt>运营方案</dt><dd>{{detail.operationPlan}}</dd></div><div class="detail-span-2"><dt>资质说明</dt><dd>{{detail.qualificationSummary}}</dd></div></template></dl>
    <div class="subsection-title"><strong>既往审批记录</strong><span>{{detail.approvalHistories.length}} 条</span></div><el-timeline><el-timeline-item v-for="item in detail.approvalHistories" :key="item.id" :timestamp="`${dateTime(item.createdAt)} · ${item.actorName}`"><strong>{{item.nodeName||'申请流转'}}</strong><p>{{item.comment||item.action}}</p></el-timeline-item></el-timeline>
  </div></el-drawer>
  <el-dialog v-model="handleDialog" title="审批处理" width="600px"><div class="decision-choice"><el-radio-group v-model="handleForm.action"><el-radio-button value="APPROVE">通过</el-radio-button><el-radio-button value="RETURN">退回补正</el-radio-button><el-radio-button value="REJECT">驳回</el-radio-button></el-radio-group></div><el-form-item label="处理意见" :required="handleForm.action!=='APPROVE'"><el-input v-model="handleForm.comment" type="textarea" :rows="5" :placeholder="handleForm.action==='APPROVE'?'可填写审批依据和补充说明':'请明确需要补正的材料或驳回原因'"/></el-form-item><template #footer><el-button @click="handleDialog=false">取消</el-button><el-button type="primary" :loading="handling" @click="handle">确认处理</el-button></template></el-dialog>
</template>
