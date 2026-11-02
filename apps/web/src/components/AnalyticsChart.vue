<script setup lang="ts">
import { init, use, type EChartsCoreOption } from 'echarts/core';
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts';
import { AriaComponent, GraphicComponent, GridComponent, LegendComponent, RadarComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

use([BarChart, LineChart, PieChart, RadarChart, AriaComponent, GraphicComponent, GridComponent, LegendComponent, RadarComponent, TooltipComponent, CanvasRenderer]);
const props = withDefaults(defineProps<{ option: EChartsCoreOption; height?: string; ariaLabel?: string }>(), { height: '280px', ariaLabel: '数据图表' });
const emit = defineEmits<{ 'chart-click': [value: any] }>();
const root = ref<HTMLElement | null>(null);
let chart: ReturnType<typeof init> | null = null;
let observer: ResizeObserver | null = null;

function render() {
  if (!root.value) return;
  if (!chart) { chart = init(root.value, undefined, { renderer: 'canvas' }); chart.on('click', value => emit('chart-click', value)); chart.on('finished', () => { if (root.value) root.value.dataset.chartReady = 'true'; }); }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.value.dataset.chartReady = 'false';
  chart.setOption({ animation: !reduceMotion, animationDuration: 420, ...props.option }, { notMerge: true });
  root.value.setAttribute('aria-label', props.ariaLabel);
}

watch(() => props.option, () => nextTick(render), { deep: true });
onMounted(() => { render(); observer = new ResizeObserver(() => chart?.resize()); if (root.value) observer.observe(root.value); });
onUnmounted(() => { observer?.disconnect(); chart?.dispose(); chart = null; });
</script>

<template><div ref="root" class="analytics-chart" :style="{ height }" role="img" :aria-label="ariaLabel"></div></template>
