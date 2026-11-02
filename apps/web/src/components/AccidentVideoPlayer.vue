<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { VideoOff, CircleAlert } from 'lucide-vue-next';
import { label, stamp, type VideoClip } from '../province-monitoring';
import { binary, fail } from '../safety-workspace';
const props = defineProps<{ videos: VideoClip[]; cursorTime: number; playing: boolean; speed: number; sourceState: string }>();
const emit = defineEmits<{ seek: [time: number]; 'update:playing': [value: boolean] }>();
const video = ref<HTMLVideoElement>(), channel = ref('FRONT'), failure = ref('');
const playbackUrl=ref(''),mediaLoading=ref(false);let mediaGeneration=0,objectUrl='';
let changingSource = false, syncingSeek = false;
const channels = computed(() => [...new Set([...props.videos.map(v => v.channel), 'FRONT', 'BACK', 'SIDE'])]);
const candidates = computed(() => props.videos.filter(v => v.channel === channel.value));
const current = computed(() => candidates.value.find(v => v.state === 'AVAILABLE' && v.startedAt && v.endedAt && props.cursorTime >= Date.parse(v.startedAt) && props.cursorTime < Date.parse(v.endedAt)) ?? candidates.value.find(v => v.state === 'NO_TIME'));
const reason = computed(() => props.sourceState === 'INVALID' ? '视频资料格式异常，请联系所属地市核查' : !candidates.value.length ? '该通道尚未接入录像' : candidates.value.every(v => v.state === 'UNAVAILABLE') ? '该通道的录像暂不可用' : '当前时间没有录像覆盖，可拖动时间线查看其他时段');
watch(() => props.videos, rows => { failure.value = ''; if (!rows.some(v => v.channel === channel.value)) channel.value = rows.find(v => v.state !== 'UNAVAILABLE')?.channel ?? 'FRONT'; }, { immediate: true });
watch(() => current.value?.id, async () => { changingSource = true; syncingSeek = false; failure.value = ''; await nextTick(); sync(); }, { flush: 'sync' });
async function loadMedia(){const generation=++mediaGeneration;changingSource=true;playbackUrl.value='';failure.value='';if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}const url=current.value?.url;if(!url)return;const material=url.match(/^\/media\/safety\/([a-f\d-]{36})$/i);if(!material){playbackUrl.value=url;return;}mediaLoading.value=true;try{const blob=await binary(`/safety/workspace/materials/${material[1]}/content`);if(generation!==mediaGeneration)return;objectUrl=URL.createObjectURL(blob);playbackUrl.value=objectUrl;}catch(e){if(generation===mediaGeneration)failure.value=fail(e);}finally{if(generation===mediaGeneration)mediaLoading.value=false;}}
watch(()=>current.value?.url,loadMedia,{immediate:true});
onBeforeUnmount(()=>{mediaGeneration++;if(objectUrl)URL.revokeObjectURL(objectUrl)});
function sync() {
  const player = video.value, clip = current.value; if (!player || !clip) return;
  player.playbackRate = props.speed;
  if (clip.state === 'NO_TIME') return;
  if (clip.startedAt && clip.endedAt && player.readyState >= 1) { const limit = Number.isFinite(player.duration) ? player.duration : (Date.parse(clip.endedAt) - Date.parse(clip.startedAt)) / 1000; const target = Math.max(0, Math.min(limit, (props.cursorTime - Date.parse(clip.startedAt)) / 1000)); if (Math.abs(player.currentTime - target) > .6) { syncingSeek = true; player.currentTime = target; } }
  if (props.playing && player.paused && clip.state === 'AVAILABLE') player.play().catch(() => { emit('update:playing', false); });
  else if (!props.playing && !player.paused) player.pause();
}
function seek() { if (changingSource || syncingSeek) return; const player = video.value, clip = current.value; if (player && clip?.startedAt) { const time = Date.parse(clip.startedAt) + player.currentTime * 1000; if (Math.abs(time - props.cursorTime) > 700) emit('seek', time); } }
function loaded() { changingSource = false; sync(); }
function paused() { if (!changingSource && current.value?.state === 'AVAILABLE' && video.value && !video.value.ended) emit('update:playing', false); }
watch(() => [props.cursorTime, props.playing, props.speed], sync);
</script>
<template><section class="pm-video-panel"><header><strong>事件视频</strong><div class="pm-channel-links" role="group" aria-label="录像通道"><button v-for="item in channels" :key="item" type="button" :aria-pressed="channel === item" @click="channel = item">{{ label(item) }}</button></div></header><div v-loading="mediaLoading" class="pm-video-stage"><video v-if="playbackUrl" :key="`${current?.id}-${playbackUrl}`" ref="video" :src="playbackUrl" controls playsinline preload="metadata" aria-label="事故录像" @loadedmetadata="loaded" @seeking="seek" @seeked="syncingSeek = false" @play="current?.state === 'AVAILABLE' && emit('update:playing', true)" @pause="paused" @error="failure = '录像读取失败或格式不受支持，请核查来源视频'; emit('update:playing', false)"/><div v-if="!current?.url || failure" class="pm-video-empty" :class="{ failure: !!failure }" role="status"><CircleAlert v-if="failure" :size="30"/><VideoOff v-else :size="30"/><strong>{{ failure || reason }}</strong><span v-if="!failure">已接入录像会按车辆、摄像头通道和采集时间关联</span><el-button v-if="failure" @click="loadMedia">重新读取录像</el-button></div></div><footer><span v-if="current">{{ current.name }} · {{ current.source || '事件关联录像' }}</span><span v-else>无可用录像</span><small v-if="current?.state === 'NO_TIME'">录像未标注起止时间，仅支持单独播放</small><small v-else-if="current?.startedAt">{{ stamp(current.startedAt, true) }} — {{ stamp(current.endedAt, true) }}</small><small v-else>按实际采集时间关联</small></footer></section></template>

