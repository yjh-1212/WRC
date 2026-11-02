<script setup lang="ts">
import type { ApplicationForm, SaasCatalog } from '../saas';
defineProps<{ form: ApplicationForm; catalog: SaasCatalog; lockCity?: boolean }>();
</script>
<template><div class="saas-grid">
<el-form-item label="申请城市" required><el-select v-model="form.cityCode" filterable :disabled="lockCity" placeholder="选择山东省内城市" aria-label="申请城市"><el-option v-for="city in catalog.cities" :key="city.code" :label="city.name" :value="city.code"/></el-select></el-form-item>
<el-form-item label="申请单位" required><el-input v-model="form.unitName" maxlength="120" aria-label="申请单位"/></el-form-item>
<el-form-item label="联系人" required><el-input v-model="form.contactName" maxlength="50" aria-label="联系人"/></el-form-item>
<el-form-item label="联系电话" required><el-input v-model="form.contactPhone" maxlength="30" aria-label="联系电话"/></el-form-item>
<el-form-item label="管理员姓名" required><el-input v-model="form.adminName" maxlength="50" aria-label="管理员姓名"/></el-form-item>
<el-form-item label="管理员账号" required><el-input v-model="form.adminUsername" maxlength="40" aria-label="管理员账号" placeholder="以字母开头，3至40位"/></el-form-item>
<el-form-item label="预计接入车辆数" required><el-input-number v-model="form.expectedVehicles" :min="0" :max="1000000" aria-label="预计接入车辆数"/></el-form-item>
<el-form-item label="申请业务模块" class="wide" required><el-checkbox-group v-model="form.modules"><el-checkbox v-for="item in catalog.modules" :key="item.code" :value="item.code">{{item.name}}</el-checkbox></el-checkbox-group></el-form-item>
<el-form-item label="授权函编号及材料摘要" class="wide" required><el-input v-model="form.materialNote" type="textarea" :rows="4" maxlength="4000" show-word-limit aria-label="授权函编号及材料摘要" placeholder="填写单位授权函编号、申请依据和拟开展的业务。审核时将据此核验单位与管理员身份。"/></el-form-item>
</div></template>
