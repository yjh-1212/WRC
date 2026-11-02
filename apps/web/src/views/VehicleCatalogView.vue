<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ManufacturersView from './ManufacturersView.vue';
import VehicleModelsView from './VehicleModelsView.vue';
const route=useRoute(),router=useRouter();
const tab=computed({get:()=>String(route.query.tab??'manufacturers'),set:(value:string)=>router.replace({query:{...route.query,tab:value}})});
</script>
<template><section class="catalog-page"><el-tabs v-model="tab" class="compact-tabs"><el-tab-pane label="厂商" name="manufacturers"/><el-tab-pane label="车型" name="models"/></el-tabs><component :is="tab==='models'?VehicleModelsView:ManufacturersView"/></section></template>
