<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
defineProps<{ title: string; icon: Component; subtitle?: string }>();
const host = ref<HTMLElement>(), size = ref({ width: 360, height: 250 });
let observer: ResizeObserver | undefined;
const frame = computed(() => {
  const { width: w, height: h } = size.value;
  return { outline: `M1 17 L17 1 H${w * .73} L${w * .78} 14 H${w - 1} V${h - 1} H${w * .83} L${w * .81} ${h - 6} H${w * .19} L${w * .17} ${h - 1} H1 Z`, corners: `M${w - 18} 14 H${w - 1} V30 M1 ${h - 18} V${h - 1} H18 M${w * .19} ${h - 3} H${w * .81}` };
});
onMounted(() => { observer = new ResizeObserver(() => { if (host.value) size.value = { width: host.value.clientWidth, height: host.value.clientHeight }; }); if (host.value) observer.observe(host.value); });
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <section ref="host" class="pc-panel" :aria-label="title">
    <svg class="pc-panel-frame" :viewBox="`0 0 ${size.width} ${size.height}`" preserveAspectRatio="none" aria-hidden="true"><path class="pc-frame-outline" :d="frame.outline"/><path class="pc-frame-corners" :d="frame.corners"/><path class="pc-frame-notch" d="M1 13 V1 H13 Z"/></svg>
    <header class="pc-panel-heading"><span><component :is="icon" :size="17"/><h2>{{ title }}</h2></span><slot name="action"><small v-if="subtitle">{{ subtitle }}</small></slot></header>
    <div class="pc-panel-body"><slot/></div>
  </section>
</template>
