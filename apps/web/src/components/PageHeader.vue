<script setup lang="ts">
import { watchEffect } from 'vue';

const props = defineProps<{ title: string; description?: string; count?: number }>();

watchEffect(() => {
  document.title = `${props.title} · 无人快递车监管平台`;
});
</script>
<template>
  <header class="page-header">
    <div><div class="title-line"><h1>{{ title }}</h1><span v-if="count !== undefined" class="count">{{ count }}</span></div><p v-if="description">{{ description }}</p></div>
    <div class="header-actions"><slot /></div>
  </header>
</template>
