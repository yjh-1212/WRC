<script setup lang="ts">
import { watchEffect } from 'vue';

const props = defineProps<{ title: string; description?: string; count?: number }>();

watchEffect(() => {
  document.title = `${props.title} · 无人快递车监管平台`;
});
</script>
<template>
  <h1 class="sr-only">{{ title }}</h1>
  <header v-if="$slots.default" class="page-header" :aria-label="`${title}页面操作`">
    <div class="header-actions"><slot /></div>
  </header>
</template>
