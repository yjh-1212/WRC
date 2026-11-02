<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { api } from '../api';
import { dateText, errorText, moduleNames, post, validPassword } from '../saas';

const props = defineProps<{ modelValue: boolean; initialCityCode?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; opened: [] }>();
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const cities = ref<Array<{ code: string; name: string; opened: boolean }>>([]);
const result = ref<{ workspace: { cityName: string; status: string; validUntil: string | null }; administrator: { username: string; displayName: string } } | null>(null);
const defaults = () => ({ cityCode: '', unitName: '', contactName: '', contactPhone: '', adminName: '', adminUsername: '', password: '', modules: Object.keys(moduleNames), validUntil: '', vehicleQuota: 1000, offlineReference: '' });
const form = reactive(defaults());
const rules: FormRules = {
  cityCode: [{ required: true, message: '请选择开通城市', trigger: 'change' }],
  unitName: [{ required: true, min: 2, message: '请填写管理单位', trigger: 'blur' }],
  contactName: [{ required: true, min: 2, message: '请填写联系人姓名', trigger: 'blur' }],
  contactPhone: [{ required: true, pattern: /^[\d+()\- ]{7,30}$/, message: '请填写有效的联系电话', trigger: 'blur' }],
  adminName: [{ required: true, min: 2, message: '请填写管理员姓名', trigger: 'blur' }],
  adminUsername: [{ required: true, pattern: /^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/, message: '账号以字母开头，使用3至40位字母、数字、点、下划线或短横线', trigger: 'blur' }],
  password: [{ required: true, validator: (_rule, value, callback) => callback(validPassword(value ?? '') ? undefined : new Error('至少8位，包含大小写字母、数字和符号')), trigger: 'blur' }],
  modules: [{ type: 'array', required: true, min: 1, message: '请至少选择一个业务模块', trigger: 'change' }],
};
async function loadOptions() {
  loading.value = true; error.value = '';
  try { cities.value = (await api<{ cities: typeof cities.value }>('/saas/workspaces/options')).cities; }
  catch (reason) { error.value = errorText(reason); }
  finally { loading.value = false; }
}
watch(() => props.modelValue, async opened => {
  if (!opened) return;
  Object.assign(form, defaults()); result.value = null; formRef.value?.clearValidate();
  await loadOptions();
  if (props.initialCityCode && cities.value.some(city => city.code === props.initialCityCode && !city.opened)) {
    form.cityCode = props.initialCityCode;
    selectCity(form.cityCode);
  }
});
function selectCity(code: string) {
  const city = cities.value.find(item => item.code === code);
  if (!form.unitName || cities.value.some(item => form.unitName === `${item.name}交通运输局`)) form.unitName = city ? `${city.name}交通运输局` : '';
  if (!form.adminUsername || /^city_37\d{4}_admin$/.test(form.adminUsername)) form.adminUsername = code ? `city_${code}_admin` : '';
}
async function submit() {
  if (saving.value || !await formRef.value?.validate().catch(() => false)) return;
  saving.value = true; error.value = '';
  try {
    result.value = await post('/saas/workspaces', { ...form, unitName: form.unitName.trim(), contactName: form.contactName.trim(), contactPhone: form.contactPhone.trim(), adminName: form.adminName.trim(), adminUsername: form.adminUsername.trim(), validUntil: form.validUntil || undefined });
    form.password = '';
    emit('opened');
  } catch (reason) { error.value = errorText(reason); }
  finally { saving.value = false; }
}
async function copyAccount() {
  try { await navigator.clipboard.writeText(result.value!.administrator.username); ElMessage.success('管理员账号已复制'); }
  catch { ElMessage.warning('复制未完成，请手动复制账号'); }
}
</script>

<template>
  <el-dialog v-model="visible" :title="result ? '城市已开通' : '开通城市'" width="760px" class="city-opening-dialog" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" @closed="form.password = ''">
    <template v-if="result">
      <el-alert :title="`${result.workspace.cityName}已开通，管理员可直接登录`" type="success" :closable="false" show-icon />
      <el-descriptions :column="2" border class="opening-result">
        <el-descriptions-item label="城市">{{ result.workspace.cityName }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag type="success">已开通</el-tag></el-descriptions-item>
        <el-descriptions-item label="管理员">{{ result.administrator.displayName }}</el-descriptions-item>
        <el-descriptions-item label="登录账号">{{ result.administrator.username }}</el-descriptions-item>
        <el-descriptions-item label="授权有效期" :span="2">{{ result.workspace.validUntil ? dateText(result.workspace.validUntil) : '长期有效' }}</el-descriptions-item>
      </el-descriptions>
      <p class="saas-subtle">将管理员账号和刚设置的初始密码交付给地市负责人，即可通过统一登录入口使用平台。</p>
    </template>
    <template v-else>
      <p class="opening-intro">根据地市线下申请，录入开通信息。保存后城市平台和管理员账号立即生效。</p>
      <div v-if="error" class="saas-error" role="alert"><span>{{ error }}</span><el-button v-if="!cities.length" @click="loadOptions">重试</el-button></div>
      <el-form ref="formRef" v-loading="loading" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
        <div class="saas-grid">
          <el-form-item label="开通城市" prop="cityCode"><el-select v-model="form.cityCode" aria-label="开通城市" filterable placeholder="请选择城市" @change="selectCity"><el-option v-for="city in cities" :key="city.code" :label="`${city.name}${city.opened ? '（已开通）' : ''}`" :value="city.code" :disabled="city.opened" /></el-select></el-form-item>
          <el-form-item label="管理单位" prop="unitName"><el-input v-model="form.unitName" aria-label="管理单位" maxlength="120" /></el-form-item>
          <el-form-item label="联系人" prop="contactName"><el-input v-model="form.contactName" aria-label="联系人" maxlength="40" /></el-form-item>
          <el-form-item label="联系电话" prop="contactPhone"><el-input v-model="form.contactPhone" aria-label="联系电话" maxlength="30" /></el-form-item>
          <el-form-item label="管理员姓名" prop="adminName"><el-input v-model="form.adminName" aria-label="管理员姓名" maxlength="40" /></el-form-item>
          <el-form-item label="管理员账号" prop="adminUsername"><el-input v-model="form.adminUsername" aria-label="管理员账号" autocomplete="off" maxlength="40" /></el-form-item>
          <el-form-item class="wide" label="初始密码" prop="password"><el-input v-model="form.password" aria-label="初始密码" type="password" show-password autocomplete="new-password" maxlength="128" placeholder="至少8位，包含大小写字母、数字和符号" /></el-form-item>
          <el-form-item label="授权有效期"><el-date-picker v-model="form.validUntil" aria-label="授权有效期" type="date" value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]" placeholder="不填则长期有效" /></el-form-item>
          <el-form-item label="车辆配额"><el-input-number v-model="form.vehicleQuota" aria-label="车辆配额" :min="1" :max="1000000" /></el-form-item>
          <el-form-item class="wide" label="开通模块" prop="modules"><el-checkbox-group v-model="form.modules"><el-checkbox v-for="(label, code) in moduleNames" :key="code" :value="code">{{ label }}</el-checkbox></el-checkbox-group></el-form-item>
          <el-form-item class="wide" label="线下申请依据"><el-input v-model="form.offlineReference" aria-label="线下申请依据" type="textarea" :rows="2" maxlength="2000" placeholder="授权函编号或办理说明（选填）" /></el-form-item>
        </div>
      </el-form>
    </template>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">{{ result ? '关闭' : '取消' }}</el-button>
      <el-button v-if="result" type="primary" @click="copyAccount">复制管理员账号</el-button>
      <el-button v-else type="primary" :loading="saving" :disabled="loading || !cities.length" @click="submit">确认开通</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.opening-intro { margin: 0 0 24px; color: #66758b; line-height: 1.7; font-size: 14px; }
.opening-result { margin: 24px 0 16px; }
:global(.city-opening-dialog) { max-width: calc(100vw - 32px); }
.saas-error { margin-bottom: 20px; }
.el-checkbox-group { display: flex; gap: 8px 20px; flex-wrap: wrap; }
.el-checkbox { margin-right: 0; }
.el-input-number { width: 100%; }
</style>
