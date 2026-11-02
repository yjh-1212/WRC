import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
export class CityAnalysisQuery {
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    from?: string;
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    to?: string;
    @IsOptional()
    @IsString()
    enterpriseId?: string;
    @IsOptional()
    @IsString()
    vehicleId?: string;
    @IsOptional()
    @IsString()
    vehicleType?: string;
    @IsOptional()
    @IsString()
    manufacturerId?: string;
    @IsOptional()
    @IsString()
    taskId?: string;
    @IsOptional()
    @IsString()
    status?: string;
    @IsOptional()
    @IsString()
    grade?: string;
    @IsOptional()
    @IsString()
    category?: string;
    @IsOptional()
    @IsIn(['ALL', 'PENDING', 'HANDLING', 'CLOSED'])
    queue?: string;
    @IsOptional()
    @IsIn(['ALERT', 'ACCIDENT', 'VIOLATION', 'OFFLINE'])
    eventType?: string;
    @IsOptional()
    @IsString()
    sourceType?: string;
    @IsOptional()
    @IsIn(['ALL', 'CONFIRMED'])
    confirmation?: string;
    @IsOptional()
    @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SPECIAL'])
    reportType?: string;
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    generatedFrom?: string;
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    generatedTo?: string;
    @IsOptional()
    @IsString()
    @MaxLength(200)
    q?: string;
    @IsOptional()
    @IsIn(['name', 'mileage', 'trips', 'durationHours', 'total', 'score', 'updatedAt'])
    sort?: string;
    @IsOptional()
    @IsIn(['asc', 'desc'])
    order?: string;
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1;
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize = 20;
}
export class ScoringBandDto {
    @IsOptional()
    @IsNumber()
    @Min(0)
    minValue!: number | null;
    @IsOptional()
    @IsNumber()
    @Min(0)
    maxValue!: number | null;
    @IsNumber()
    @Min(0)
    @Max(100)
    score!: number;
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    label!: string;
}
export class IndicatorDto {
    @IsIn(['accidentCount', 'violationCount', 'onlineRate', 'rectificationRate'])
    metricKey!: string;
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string;
    @IsIn(['SAFETY', 'COMPLIANCE', 'OPERATION'])
    dimension!: string;
    @IsNumber()
    @Min(.01)
    @Max(100)
    weight!: number;
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => ScoringBandDto)
    rules!: ScoringBandDto[];
}
export class EvaluationRulesDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name!: string;
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(10)
    @ValidateNested({ each: true })
    @Type(() => IndicatorDto)
    indicators!: IndicatorDto[];
    @IsInt()
    @Min(0)
    expectedVersion!: number;
}
export class EvaluationCreateDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    name!: string;
    @IsIn(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'SPECIAL'])
    periodType!: string;
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    from!: string;
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    to!: string;
    @IsOptional()
    @IsString()
    enterpriseId?: string;
    @IsString()
    @IsNotEmpty()
    rulesVersion!: string;
}
export class EvaluationActionDto {
    @IsIn(['REVIEW', 'RETURN', 'PUBLISH', 'RECALCULATE'])
    action!: string;
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    comment!: string;
    @IsInt()
    @Min(1)
    version!: number;
}
export class CreditEntryCreateDto {
    @IsString()
    @IsNotEmpty()
    enterpriseId!: string;
    @IsIn(['ACCIDENT', 'VIOLATION', 'INSPECTION'])
    sourceType!: string;
    @IsString()
    @IsNotEmpty()
    sourceId!: string;
    @IsIn(['MINOR', 'GENERAL', 'SERIOUS', 'MAJOR'])
    severity!: string;
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    reason!: string;
    @IsString()
    @IsNotEmpty()
    rulesVersion!: string;
}
export class CityCreditRepairDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    comment!: string;
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @ArrayUnique()
    @IsString({ each: true })
    materialIds!: string[];
}
export class CreditBandDto {
    @IsIn(['MINOR', 'GENERAL', 'SERIOUS', 'MAJOR'])
    key!: string;
    @IsInt()
    @Min(1)
    @Max(100)
    points!: number;
    @IsInt()
    @Min(0)
    @Max(3650)
    repairDays!: number;
}
export class CreditRulesDto {
    @IsInt()
    @Min(0)
    expectedVersion!: number;
    @IsArray()
    @ArrayMinSize(4)
    @ArrayMaxSize(4)
    @ValidateNested({ each: true })
    @Type(() => CreditBandDto)
    bands!: CreditBandDto[];
}
export class CityReportCreateDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;
    @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SPECIAL'])
    reportType!: string;
    @IsIn(['OPERATIONS', 'SAFETY', 'COMPREHENSIVE', 'ENTERPRISE'])
    category!: string;
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    from!: string;
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    to!: string;
    @IsOptional()
    @IsString()
    enterpriseId?: string;
}
export class CityReportBatchExportDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @ArrayUnique()
    @IsString({ each: true })
    ids!: string[];
}
