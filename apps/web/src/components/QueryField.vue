<script setup lang="ts">
import { useId } from 'vue';

defineProps<{ label: string; wide?: boolean; keyword?: boolean }>();
const labelId = useId();
</script>

<template>
  <div class="query-field" :class="{ 'query-field--wide': wide, 'query-field--keyword': keyword }" role="group" :aria-labelledby="labelId">
    <span :id="labelId" class="query-field__label">{{ label }}</span>
    <div class="query-field__control"><slot /></div>
  </div>
</template>
