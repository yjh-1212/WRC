<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';
import EnterpriseArchivesView from './EnterpriseArchivesView.vue';
import QualificationsView from './QualificationsView.vue';
import '../saas.css';
const route=useRoute(),router=useRouter(),session=useSessionStore();
const view=computed({get:()=>String(route.query.view??'info'),set:(value:string)=>router.replace({query:{...route.query,view:value}})});
</script>
<template><section class="saas-page"><h1 class="sr-only">企业资料</h1><el-tabs v-model="view"><el-tab-pane label="主体信息" name="info"/><el-tab-pane v-if="session.user?.permissions.includes('archive:qualification:read')" label="资质材料" name="qualifications"/></el-tabs><QualificationsView v-if="view==='qualifications'"/><EnterpriseArchivesView v-else/></section></template>
