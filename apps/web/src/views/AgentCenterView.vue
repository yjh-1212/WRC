<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Component } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, ChartNoAxesCombined, ChevronRight, ClipboardCheck, ExternalLink, Gauge, Home, Menu, MessageSquare, Plus, RefreshCw, Search, Send, ShieldAlert, Sparkles, Square, Trash2, Truck, UserRound, X } from 'lucide-vue-next';
import { api } from '../api';
import { useSessionStore } from '../stores/session';
import { streamAgentAnswer, type AgentConversation, type AgentDefinition, type AgentProgress, type AgentTurn, type ConversationSummary } from '../agents';
import '../agent-center.css';

const route = useRoute(), router = useRouter(), session = useSessionStore();
const definitions = ref<AgentDefinition[]>([]), scope = ref(''), catalogError = ref('');
const general = ref<AgentDefinition>();
const history = ref<ConversationSummary[]>([]), historyQuery = ref(''), historyError = ref(''), historyBusy = ref(false), historyPage = ref(1), historyTotal = ref(0);
const selectedCode = ref(''), conversation = ref<AgentConversation>(), turns = ref<AgentTurn[]>([]), question = ref('');
const busy = ref(false), loading = ref(false), error = ref(''), statusText = ref(''), factsSummary = ref(''), showSidebar = ref(false), showHelp = ref(false);
const messages = ref<HTMLElement>(), composer = ref<HTMLTextAreaElement>();
const icons: Record<string, Component> = { Gauge, Truck, ShieldAlert, ClipboardCheck, ChartNoAxesCombined, BookOpen };
let controller: AbortController | undefined, historyTimer: ReturnType<typeof setTimeout> | undefined, historyGeneration = 0, viewGeneration = 0, leaving = false;
const selectedAgent = computed(() => selectedCode.value === 'GENERAL' ? general.value : definitions.value.find(agent => agent.code === selectedCode.value));
const square = computed(() => route.query.view === 'square');
const welcome = computed(() => !conversation.value && !selectedCode.value && !square.value);
const draftKey = computed(() => `wrc-agent-draft:${session.user?.id}:${conversation.value?.id ?? (selectedCode.value || 'home')}`);
const businessHome = computed(() => session.user?.accountLevel === 'PROVINCE' ? '/province/overview' : session.user?.portal === 'ENTERPRISE' ? '/enterprise/overview' : '/regulatory/overview');
const returnTo = computed(() => typeof route.query.returnTo === 'string' && /^\/(?!\/|agents)[a-z]/.test(route.query.returnTo) ? route.query.returnTo : businessHome.value);
const currentTitle = computed(() => selectedAgent.value?.name ?? '鲁行智能助手');
const shortDate = (value: string) => new Date(value).toLocaleDateString('zh-CN');
const time = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '';

async function catalog() {
  catalogError.value = '';
  try { const data = await api<{ agents: AgentDefinition[]; general?: AgentDefinition; scope: string }>('/agents/catalog'); definitions.value = data.agents; general.value = data.general; scope.value = data.scope; }
  catch (reason) { catalogError.value = reason instanceof Error ? reason.message : '智能体列表加载失败'; }
}
async function loadHistory(append = false) {
  const generation = ++historyGeneration; historyBusy.value = true; historyError.value = '';
  try {
    const page = append ? historyPage.value + 1 : 1;
    const data = await api<{ items: ConversationSummary[]; total: number }>(`/agents/conversations?${new URLSearchParams({ q: historyQuery.value, page: String(page), pageSize: '20' })}`);
    if (generation !== historyGeneration) return;
    history.value = append ? [...history.value, ...data.items] : data.items; historyTotal.value = data.total; historyPage.value = page;
  } catch (reason) { if (generation === historyGeneration) historyError.value = reason instanceof Error ? reason.message : '历史对话加载失败'; }
  finally { if (generation === historyGeneration) historyBusy.value = false; }
}
watch(historyQuery, () => { clearTimeout(historyTimer); historyTimer = setTimeout(() => void loadHistory(), 250); });
watch(question, value => { if (value) localStorage.setItem(draftKey.value, value); else localStorage.removeItem(draftKey.value); });
async function scrollDown() { await nextTick(); messages.value?.scrollTo({ top: messages.value.scrollHeight, behavior: 'instant' }); }
async function loadView() {
  if (typeof route.query.conversation === 'string' && route.query.conversation === conversation.value?.id && turns.value.length) return;
  const generation = ++viewGeneration; loading.value = true; error.value = ''; factsSummary.value = ''; showSidebar.value = false;
  try {
    if (!definitions.value.length) await catalog();
    if (generation !== viewGeneration) return;
    const id = typeof route.query.conversation === 'string' ? route.query.conversation : '';
    const loaded = id ? await api<AgentConversation>(`/agents/conversations/${encodeURIComponent(id)}`) : undefined;
    if (generation !== viewGeneration) return;
    conversation.value = loaded;
    selectedCode.value = conversation.value?.agentCode ?? String(route.query.agent ?? ''); turns.value = conversation.value?.turns ?? [];
    if (selectedCode.value && !selectedAgent.value) throw new Error('当前账号无法使用此智能体');
    question.value = localStorage.getItem(draftKey.value) ?? ''; await scrollDown();
  } catch (reason) { if (generation === viewGeneration) error.value = reason instanceof Error ? reason.message : '对话加载失败'; }
  finally { if (generation === viewGeneration) loading.value = false; }
}
watch(() => [route.query.conversation, route.query.agent, route.query.view], loadView, { immediate: true });
void loadHistory();
function navigate(query: Record<string, string> = {}) {
  if (busy.value) return;
  showSidebar.value = false;
  void router.push({ path: '/agents', query: { ...(route.query.returnTo ? { returnTo: String(route.query.returnTo) } : {}), ...query } });
}
function chooseAgent(code: string) { navigate({ agent: code }); }
function newChat() { if (route.query.conversation || route.query.view || selectedCode.value) navigate(); else { question.value = ''; composer.value?.focus(); } }
function infer(text: string) {
  const code = /告警|风险|越界|超速|事故/.test(text) ? 'SAFETY' : /审批|许可|准入|申请材料/.test(text) ? 'ADMISSION' : /里程|运行时长|运行记录|运行分析/.test(text) ? 'ANALYTICS' : /车辆|离线|VIN|车牌|VEH-/i.test(text) ? 'VEHICLE' : /如何|怎么|开通|入口|办理|操作/.test(text) ? 'GUIDE' : 'OVERVIEW';
  return definitions.value.find(agent => agent.code === code)?.code ?? definitions.value[0]?.code;
}
function progress(event: AgentProgress, pending: AgentTurn) {
  if (event.type === 'status') statusText.value = event.message ?? '';
  if (event.type === 'facts') { factsSummary.value = event.summary ?? ''; pending.sources = event.sources ?? []; pending.measuredAt = event.measuredAt; }
  if (event.type === 'delta') pending.answer += event.text ?? '';
  void scrollDown();
}
async function send(retry?: AgentTurn) {
  const text = retry?.question ?? question.value.trim();
  if (busy.value || loading.value || text.length < 2 || !definitions.value.length) return;
  busy.value = true; error.value = ''; factsSummary.value = ''; statusText.value = '正在开始查询…';
  let pending: AgentTurn | undefined;
  const oldDraftKey = draftKey.value;
  try {
    selectedCode.value ||= infer(text);
    if (!conversation.value) {
      const created = await api<AgentConversation>('/agents/conversations', { method: 'POST', body: JSON.stringify({ agentCode: selectedCode.value, pagePath: returnTo.value }) });
      conversation.value = { ...created, turns: [] };
    }
    pending = retry ?? { id: `pending-${crypto.randomUUID()}`, requestKey: crypto.randomUUID(), question: text, answer: '', status: 'PENDING', sources: [] };
    pending.answer = ''; pending.status = 'PENDING'; pending.error = null;
    if (!retry) turns.value.push(pending);
    pending = turns.value.find(turn => turn.requestKey === pending!.requestKey)!;
    question.value = ''; localStorage.removeItem(oldDraftKey);
    controller = new AbortController();
    const result = await streamAgentAnswer(conversation.value.id, text, pending.requestKey, controller.signal, event => progress(event, pending!));
    Object.assign(pending, result); conversation.value.title = text.slice(0, 60);
  } catch (reason) {
    const stopped = controller?.signal.aborted;
    const message = stopped ? '已停止生成，可以重试。' : reason instanceof Error ? reason.message : '分析未完成，请重试';
    if (pending) { pending.status = stopped ? 'CANCELLED' : 'FAILED'; pending.error = message; }
    else { error.value = message; question.value = text; }
  } finally {
    busy.value = false; statusText.value = ''; controller = undefined;
    if (conversation.value?.id && !leaving) {
      await router.replace({ path: '/agents', query: { conversation: conversation.value.id, returnTo: returnTo.value } });
      void loadHistory();
    }
    await scrollDown();
  }
}
function stop() {
  controller?.abort();
  if (conversation.value) void api(`/agents/conversations/${conversation.value.id}/cancel`, { method: 'POST', body: '{}' }).catch(() => undefined);
}
async function removeHistory(item: ConversationSummary) {
  if (busy.value) return;
  try { await ElMessageBox.confirm('删除后无法恢复此对话，业务记录不受影响。', '删除对话', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }); }
  catch { return; }
  try { await api(`/agents/conversations/${item.id}`, { method: 'DELETE' }); if (conversation.value?.id === item.id) newChat(); await loadHistory(); }
  catch (reason) { historyError.value = reason instanceof Error ? reason.message : '删除未完成，请重试'; }
}
function example(text: string) { question.value = text; void nextTick(() => composer.value?.focus()); }
function keydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); } }
onBeforeRouteLeave(() => { leaving = true; if (busy.value) stop(); });
onBeforeUnmount(() => { controller?.abort(); clearTimeout(historyTimer); historyGeneration++; viewGeneration++; });
</script>

<template>
  <main class="agent-center" @keydown.esc="showSidebar = false">
    <button v-if="showSidebar" type="button" class="agent-mobile-shade" aria-label="关闭侧栏" @click="showSidebar = false"></button>
    <aside class="agent-sidebar" :class="{ visible: showSidebar }" aria-label="智能体导航">
      <router-link :to="businessHome" class="agent-brand"><img src="/ai/luxing-assistant-transparent.png" alt="鲁行智助" width="48" height="48"/><span><strong>山东无人车监管</strong><small>鲁行智助 · AI智能体中心</small></span></router-link>
      <el-button type="primary" class="agent-new" :icon="Plus" :disabled="busy" @click="newChat">新建对话</el-button>
      <nav class="agent-nav" aria-label="智能体功能">
        <button type="button" :class="{ active: !square && !conversation && !selectedCode }" :disabled="busy" @click="navigate()"><Home :size="18"/>首页</button>
        <button type="button" :class="{ active: square }" :disabled="busy" @click="navigate({ view: 'square' })"><Sparkles :size="18"/>智能体广场<span>{{ definitions.length }}</span></button>
      </nav>
      <div class="agent-history-heading"><span>历史对话</span><button type="button" aria-label="刷新历史对话" :disabled="historyBusy" @click="loadHistory()"><RefreshCw :size="15"/></button></div>
      <el-input v-model="historyQuery" :prefix-icon="Search" clearable placeholder="搜索历史对话" aria-label="搜索历史对话" class="agent-history-search"/>
      <div class="agent-history">
        <div v-if="historyError" class="agent-history-error" role="alert">{{ historyError }}<el-button text @click="loadHistory()">重试</el-button></div>
        <p v-else-if="!history.length && !historyBusy" class="agent-history-empty">{{ historyQuery ? '没有匹配的对话' : '开始对话后，记录会保存在这里' }}</p>
        <div v-for="item in history" :key="item.id" class="agent-history-row" :class="{ active: conversation?.id === item.id }">
          <button type="button" class="agent-history-link" :disabled="busy" @click="navigate({ conversation: item.id })"><MessageSquare :size="16"/><span><strong>{{ item.title }}</strong><small>{{ shortDate(item.updatedAt) }}</small></span></button>
          <button type="button" class="agent-history-delete" :aria-label="`删除对话：${item.title}`" :disabled="busy" @click="removeHistory(item)"><Trash2 :size="14"/></button>
        </div>
        <p v-if="historyBusy" class="agent-history-empty">正在加载对话…</p>
        <el-button v-if="history.length < historyTotal" text :loading="historyBusy" @click="loadHistory(true)">加载更多<ArrowDown :size="14"/></el-button>
      </div>
      <footer class="agent-sidebar-footer"><button type="button" @click="showHelp = true"><BookOpen :size="17"/>使用指南</button><button type="button" @click="router.push(returnTo)"><ArrowLeft :size="17"/>返回业务系统</button><div class="agent-user"><span><UserRound :size="18"/></span><div><strong>{{ session.user?.displayName }}</strong><small>{{ scope }}</small></div></div></footer>
    </aside>
    <section class="agent-workspace">
      <header class="agent-topbar"><button type="button" class="agent-mobile-menu" aria-label="打开智能体导航" @click="showSidebar = true"><Menu :size="21"/></button><span>{{ currentTitle }}</span><span class="agent-scope"><ShieldAlert :size="14"/>{{ scope }}</span></header>
      <div v-if="catalogError || error" class="agent-page-error" role="alert"><span>{{ catalogError || error }}</span><el-button text @click="catalogError ? catalog() : loadView()">重试</el-button></div>
      <div v-if="loading" class="agent-view-loading"><el-skeleton :rows="5" animated/></div>
      <div v-else-if="welcome || square" class="agent-home">
        <section class="agent-hero"><div><p>鲁行智助</p><h1>{{ square ? '选择您的业务智能体' : '让无人车监管，更清晰' }}</h1><span>{{ square ? '围绕监管日常工作，选择能力、查看示例，开始一次有据可查的对话。' : '从车辆档案到风险研判，六类智能能力协助您查数据、理线索、办业务。' }}</span></div><img src="/ai/luxing-assistant-transparent.png" alt="蓝白色无人车AI助手" width="164" height="164"/></section>
        <form v-if="!square && definitions.length" class="agent-home-composer" @submit.prevent="send()"><textarea ref="composer" v-model="question" maxlength="3000" rows="3" aria-label="向AI助手提问" placeholder="例如：汇总当前未闭环的高风险告警，给出核查建议" @keydown="keydown"></textarea><footer><span><Sparkles :size="16"/>鲁行智能助手</span><el-button type="primary" native-type="submit" :disabled="question.trim().length < 2 || busy" aria-label="发送问题"><ArrowRight :size="22"/></el-button></footer></form>
        <div class="agent-cards"><button v-for="agent in definitions" :key="agent.code" type="button" @click="chooseAgent(agent.code)"><span class="agent-card-icon" :style="{ background: agent.color }"><component :is="icons[agent.icon] || Sparkles" :size="26" :stroke-width="1.7"/></span><div><strong>{{ agent.name }}</strong><p>{{ agent.brief }}</p></div><ChevronRight class="agent-card-arrow" :size="18"/></button></div>
        <div v-if="!definitions.length && !catalogError" class="agent-empty"><ShieldAlert :size="28"/><p>当前账号暂无可用智能体，请联系管理员核对业务权限。</p></div>
        <p class="agent-home-note">基于当前授权的平台记录进行分析，关键业务操作请在业务页面确认。</p>
      </div>
      <div v-else class="agent-chat">
        <div ref="messages" class="agent-messages" role="log" aria-label="对话记录" aria-live="polite" aria-relevant="additions">
          <section v-if="!turns.length && selectedAgent" class="agent-welcome"><span class="agent-welcome-icon" :style="{ background: selectedAgent.color }"><component :is="icons[selectedAgent.icon] || Sparkles" :size="27"/></span><h1>{{ selectedAgent.name }}</h1><p>{{ selectedAgent.brief }}</p><h2>您可以这样问</h2><button v-for="text in selectedAgent.examples" :key="text" type="button" @click="example(text)">{{ text }}<ArrowRight :size="16"/></button></section>
          <article v-for="turn in turns" :key="turn.requestKey" class="agent-turn">
            <div class="agent-user-message">{{ turn.question }}</div>
            <div class="agent-assistant-message"><img src="/ai/luxing-assistant-transparent.png" alt="" width="38" height="38"/><section><p v-if="turn.answer" class="agent-answer">{{ turn.answer }}</p><p v-else-if="turn.status === 'PENDING'" class="agent-pending"><span></span>{{ statusText || '正在分析…' }}</p><div v-if="turn.sources?.length" class="agent-sources"><strong>数据来源</strong><button v-for="source in turn.sources" :key="source.kind + source.id" type="button" @click="router.push(source.path)">{{ source.label }}<ExternalLink :size="12"/></button></div><footer v-if="turn.measuredAt" class="agent-answer-footer"><span>数据时点 {{ time(turn.measuredAt) }}</span><span>{{ scope }}</span></footer><div v-if="turn.error" class="agent-turn-error" role="alert"><span>{{ turn.error }}</span><el-button v-if="turn.status !== 'REDACTED'" text :disabled="busy" @click="send(turn)">重试</el-button></div></section></div>
          </article>
          <p v-if="busy && factsSummary" class="agent-facts-status"><ShieldAlert :size="14"/>{{ factsSummary }}</p>
        </div>
        <div class="agent-chat-compose"><form class="agent-chat-composer" @submit.prevent="send()"><textarea ref="composer" v-model="question" maxlength="3000" rows="2" aria-label="向AI助手提问" placeholder="继续提问，Enter 发送，Shift + Enter 换行" :disabled="busy" @keydown="keydown"></textarea><footer><span><component :is="icons[selectedAgent?.icon ?? ''] || Sparkles" :size="15"/>{{ currentTitle }}</span><el-button v-if="busy" :icon="Square" @click="stop">停止生成</el-button><el-button v-else type="primary" native-type="submit" :disabled="question.trim().length < 2" :icon="Send">发送</el-button></footer></form><p>回答供辅助研判，请结合来源记录核对。</p></div>
      </div>
    </section>
    <el-drawer v-model="showHelp" title="使用指南" size="420px"><div class="agent-guide"><h2>从业务问题出发</h2><p>选择智能体，输入车辆编号、风险事项或希望了解的平台流程。使用引号标出车辆编号，可缩小查询范围。</p><h2>核对来源与时点</h2><p>回答读取您当前有权查看的平台记录，并保留来源链接。历史对话仅本人可见；权限变化后，相关历史结果可能需要重新查询。</p><h2>保留正式办理环节</h2><p>智能体协助查询和分析，不代替开通、审批、发证或事件处置。请在对应业务页面核实后办理。</p><h2>停止与重试</h2><p>生成过程中可以停止；失败或停止后可以重试，历史记录不会重复增加相同问题。</p></div></el-drawer>
  </main>
</template>
