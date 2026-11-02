<script setup lang="ts">
defineProps<{error?:string;loading?:boolean}>();defineEmits<{retry:[]}>();
</script>
<template><div v-if="error" class="province-error" role="alert"><span>{{error}}</span><el-button @click="$emit('retry')">重试</el-button></div><div v-else v-loading="loading"><slot/></div></template>
