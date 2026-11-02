import { Body, Controller, Delete, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AgentsService } from './agents.service';
import { AgentMessageDto, ConversationQueryDto, CreateConversationDto } from './dto';

@ApiTags('AI智能体中心')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}
  @Get('catalog') catalog(@CurrentUser() user: AuthUser) { return this.agents.catalog(user); }
  @Get('conversations') list(@CurrentUser() user: AuthUser, @Query() query: ConversationQueryDto) { return this.agents.list(user, query); }
  @Post('conversations') create(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationDto) { return this.agents.create(user, dto); }
  @Get('conversations/:id') detail(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.agents.detail(user, id); }
  @Delete('conversations/:id') remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.agents.remove(user, id); }
  @Post('conversations/:id/cancel') cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.agents.cancel(user, id); }
  @Post('conversations/:id/messages/stream')
  async send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AgentMessageDto, @Res() response: Response) {
    await this.agents.conversation(user, id);
    const controller = new AbortController();
    response.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' }); response.flushHeaders();
    const emit = (event: unknown) => { if (!response.destroyed && !response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`); };
    const heartbeat = setInterval(() => { if (!response.destroyed && !response.writableEnded) response.write(': keep-alive\n\n'); }, 10000);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', closed);
    try { emit({ type: 'status', message: '正在开始查询…' }); emit({ type: 'result', turn: await this.agents.send(user, id, dto, emit, controller.signal) }); }
    catch (reason) { const error = reason as { getStatus?: () => number; message?: string }; emit({ type: 'error', code: error.getStatus?.() ?? 500, message: error.getStatus ? error.message : '智能分析暂不可用，请稍后重试。' }); }
    finally { clearInterval(heartbeat); response.off('close', closed); response.end(); }
  }
}
