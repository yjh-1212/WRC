<script setup lang="ts">
import {computed} from 'vue';import {useRoute,useRouter} from 'vue-router';import {useSessionStore} from '../stores/session';
import RealtimeOperationsView from './RealtimeOperationsView.vue';import VehicleTrajectoryView from './VehicleTrajectoryView.vue';import OperationRecordsView from './OperationRecordsView.vue';
const route=useRoute(),router=useRouter(),session=useSessionStore(),view=computed(()=>String(route.query.view??'monitor'));
function back(){router.push({path:route.path,query:route.query.vehicleId?{vehicleId:route.query.vehicleId}:{}})}
</script>
<template><RealtimeOperationsView v-if="!['trajectory','records'].includes(view)"/><section v-else class="saas-page"><div class="header-actions"><el-button @click="back">返回运行监测</el-button></div><VehicleTrajectoryView v-if="view==='trajectory'&&session.user?.permissions.includes('operation:trajectory:read')" :key="route.fullPath"/><OperationRecordsView v-else-if="view==='records'&&session.user?.permissions.includes('operation:record:read')" :key="route.fullPath"/></section></template>
