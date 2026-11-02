<script setup lang="ts">
import { computed, useId } from 'vue';
const props = defineProps<{ points: Array<{ date: string; value: number | null }>; unit: string; color?: string }>();
const gradient = `trend-${useId().replaceAll(':', '')}`;
const max = computed(() => Math.max(1, ...props.points.map(p => p.value ?? 0)) * 1.15);
const coords = computed(() => props.points.map((p, i) => ({ ...p, x: 36 + i * 270 / Math.max(1, props.points.length - 1), y: 130 - (p.value ?? 0) / max.value * 106 })));
const segments = computed(() => {
  const list: Array<Array<{ x: number; y: number }>> = []; let run: Array<{ x: number; y: number }> = [];
  for (const p of coords.value) { if (p.value == null) { if (run.length) list.push(run); run = []; } else run.push(p); }
  if (run.length) list.push(run);
  return list.map(points => ({ line: points.map(p => `${p.x},${p.y}`).join(' '), area: `${points[0]!.x},130 ${points.map(p => `${p.x},${p.y}`).join(' ')} ${points.at(-1)!.x},130` }));
});
</script>
<template>
  <div class="cockpit-line-chart">
    <svg viewBox="0 0 330 161" role="img" :aria-label="`${unit}近七日趋势`">
      <defs><linearGradient :id="gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" :stop-color="color || '#45cdff'" stop-opacity=".36"/><stop offset="1" :stop-color="color || '#45cdff'" stop-opacity="0"/></linearGradient></defs>
      <g v-for="n in [0, 1, 2]" :key="n"><line x1="36" x2="308" :y1="24 + n * 53" :y2="24 + n * 53" stroke="#8ab7d2" stroke-opacity=".12" stroke-dasharray="3 5"/><text x="30" :y="28 + n * 53" text-anchor="end">{{ Math.round(max * (1 - n / 2)).toLocaleString() }}</text></g>
      <g v-for="(segment, i) in segments" :key="i"><polygon :points="segment.area" :fill="`url(#${gradient})`"/><polyline :points="segment.line" fill="none" :stroke="color || '#45cdff'" stroke-width="2.2" stroke-linejoin="round"/></g>
      <g v-for="p in coords" :key="p.date"><circle v-if="p.value != null" :cx="p.x" :cy="p.y" r="3" :fill="color || '#45cdff'"><title>{{ p.date }}：{{ p.value }} {{ unit }}</title></circle><text :x="p.x" y="153" text-anchor="middle">{{ p.date.slice(5) }}</text></g>
    </svg>
    <span v-if="!segments.length" class="cockpit-chart-empty">此范围暂无历史报送</span>
    <div class="cockpit-chart-caption">{{ unit }} · 缺报日期保留空缺</div>
  </div>
</template>
