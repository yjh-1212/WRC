<script setup lang="ts">
import { computed } from 'vue';
import { VEHICLE_STATES, vehicleState } from '../cockpit/vehicle-status.js';
const props = defineProps<{ vehicles: Array<{ onlineStatus?: string; drivingState?: string }>; track?: boolean; showAreas?: boolean }>();
const entries = computed(() => VEHICLE_STATES.map(state => ({ ...state, count: props.vehicles.filter(row => vehicleState(row).key === state.key).length })).filter(state => state.key !== 'unknown' || state.count));
</script>
<template>
  <section class="pc-vehicle-legend" :class="{ 'with-track': track }" aria-label="车辆状态图例"><strong>车辆状态<span v-if="showAreas" class="pc-area-legend"><i/>运营区域边界</span></strong><div><span v-for="state in entries" :key="state.key" :data-vehicle-state="state.key"><i :style="{ backgroundColor: state.color }"/><span>{{ state.label }}</span><b>{{ state.count }}</b></span></div><small>颜色对应车辆状态 · 离线车辆显示最后位置</small></section>
</template>
