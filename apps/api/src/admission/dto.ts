import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty,
  IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export const applicationTypes = ['ENTERPRISE_ONBOARDING', 'VEHICLE_REGISTRATION', 'ROAD_TEST', 'DEMONSTRATION', 'LICENSE_CHANGE', 'LICENSE_RENEWAL', 'LICENSE_EXIT'] as const;
const applicationStatuses = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED', 'APPROVED', 'REJECTED', 'COMPLETED', 'WITHDRAWN'] as const;

export class AdmissionPageQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(applicationTypes) applicationType?: string;
  @IsOptional() @IsIn(applicationStatuses) status?: string;
  @IsOptional() @IsString() enterpriseId?: string;
  @IsOptional() @IsIn(['all', 'pending']) view?: string;
}

export class TaskPageQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'RETURNED', 'REJECTED']) status?: string;
}

export class LicensePageQueryDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() workspaceId?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['VALID', 'EXPIRING', 'EXPIRED', 'SUSPENDED', 'CANCELLED', 'REVOKED']) status?: string;
  @IsOptional() @IsString() enterpriseId?: string;
  @IsOptional() @IsIn(['ROAD_TEST', 'DEMONSTRATION', 'LEGACY']) licenseType?: string;
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
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ArrayUnique() @IsString({ each: true }) vehicleIds?: string[];
  @IsOptional() @IsString() targetLicenseId?: string;
  @IsOptional() @IsISO8601() requestedExpiresAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) renewalReason?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) regionIds?: string[];
  @IsOptional() @IsString() @MaxLength(1000) changeReason?: string;
  @IsOptional() @IsString() @MaxLength(80) allowedHours?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(80) speedLimit?: number;
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
  @IsString() @MinLength(2) @MaxLength(120) approvalRoleCode!: string;
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
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(40) businessNo?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(40) licenseNo?: string;
  @IsOptional() @IsISO8601() issuedAt?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) regionIds?: string[];
  @IsOptional() @IsString() @MaxLength(80) allowedHours?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(80) speedLimit?: number;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}

export class PermitActionDto {
  @IsIn(['SUSPEND', 'RESUME', 'REVOKE', 'CANCEL']) action!: string;
  @IsString() @MinLength(2) @MaxLength(1000) reason!: string;
}
