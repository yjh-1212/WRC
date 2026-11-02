import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export const MATTER_KINDS = ['RISK_NOTICE', 'SUPERVISION', 'CROSS_CITY', 'EMERGENCY'];
export const PILOT_STAGES = ['PREPARING', 'SUBMITTED', 'REVIEWING', 'RECTIFYING', 'ACCEPTED', 'OPERATING'];
export const RESOURCE_KINDS = ['VEHICLE', 'STAFF', 'SITE', 'ENERGY', 'REPAIR'];
export class OversightQueryDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsIn(MATTER_KINDS) kind?: string;
  @IsOptional() @IsString() @MaxLength(100) workspaceId?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class ResourceQueryDto extends OmitType(OversightQueryDto, ['kind'] as const) {
  @IsOptional() @IsIn(RESOURCE_KINDS) kind?: string;
}
export class MatterQueryDto extends OversightQueryDto {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) createdMonth?: string;
  @IsOptional() @IsIn(['STANDARD', 'SPECIAL_INSPECTION']) template?: string;
  @IsOptional() @IsIn(['ALL', 'WAITING', 'PROCESSING', 'REVIEW', 'OVERDUE']) bucket?: string;
  @IsOptional() @IsDateString() dueFrom?: string;
  @IsOptional() @IsDateString() dueTo?: string;
}
export class RelatedMatterQueryDto {
  @IsIn(['VEHICLE', 'ALERT', 'ACCIDENT']) type!: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.split(',').filter(Boolean) : value)
  @IsArray() @ArrayMaxSize(16) @IsString({ each: true }) workspaceIds?: string[];
}
export class InspectionCheckDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,40}$/) id!: string;
  @IsString() @MinLength(2) @MaxLength(200) label!: string;
}
export class InspectionResultDto {
  @IsString() @MaxLength(40) itemId!: string;
  @IsIn(['NORMAL', 'ISSUE', 'NOT_APPLICABLE']) status!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class InspectionReportDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000) enterprises!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000) vehicles!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000) problemVehicles!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000) rectifiedVehicles!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => InspectionResultDto) checks!: InspectionResultDto[];
}
export class CreateProvinceMatterDto {
  @IsIn(MATTER_KINDS) kind!: string;
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsString() @MinLength(5) @MaxLength(4000) description!: string;
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) level: string = 'MEDIUM';
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) basis?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(16) @IsString({ each: true }) workspaceIds!: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) resourceIds?: string[];
  @IsOptional() @IsIn(['STANDARD', 'SPECIAL_INSPECTION']) template?: string;
  @IsOptional() @IsString() @MaxLength(100) leadWorkspaceId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => InspectionCheckDto) checklist?: InspectionCheckDto[];
  @IsOptional() @IsIn(['VEHICLE', 'ALERT', 'ACCIDENT']) relatedType?: string | null;
  @IsOptional() @IsString() @MaxLength(100) relatedId?: string | null;
}
export class UpdateProvinceMatterDto extends PartialType(CreateProvinceMatterDto) {}
export class ProvinceMatterActionDto {
  @IsIn(['DISPATCH', 'RETURN', 'CLOSE']) action!: string;
  @IsString() @MinLength(2) @MaxLength(2000) comment!: string;
  @IsOptional() @IsString() workspaceId?: string;
}
export class CityTaskActionDto {
  @IsIn(['RESPOND', 'SUBMIT']) action!: string;
  @IsOptional() @IsString() @MaxLength(4000) feedback?: string;
  @IsOptional() @IsString() @MaxLength(4000) evidenceNote?: string;
  @IsOptional() @ValidateNested() @Type(() => InspectionReportDto) report?: InspectionReportDto;
}
export class UpsertPilotDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsIn(PILOT_STAGES) stage!: string;
  @IsString() @MinLength(2) @MaxLength(40) responsibleName!: string;
  @IsOptional() @IsDateString() planDate?: string | null;
  @IsString() @MinLength(5) @MaxLength(4000) summary!: string;
  @IsOptional() @IsString() @MaxLength(2000) reviewComment?: string;
}
export class CreateResourceDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(RESOURCE_KINDS) kind!: string;
  @IsIn(['AVAILABLE', 'BUSY', 'UNAVAILABLE']) status: string = 'AVAILABLE';
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) capacity = 1;
  @IsOptional() @IsString() @MaxLength(40) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(2000) conditions?: string;
}
export class UpdateResourceDto extends PartialType(CreateResourceDto) {}
export class GenerateDutyEvaluationDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
}
export class PublishDutyEvaluationDto {
  @IsString() @MinLength(5) @MaxLength(4000) conclusion!: string;
}
