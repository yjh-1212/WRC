<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, RefreshCw, Search } from 'lucide-vue-next';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const rows = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const q = ref('');
const dialog = ref(false);
const saving = ref(false);
const form = reactive({ code: '', name: '', parentId: '' });
const isSuperAdmin = computed(() => Boolean(session.user?.roles.some((role) => role.code === 'SUPER_ADMIN')));
const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase();
  if (!keyword) return rows.value;
  return rows.value.filter((row) => [row.name, row.code].some((value) => String(value).toLowerCase().includes(keyword)));
});
function parentName(row: any) {
  return rows.value.find((item) => item.id === row.parentId)?.name ?? '—';
}

async function load() {
  loading.value = true; error.value = '';
  try { rows.value = await api('/system/organizations'); }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '组织机构加载失败'; }
  finally { loading.value = false; }
}
function openCreate() {
  Object.assign(form, { code: '', name: '', parentId: '' });
  dialog.value = true;
}
async function create() {
  if (!form.code.trim() || !form.name.trim()) return ElMessage.warning('请填写机构编码和名称');
  saving.value = true;
  try {
    await api('/system/organizations', { method: 'POST', body: JSON.stringify({ code: form.code.trim(), name: form.name.trim(), parentId: form.parentId || undefined }) });
    ElMessage.success('组织机构已创建');
    dialog.value = false;
    await load();
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : '创建失败');
  } finally { saving.value = false; }
}
onMounted(load);
</script>

<template>
  <PageHeader title="组织机构" description="监管部门层级决定监管账号的基础数据范围。新增机构仅超级管理员可操作。" :count="filtered.length">
    <el-button :icon="RefreshCw" :loading="loading" @click="load">刷新</el-button>
    <el-button v-if="isSuperAdmin" type="primary" :icon="Plus" @click="openCreate">新增机构</el-button>
  </PageHeader>
  <div class="table-toolbar">
    <el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索机构名称或编码" aria-label="搜索机构" />
    <el-button v-if="q" text @click="q = ''">清除筛选</el-button>
  </div>
  <div v-if="error" class="error-state"><strong>组织机构暂时无法加载</strong><span>{{ error }}</span><el-button @click="load">重试</el-button></div>
  <el-table v-else v-loading="loading" :data="filtered" row-key="id" empty-text="没有符合条件的组织机构">
    <el-table-column label="机构名称" min-width="220" prop="name" />
    <el-table-column label="机构编码" min-width="160" prop="code" />
    <el-table-column label="上级机构" min-width="200"><template #default="{ row }">{{ parentName(row) }}</template></el-table-column>
    <el-table-column label="状态" width="100">
      <template #default="{ row }"><span class="status-mark active"><i></i>{{ row.status === 'ACTIVE' ? '正常' : '停用' }}</span></template>
    </el-table-column>
  </el-table>
  <el-dialog v-model="dialog" title="新增机构" width="520" destroy-on-close>
    <p class="dialog-note">新机构会进入监管层级，后续创建的监管账号可以挂到该机构并继承数据范围。</p>
    <el-form label-position="top">
      <div class="form-grid">
        <el-form-item label="机构编码" required><el-input v-model="form.code" input-id="org-code" placeholder="如 XSJT" /></el-form-item>
        <el-form-item label="机构名称" required><el-input v-model="form.name" input-id="org-name" placeholder="如 萧山区交通运输局" /></el-form-item>
      </div>
      <el-form-item label="上级机构">
        <el-select v-model="form.parentId" clearable filterable placeholder="不选则为市级或顶级机构" aria-label="上级机构">
          <el-option v-for="item in rows" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="create">创建机构</el-button>
    </template>
  </el-dialog>
</template>
