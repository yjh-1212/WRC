<script setup lang="ts">
import {ref} from 'vue';import ProvinceMatterList from '../components/ProvinceMatterList.vue';import ProvinceResources from '../components/ProvinceResources.vue';import './ProvincePages.css';
const view=ref('tasks');
</script>
<template><section class="province-page"><h1 class="sr-only">应急统筹</h1><el-tabs v-model="view" class="province-resource-tabs"><el-tab-pane name="tasks" label="协同任务"><ProvinceMatterList v-if="view==='tasks'" kind="EMERGENCY" title="应急任务" hide-heading/></el-tab-pane><el-tab-pane name="resources" label="可调用资源"><ProvinceResources v-if="view==='resources'"/></el-tab-pane></el-tabs></section></template>
