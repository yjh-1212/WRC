<script setup lang="ts">
defineProps<{ title: string; note?: string }>();
</script>
<template>
  <article class="rwb-panel" :aria-label="title">
    <header class="rwb-panel-header"><h2>{{ title }}</h2><div class="rwb-panel-tools"><slot name="actions"><span v-if="note" class="rwb-muted">{{ note }}</span></slot></div></header>
    <div class="rwb-panel-content"><slot /></div>
  </article>
</template>
