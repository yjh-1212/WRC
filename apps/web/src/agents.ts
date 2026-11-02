import { useSessionStore } from './stores/session';

export interface AgentDefinition { code: string; name: string; icon: string; color: string; brief: string; examples: string[] }
export interface AgentSource { id: string; kind: string; label: string; path: string }
export interface AgentTurn { id: string; requestKey: string; question: string; answer: string; status: string; sources: AgentSource[]; measuredAt?: string; error?: string | null; createdAt?: string }
export interface ConversationSummary { id: string; title: string; agentCode: string; updatedAt: string }
export interface AgentConversation extends ConversationSummary { turns: AgentTurn[]; pagePath: string }
export type AgentProgress = { type: string; message?: string; text?: string; summary?: string; measuredAt?: string; sources?: AgentSource[]; turn?: AgentTurn };

export async function streamAgentAnswer(id: string, question: string, requestKey: string, signal: AbortSignal, onEvent: (event: AgentProgress) => void): Promise<AgentTurn> {
  const session = useSessionStore();
  const request = () => fetch(`/api/agents/conversations/${encodeURIComponent(id)}/messages/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ question, requestKey }), signal });
  let response = await request();
  if (response.status === 401 && session.refreshToken && await session.refresh()) response = await request();
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message ?? '请求未完成，请重试'); }
  if (!response.body) throw new Error('回答连接未建立，请重试');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', result: AgentTurn | undefined;
  const line = (text: string) => {
    if (!text.startsWith('data:')) return;
    const value = text.slice(5).trim(); if (!value) return;
    const event = JSON.parse(value) as AgentProgress;
    if (event.type === 'error') throw new Error(event.message ?? '分析未完成，请重试');
    if (event.type === 'result' && event.turn) result = event.turn;
    onEvent(event);
  };
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      pending += decoder.decode(item.value, { stream: true });
      if (pending.length > 512000) throw new Error('回答连接异常，请重试');
      let at: number;
      while ((at = pending.indexOf('\n')) !== -1) { line(pending.slice(0, at).replace(/\r$/, '')); pending = pending.slice(at + 1); }
    }
    pending += decoder.decode(); if (pending.trim()) line(pending.trim());
    if (!result) throw new Error('回答连接中断，请重试');
    return result;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
