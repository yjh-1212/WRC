<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { Pause, Play, RotateCcw } from 'lucide-vue-next';
import { stamp, type VideoClip } from '../province-monitoring';
const props = withDefaults(defineProps<{ from: number; to: number; modelValue: number; playing?: boolean; videos?: VideoClip[]; incidentAt?: number; title?: string; disabled?: boolean }>(), { playing: false, videos: () => [], title: '轨迹时间线' });
const emit = defineEmits<{ 'update:modelValue': [time: number]; 'update:playing': [value: boolean] }>();
const speed = defineModel<number>('speed', { default: 1 });
const duration = computed(() => Math.max(1, props.to - props.from));
const progress = computed(() => Math.max(0, Math.min(100, (props.modelValue - props.from) / duration.value * 100)));
const coverage = computed(() => props.videos.filter(v => v.state === 'AVAILABLE' && v.startedAt && v.endedAt).flatMap(v => { const start = Math.max(props.from, Date.parse(v.startedAt!)), end = Math.min(props.to, Date.parse(v.endedAt!)); return end > start ? [{ id: v.id, left: (start - props.from) / duration.value * 100, width: (end - start) / duration.value * 100 }] : []; }));
let timer: ReturnType<typeof setInterval> | undefined, lastTick = 0;
function stop() { clearInterval(timer); timer = undefined; }
watch(() => props.playing, active => { stop(); if (active) { if (props.modelValue >= props.to) emit('update:modelValue', props.from); lastTick = performance.now(); timer = setInterval(() => { const now = performance.now(), time = Math.min(props.to, props.modelValue + (now - lastTick) * speed.value); lastTick = now; emit('update:modelValue', time); if (time >= props.to) emit('update:playing', false); }, 200); } }, { immediate: true });
watch(() => [props.from, props.to], () => emit('update:playing', false));
function hidden() { if (document.hidden) emit('update:playing', false); }
document.addEventListener('visibilitychange', hidden);
onBeforeUnmount(() => { stop(); document.removeEventListener('visibilitychange', hidden); });
</script>
<template><section class="pm-timeline" :aria-label="title"><header><strong>{{ title }}</strong><span>{{ stamp(modelValue, true) }}</span><div class="pm-timeline-actions"><el-button :icon="playing ? Pause : Play" :disabled="disabled || to <= from" @click="emit('update:playing', !playing)">{{ playing ? '暂停' : '播放' }}</el-button><el-button :icon="RotateCcw" aria-label="复位时间线" @click="emit('update:playing', false); emit('update:modelValue', from)"/><el-select v-model="speed" aria-label="回放速度" style="width:75px"><el-option v-for="n in [1,2,4,8]" :key="n" :label="`${n}×`" :value="n"/></el-select></div></header><div class="pm-timeline-rail"><span v-for="clip in coverage" :key="clip.id" class="pm-video-coverage" :style="{ left: `${clip.left}%`, width: `${clip.width}%` }"/><i v-if="incidentAt" class="pm-incident-tick" :style="{ left: `${(incidentAt - from) / duration * 100}%` }" title="事发时刻"/><input type="range" min="0" max="100" step="0.01" :value="progress" aria-label="回放时间" @input="emit('update:modelValue', from + Number(($event.target as HTMLInputElement).value) / 100 * duration)"/></div><footer><span>{{ stamp(from, true) }}</span><span v-if="incidentAt" class="pm-warning">{{ stamp(incidentAt, true) }} 事发时刻</span><small v-if="videos.length">蓝色：已接入录像覆盖 · 斜纹：无可用录像</small><span>{{ stamp(to, true) }}</span></footer></section></template>

