<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SafetyEventWorkspaceView from './SafetyEventWorkspaceView.vue';
import AccidentReconstructionView from './AccidentReconstructionView.vue';
import '../saas.css';
const route=useRoute(),router=useRouter();
const view=computed(()=>String(route.query.view??'list'));
const names:Record<string,string>={list:'事件处置',ALERT:'告警处置',ACCIDENT:'事故处置',VIOLATION:'违规整改',OFFLINE:'离线核查',reconstruction:'事故回溯'};
function back(){router.push({path:route.path,query:{type:route.query.type}})}
</script>
<template><section v-if="view==='reconstruction'" class="saas-page"><el-button @click="back">返回事件处置</el-button><AccidentReconstructionView/></section><SafetyEventWorkspaceView v-else/></template>
