<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import VehicleManagementView from './VehicleManagementView.vue';
import VehicleArchivesView from './VehicleArchivesView.vue';
import CityVehiclesView from './CityVehiclesView.vue';
import { useSessionStore } from '../stores/session';
import '../saas.css';
const route=useRoute(),router=useRouter(),session=useSessionStore();const archive=computed(()=>route.query.view==='archive');
</script>
<template><CityVehiclesView v-if="session.user?.accountLevel==='CITY'"/><section v-else class="saas-page"><h1 class="sr-only">{{archive?'车辆档案详情':'车辆管理'}}</h1><div class="page-header"><div class="header-actions"><el-button v-if="archive" @click="router.push({path:route.path,query:{}})">返回车辆管理</el-button></div></div><VehicleArchivesView v-if="archive" :key="route.fullPath"/><VehicleManagementView v-else :key="route.fullPath"/></section></template>
