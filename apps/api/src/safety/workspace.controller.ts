import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { WorkspaceQueryDto, EvidenceSealDto, EventVideosDto, WorkspaceTaskDto, WorkspaceTaskActionDto, DeterminationDto } from './workspace.dto';
import { EventWorkspaceService } from './event-workspace.service';
import { TaskWorkspaceService } from './task-workspace.service';
import { SafetyMaterialsService } from './workspace-materials.service';

@ApiTags('安全监管工作区') @ApiBearerAuth() @Controller('safety/workspace')
export class SafetyWorkspaceController {
  constructor(private events:EventWorkspaceService,private tasks:TaskWorkspaceService,private materials:SafetyMaterialsService){}
  @Get('options') options(@CurrentUser() user:AuthUser){return this.events.options(user);}
  @Get('events') eventsList(@CurrentUser() user:AuthUser,@Query() q:WorkspaceQueryDto){return this.events.list(user,q);}
  @Get('events/:type/:id') detail(@CurrentUser() user:AuthUser,@Param('type') type:string,@Param('id') id:string,@Query() q:WorkspaceQueryDto){return this.events.detail(user,type,id,q);}
  @Post('events/:type/:id/videos') videos(@CurrentUser() user:AuthUser,@Param('type') type:string,@Param('id') id:string,@Body() dto:EventVideosDto){return this.events.submitVideos(user,type,id,dto);}
  @Post('events/:type/:id/preserve') preserve(@CurrentUser() user:AuthUser,@Param('type') type:string,@Param('id') id:string,@Body() dto:EvidenceSealDto){return this.events.seal(user,type,id,dto);}
  @Get('events/:type/:id/export') async export(@CurrentUser() user:AuthUser,@Param('type') type:string,@Param('id') id:string,@Query() q:WorkspaceQueryDto,@Res() response:Response){const file=await this.events.export(user,type,id,q);response.setHeader('Content-Type','application/zip');response.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);response.send(file.buffer);}
  @Post('accidents/:id/determination') determination(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body() dto:DeterminationDto){return this.events.determination(user,id,dto);}
  @Get('tasks') @RequirePermissions('safety:emergency:read') listTasks(@CurrentUser() user:AuthUser,@Query() q:WorkspaceQueryDto){return this.tasks.list(user,q);}
  @Get('tasks/:type/:id') @RequirePermissions('safety:emergency:read') task(@CurrentUser() user:AuthUser,@Param('type') type:string,@Param('id') id:string){return this.tasks.detail(user,type,id);}
  @Post('tasks') @RequirePermissions('safety:emergency:dispatch') createTask(@CurrentUser() user:AuthUser,@Body() dto:WorkspaceTaskDto){return this.tasks.create(user,dto);}
  @Post('tasks/:type/:id/actions') @RequirePermissions('safety:emergency:read') action(@CurrentUser() user:AuthUser,@Param('type') type:string,@Param('id') id:string,@Body() dto:WorkspaceTaskActionDto){return this.tasks.act(user,type,id,dto);}
  @Post('materials') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:100*1024*1024}})) upload(@CurrentUser() user:AuthUser,@Body('enterpriseId') enterpriseId:string,@UploadedFile() file:any){return this.materials.upload(user,enterpriseId,file);}
  @Get('materials/:id/content') async download(@CurrentUser() user:AuthUser,@Param('id') id:string,@Res() response:Response){const file=await this.materials.download(user,id);response.setHeader('Content-Type',file.mimeType);response.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);response.setHeader('Cache-Control','private, no-store');response.setHeader('X-Content-Type-Options','nosniff');response.send(file.buffer);}
}
