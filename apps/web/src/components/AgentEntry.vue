<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, ref } from 'vue';
import { useSessionStore } from '../stores/session';
const AssistantPanel = defineAsyncComponent(() => import('./AssistantPanel.vue'));
const session = useSessionStore();
const available = computed(() => session.user?.accountLevel !== 'OPERATIONS' && session.user?.permissions.includes('dashboard:view'));
const open = ref(false), started = ref(false), fullscreenTarget = ref<Element | null>(null);
function show() { started.value = true; open.value = true; }
function fullscreen() { fullscreenTarget.value = document.fullscreenElement; }
onMounted(() => { fullscreen(); document.addEventListener('fullscreenchange', fullscreen); });
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', fullscreen));
</script>

<template>
  <Teleport :to="fullscreenTarget ?? 'body'">
  <el-tooltip v-if="available && !open" content="AI助手 · 直接提问" placement="left">
    <button class="agent-entry" type="button" aria-label="打开AI助手" aria-haspopup="dialog" :aria-expanded="open" @click="show">
      <img src="/ai/luxing-assistant-transparent.png" alt="" width="80" height="80" />
      <span>AI 助手</span>
    </button>
  </el-tooltip>
  </Teleport>
  <AssistantPanel v-if="available && started" v-model="open" :append-to="fullscreenTarget ?? 'body'" />
</template>

<style scoped>
.agent-entry{position:fixed;right:22px;bottom:22px;z-index:1800;width:88px;display:flex;flex-direction:column;align-items:center;gap:1px;padding:0;border:0;background:transparent;cursor:pointer;transition:transform .18s ease-out}
.agent-entry img{width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 5px 9px #244d7c24)}
.agent-entry span{padding:3px 12px;border:1px solid #dce8f6;background:#fff;color:#285891;font-size:11px;font-weight:600;border-radius:12px;box-shadow:0 2px 8px #244d7c0d}
.agent-entry:hover{transform:translateY(-3px)}.agent-entry:focus-visible{outline:2px solid #3678cb;outline-offset:4px;border-radius:16px}
@media(max-width:720px){.agent-entry{right:12px;bottom:14px;width:68px}.agent-entry img{width:64px;height:64px}}
@media(prefers-reduced-motion:reduce){.agent-entry{transition:none}}
</style>
