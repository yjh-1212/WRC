<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { KeyRound, MoreHorizontal, Plus, RefreshCw, Search, UserRound } from 'lucide-vue-next';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';
import { useCollectionMotion } from '../useDashboardMotion';
import type { PageData, Role } from '../types';

interface AccountRow {
  id: string; username: string; displayName: string; email?: string | null; phone?: string | null;
  status: string; lastLoginAt?: string | null; createdAt: string;
  roles: Array<{ role: Role }>;
}

const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const root = ref<HTMLElement | null>(null);
const loading = ref(false);
const error = ref('');
const rows = ref<AccountRow[]>([]);
const total = ref(0);
const selected = ref<AccountRow[]>([]);
const roles = ref<Array<Role & { description?: string }>>([]);
const q = ref(String(route.query.q ?? ''));
const status = ref(String(route.query.status ?? ''));
const page = ref(1);
const sort = ref(String(route.query.sort ?? 'createdAt'));
const order = ref(String(route.query.order ?? 'desc'));
const dialog = ref(false);
const passwordDialog = ref(false);
const saving = ref(false);
const editingId = ref('');
const passwordTarget = ref<AccountRow | null>(null);
const form = reactive({ username: '', password: 'Wrc@2026!', displayName: '', email: '', phone: '', roleIds: [] as string[] });
const passwordForm = reactive({ password: '' });
let timer: number | undefined;

const canCreate = computed(() => Boolean(session.user?.permissions.includes('system:user:create')));
const canUpdate = computed(() => Boolean(session.user?.permissions.includes('system:user:update')));
const selfId = computed(() => session.user?.id ?? '');
const filtered = computed(() => Boolean(q.value || status.value));
const hasLoaded = ref(false);
const motionReady = computed(() => hasLoaded.value && !error.value);
const emptyText = computed(() => (filtered.value ? '没有符合条件的账号，试试缩短关键词或清除筛选' : '还没有本企业账号，先新增一个登录账号'));

useCollectionMotion(root, motionReady);

function isSelf(row: AccountRow) { return row.id === selfId.value; }
function roleNames(row: AccountRow) { return row.roles.map((item) => item.role.name).join('、') || '未分配角色'; }
function fmtLogin(value?: string | null) {
  if (!value) return '从未登录';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function loadOptions() {
  const data = await api<{ roles: Array<Role & { description?: string }> }>('/system/users/options');
  roles.value = data.roles;
}

async function load() {
  loading.value = true; error.value = '';
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: '20', sort: sort.value, order: order.value });
    if (q.value) params.set('q', q.value);
    if (status.value) params.set('status', status.value);
    const data = await api<PageData<AccountRow>>(`/system/users?${params}`);
    rows.value = data.items; total.value = data.total;
    await router.replace({ query: Object.fromEntries([...params.entries()].filter(([key]) => !['page', 'pageSize'].includes(key))) });
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '账号列表加载失败';
  } finally { loading.value = false; hasLoaded.value = true; }
}

watch([q, status, sort, order], () => { page.value = 1; clearTimeout(timer); timer = window.setTimeout(load, 180); });
watch(page, load);
onMounted(() => Promise.all([load(), loadOptions()]));

function onSort({ prop, order: next }: { prop?: string; order: string | null }) {
  if (!next || !prop) { sort.value = 'createdAt'; order.value = 'desc'; return; }
  sort.value = prop;
  order.value = next === 'ascending' ? 'asc' : 'desc';
}

function clearFilters() { q.value = ''; status.value = ''; }

function openCreate() {
  editingId.value = '';
  Object.assign(form, { username: '', password: 'Wrc@2026!', displayName: '', email: '', phone: '', roleIds: roles.value.filter((item) => item.code === 'ENTERPRISE_USER').map((item) => item.id) });
  dialog.value = true;
}

function openEdit(row: AccountRow) {
  editingId.value = row.id;
  Object.assign(form, { username: row.username, password: '', displayName: row.displayName, email: row.email ?? '', phone: row.phone ?? '', roleIds: row.roles.map((item) => item.role.id) });
  dialog.value = true;
}

async function save() {
  if (!editingId.value && (!form.username.trim() || !form.password || !form.displayName.trim())) return ElMessage.warning('请填写登录账号、初始密码和显示姓名');
  if (editingId.value && !form.displayName.trim()) return ElMessage.warning('请填写显示姓名');
  if (!form.roleIds.length) return ElMessage.warning('请至少选择一个岗位角色');
  saving.value = true;
  try {
    if (editingId.value) {
      await api(`/system/users/${editingId.value}`, { method: 'PATCH', body: JSON.stringify({ displayName: form.displayName.trim(), email: form.email || undefined, phone: form.phone || undefined, roleIds: form.roleIds }) });
      ElMessage.success('账号信息已保存');
    } else {
      await api('/system/users', { method: 'POST', body: JSON.stringify({ username: form.username.trim(), password: form.password, displayName: form.displayName.trim(), email: form.email || undefined, phone: form.phone || undefined, portal: 'ENTERPRISE', roleIds: form.roleIds }) });
      ElMessage.success('账号已创建');
    }
    dialog.value = false;
    await load();
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : '保存失败');
  } finally { saving.value = false; }
}

async function setStatus(targets: AccountRow[], statusValue: string) {
  const actionable = statusValue === 'INACTIVE' ? targets.filter((row) => !isSelf(row)) : targets;
  if (!actionable.length) return ElMessage.warning(statusValue === 'INACTIVE' ? '不能停用当前登录账号' : '没有可操作的账号');
  if (statusValue === 'INACTIVE' && actionable.length !== targets.length) ElMessage.warning('已跳过当前登录账号');
  try {
    await Promise.all(actionable.map((row) => api(`/system/users/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: statusValue }) })));
    ElMessage.success(statusValue === 'ACTIVE' ? `已启用 ${actionable.length} 个账号` : `已停用 ${actionable.length} 个账号`);
    selected.value = [];
    await load();
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : '状态更新失败');
  }
}

async function bulkStatus(statusValue: string) {
  await ElMessageBox.confirm(`确定${statusValue === 'ACTIVE' ? '启用' : '停用'}选中的账号？`, '批量操作', { type: 'warning' });
  await setStatus(selected.value, statusValue);
}

function openPassword(row: AccountRow) {
  passwordTarget.value = row;
  passwordForm.password = '';
  passwordDialog.value = true;
}

async function resetPassword() {
  if (!passwordTarget.value) return;
  if (passwordForm.password.length < 8) return ElMessage.warning('新密码至少 8 位');
  saving.value = true;
  try {
    await api(`/system/users/${passwordTarget.value.id}/password`, { method: 'PATCH', body: JSON.stringify({ password: passwordForm.password }) });
    ElMessage.success(isSelf(passwordTarget.value) ? '密码已重置，请使用新密码重新登录' : '密码已重置，对方需使用新密码登录');
    passwordDialog.value = false;
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : '重置失败');
  } finally { saving.value = false; }
}

function command(row: AccountRow, action: string) {
  if (action === 'edit') openEdit(row);
  if (action === 'password') openPassword(row);
  if (action === 'enable') setStatus([row], 'ACTIVE');
  if (action === 'disable') setStatus([row], 'INACTIVE');
}
</script>

<template>
  <section ref="root" class="accounts-page">
    <PageHeader title="账号管理" description="管理本企业登录账号、岗位角色和启用状态。停用后立即无法登录。" :count="total">
      <el-button :icon="RefreshCw" :loading="loading" @click="load">刷新</el-button>
      <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">新增账号</el-button>
    </PageHeader>
    <div class="table-toolbar">
      <el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索账号、姓名、邮箱或手机" aria-label="搜索账号" />
      <el-select v-model="status" clearable placeholder="全部状态" aria-label="账号状态">
        <el-option label="正常" value="ACTIVE" />
        <el-option label="停用" value="INACTIVE" />
      </el-select>
      <el-button v-if="filtered" text @click="clearFilters">清除筛选</el-button>
    </div>
    <div v-if="selected.length && canUpdate" class="bulk-bar">
      <strong>已选择 {{ selected.length }} 项</strong>
      <el-button size="small" @click="bulkStatus('ACTIVE')">启用</el-button>
      <el-button size="small" @click="bulkStatus('INACTIVE')">停用</el-button>
      <el-button text size="small" @click="selected = []">清除</el-button>
    </div>
    <div v-if="error" class="error-state">
      <strong>账号列表暂时无法加载</strong>
      <span>{{ error }}</span>
      <el-button @click="load">重试</el-button>
    </div>
    <div v-else class="collection-surface">
      <el-table
        v-show="loading || rows.length"
        v-loading="loading"
        :data="rows"
        row-key="id"
        empty-text="暂无符合条件的账号"
        @selection-change="selected = $event"
        @sort-change="onSort"
      >
        <el-table-column v-if="canUpdate" type="selection" width="44" :selectable="(row: AccountRow) => !isSelf(row)" />
        <el-table-column label="账号" min-width="220" prop="displayName" sortable="custom">
          <template #default="{ row }">
            <button class="table-link" type="button" @click="openEdit(row)">
              <strong>{{ row.displayName }}</strong>
              <span>{{ row.username }}{{ isSelf(row) ? ' · 当前登录' : '' }}</span>
            </button>
          </template>
        </el-table-column>
        <el-table-column label="岗位角色" min-width="160">
          <template #default="{ row }">{{ roleNames(row) }}</template>
        </el-table-column>
        <el-table-column label="联系方式" min-width="170">
          <template #default="{ row }">
            <div class="identity-cell">
              <strong>{{ row.phone || '未填手机' }}</strong>
              <span>{{ row.email || '未填邮箱' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最近登录" width="130" prop="lastLoginAt" sortable="custom">
          <template #default="{ row }">{{ fmtLogin(row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" prop="status">
          <template #default="{ row }">
            <span class="status-mark" :class="row.status.toLowerCase()"><i></i>{{ row.status === 'ACTIVE' ? '正常' : '停用' }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="canUpdate" label="" width="58" align="right">
          <template #default="{ row }">
            <el-dropdown trigger="click" @command="(value: string) => command(row, value)">
              <el-button text circle aria-label="账号操作"><MoreHorizontal :size="17" /></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑资料</el-dropdown-item>
                  <el-dropdown-item command="password">重置密码</el-dropdown-item>
                  <el-dropdown-item v-if="row.status !== 'ACTIVE'" command="enable">启用账号</el-dropdown-item>
                  <el-dropdown-item v-else command="disable" :disabled="isSelf(row)">{{ isSelf(row) ? '不能停用自己' : '停用账号' }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!loading && !rows.length" class="empty-state accounts-empty">
        <UserRound :size="28" />
        <strong>{{ filtered ? '没有匹配的账号' : '还没有可管理的账号' }}</strong>
        <span>{{ emptyText }}</span>
        <el-button v-if="filtered" @click="clearFilters">清除筛选</el-button>
        <el-button v-else-if="canCreate" type="primary" @click="openCreate">新增账号</el-button>
      </div>
      <div class="pagination-row"><span>当前显示 {{ rows.length }} / {{ total }}</span><el-pagination v-model:current-page="page" layout="prev, pager, next" :total="total" :page-size="20" /></div>
    </div>
    <el-dialog v-model="dialog" :title="editingId ? '编辑账号' : '新增账号'" width="520" destroy-on-close>
      <p class="dialog-note">账号归属当前企业，不能改到其他企业或监管端。</p>
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="登录账号" required>
            <el-input v-model="form.username" :disabled="Boolean(editingId)" input-id="account-username" autocomplete="off" placeholder="登录名，创建后不可改" />
          </el-form-item>
          <el-form-item label="显示姓名" required>
            <el-input v-model="form.displayName" input-id="account-display-name" placeholder="用于列表和操作记录" />
          </el-form-item>
        </div>
        <el-form-item v-if="!editingId" label="初始密码" required>
          <el-input v-model="form.password" input-id="account-password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="手机">
            <el-input v-model="form.phone" input-id="account-phone" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" input-id="account-email" />
          </el-form-item>
        </div>
        <el-form-item label="岗位角色" required>
          <el-select v-model="form.roleIds" multiple aria-label="岗位角色">
            <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button v-if="canUpdate || (!editingId && canCreate)" type="primary" :loading="saving" @click="save">{{ editingId ? '保存账号' : '创建账号' }}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="passwordDialog" title="重置密码" width="440" destroy-on-close>
      <p class="dialog-note">将立即作废 {{ passwordTarget?.displayName }} 的现有登录会话，对方需使用新密码重新登录。</p>
      <el-form-item label="新密码">
        <el-input v-model="passwordForm.password" type="password" show-password input-id="reset-password" autocomplete="new-password" />
      </el-form-item>
      <template #footer>
        <el-button @click="passwordDialog = false">取消</el-button>
        <el-button type="primary" :icon="KeyRound" :loading="saving" @click="resetPassword">确认重置</el-button>
      </template>
    </el-dialog>
  </section>
</template>
