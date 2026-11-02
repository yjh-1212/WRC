<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowUp, ExternalLink, Plus, RotateCcw, Sparkles, Square } from 'lucide-vue-next';
import { api } from '../api';
import { streamAgentAnswer, type AgentConversation, type AgentProgress, type AgentTurn } from '../agents';
import { useSessionStore } from '../stores/session';
import { useResponsiveDrawer } from '../province-monitoring';
import '../assistant-panel.css';

const props = defineProps<{ modelValue: boolean; appendTo: string | Element }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const session = useSessionStore(), route = useRoute(), router = useRouter(), width = useResponsiveDrawer(480);
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) });
const ownerKey = `${session.user?.id}:${session.user?.workspaceId ?? ''}:${session.user?.enterpriseId ?? ''}:${session.user?.authVersion ?? ''}`;
const conversationKey = `wrc-assistant-conversation:${ownerKey}`, draftKey = `wrc-assistant-draft:${ownerKey}`;
const question = ref(localStorage.getItem(draftKey) ?? ''), conversation = ref<AgentConversation>(), turns = ref<AgentTurn[]>([]);
const busy = ref(false), loading = ref(false), error = ref(''), status = ref('');
const messages = ref<HTMLElement>(), composer = ref<HTMLTextAreaElement>();
let controller: AbortController | undefined, initialized = false, disposed = false, version = 0;
const scope = computed(() => session.user?.accountLevel === 'PROVINCE' ? '全省授权范围' : session.user?.enterpriseId ? '本企业授权范围' : `${session.user?.workspace?.cityName ?? '本市'}授权范围`);
watch(question, value => { if (value) localStorage.setItem(draftKey, value); else localStorage.removeItem(draftKey); });
async function scroll() { await nextTick(); if (open.value) messages.value?.scrollTo({ top: messages.value.scrollHeight, behavior: 'instant' }); }
async function restore() {
  const id = sessionStorage.getItem(conversationKey); initialized = true;
  if (!id) return;
  const current = ++version; loading.value = true; error.value = '';
  try {
    const result = await api<AgentConversation>(`/agents/conversations/${encodeURIComponent(id)}`);
    if (disposed || current !== version) return;
    if (result.agentCode !== 'GENERAL') throw new Error('请新建一次通用对话');
    conversation.value = result; turns.value = result.turns;
  } catch (reason) { if (!disposed && current === version) error.value = reason instanceof Error ? reason.message : '对话加载失败'; }
  finally { if (!disposed && current === version) { loading.value = false; void scroll(); } }
}
watch(open, async value => { if (value) { if (!initialized) await restore(); await scroll(); await nextTick(); composer.value?.focus(); } }, { immediate: true });
function progress(event: AgentProgress, turn: AgentTurn) {
  if (event.type === 'status') status.value = event.message ?? '';
  if (event.type === 'facts') { turn.sources = event.sources ?? []; turn.measuredAt = event.measuredAt; }
  if (event.type === 'delta') turn.answer += event.text ?? '';
  void scroll();
}
async function send(retry?: AgentTurn) {
  const text = retry?.question ?? question.value.trim();
  if (busy.value || loading.value || error.value || text.length < 2) return;
  busy.value = true; status.value = '正在开始查询…';
  let pending: AgentTurn | undefined;
  try {
    if (!conversation.value) {
      const result = await api<AgentConversation>('/agents/conversations', { method: 'POST', body: JSON.stringify({ agentCode: 'GENERAL', pagePath: route.fullPath }) });
      if (disposed) return;
      conversation.value = { ...result, turns: [] }; sessionStorage.setItem(conversationKey, result.id);
    }
    pending = retry ?? { id: `pending-${crypto.randomUUID()}`, requestKey: crypto.randomUUID(), question: text, answer: '', status: 'PENDING', sources: [] };
    pending.answer = ''; pending.status = 'PENDING'; pending.error = null;
    if (!retry) { turns.value.push(pending); question.value = ''; }
    pending = turns.value.find(turn => turn.requestKey === pending!.requestKey)!;
    controller = new AbortController();
    const result = await streamAgentAnswer(conversation.value.id, text, pending.requestKey, controller.signal, event => progress(event, pending!));
    if (!disposed) Object.assign(pending, result);
  } catch (reason) {
    if (!disposed) {
      const message = controller?.signal.aborted ? '已停止生成，可以重试。' : reason instanceof Error ? reason.message : '回答未完成，请重试';
      if (pending) { pending.status = controller?.signal.aborted ? 'CANCELLED' : 'FAILED'; pending.error = message; }
      else { error.value = message; question.value = text; }
    }
  } finally { if (!disposed) { busy.value = false; status.value = ''; controller = undefined; await scroll(); } }
}
function stop() {
  controller?.abort();
  if (conversation.value) void api(`/agents/conversations/${conversation.value.id}/cancel`, { method: 'POST', body: '{}' }).catch(() => undefined);
}
function newChat() {
  if (busy.value || loading.value) return;
  version++; initialized = true; conversation.value = undefined; turns.value = []; error.value = ''; sessionStorage.removeItem(conversationKey);
  void nextTick(() => composer.value?.focus());
}
function retryLoad() { if (sessionStorage.getItem(conversationKey) && !conversation.value) void restore(); else { error.value = ''; void nextTick(() => composer.value?.focus()); } }
function example(text: string) { question.value = text; void nextTick(() => composer.value?.focus()); }
function keydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); } }
function source(path: string) { open.value = false; void router.push(path); }
onBeforeUnmount(() => { disposed = true; version++; stop(); });
</script>

<template>
  <el-drawer v-model="open" :append-to="appendTo" append-to-body :z-index="4200" :size="width" class="assistant-drawer" title="AI助手" :close-on-click-modal="false" @opened="composer?.focus()">
    <template #header><div class="assistant-heading"><span><Sparkles :size="20" /><strong>AI助手</strong></span><small>通用对话 · {{ scope }}</small></div><el-tooltip content="新对话" placement="bottom"><el-button text :icon="Plus" aria-label="新建通用对话" :disabled="busy || loading || (!conversation && !turns.length && !error)" @click="newChat" /></el-tooltip></template>
    <div v-if="error" class="assistant-error" role="alert"><span>{{ error }}</span><el-button link type="primary" @click="retryLoad">重试加载</el-button></div>
    <div ref="messages" class="assistant-messages" role="log" aria-label="AI助手对话记录" aria-live="polite" aria-relevant="additions">
      <el-skeleton v-if="loading" :rows="5" animated />
      <section v-else-if="!turns.length" class="assistant-welcome"><img src="/ai/luxing-assistant-transparent.png" alt="" width="100" height="100"/><h2>你好，我是 AI 助手</h2><p>直接说出你的问题，帮你查数据、理事项、了解办理流程。</p><div class="assistant-examples"><button v-for="text in ['汇总当前需要关注的事项。','如何查询车辆档案？','梳理未闭环告警并给出核查建议。']" :key="text" type="button" @click="example(text)">{{ text }}<ArrowUp :size="14"/></button></div></section>
      <article v-for="turn in turns" :key="turn.requestKey" class="assistant-turn"><div class="assistant-question">{{ turn.question }}</div><div class="assistant-reply"><span class="assistant-avatar"><Sparkles :size="17"/></span><div><p v-if="turn.answer" class="assistant-answer">{{ turn.answer }}</p><p v-else-if="turn.status === 'PENDING'" class="assistant-pending"><i/>{{ status || '正在分析…' }}</p><div v-if="turn.sources?.length" class="assistant-sources"><span>参考来源</span><button v-for="item in turn.sources" :key="item.kind + item.id" type="button" @click="source(item.path)">{{ item.label }}<ExternalLink :size="11"/></button></div><small v-if="turn.measuredAt" class="assistant-time">数据时点 {{ new Date(turn.measuredAt).toLocaleString('zh-CN', { hour12: false }) }}</small><div v-if="turn.error" class="assistant-turn-error" role="alert"><span>{{ turn.error }}</span><el-button v-if="turn.status !== 'REDACTED'" link type="primary" :icon="RotateCcw" :disabled="busy" @click="send(turn)">重试回答</el-button></div></div></div></article>
    </div>
    <form class="assistant-composer" @submit.prevent="send()"><textarea ref="composer" v-model="question" aria-label="向通用AI助手提问" placeholder="输入问题，Enter 发送，Shift + Enter 换行" maxlength="3000" rows="3" :disabled="busy || loading" @keydown="keydown"/><div><small>当前页面可继续保留，对话随时回来查看</small><el-button v-if="busy" :icon="Square" size="small" @click="stop">停止生成</el-button><el-button v-else type="primary" :icon="ArrowUp" native-type="submit" size="small" aria-label="发送给AI助手" :disabled="loading || !!error || question.trim().length < 2">发送</el-button></div></form>
    <p class="assistant-note">回答供辅助参考，请结合来源记录核对。</p>
  </el-drawer>
</template>
