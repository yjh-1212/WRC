import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ActivateMemberDto, ApplyCityDto, ChangeRequestDto, CreateCityWorkspaceDto, CreateWorkspaceMemberDto, InviteMemberDto, PatchWorkspaceDto, PatchWorkspaceMemberDto, RecoverAdminDto, ResubmitApplicationDto, ReviewApplicationDto, SaasQueryDto, TrackApplicationDto, TrackingSecretDto, TransferAdminDto } from './dto';
import { ApplicationUpload, SaasService } from './saas.service';

@ApiTags('省市开通与授权') @Controller('saas')
export class SaasController {
  constructor(private readonly saas: SaasService) {}
  @Public() @Get('catalog') catalog() { return this.saas.catalog(); }
  @Public() @Post('applications') apply(@Body() dto: ApplyCityDto) { return this.saas.apply(dto); }
  @Public() @Post('applications/track') track(@Body() dto: TrackApplicationDto) { return this.saas.track(dto); }
  @Public() @Post('applications/:id/resubmit') resubmit(@Param('id') id: string, @Body() dto: ResubmitApplicationDto) { return this.saas.resubmit(id, dto); }
  @Public() @Post('applications/:id/withdraw') withdraw(@Param('id') id: string, @Body() dto: TrackingSecretDto) { return this.saas.withdraw(id, dto.trackingSecret); }
  @Public() @Post('applications/:id/materials')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, fieldSize: 256 } }))
  uploadMaterial(@Param('id') id: string, @Body() dto: TrackingSecretDto, @UploadedFile() file: ApplicationUpload) { return this.saas.uploadMaterial(id, dto.trackingSecret, file); }
  @Public() @Delete('applications/:id/materials/:materialId')
  removeMaterial(@Param('id') id: string, @Param('materialId') materialId: string, @Body() dto: TrackingSecretDto) { return this.saas.removeMaterial(id, materialId, dto.trackingSecret); }
  @Get('applications/:id/materials/:materialId/download')
  async downloadMaterial(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('materialId') materialId: string, @Res() response: Response) {
    const file = await this.saas.downloadMaterial(user, id, materialId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.buffer);
  }
  @Public() @Post('applications/:id/materials/:materialId/download') @HttpCode(200)
  async downloadOwnMaterial(@Param('id') id: string, @Param('materialId') materialId: string, @Body() dto: TrackingSecretDto, @Res() response: Response) {
    const file = await this.saas.downloadOwnMaterial(id, materialId, dto.trackingSecret);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.buffer);
  }
  @Public() @Post('activate') activate(@Body() dto: ActivateMemberDto) { return this.saas.activate(dto); }
  @Get('applications') applications(@CurrentUser() user: AuthUser, @Query() query: SaasQueryDto) { return this.saas.applications(user, query); }
  @Post('applications/:id/review') review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewApplicationDto) { return this.saas.review(user, id, dto); }
  @Post('applications/:id/provision') provision(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.saas.provision(user, id); }
  @Get('workspaces') workspaces(@CurrentUser() user: AuthUser, @Query() query: SaasQueryDto) { return this.saas.workspaces(user, query); }
  @Get('workspaces/options') workspaceOptions(@CurrentUser() user: AuthUser) { return this.saas.workspaceOptions(user); }
  @Post('workspaces') createWorkspace(@CurrentUser() user: AuthUser, @Body() dto: CreateCityWorkspaceDto) { return this.saas.createWorkspace(user, dto); }
  @Patch('workspaces/:id') updateWorkspace(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PatchWorkspaceDto) { return this.saas.updateWorkspace(user, id, dto); }
  @Post('workspaces/:id/invitations') invite(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: InviteMemberDto) { return this.saas.invite(user, id, dto); }
  @Post('workspaces/:id/recover-admin') recover(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RecoverAdminDto) { return this.saas.recoverAdmin(user, id, dto); }
  @Get('current') current(@CurrentUser() user: AuthUser) { return this.saas.current(user); }
  @Post('current/confirm-rules') confirmRules(@CurrentUser() user: AuthUser) { return this.saas.confirmRules(user); }
  @Get('members') members(@CurrentUser() user: AuthUser) { return this.saas.members(user); }
  @Post('members') createMember(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceMemberDto) { return this.saas.createMember(user, dto); }
  @Patch('members/:id') updateMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PatchWorkspaceMemberDto) { return this.saas.updateMember(user, id, dto); }
  @Post('transfer-admin') transfer(@CurrentUser() user: AuthUser, @Body() dto: TransferAdminDto) { return this.saas.transferAdmin(user, dto.targetUserId); }
  @Post('change-requests') change(@CurrentUser() user: AuthUser, @Body() dto: ChangeRequestDto) { return this.saas.changeRequest(user, dto); }
  @Post('notices/:id/read') readNotice(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.saas.readNotice(user, id); }
}
