import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AgentFactsService } from './facts.service';
import { AgentModelService } from './model.service';
import { AgentCode, AgentSource } from './catalog';
import { AgentMessageDto, ConversationQueryDto, CreateConversationDto } from './dto';

export type AgentEvent = { type: string; [key: string]: unknown };
@Injectable()
export class AgentsService {
  private readonly active = new Map<string, { conversationId: string; controller: AbortController }>();
  constructor(private readonly prisma: PrismaService, private readonly facts: AgentFactsService, private readonly model: AgentModelService) {}
  private parse<T>(value: string, fallback: T): T { try { return JSON.parse(value); } catch { return fallback; } }
  private scopeKey(user: AuthUser) { return createHash('sha256').update(JSON.stringify({ userId: user.id, workspaceId: user.workspaceId, enterpriseId: user.enterpriseId, level: user.accountLevel, organizations: [...(user.scopeOrganizationIds ?? [])].sort(), permissions: [...user.permissions].sort(), modules: [...(user.workspace?.modules ?? [])].sort(), authVersion: user.authVersion })).digest('hex'); }
  catalog(user: AuthUser) { return { agents: this.facts.available(user).map(({ permission, module, ...agent }) => agent), general: this.facts.general(user), scope: this.facts.scope(user), modelReady: this.model.configured() }; }
  async create(user: AuthUser, dto: CreateConversationDto) {
    const agent = this.facts.assert(user, dto.agentCode);
    return this.prisma.agentConversation.create({ data: { userId: user.id, workspaceId: user.workspaceId ?? null, enterpriseId: user.enterpriseId, agentCode: dto.agentCode, title: agent.name, pagePath: dto.pagePath.startsWith('/') && !dto.pagePath.startsWith('//') ? dto.pagePath : '' } });
  }
  async conversation(user: AuthUser, id: string) {
    const row = await this.prisma.agentConversation.findFirst({ where: { id, userId: user.id, workspaceId: user.workspaceId ?? null, enterpriseId: user.enterpriseId } });
    if (!row) throw new NotFoundException('对话不存在或已无法访问');
    this.facts.assert(user, row.agentCode);
    return row;
  }
  async list(user: AuthUser, query: ConversationQueryDto) {
    const available: string[] = this.facts.available(user).map(agent => agent.code);
    if (this.facts.general(user)) available.push('GENERAL');
    const where = { userId: user.id, workspaceId: user.workspaceId ?? null, enterpriseId: user.enterpriseId, agentCode: { in: available }, ...(query.q ? { title: { contains: query.q } } : {}) };
    const [total, items] = await Promise.all([this.prisma.agentConversation.count({ where }), this.prisma.agentConversation.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], select: { id: true, title: true, agentCode: true, updatedAt: true } })]);
    return { total, items, page: query.page };
  }
  private async viewTurn(user: AuthUser, turn: any) {
    const sources = this.parse<AgentSource[]>(turn.sourcesJson, []);
    const readable = turn.scopeKey === this.scopeKey(user) && await this.facts.canReadSources(user, sources);
    const interrupted = turn.status === 'PENDING' && this.active.get(user.id)?.conversationId !== turn.conversationId;
    return { id: turn.id, requestKey: turn.requestKey, question: turn.question, answer: readable ? turn.answer : '数据范围或权限已发生变化，请重新查询当前授权记录。', status: readable ? interrupted ? 'CANCELLED' : turn.status : 'REDACTED', sources: readable ? sources : [], measuredAt: readable ? this.parse<any>(turn.factsJson, {}).measuredAt : undefined, error: readable ? interrupted ? '上次生成已中断，可以重试。' : turn.error : null, createdAt: turn.createdAt };
  }
  async detail(user: AuthUser, id: string) {
    const row = await this.conversation(user, id);
    const turns = await this.prisma.agentTurn.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, take: 100 });
    return { ...row, turns: await Promise.all(turns.map(turn => this.viewTurn(user, turn))) };
  }
  async remove(user: AuthUser, id: string) { await this.conversation(user, id); if (this.active.get(user.id)?.conversationId === id) throw new ConflictException('请先停止生成，再删除对话'); await this.prisma.agentConversation.delete({ where: { id, userId: user.id } }); return { deleted: true }; }
  async cancel(user: AuthUser, id: string) { await this.conversation(user, id); const task = this.active.get(user.id); if (task?.conversationId === id) task.controller.abort(); return { cancelled: !!task && task.conversationId === id }; }
  async send(user: AuthUser, id: string, dto: AgentMessageDto, emit: (event: AgentEvent) => void, externalSignal: AbortSignal) {
    const conversation = await this.conversation(user, id);
    if (dto.question.trim().length < 2) throw new BadRequestException('请输入至少两个有效字符');
    const existing = await this.prisma.agentTurn.findUnique({ where: { conversationId_requestKey: { conversationId: id, requestKey: dto.requestKey } } });
    if (existing && existing.question !== dto.question.trim()) throw new BadRequestException('重试的问题内容不一致，请新建请求');
    if (existing?.status === 'COMPLETED') return this.viewTurn(user, existing);
    if (!existing && await this.prisma.agentTurn.count({ where: { conversationId: id } }) >= 100) throw new BadRequestException('本次对话已达到100条问题，请新建对话继续');
    if (this.active.has(user.id)) throw new ConflictException('已有回答正在生成，请先停止或等待完成');
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, externalSignal]);
    this.active.set(user.id, { conversationId: id, controller });
    let turnId: string | undefined;
    let answer = '';
    try {
      emit({ type: 'status', message: '正在查询授权范围内的平台记录…' });
      const facts = await this.facts.read(user, conversation.agentCode as AgentCode, dto.question);
      signal.throwIfAborted();
      const turn = existing
        ? await this.prisma.agentTurn.update({ where: { id: existing.id }, data: { status: 'PENDING', answer: '', error: null, scopeKey: this.scopeKey(user), sourcesJson: JSON.stringify(facts.sources), factsJson: JSON.stringify(facts) } })
        : await this.prisma.agentTurn.create({ data: { conversationId: id, requestKey: dto.requestKey, question: dto.question.trim(), scopeKey: this.scopeKey(user), sourcesJson: JSON.stringify(facts.sources), factsJson: JSON.stringify(facts) } });
      turnId = turn.id;
      await this.prisma.agentConversation.update({ where: { id }, data: { title: dto.question.trim().slice(0, 60), updatedAt: new Date() } });
      emit({ type: 'facts', summary: facts.summary, measuredAt: facts.measuredAt, sources: facts.sources });
      const previous = await this.prisma.agentTurn.findMany({ where: { conversationId: id, status: 'COMPLETED', id: { not: turn.id } }, orderBy: { createdAt: 'desc' }, take: 4 });
      const prior = await Promise.all(previous.reverse().map(row => this.viewTurn(user, row)));
      emit({ type: 'status', message: '正在整理分析与建议…' });
      answer = await this.model.answer(dto.question, facts, prior.filter(row => row.status === 'COMPLETED'), signal, text => { answer += text; emit({ type: 'delta', text }); });
      signal.throwIfAborted();
      const saved = await this.prisma.agentTurn.update({ where: { id: turn.id }, data: { answer, status: 'COMPLETED', error: null } });
      return this.viewTurn(user, saved);
    } catch (reason) {
      const message = signal.aborted ? '已停止生成，可重试继续分析。' : reason instanceof Error && (reason.name === 'TimeoutError' || /timeout/i.test(reason.message)) ? '分析超时，请稍后重试。' : reason instanceof Error && !/fetch failed|ECONN|prisma|Invalid.*invocation/i.test(reason.message) ? reason.message : '智能分析暂不可用，请稍后重试。';
      if (turnId) await this.prisma.agentTurn.update({ where: { id: turnId }, data: { status: signal.aborted ? 'CANCELLED' : 'FAILED', answer: answer.slice(0, 16000), error: message.slice(0, 300) } });
      throw new BadRequestException(message);
    } finally { if (this.active.get(user.id)?.controller === controller) this.active.delete(user.id); }
  }
}
