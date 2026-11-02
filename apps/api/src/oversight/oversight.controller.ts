import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CityTaskActionDto, CreateProvinceMatterDto, CreateResourceDto, GenerateDutyEvaluationDto, OversightQueryDto, MatterQueryDto, RelatedMatterQueryDto, ProvinceMatterActionDto, PublishDutyEvaluationDto, ResourceQueryDto, UpdateProvinceMatterDto, UpdateResourceDto } from './dto';
import { OversightService } from './oversight.service';

@ApiTags('省级监测与协同督办') @ApiBearerAuth() @Controller('oversight')
export class OversightController {
  constructor(private readonly oversight: OversightService) {}
  @Get('overview') overview(@CurrentUser() user: AuthUser) { return this.oversight.overview(user); }
  @Get('options') options(@CurrentUser() user: AuthUser) { return this.oversight.options(user); }
  @Get('matters') matters(@CurrentUser() user: AuthUser, @Query() query: MatterQueryDto) { return this.oversight.matters(user, query); }
  @Get('related-options') relatedOptions(@CurrentUser() user: AuthUser, @Query() query: RelatedMatterQueryDto) { return this.oversight.relatedOptions(user, query); }
  @Get('matters/:id') matter(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.oversight.matter(user, id); }
  @Post('matters') createMatter(@CurrentUser() user: AuthUser, @Body() dto: CreateProvinceMatterDto) { return this.oversight.createMatter(user, dto); }
  @Patch('matters/:id') updateMatter(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProvinceMatterDto) { return this.oversight.updateMatter(user, id, dto); }
  @Post('matters/:id/actions') actMatter(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProvinceMatterActionDto) { return this.oversight.actMatter(user, id, dto); }
  @Get('resources') resources(@CurrentUser() user: AuthUser, @Query() query: ResourceQueryDto) { return this.oversight.resources(user, query); }
  @Post('resources') createResource(@CurrentUser() user: AuthUser, @Body() dto: CreateResourceDto) { return this.oversight.createResource(user, dto); }
  @Patch('resources/:id') updateResource(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateResourceDto) { return this.oversight.updateResource(user, id, dto); }
  @Get('evaluations') evaluations(@CurrentUser() user: AuthUser, @Query() query: OversightQueryDto) { return this.oversight.evaluations(user, query); }
  @Post('evaluations/generate') generateEvaluations(@CurrentUser() user: AuthUser, @Body() dto: GenerateDutyEvaluationDto) { return this.oversight.generateEvaluations(user, dto); }
  @Post('evaluations/:id/publish') publishEvaluation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PublishDutyEvaluationDto) { return this.oversight.publishEvaluation(user, id, dto); }
  @Get('directory') directory(@CurrentUser() user: AuthUser) { return this.oversight.directory(user); }
  @Get('city-tasks') cityTasks(@CurrentUser() user: AuthUser, @Query() query: OversightQueryDto) { return this.oversight.cityTasks(user, query); }
  @Get('city-tasks/:id') cityTask(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.oversight.cityTask(user, id); }
  @Post('city-tasks/:id/actions') actCityTask(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CityTaskActionDto) { return this.oversight.actCityTask(user, id, dto); }
}
