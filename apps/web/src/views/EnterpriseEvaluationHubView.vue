<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import EnterpriseEvaluationsView from './EnterpriseEvaluationsView.vue';
import SafetyProfilesView from './SafetyProfilesView.vue';
import CreditAccountsView from './CreditAccountsView.vue';
import { useSessionStore } from '../stores/session';
import '../saas.css';
const route=useRoute(),router=useRouter(),session=useSessionStore();
const view=computed({get:()=>String(route.query.context??'evaluation'),set:(value:string)=>router.replace({query:{...route.query,context:value}})});
</script>
<template><section class="saas-page"><h1 class="sr-only">企业评价</h1><el-tabs v-model="view"><el-tab-pane label="评价与申诉" name="evaluation"/><el-tab-pane v-if="session.user?.permissions.includes('analytics:profile:read')" label="本企业安全画像" name="profile"/><el-tab-pane v-if="session.user?.permissions.includes('analytics:evaluation:read')" label="本企业信用" name="credit"/></el-tabs><SafetyProfilesView v-if="view==='profile'"/><CreditAccountsView v-else-if="view==='credit'"/><EnterpriseEvaluationsView v-else/></section></template>
