<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { MoreHorizontal, Plus, RefreshCw, Search } from 'lucide-vue-next';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';
import type { PageData } from '../types';

const route = useRoute(), router = useRouter(), session = useSessionStore();
const rows = ref<any[]>([]), total = ref(0), loading = ref(false), error = ref('');
const selected = ref<any[]>([]), q = ref(String(route.query.q ?? '')), status = ref(String(route.query.status ?? ''));
const sort = ref(String(route.query.sort ?? 'updatedAt')), page = ref(Number(route.query.page ?? 1)), pageSize = 20;
const dialog = ref(false), saving = ref(false), editingId = ref('');
const canWrite = computed(() => session.user?.permissions.includes('archive:manufacturer:write'));
const form = reactive({ businessNo: '', name: '', shortName: '', creditCode: '', contactName: '', contactPhone: '', address: '' });
let timer: number | undefined;

function syncUrl() {
  router.replace({ query: { ...(q.value ? { q: q.value } : {}), ...(status.value ? { status: status.value } : {}), ...(sort.value !== 'updatedAt' ? { sort: sort.value } : {}), ...(page.value > 1 ? { page: String(page.value) } : {}) } });
}
async function load() {
  loading.value = true; error.value = '';
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize), sort: sort.value, order: sort.value === 'name' ? 'asc' : 'desc' });
    if (q.value) params.set('q', q.value); if (status.value) params.set('status', status.value);
    const data = await api<PageData<any>>(`/archives/manufacturers?${params}`);
    rows.value = data.items; total.value = data.total;
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '厂商列表加载失败'; }
  finally { loading.value = false; }
}
watch([q, status, sort], () => { page.value = 1; clearTimeout(timer); timer = window.setTimeout(() => { syncUrl(); load(); }, 180); });
watch(page, () => { syncUrl(); load(); });
onMounted(load);
function openForm(row?: any) {
  editingId.value = row?.id ?? '';
  Object.assign(form, row ? { businessNo: row.businessNo, name: row.name, shortName: row.shortName ?? '', creditCode: row.creditCode ?? '', contactName: row.contactName ?? '', contactPhone: row.contactPhone ?? '', address: row.address ?? '' } : { businessNo: '', name: '', shortName: '', creditCode: '', contactName: '', contactPhone: '', address: '' });
  dialog.value = true;
}
async function save() {
  if (!form.businessNo.trim() || !form.name.trim()) return ElMessage.warning('请填写厂商编号和厂商全称');
  saving.value = true;
  try {
    await api(editingId.value ? `/archives/manufacturers/${editingId.value}` : '/archives/manufacturers', { method: editingId.value ? 'PATCH' : 'POST', body: JSON.stringify(form) });
    ElMessage.success(editingId.value ? '厂商信息已保存' : '厂商已新增'); dialog.value = false; await load();
  } catch (reason) { ElMessage.error(reason instanceof Error ? reason.message : '保存失败'); }
  finally { saving.value = false; }
}
async function setStatus(targets: any[], value: string) {
  await Promise.all(targets.map((row) => api(`/archives/manufacturers/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: value }) })));
  ElMessage.success(`已更新 ${targets.length} 家厂商状态`); selected.value = []; await load();
}
async function remove(targets: any[]) {
  await ElMessageBox.confirm(`确定删除选中的 ${targets.length} 家厂商？仅无关联车型的厂商可删除。`, '删除厂商', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
  try {
    for (const row of targets) await api(`/archives/manufacturers/${row.id}`, { method: 'DELETE' });
    ElMessage.success('厂商已删除'); selected.value = []; await load();
  } catch (reason) { ElMessage.error(reason instanceof Error ? reason.message : '删除失败'); }
}
function command(row: any, action: string) {
  if (action === 'edit') openForm(row);
  if (action === 'enable') setStatus([row], 'ACTIVE');
  if (action === 'disable') setStatus([row], 'INACTIVE');
  if (action === 'delete') remove([row]);
}
</script>

<template>
  <PageHeader title="厂商管理" description="维护无人配送车辆生产厂商及联系人信息。" :count="total">
    <el-button :icon="RefreshCw" @click="load">刷新</el-button>
    <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openForm()">新增厂商</el-button>
  </PageHeader>
  <div class="table-toolbar">
    <el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索名称、编号或信用代码" aria-label="搜索厂商" />
    <el-select v-model="status" clearable placeholder="全部状态" aria-label="厂商状态"><el-option label="正常" value="ACTIVE" /><el-option label="停用" value="INACTIVE" /></el-select>
    <el-select v-model="sort" aria-label="排序方式"><el-option label="最近更新" value="updatedAt" /><el-option label="名称排序" value="name" /><el-option label="最近创建" value="createdAt" /></el-select>
    <el-button v-if="q || status" text @click="q='';status=''">清除筛选</el-button>
  </div>
  <div v-if="selected.length && canWrite" class="bulk-bar"><strong>已选 {{ selected.length }} 项</strong><el-button size="small" @click="setStatus(selected,'ACTIVE')">启用</el-button><el-button size="small" @click="setStatus(selected,'INACTIVE')">停用</el-button><el-button size="small" type="danger" plain @click="remove(selected)">删除</el-button><el-button size="small" text @click="selected=[]">取消选择</el-button></div>
  <div v-if="error" class="error-state"><strong>厂商列表暂时无法加载</strong><span>{{ error }}</span><el-button @click="load">重试</el-button></div>
  <el-table v-else v-loading="loading" :data="rows" row-key="id" empty-text="暂无符合条件的厂商" @selection-change="selected=$event">
    <el-table-column v-if="canWrite" type="selection" width="46" />
    <el-table-column label="厂商" min-width="250"><template #default="{row}"><div class="identity-cell"><strong>{{row.shortName || row.name}}</strong><span>{{row.businessNo}} · {{row.name}}</span></div></template></el-table-column>
    <el-table-column label="统一社会信用代码" prop="creditCode" min-width="190" />
    <el-table-column label="联系人" min-width="150"><template #default="{row}">{{row.contactName || '—'}}<span class="cell-meta">{{row.contactPhone || ''}}</span></template></el-table-column>
    <el-table-column label="车型数" width="90"><template #default="{row}">{{row._count.models}}</template></el-table-column>
    <el-table-column label="状态" width="90"><template #default="{row}"><span class="status-mark" :class="row.status.toLowerCase()"><i></i>{{row.status==='ACTIVE'?'正常':'停用'}}</span></template></el-table-column>
    <el-table-column v-if="canWrite" label="" width="58" align="right"><template #default="{row}"><el-dropdown trigger="click" @command="(value:string)=>command(row,value)"><el-button text circle aria-label="更多厂商操作"><MoreHorizontal :size="17"/></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="edit">编辑</el-dropdown-item><el-dropdown-item :command="row.status==='ACTIVE'?'disable':'enable'">{{row.status==='ACTIVE'?'停用':'启用'}}</el-dropdown-item><el-dropdown-item command="delete" divided>删除</el-dropdown-item></el-dropdown-menu></template></el-dropdown></template></el-table-column>
  </el-table>
  <div class="pagination-row"><span>当前显示 {{rows.length}} / {{total}}</span><el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" /></div>

  <el-dialog v-model="dialog" :title="editingId?'编辑厂商':'新增厂商'" width="620px" destroy-on-close>
    <p class="dialog-note">厂商编号和全称用于监管档案关联，保存后仍可修订。</p>
    <div class="form-grid">
      <el-form-item label="厂商编号" required><el-input v-model="form.businessNo" placeholder="MFR-005" /></el-form-item>
      <el-form-item label="厂商简称"><el-input v-model="form.shortName" placeholder="用于表格快速识别" /></el-form-item>
      <el-form-item label="厂商全称" required class="form-span-2"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="统一社会信用代码"><el-input v-model="form.creditCode" /></el-form-item>
      <el-form-item label="联系人"><el-input v-model="form.contactName" /></el-form-item>
      <el-form-item label="联系电话"><el-input v-model="form.contactPhone" /></el-form-item>
      <el-form-item label="联系地址"><el-input v-model="form.address" /></el-form-item>
    </div>
    <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存厂商</el-button></template>
  </el-dialog>
</template>
