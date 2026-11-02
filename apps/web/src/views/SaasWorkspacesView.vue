<script setup lang="ts">
import CityOpeningDialog from '../components/CityOpeningDialog.vue';
import CityOpeningMap from '../components/CityOpeningMap.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Building2, ChevronDown, Clock3, Plus, Search, ShieldCheck, Truck } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { activationUrl, dateText, errorText, moduleNames, patch, post, statusText } from '../saas';
import '../saas.css';
import '../city-management.css';
const session=useSessionStore();const canManage=computed(()=>session.user?.permissions.includes('system:organization:update')??false);
const opening = ref(false);
const initialCityCode = ref('');
interface Workspace { id: string; cityCode: string; cityName: string; organizationName?: string; status: string; modules: string[]; validUntil?: string | null; quotas?: { vehicles?: number }; usage?: { vehicles?: number }; administrators?: Array<{ displayName?: string; username: string }>; }
interface CityOption { code: string; name: string; opened: boolean }
const allRows=ref<Workspace[]>([]);const cities=ref<CityOption[]>([]);const loaded=ref(false);const loading=ref(false);const saving=ref(false);const page=ref(1);const q=ref('');const status=ref('');const error=ref('');const dialog=ref(false);const selected=ref<any>(null);const invitation=ref<any>(null);const edit=reactive({status:'ACTIVE',modules:[] as string[],validUntil:'',vehicleQuota:1000,reason:'',username:'',displayName:''});const inviteDialog=ref(false);const inviteMode=ref<'invitations'|'recover-admin'>('invitations');
// The complete provincial catalog feeds both the overview and filtering; filtering never changes the provincial totals.
const filteredRows = computed(() => allRows.value.filter(row => (!q.value.trim() || `${row.cityName} ${row.cityCode}`.includes(q.value.trim())) && (!status.value || row.status === status.value)));
const total = computed(() => filteredRows.value.length);
const rows = computed(() => filteredRows.value.slice((page.value - 1) * 10, page.value * 10));
const unopened = computed(() => cities.value.filter(city => !city.opened));
const openedCount = computed(() => cities.value.filter(city => city.opened).length);
const vehicleCount = computed(() => allRows.value.reduce((sum, row) => sum + (row.usage?.vehicles ?? 0), 0));
const percentage = computed(() => cities.value.length ? openedCount.value / cities.value.length * 100 : 0);
const overviewReady = computed(() => loaded.value && !error.value);
const metrics = computed(() => [
  { label: '全省地市', value: cities.value.length, unit: '个', icon: Building2, tone: 'blue' },
  { label: '已开通', value: openedCount.value, unit: '个', icon: ShieldCheck, tone: 'green' },
  { label: '待开通', value: unopened.value.length, unit: '个', icon: Clock3, tone: 'blue' },
  { label: '接入车辆', value: vehicleCount.value, unit: '辆', icon: Truck, tone: 'blue' },
]);
async function load(){
  loading.value=true; error.value='';
  try {
    const [catalog, workspaces] = await Promise.all([
      api<{ cities: CityOption[] }>('/saas/workspaces/options'),
      (async () => {
        const items: Workspace[] = [];
        for (let current = 1; ; current++) {
          const result = await api<{ items: Workspace[]; total: number }>(`/saas/workspaces?page=${current}&pageSize=100`);
          items.push(...result.items);
          if (items.length >= result.total || !result.items.length) return items;
        }
      })(),
    ]);
    cities.value=catalog.cities; allRows.value=workspaces; loaded.value=true;
    page.value=Math.max(1,Math.min(page.value,Math.ceil(total.value/10)));
  } catch(e){error.value=errorText(e)}finally{loading.value=false}
}
function search(){page.value=1}
function openCity(code = '') { if (!canManage.value) return; initialCityCode.value=code; opening.value=true; }
function authorizationDate(value: string) { return new Date(value).toLocaleDateString('sv-SE'); }
function open(row:any){selected.value=row;Object.assign(edit,{status:row.status,modules:[...(row.modules??[])],validUntil:row.validUntil??'',vehicleQuota:row.quotas?.vehicles??1000,reason:'',username:'',displayName:''});dialog.value=true}
async function save(){if(!edit.reason.trim())return ElMessage.warning('请填写变更原因');saving.value=true;try{await patch(`/saas/workspaces/${selected.value.id}`,{status:edit.status==='PENDING_ACTIVATION'?undefined:edit.status,modules:edit.modules,validUntil:edit.validUntil||null,quotas:{...selected.value.quotas,vehicles:edit.vehicleQuota},reason:edit.reason});dialog.value=false;ElMessage.success('城市授权已更新');await load()}catch(e){ElMessage.error(errorText(e))}finally{saving.value=false}}
function openInvite(row:any,mode:'invitations'|'recover-admin'){selected.value=row;inviteMode.value=mode;invitation.value=null;Object.assign(edit,{username:'',displayName:'',reason:''});inviteDialog.value=true}
async function invite(){if(!edit.username.trim()||!edit.displayName.trim())return ElMessage.warning('请填写管理员账号和姓名');if(inviteMode.value==='recover-admin'&&!edit.reason.trim())return ElMessage.warning('请填写身份核验与恢复原因');saving.value=true;try{invitation.value=await post(`/saas/workspaces/${selected.value.id}/${inviteMode.value}`,{username:edit.username,displayName:edit.displayName,roleCode:'CITY_ADMIN',reason:edit.reason||undefined});ElMessage.success('激活邀请已生成');await load()}catch(e){ElMessage.error(errorText(e))}finally{saving.value=false}}
async function copy(){try{await navigator.clipboard.writeText(activationUrl(invitation.value));ElMessage.success('链接已复制')}catch{ElMessage.warning('请手动复制下方链接')}}
onMounted(load);

function resetQueryFilters() {
  q.value = '';
  status.value = '';
  page.value = 1;
  search();
}
</script>
<template>
<div class="saas-page city-management-page">
  <h1 class="sr-only">地市管理</h1>
  <section class="city-metrics" aria-label="全省地市接入概况" :aria-busy="loading">
    <div v-for="metric in metrics" :key="metric.label" class="city-metric">
      <div><span class="city-metric-label">{{ metric.label }}<i v-if="metric.tone === 'green'" /></span><div class="city-metric-value"><strong>{{ overviewReady ? metric.value.toLocaleString('zh-CN') : '—' }}</strong><span>{{ metric.unit }}</span></div></div>
      <span class="city-metric-icon" :class="metric.tone"><component :is="metric.icon" :size="23" :stroke-width="1.8" /></span>
    </div>
  </section>

  <section class="city-list city-card" aria-labelledby="city-list-title">
    <header class="city-list-header">
      <h2 id="city-list-title">已开通城市 <span v-if="overviewReady" class="city-count">{{ total }}</span></h2>
      <form class="city-list-tools" role="search" aria-label="城市筛选" @submit.prevent="search">
        <el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索城市或编码" aria-label="搜索城市" @input="search" @clear="search" />
        <el-select v-model="status" clearable placeholder="全部状态" aria-label="城市状态" @change="search"><el-option v-for="s in ['ACTIVE','PENDING_ACTIVATION','SUSPENDED']" :key="s" :label="statusText(s)" :value="s" /></el-select>
        <el-button @click="resetQueryFilters">重置</el-button>
        <el-button v-if="canManage" type="primary" :icon="Plus" :disabled="!overviewReady" @click="openCity()">开通城市</el-button>
      </form>
    </header>
    <div v-if="error" class="saas-error" role="alert"><span>{{ error }}</span><el-button @click="load">重试</el-button></div>
    <el-table v-else v-loading="loading" :data="rows" row-key="id" class="city-table" empty-text="没有符合条件的城市">
      <el-table-column label="城市 / 行政区划编码" min-width="175"><template #default="{ row }"><div class="city-identity"><strong>{{ row.cityName }}</strong><span>{{ row.cityCode }}</span></div></template></el-table-column>
      <el-table-column prop="organizationName" label="管理单位" min-width="190"><template #default="{ row }">{{ row.organizationName || '—' }}</template></el-table-column>
      <el-table-column label="已开通模块" min-width="295"><template #default="{ row }"><div class="city-module-tags"><span v-for="code in row.modules" :key="code">{{ moduleNames[code] ?? code }}</span><span v-if="!row.modules.length" class="city-muted">暂无授权模块</span></div></template></el-table-column>
      <el-table-column label="接入车辆" min-width="115"><template #default="{ row }"><span class="city-vehicle-count"><strong>{{ row.usage?.vehicles?.toLocaleString('zh-CN') ?? '—' }}</strong><small>辆</small></span></template></el-table-column>
      <el-table-column label="管理员" min-width="165"><template #default="{ row }"><span class="city-admin-names">{{ (row.administrators ?? []).map((a: any) => a.displayName || a.username).join('、') || '待激活' }}</span></template></el-table-column>
      <el-table-column label="授权状态 / 有效期" min-width="180"><template #default="{ row }"><div class="city-authorization"><el-tag :type="row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'warning' : 'info'" effect="light">{{ statusText(row.status) }}</el-tag><span>{{ row.validUntil ? `至 ${authorizationDate(row.validUntil)}` : '长期有效' }}</span></div></template></el-table-column>
      <el-table-column v-if="canManage" label="操作" width="140" fixed="right"><template #default="{ row }"><div class="city-row-actions"><el-button link type="primary" @click="open(row)">调整授权</el-button><el-dropdown trigger="click"><el-button link type="primary" :aria-label="`${row.cityName}管理员管理`">管理员管理 <ChevronDown :size="13" /></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item @click="openInvite(row, 'invitations')">邀请管理员</el-dropdown-item><el-dropdown-item @click="openInvite(row, 'recover-admin')">恢复管理员</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></template></el-table-column>
    </el-table>
    <footer v-if="!error" class="city-list-footer"><span>授权与管理员操作集中管理</span><el-pagination v-if="total" v-model:current-page="page" :total="total" :page-size="10" layout="total, prev, pager, next" background small /><span v-else-if="overviewReady">共 0 条</span></footer>
  </section>

  <section v-if="overviewReady" class="city-opening-bottom" aria-label="地市开通概况与快捷入口">
    <section class="city-card city-coverage" aria-labelledby="city-coverage-title">
      <h2 id="city-coverage-title">全省开通概况</h2>
      <div class="city-coverage-body"><CityOpeningMap :cities="cities" /><div class="city-coverage-summary"><span class="city-muted">地市已开通</span><div class="city-coverage-ratio"><strong>{{ openedCount }}</strong><span>/ {{ cities.length }}</span></div><div class="city-coverage-progress"><el-progress :percentage="percentage" :show-text="false" :stroke-width="8" /><span>{{ Number(percentage.toFixed(2)) }}%</span></div><div class="city-coverage-legend"><span><i />已开通 <b>{{ openedCount }}</b></span><span><i />待开通 <b>{{ unopened.length }}</b></span></div></div></div>
    </section>
    <section class="city-card city-unopened" aria-labelledby="city-unopened-title">
      <header><h2 id="city-unopened-title">待开通城市 <span class="city-count">{{ unopened.length }}</span></h2><span v-if="canManage" class="city-muted">选择城市可发起开通 →</span></header>
      <div v-if="unopened.length" class="city-unopened-grid"><button v-for="city in unopened" :key="city.code" type="button" :disabled="!canManage" :aria-label="canManage ? `开通${city.name}` : `${city.name}待开通`" @click="openCity(city.code)"><span>{{ city.name }}</span><Plus v-if="canManage" :size="15" /></button></div>
      <el-empty v-else description="全省地市均已开通" :image-size="70" />
    </section>
  </section>
  <CityOpeningDialog v-model="opening" :initial-city-code="initialCityCode" @opened="page = 1; load()" />
<el-dialog v-model="dialog" :title="`${selected?.cityName??''} · 调整授权`" width="650" destroy-on-close><el-form label-position="top"><div class="saas-grid"><el-form-item label="工作空间状态"><el-select v-model="edit.status"><el-option label="待激活" value="PENDING_ACTIVATION" disabled/><el-option label="已开通" value="ACTIVE"/><el-option label="已暂停" value="SUSPENDED"/></el-select></el-form-item><el-form-item label="授权有效期"><el-date-picker v-model="edit.validUntil" type="date" value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]" placeholder="长期有效"/></el-form-item></div><el-form-item label="已开通模块"><el-checkbox-group v-model="edit.modules"><el-checkbox v-for="(name,code) in moduleNames" :key="code" :value="code">{{name}}</el-checkbox></el-checkbox-group></el-form-item><el-form-item label="车辆配额"><el-input-number v-model="edit.vehicleQuota" :min="1" :max="1000000"/></el-form-item><el-form-item label="变更原因" required><el-input v-model="edit.reason" type="textarea" :rows="3" maxlength="2000"/></el-form-item><el-alert title="授权变更会影响该城市的业务访问。历史数据继续保留，必要安全处置按平台策略保障。" type="info" :closable="false"/></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存授权</el-button></template></el-dialog>
<el-dialog v-model="inviteDialog" :title="`${selected?.cityName??''} · ${inviteMode==='recover-admin'?'恢复管理员':'邀请管理员'}`" width="600" destroy-on-close><el-form v-if="!invitation" label-position="top"><el-form-item label="管理员账号" required><el-input v-model="edit.username" maxlength="40"/></el-form-item><el-form-item label="管理员姓名" required><el-input v-model="edit.displayName" maxlength="50"/></el-form-item><el-form-item v-if="inviteMode==='recover-admin'" label="身份核验及恢复原因" required><el-input v-model="edit.reason" type="textarea" :rows="3" maxlength="2000"/></el-form-item><p class="saas-subtle">邀请生成后，由授权管理者将激活链接交付给指定负责人。</p></el-form><div v-else class="saas-credential-box"><strong>管理员激活邀请已生成</strong><p>有效期至 {{dateText(invitation.expiresAt)}}。重新邀请会使旧链接失效。</p><div class="saas-secret">{{activationUrl(invitation)}}</div><el-button style="margin-top:12px" @click="copy">复制激活链接</el-button></div><template #footer><el-button @click="inviteDialog=false">关闭</el-button><el-button v-if="!invitation" type="primary" :loading="saving" @click="invite">生成激活邀请</el-button></template></el-dialog></div></template>
