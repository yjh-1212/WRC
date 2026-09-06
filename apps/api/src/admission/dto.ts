import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty,
  IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

const applicationTypes = ['ENTERPRISE_ONBOARDING', 'ROAD_TEST', 'LICENSE_RENEWAL'] as const;
const applicationStatuses = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;

export class AdmissionPageQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(applicationTypes) applicationType?: string;
  @IsOptional() @IsIn(applicationStatuses) status?: string;
  @IsOptional() @IsString() enterpriseId?: string;
}

export class TaskPageQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'RETURNED', 'REJECTED']) status?: string;
}

export class LicensePageQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['VALID', 'EXPIRING', 'EXPIRED', 'SUSPENDED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() enterpriseId?: string;
}

export class CreateAdmissionApplicationDto {
  @IsIn(applicationTypes) applicationType!: string;
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(120) enterpriseNameSnapshot?: string;
  @IsOptional() @IsString() @MaxLength(32) creditCodeSnapshot?: string;
  @IsOptional() @IsString() @MaxLength(60) legalRepresentative?: string;
  @IsOptional() @IsString() @MaxLength(60) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(240) registeredAddress?: string;
  @IsOptional() @IsString() @MaxLength(2000) operationPlan?: string;
  @IsOptional() @IsString() @MaxLength(2000) qualificationSummary?: string;
  @IsOptional() @IsISO8601() roadTestStartAt?: string;
  @IsOptional() @IsISO8601() roadTestEndAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) roadTestRoute?: string;
  @IsOptional() @IsString() @MaxLength(4000) testPlan?: string;
  @IsOptional() @IsString() @MaxLength(4000) safetyMeasures?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true }) vehicleIds?: string[];
  @IsOptional() @IsString() targetLicenseId?: string;
  @IsOptional() @IsISO8601() requestedExpiresAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) renewalReason?: string;
}

export class UpdateAdmissionApplicationDto extends PartialType(CreateAdmissionApplicationDto) {}

export class HandleApprovalDto {
  @IsIn(['APPROVE', 'RETURN', 'REJECT']) action!: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class ProcessNodeDto {
  @IsString() @MinLength(2) @MaxLength(40) nodeCode!: string;
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @Type(() => Number) @IsInt() @Min(1) orderNo!: number;
  @IsIn(['APPROVER', 'REGULATORY_ADMIN']) approvalRoleCode!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(720) timeLimitHours = 48;
  @IsOptional() @IsIn(['ANY', 'ALL']) countersignMode?: string;
  @IsOptional() @IsBoolean() canReturn?: boolean;
}

export class CreateProcessDefinitionDto {
  @IsString() @MinLength(2) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsIn(applicationTypes) applicationType!: string;
  @Type(() => Number) @IsInt() @Min(1) version = 1;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ProcessNodeDto) nodes!: ProcessNodeDto[];
}

export class UpdateProcessDefinitionDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'INACTIVE']) status?: string;
}

export class IssueLicenseDto {
  @IsString() @IsNotEmpty() vehicleId!: string;
  @IsString() @MinLength(4) @MaxLength(40) businessNo!: string;
  @IsString() @MinLength(4) @MaxLength(40) licenseNo!: string;
  @IsISO8601() issuedAt!: string;
  @IsISO8601() expiresAt!: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}
