<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Clock3, RadioTower, RefreshCw, Search, WifiOff } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';
import type { PageData } from '../types';

const session = useSessionStore();
const loading = ref(false), scanning = ref(false), error = ref(''), rows = ref<any[]>([]), total = ref(0), page = ref(1);
const q = ref(''), status = ref(''), enterpriseId = ref('');
const options = reactive<any>({ enterprises: [] });
const summary = reactive({ open: 0, recovered: 0, longestMinutes: 0 });
const isEnterprise = computed(() => session.user?.portal === 'ENTERPRISE');
const canHandle = computed(() => session.user?.permissions.includes('safety:offline:handle'));
let timer: number | undefined;

const statusText = (value: string) => ({ OFFLINE: '离线待核实', INVESTIGATING: '跟进中', RECOVERED: '已恢复' } as any)[value] ?? value;
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const durationText = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60}分` : `${minutes}分钟`;
function liveDuration(row: any) { return row.status === 'RECOVERED' ? row.durationMinutes : Math.max(row.durationMinutes, Math.round((Date.now() - new Date(row.startedAt).getTime()) / 60000)); }

async function loadOptions() { Object.assign(options, await api<any>('/safety/options')); }
async function load() {
  loading.value = true; error.value = '';
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: '20' });
    for (const [key, value] of Object.entries({ q: q.value, status: status.value, enterpriseId: enterpriseId.value })) if (value) params.set(key, value);
    const data = await api<PageData<any> & { summary: typeof summary }>(`/safety/offline-events?${params}`);
    rows.value = data.items; total.value = data.total; Object.assign(summary, data.summary);
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '离线事件加载失败'; }
  finally { loading.value = false; }
}
watch([q, status, enterpriseId], () => { page.value = 1; clearTimeout(timer); timer = window.setTimeout(load, 180); });
watch(page, load);
onMounted(() => Promise.all([load(), loadOptions()]));

async function scan() {
  scanning.value = true;
  try {
    const result = await api<{ scanned: number; created: number }>('/safety/offline-events/scan', { method: 'POST' });
    ElMessage.success(`已检查 ${result.scanned} 辆车，新增 ${result.created} 条离线事件`); await load();
  } catch (reason) { ElMessage.error(reason instanceof Error ? reason.message : '离线扫描失败'); }
  finally { scanning.value = false; }
}
async function act(row: any, action: 'INVESTIGATE' | 'UPDATE_REASON' | 'RECOVER') {
  const title = action === 'INVESTIGATE' ? '开始跟进' : action === 'RECOVER' ? '确认恢复' : '补充离线原因';
  let comment = '';
  try { comment = (await ElMessageBox.prompt('填写核实情况，内容将进入审计记录。', title, { inputType: 'textarea', inputValidator: (value: string) => value?.trim() ? true : '请输入核实情况' })).value; } catch { return; }
  await api(`/safety/offline-events/${row.id}/actions`, { method: 'POST', body: JSON.stringify({ action, comment }) });
  ElMessage.success(`${title}成功`); await load();
}
</script>

<template>
  <PageHeader title="离线监管" description="按车辆心跳识别持续离线，贯通发现、原因核实、跟进与恢复确认。" :count="total">
    <el-button :icon="RefreshCw" :loading="loading" @click="load">刷新</el-button>
    <el-button v-if="canHandle && !isEnterprise" type="primary" :icon="RadioTower" :loading="scanning" @click="scan">立即扫描</el-button>
  </PageHeader>
  <div class="safety-metrics compact-metrics">
    <button @click="status = 'OFFLINE'"><WifiOff :size="17"/><span>离线待核实</span><strong>{{ summary.open }}</strong><small>需要确认原因与责任人</small></button>
    <button @click="status = 'RECOVERED'"><span>已恢复</span><strong>{{ summary.recovered }}</strong><small>保留恢复与补传记录</small></button>
    <button><Clock3 :size="17"/><span>当前最长离线</span><strong>{{ durationText(summary.longestMinutes) }}</strong><small>按当前结果集动态计算</small></button>
  </div>
  <div class="table-toolbar safety-toolbar">
    <el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索事件编号、车辆或企业"/>
    <el-select v-model="status" clearable placeholder="全部状态"><el-option v-for="item in ['OFFLINE','INVESTIGATING','RECOVERED']" :key="item" :label="statusText(item)" :value="item"/></el-select>
    <el-select v-if="!isEnterprise" v-model="enterpriseId" clearable filterable placeholder="全部企业"><el-option v-for="item in options.enterprises" :key="item.id" :label="item.name" :value="item.id"/></el-select>
  </div>
  <div v-if="error" class="error-state"><strong>离线监管暂时无法加载</strong><span>{{ error }}</span><el-button @click="load">重试</el-button></div>
  <template v-else>
    <el-table v-loading="loading" :data="rows" row-key="id" empty-text="暂无符合条件的离线事件">
      <el-table-column label="离线车辆" min-width="220"><template #default="{ row }"><div class="table-link static"><strong>{{ row.vehicle.name }}</strong><span>{{ row.vehicle.businessNo }} · {{ row.businessNo }}</span></div></template></el-table-column>
      <el-table-column v-if="!isEnterprise" label="所属企业 / 机构" min-width="210"><template #default="{ row }"><div class="identity-cell"><strong>{{ row.enterprise.name }}</strong><span>{{ row.organization.name }}</span></div></template></el-table-column>
      <el-table-column label="离线开始" width="145"><template #default="{ row }">{{ fmt(row.startedAt) }}</template></el-table-column>
      <el-table-column label="持续时长" width="120"><template #default="{ row }"><strong class="duration-value">{{ durationText(liveDuration(row)) }}</strong></template></el-table-column>
      <el-table-column label="原因 / 恢复说明" min-width="250"><template #default="{ row }"><div class="identity-cell"><strong>{{ row.reason || '等待企业或监管核实' }}</strong><span>{{ row.recoveryNote || `关联告警 ${row.alert.businessNo}` }}</span></div></template></el-table-column>
      <el-table-column label="状态" width="112"><template #default="{ row }"><el-tag size="small" :type="row.status === 'RECOVERED' ? 'success' : row.status === 'INVESTIGATING' ? 'warning' : 'danger'">{{ statusText(row.status) }}</el-tag></template></el-table-column>
      <el-table-column v-if="canHandle" label="操作" width="170" fixed="right"><template #default="{ row }"><el-button v-if="row.status === 'OFFLINE'" link type="primary" @click="act(row, 'INVESTIGATE')">开始跟进</el-button><el-button v-if="row.status !== 'RECOVERED'" link @click="act(row, 'UPDATE_REASON')">补充原因</el-button><el-button v-if="row.status === 'INVESTIGATING'" link type="success" @click="act(row, 'RECOVER')">确认恢复</el-button></template></el-table-column>
    </el-table>
    <div class="pagination-row"><span>当前显示 {{ rows.length }} / {{ total }}</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next"/></div>
  </template>
</template>
