import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class AnalyticsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() level?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize = 20;
}

export class CreateEvaluationTaskDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'SPECIAL']) periodType!: string;
  @ApiProperty() @IsDateString() periodStart!: string;
  @ApiProperty() @IsDateString() periodEnd!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
}

export class UpdateIndicatorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateRuleDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minValue?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() maxValue?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) score?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
}

export class SaveReconstructionDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(180) windowMinutes?: number;
  @ApiProperty() @IsString() @IsNotEmpty() conclusion!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() primaryCause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contributingFactor?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['DRAFT', 'COMPLETED']) status?: string;
}

export class CreateAppealDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() evidence?: string;
}

export class ReviewAppealDto {
  @ApiProperty() @IsIn(['ACCEPT', 'REJECT']) action!: string;
  @ApiProperty() @IsString() @IsNotEmpty() comment!: string;
}

export class CreateReportDto {
  @ApiProperty() @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'SPECIAL']) reportType!: string;
  @ApiProperty() @IsIn(['OPERATIONS', 'SAFETY', 'COMPREHENSIVE', 'ENTERPRISE']) category!: string;
  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiProperty() @IsDateString() periodStart!: string;
  @ApiProperty() @IsDateString() periodEnd!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipient?: string;
}

export class UpdateReportDto extends PartialType(CreateReportDto) {
  @ApiPropertyOptional() @IsOptional() @IsIn(['GENERATED', 'DISTRIBUTED']) status?: string;
}
