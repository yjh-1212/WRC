<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { AlarmClock, ClipboardCheck, RefreshCw, Search, Siren } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';
import type { PageData } from '../types';

const session = useSessionStore();
const route = useRoute();
const loading = ref(false), error = ref(''), rows = ref<any[]>([]), total = ref(0), page = ref(1), q = ref(String(route.query.q ?? '')), status = ref(''), level = ref(''), enterpriseId = ref('');
const drawer = ref(false), detail = ref<any>(null), detailLoading = ref(false);
const options = reactive<any>({ enterprises: [] });
const isEnterprise = computed(() => session.user?.portal === 'ENTERPRISE');
const canRespond = computed(() => session.user?.permissions.includes('safety:emergency:respond'));
const canReview = computed(() => session.user?.permissions.includes('safety:emergency:review'));
let timer: number | undefined;

const statusText = (value: string) => ({ PENDING_DISPATCH: '待派发', WAITING_RESPONSE: '待响应', IN_PROGRESS: '处置中', PENDING_REVIEW: '待复核', CLOSED: '已关闭' } as any)[value] ?? value;
const levelText = (value: string) => ({ LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '重大' } as any)[value] ?? value;
const actionText = (value: string) => ({ CREATE: '创建任务', DISPATCH: '派发任务', RESPOND: '确认响应', SUBMIT_FEEDBACK: '提交反馈', RETURN: '退回处置', CLOSE: '评价关闭' } as any)[value] ?? value;
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const overdue = (row: any) => row.status !== 'CLOSED' && new Date(row.dueAt).getTime() < Date.now();

async function loadOptions() { Object.assign(options, await api<any>('/safety/options')); }
async function load() {
  loading.value = true; error.value = '';
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: '20' });
    for (const [key, value] of Object.entries({ q: q.value, status: status.value, level: level.value, enterpriseId: enterpriseId.value })) if (value) params.set(key, value);
    const data = await api<PageData<any>>(`/safety/emergency-tasks?${params}`); rows.value = data.items; total.value = data.total;
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '应急任务加载失败'; }
  finally { loading.value = false; }
}
watch([q, status, level, enterpriseId], () => { page.value = 1; clearTimeout(timer); timer = window.setTimeout(load, 180); });
watch(page, load); onMounted(() => Promise.all([load(), loadOptions()]));
async function open(row: any) { drawer.value = true; detailLoading.value = true; try { detail.value = await api<any>(`/safety/emergency-tasks/${row.id}`); } finally { detailLoading.value = false; } }
function nextAction(row: any) {
  if (isEnterprise.value && canRespond.value) return row.status === 'WAITING_RESPONSE' ? ['RESPOND', '确认响应'] : row.status === 'IN_PROGRESS' ? ['SUBMIT_FEEDBACK', '提交处置反馈'] : null;
  if (!isEnterprise.value && canReview.value) return row.status === 'PENDING_DISPATCH' ? ['DISPATCH', '派发任务'] : row.status === 'PENDING_REVIEW' ? ['CLOSE', '评价并关闭'] : null;
  return null;
}
async function act(row: any, forced?: 'RETURN') {
  const action = forced ? ['RETURN', '退回继续处置'] : nextAction(row); if (!action) return;
  let comment = ''; let score: number | undefined;
  try {
    comment = (await ElMessageBox.prompt(action[0] === 'SUBMIT_FEEDBACK' ? '填写处置经过、结果与后续措施。' : '填写本次操作意见，内容将进入完整处置日志。', action[1], { inputType: 'textarea', inputValidator: (value: string) => value?.trim() ? true : '请输入处理意见' })).value;
    if (action[0] === 'CLOSE') { const value = await ElMessageBox.prompt('请输入企业本次应急响应评分（1–5）。', '处置评价', { inputPattern: /^[1-5]$/, inputErrorMessage: '请输入 1 至 5 的整数' }); score = Number(value.value); }
  } catch { return; }
  await api(`/safety/emergency-tasks/${row.id}/actions`, { method: 'POST', body: JSON.stringify({ action: action[0], comment, score }) });
  ElMessage.success(`${action[1]}成功`); if (detail.value?.id === row.id) detail.value = await api<any>(`/safety/emergency-tasks/${row.id}`); await load();
}
</script>

<template>
  <PageHeader :title="isEnterprise ? '应急响应' : '应急处置'" :description="isEnterprise ? '响应监管派发任务，反馈现场或远程处置结果。' : '对重大风险分级派发、跟踪响应、复核评价并保留全过程审计。'" :count="total"><el-button :icon="RefreshCw" :loading="loading" @click="load">刷新</el-button></PageHeader>
  <div class="table-toolbar safety-toolbar"><el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索任务编号、标题或告警编号"/><el-select v-model="status" clearable placeholder="全部状态"><el-option v-for="item in ['PENDING_DISPATCH','WAITING_RESPONSE','IN_PROGRESS','PENDING_REVIEW','CLOSED']" :key="item" :label="statusText(item)" :value="item"/></el-select><el-select v-model="level" clearable placeholder="全部等级"><el-option v-for="item in ['CRITICAL','HIGH','MEDIUM','LOW']" :key="item" :label="levelText(item)" :value="item"/></el-select><el-select v-if="!isEnterprise" v-model="enterpriseId" clearable filterable placeholder="全部企业"><el-option v-for="item in options.enterprises" :key="item.id" :label="item.name" :value="item.id"/></el-select></div>
  <div v-if="error" class="error-state"><strong>应急任务暂时无法加载</strong><span>{{ error }}</span><el-button @click="load">重试</el-button></div>
  <template v-else><el-table v-loading="loading" :data="rows" row-key="id" empty-text="暂无符合条件的应急任务" :row-class-name="({row}: any) => overdue(row) ? 'overdue-row' : ''">
    <el-table-column label="处置任务" min-width="270"><template #default="{ row }"><button class="table-link" @click="open(row)"><strong>{{ row.title }}</strong><span>{{ row.businessNo }} · 来源 {{ row.alert.businessNo }}</span></button></template></el-table-column>
    <el-table-column label="等级" width="84"><template #default="{ row }"><span class="risk-level" :class="row.level.toLowerCase()"><i></i>{{ levelText(row.level) }}</span></template></el-table-column>
    <el-table-column label="涉及车辆" min-width="160"><template #default="{ row }"><div class="identity-cell"><strong>{{ row.alert.vehicle?.name || '平台事件' }}</strong><span>{{ row.alert.vehicle?.businessNo || row.alert.alertType }}</span></div></template></el-table-column>
    <el-table-column v-if="!isEnterprise" label="责任企业" min-width="190"><template #default="{ row }">{{ row.enterprise.name }}</template></el-table-column>
    <el-table-column label="责任人 / 方式" min-width="145"><template #default="{ row }"><div class="identity-cell"><strong>{{ row.assigneeUser?.displayName || '待指定' }}</strong><span>{{ row.responseMode === 'FIELD' ? '现场处置' : '远程处置' }}</span></div></template></el-table-column>
    <el-table-column label="处置时限" width="145"><template #default="{ row }"><div class="deadline" :class="{ overdue: overdue(row) }"><AlarmClock :size="14"/>{{ fmt(row.dueAt) }}</div></template></el-table-column>
    <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag size="small" :type="row.status === 'CLOSED' ? 'success' : overdue(row) ? 'danger' : row.status === 'PENDING_REVIEW' ? 'warning' : 'primary'">{{ statusText(row.status) }}</el-tag></template></el-table-column>
    <el-table-column label="操作" width="120" fixed="right"><template #default="{ row }"><el-button v-if="nextAction(row)" link type="primary" @click="act(row)">{{ nextAction(row)?.[1] }}</el-button><el-button v-else link @click="open(row)">查看详情</el-button></template></el-table-column>
  </el-table><div class="pagination-row"><span>当前显示 {{ rows.length }} / {{ total }}</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next"/></div></template>

  <el-drawer v-model="drawer" size="780px" destroy-on-close><template #header><div class="archive-drawer-title"><div><span>{{ detail?.businessNo }}</span><h2>应急处置任务</h2></div><el-tag v-if="detail">{{ statusText(detail.status) }}</el-tag></div></template><div v-loading="detailLoading"><template v-if="detail"><div class="case-hero" :class="detail.level.toLowerCase()"><Siren :size="23"/><div><span>{{ levelText(detail.level) }}级响应 · {{ detail.responseMode === 'FIELD' ? '现场处置' : '远程处置' }}</span><strong>{{ detail.title }}</strong><small>处置时限 {{ fmt(detail.dueAt) }}</small></div></div><dl class="detail-grid"><div><dt>来源告警</dt><dd>{{ detail.alert.businessNo }} · {{ detail.alert.title }}</dd></div><div><dt>责任企业</dt><dd>{{ detail.enterprise.name }}</dd></div><div><dt>处置责任人</dt><dd>{{ detail.assigneeUser?.displayName || '待指定' }}</dd></div><div><dt>响应时间</dt><dd>{{ fmt(detail.respondedAt) }}</dd></div><div class="detail-span-2"><dt>处置要求</dt><dd>{{ detail.requirement }}</dd></div><div class="detail-span-2"><dt>企业反馈</dt><dd>{{ detail.feedback || '尚未提交' }}</dd></div><div class="detail-span-2"><dt>监管评价</dt><dd>{{ detail.evaluation ? `${detail.evaluationScore || '—'} 分 · ${detail.evaluation}` : detail.reviewComment || '尚未评价' }}</dd></div></dl><section class="case-timeline"><header><ClipboardCheck :size="16"/><strong>全过程处置日志</strong></header><ol><li v-for="log in detail.logs" :key="log.id"><i></i><div><strong>{{ actionText(log.action) }} · {{ log.actorName }}</strong><span>{{ fmt(log.createdAt) }} · {{ statusText(log.fromStatus || '') }} → {{ statusText(log.toStatus || '') }}</span><p>{{ log.content }}</p></div></li></ol></section><div class="drawer-actions"><el-button v-if="!isEnterprise && canReview && detail.status === 'PENDING_REVIEW'" @click="act(detail, 'RETURN')">退回继续处置</el-button><el-button v-if="nextAction(detail)" type="primary" @click="act(detail)">{{ nextAction(detail)?.[1] }}</el-button></div></template></div></el-drawer>
</template>
