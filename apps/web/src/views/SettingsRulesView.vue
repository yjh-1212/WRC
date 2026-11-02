<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';
import BusinessRulesView from './BusinessRulesView.vue';
import WorkflowDefinitionsView from './WorkflowDefinitionsView.vue';
import VehicleCatalogView from './VehicleCatalogView.vue';
import '../saas.css';
const route=useRoute(),router=useRouter(),session=useSessionStore();
const province=computed(()=>session.user?.accountLevel==='PROVINCE');
const canWorkflows=computed(()=>!province.value&&session.user?.workspace?.modules.includes('ADMISSION')&&session.user?.permissions.includes('admission:workflow:read'));
const canCatalog=computed(()=>province.value&&session.user?.permissions.includes('archive:manufacturer:read')&&session.user?.permissions.includes('archive:model:read'));
const view=computed({get:()=>String(route.query.view??'rules'),set:(value:string)=>router.replace({query:{...route.query,view:value}})});
</script>
<template><section class="saas-page"><h1 class="sr-only">{{province?'标准与规则':'业务规则'}}</h1><el-tabs v-if="canWorkflows||canCatalog" v-model="view"><el-tab-pane :label="province?'标准与规则':'业务规则'" name="rules"/><el-tab-pane v-if="canWorkflows" label="审批流程" name="workflows"/><el-tab-pane v-if="canCatalog" label="厂商与车型目录" name="catalog"/></el-tabs><VehicleCatalogView v-if="canCatalog&&view==='catalog'"/><WorkflowDefinitionsView v-else-if="canWorkflows&&view==='workflows'"/><BusinessRulesView v-else/></section></template>
