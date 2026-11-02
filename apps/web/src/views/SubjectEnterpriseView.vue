<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CityEnterprisesView from './CityEnterprisesView.vue';
import SafetyProfilesView from './SafetyProfilesView.vue';
import '../saas.css';
const route=useRoute(),router=useRouter();const profile=computed(()=>route.query.view==='profile');
</script>
<template><section v-if="profile" class="saas-page"><h1 class="sr-only">企业安全画像</h1><div class="page-header"><div class="header-actions"><el-button @click="router.push('/archives/enterprises')">返回企业管理</el-button></div></div><SafetyProfilesView :key="route.fullPath"/></section><CityEnterprisesView v-else/></template>
