import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentFactsService } from './facts.service';
import { AgentModelService } from './model.service';

@Module({ controllers: [AgentsController], providers: [AgentsService, AgentFactsService, AgentModelService] })
export class AgentsModule {}
