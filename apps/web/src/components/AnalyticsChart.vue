<script setup lang="ts">
import { init, use, type EChartsCoreOption } from 'echarts/core';
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, RadarComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

use([BarChart, LineChart, PieChart, RadarChart, AriaComponent, GridComponent, LegendComponent, RadarComponent, TooltipComponent, CanvasRenderer]);
const props = withDefaults(defineProps<{ option: EChartsCoreOption; height?: string; ariaLabel?: string }>(), { height: '280px', ariaLabel: '数据图表' });
const root = ref<HTMLElement | null>(null);
let chart: ReturnType<typeof init> | null = null;
let observer: ResizeObserver | null = null;

function render() {
  if (!root.value) return;
  chart ??= init(root.value, undefined, { renderer: 'canvas' });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  chart.setOption({ animation: !reduceMotion, animationDuration: 420, ...props.option }, { notMerge: true });
}

watch(() => props.option, () => nextTick(render), { deep: true });
onMounted(() => { render(); observer = new ResizeObserver(() => chart?.resize()); if (root.value) observer.observe(root.value); });
onUnmounted(() => { observer?.disconnect(); chart?.dispose(); chart = null; });
</script>

<template><div ref="root" class="analytics-chart" :style="{ height }" role="img" :aria-label="ariaLabel"></div></template>
