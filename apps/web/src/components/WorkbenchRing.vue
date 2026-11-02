<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ segments: { value: number; color: string }[]; value: string; label: string; description: string; size?: number }>(), { size: 150 });
const total = computed(() => props.segments.reduce((sum, row) => sum + Math.max(0, row.value), 0));
const paths = computed(() => {
  let offset = 0; const circumference = 2 * Math.PI * 48;
  return props.segments.filter(row => row.value > 0).map(row => { const length = total.value ? row.value / total.value * circumference : 0;
    const item = { color: row.color, dash: `${length} ${circumference - length}`, offset: -offset }; offset += length; return item; });
});
</script>
<template><div class="wb-ring" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="description"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="48" fill="none" stroke="#e8ecf4" stroke-width="14"/><circle v-for="(path, index) in paths" :key="index" cx="60" cy="60" r="48" fill="none" :stroke="path.color" stroke-width="14" :stroke-dasharray="path.dash" :stroke-dashoffset="path.offset" transform="rotate(-90 60 60)"/></svg><div class="wb-ring-center"><strong>{{ value }}</strong><span>{{ label }}</span></div></div></template>
