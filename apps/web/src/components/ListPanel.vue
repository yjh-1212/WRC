<script setup lang="ts">
defineProps<{ title: string; total?: number }>();
</script>

<template>
  <section class="list-panel" :aria-label="title">
    <header v-if="$slots.actions" class="list-panel__header">
      <div class="list-panel__actions"><slot name="actions" /></div>
    </header>
    <div class="list-panel__body"><slot /></div>
  </section>
</template>
