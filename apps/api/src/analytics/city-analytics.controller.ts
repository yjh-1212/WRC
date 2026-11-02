import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { SafetyMaterialsService } from '../safety/workspace-materials.service';
import { CityAnalysisQuery, CityReportCreateDto, CityReportBatchExportDto, CreditEntryCreateDto, CityCreditRepairDto, CreditRulesDto, EvaluationActionDto, EvaluationCreateDto, EvaluationRulesDto } from './city-analytics.dto';
import { evidenceZip } from '../safety/evidence-zip';
import { CityAnalysisService } from './city-analysis.service';
import { CityEvaluationService } from './city-evaluation.service';
import { CityCreditService } from './city-credit.service';
@ApiTags('市级分析评价')
@ApiBearerAuth()
@Controller('city-analytics')
export class CityAnalyticsController {
    constructor(private analysis: CityAnalysisService, private evaluation: CityEvaluationService, private credit: CityCreditService, private materials: SafetyMaterialsService) { }
    @Get('options')
    options(
    @CurrentUser()
    u: AuthUser) { if (!['analytics:operation:read', 'analytics:safety:read', 'analytics:evaluation:read', 'analytics:report:read'].some(p => u.permissions.includes(p)))
        throw new ForbiddenException('当前账号没有分析评价权限'); return this.analysis.options(u); }
    @Get('operations')
    @RequirePermissions('analytics:operation:read')
    operations(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.analysis.operations(u, q); }
    @Get('operations/export')
    @RequirePermissions('analytics:operation:read')
    operationExport(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.analysis.exportAnalysis(u, 'operations', q); }
    @Get('operations/records')
    @RequirePermissions('analytics:operation:read')
    records(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.analysis.operationRecords(u, q); }
    @Get('operations/records/:id')
    @RequirePermissions('analytics:operation:read')
    record(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string) { return this.analysis.operationRecord(u, id); }
    @Get('safety')
    @RequirePermissions('analytics:safety:read')
    safety(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.analysis.safety(u, q); }
    @Get('safety/export')
    @RequirePermissions('analytics:safety:read')
    safetyExport(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.analysis.exportAnalysis(u, 'safety', q); }
    @Get('safety/events')
    @RequirePermissions('analytics:safety:read')
    events(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.analysis.events(u, q); }
    @Get('evaluations/rules')
    @RequirePermissions('analytics:evaluation:read')
    rules(
    @CurrentUser()
    u: AuthUser) { return this.evaluation.rules(u); }
    @Post('evaluations/rules')
    @RequirePermissions('analytics:evaluation:config')
    saveRules(
    @CurrentUser()
    u: AuthUser, 
    @Body()
    d: EvaluationRulesDto) { return this.evaluation.saveRules(u, d); }
    @Get('evaluations/batches')
    @RequirePermissions('analytics:evaluation:read')
    batches(
    @CurrentUser()
    u: AuthUser) { return this.evaluation.batches(u); }
    @Get('evaluations')
    @RequirePermissions('analytics:evaluation:read')
    evaluations(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.evaluation.list(u, q); }
    @Post('evaluations')
    @RequirePermissions('analytics:evaluation:generate')
    createEvaluation(
    @CurrentUser()
    u: AuthUser, 
    @Body()
    d: EvaluationCreateDto) { return this.evaluation.create(u, d); }
    @Get('evaluations/:id')
    @RequirePermissions('analytics:evaluation:read')
    detail(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string) { return this.evaluation.detail(u, id); }
    @Get('evaluations/:id/export')
    @RequirePermissions('analytics:evaluation:read')
    evaluationExport(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string) { return this.evaluation.export(u, id); }
    @Post('evaluations/:id/actions')
    @RequirePermissions('analytics:evaluation:read')
    action(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string, 
    @Body()
    d: EvaluationActionDto) { const permission = d.action === 'PUBLISH' ? 'analytics:evaluation:publish' : d.action === 'RECALCULATE' ? 'analytics:evaluation:generate' : 'analytics:evaluation:review'; if (!u.permissions.includes(permission))
        throw new ForbiddenException('当前账号没有执行该评价操作的权限'); return this.evaluation.action(u, id, d); }
    @Get('credit/rules')
    @RequirePermissions('analytics:evaluation:read')
    creditRules(
    @CurrentUser()
    u: AuthUser) { return this.credit.rules(u); }
    @Post('credit/rules')
    @RequirePermissions('analytics:evaluation:config')
    saveCreditRules(
    @CurrentUser()
    u: AuthUser, 
    @Body()
    d: CreditRulesDto) { return this.credit.saveRules(u, d); }
    @Get('credit')
    @RequirePermissions('analytics:evaluation:read')
    credits(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.credit.list(u, q); }
    @Get('credit/sources')
    @RequirePermissions('analytics:evaluation:publish')
    sources(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.credit.sources(u, q); }
    @Post('credit/entries')
    @RequirePermissions('analytics:evaluation:publish')
    createCredit(
    @CurrentUser()
    u: AuthUser, 
    @Body()
    d: CreditEntryCreateDto) { return this.credit.create(u, d); }
    @Post('credit/entries/:id/repair')
    @RequirePermissions('analytics:evaluation:publish')
    repair(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string, 
    @Body()
    d: CityCreditRepairDto) { return this.credit.repair(u, id, d); }
    @Post('credit/materials')
    @RequirePermissions('analytics:evaluation:publish')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
    upload(
    @CurrentUser()
    u: AuthUser, 
    @Body('enterpriseId')
    id: string, 
    @UploadedFile()
    f: any) { return this.materials.upload(u, id, f, 'CREDIT'); }
    @Get('credit/materials/:id/content')
    @RequirePermissions('analytics:evaluation:read')
    async material(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string, 
    @Res()
    res: Response) { const file = await this.materials.download(u, id, 'CREDIT'); res.setHeader('Content-Type', file.mimeType); res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`); res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(file.buffer); }
    @Get('credit/:id')
    @RequirePermissions('analytics:evaluation:read')
    creditDetail(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string) { return this.credit.detail(u, id); }
    @Get('credit/:id/export')
    @RequirePermissions('analytics:evaluation:read')
    creditExport(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string) { return this.credit.export(u, id); }
    @Get('reports')
    @RequirePermissions('analytics:report:read')
    reports(
    @CurrentUser()
    u: AuthUser, 
    @Query()
    q: CityAnalysisQuery) { return this.analysis.reports(u, q); }
    @Post('reports')
    @RequirePermissions('analytics:report:generate')
    reportCreate(
    @CurrentUser()
    u: AuthUser, 
    @Body()
    d: CityReportCreateDto) { return this.analysis.createReport(u, d); }
    @Post('reports/batch-export')
    @RequirePermissions('analytics:report:export')
    async batchExport(
    @CurrentUser()
    u: AuthUser, 
    @Body()
    d: CityReportBatchExportDto) { const files = []; for (const id of d.ids) {
        const file = await this.analysis.exportReport(u, id);
        files.push({ name: file.filename, buffer: Buffer.from(file.content) });
    } return { filename: '统计报表-' + Date.now() + '.zip', content: evidenceZip(files).toString('base64') }; }
    @Get('reports/:id')
    @RequirePermissions('analytics:report:read')
    report(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string) { return this.analysis.report(u, id); }
    @Get('reports/:id/export')
    @RequirePermissions('analytics:report:export')
    exportReport(
    @CurrentUser()
    u: AuthUser, 
    @Param('id')
    id: string) { return this.analysis.exportReport(u, id); }
}
