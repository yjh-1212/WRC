<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-vue-next';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const loading = ref(false);
const error = ref('');
const roles = ref<any[]>([]);
const permissions = ref<any[]>([]);
const q = ref('');
const portal = ref('');
const grantDialog = ref(false);
const createDialog = ref(false);
const active = ref<any>(null);
const checked = ref<string[]>([]);
const saving = ref(false);
const form = reactive({ code: '', name: '', portal: 'REGULATORY', description: '' });
const isSuperAdmin = computed(() => Boolean(session.user?.roles.some((role) => role.code === 'SUPER_ADMIN')));
const filtered = computed(() => roles.value.filter((row) => {
  const keyword = q.value.trim().toLowerCase();
  const matched = !keyword || [row.name, row.code, row.description].some((value) => String(value ?? '').toLowerCase().includes(keyword));
  return matched && (!portal.value || row.portal === portal.value);
}));
function canGrant(row: any) {
  if (row.code === 'SUPER_ADMIN') return false;
  if (row.portal === 'ENTERPRISE') return isSuperAdmin.value;
  return true;
}

async function load() {
  loading.value = true; error.value = '';
  try {
    [roles.value, permissions.value] = await Promise.all([api<any[]>('/system/roles'), api<any[]>('/system/permissions')]);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '角色列表加载失败';
  } finally { loading.value = false; }
}
function openGrant(row: any) {
  active.value = row;
  checked.value = row.permissions.map((item: any) => item.permission.id);
  grantDialog.value = true;
}
async function saveGrant() {
  saving.value = true;
  try {
    await api(`/system/roles/${active.value.id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissionIds: checked.value }) });
    ElMessage.success('角色权限已更新，相关用户重新登录后生效');
    grantDialog.value = false;
    await load();
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : '保存失败');
  } finally { saving.value = false; }
}
function openCreate() {
  Object.assign(form, { code: '', name: '', portal: 'REGULATORY', description: '' });
  createDialog.value = true;
}
async function create() {
  if (!form.code.trim() || !form.name.trim()) return ElMessage.warning('请填写角色编码和名称');
  saving.value = true;
  try {
    await api('/system/roles', { method: 'POST', body: JSON.stringify({ code: form.code.trim(), name: form.name.trim(), portal: form.portal, description: form.description.trim() || undefined }) });
    ElMessage.success('角色已创建，可继续为其授权');
    createDialog.value = false;
    await load();
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : '创建失败');
  } finally { saving.value = false; }
}
onMounted(load);
</script>

<template>
  <PageHeader title="角色管理" description="监管端查看全平台岗位。企业角色只读；新增和给企业角色授权仅超级管理员可操作。" :count="filtered.length">
    <el-button :icon="RefreshCw" :loading="loading" @click="load">刷新</el-button>
    <el-button v-if="isSuperAdmin" type="primary" :icon="Plus" @click="openCreate">新增角色</el-button>
  </PageHeader>
  <div class="table-toolbar">
    <el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索角色名称或编码" aria-label="搜索角色" />
    <el-select v-model="portal" clearable placeholder="全部门户" aria-label="所属门户">
      <el-option label="监管端" value="REGULATORY" />
      <el-option label="企业端" value="ENTERPRISE" />
    </el-select>
    <el-button v-if="q || portal" text @click="q = ''; portal = ''">清除筛选</el-button>
  </div>
  <div v-if="error" class="error-state"><strong>角色列表暂时无法加载</strong><span>{{ error }}</span><el-button @click="load">重试</el-button></div>
  <el-table v-else v-loading="loading" :data="filtered" empty-text="没有符合条件的角色">
    <el-table-column label="角色" min-width="220">
      <template #default="{ row }">
        <div class="identity-cell"><strong>{{ row.name }}</strong><span>{{ row.code }}</span></div>
      </template>
    </el-table-column>
    <el-table-column label="门户" width="110">
      <template #default="{ row }">{{ row.portal === 'REGULATORY' ? '监管端' : '企业端' }}</template>
    </el-table-column>
    <el-table-column label="用户数" width="100"><template #default="{ row }">{{ row._count.users }}</template></el-table-column>
    <el-table-column label="权限数" width="100"><template #default="{ row }">{{ row.permissions.length }}</template></el-table-column>
    <el-table-column label="状态" width="100"><template #default="{ row }"><span class="status-mark active"><i></i>正常</span></template></el-table-column>
    <el-table-column label="" width="110" align="right">
      <template #default="{ row }">
        <el-button text :icon="SlidersHorizontal" :disabled="!canGrant(row)" @click="openGrant(row)">授权</el-button>
      </template>
    </el-table-column>
  </el-table>
  <el-dialog v-model="createDialog" title="新增角色" width="520" destroy-on-close>
    <p class="dialog-note">新增后不会自动带权限。企业角色仍只能由超级管理员授权，企业端不能自己改权限。</p>
    <el-form label-position="top">
      <div class="form-grid">
        <el-form-item label="角色编码" required><el-input v-model="form.code" input-id="role-code" placeholder="如 DISTRICT_INSPECTOR" /></el-form-item>
        <el-form-item label="角色名称" required><el-input v-model="form.name" input-id="role-name" placeholder="如 区县巡查员" /></el-form-item>
      </div>
      <el-form-item label="所属门户" required>
        <el-select v-model="form.portal" aria-label="所属门户">
          <el-option label="监管端" value="REGULATORY" />
          <el-option label="企业端" value="ENTERPRISE" />
        </el-select>
      </el-form-item>
      <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createDialog = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="create">创建角色</el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="grantDialog" :title="`配置权限 · ${active?.name ?? ''}`" width="600">
    <p class="dialog-note">勾选后会替换该角色的现有权限；在线会话不会被静默提升。</p>
    <el-checkbox-group v-model="checked" class="permission-grid">
      <el-checkbox v-for="permission in permissions" :key="permission.id" :value="permission.id">
        <div><strong>{{ permission.name }}</strong><span>{{ permission.code }}</span></div>
      </el-checkbox>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="grantDialog = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveGrant">保存权限</el-button>
    </template>
  </el-dialog>
</template>
