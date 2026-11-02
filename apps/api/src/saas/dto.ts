import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const MODULE_KEYS = ['ARCHIVES', 'ADMISSION', 'OPERATIONS', 'SAFETY', 'ANALYTICS', 'GOVERNANCE'];
export class SaasQueryDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class ApplyCityDto {
  @IsString() @Matches(/^37\d{4}$/) cityCode!: string;
  @IsString() @MinLength(2) @MaxLength(120) unitName!: string;
  @IsString() @MinLength(2) @MaxLength(40) contactName!: string;
  @IsString() @Matches(/^[\d+()\- ]{7,30}$/) contactPhone!: string;
  @IsString() @MinLength(2) @MaxLength(40) adminName!: string;
  @IsString() @Matches(/^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/) adminUsername!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(MODULE_KEYS, { each: true }) modules!: string[];
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000) expectedVehicles = 0;
  @IsString() @MinLength(5) @MaxLength(4000) materialNote!: string;
}
export class CreateCityWorkspaceDto {
  @IsString() @Matches(/^37\d{4}$/) cityCode!: string;
  @IsString() @MinLength(2) @MaxLength(120) unitName!: string;
  @IsString() @MinLength(2) @MaxLength(40) contactName!: string;
  @IsString() @Matches(/^[\d+()\- ]{7,30}$/) contactPhone!: string;
  @IsString() @MinLength(2) @MaxLength(40) adminName!: string;
  @IsString() @Matches(/^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/) adminUsername!: string;
  @IsString() @MinLength(8) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,128}$/, { message: '初始密码需至少8位且包含大小写字母、数字和符号' }) password!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(MODULE_KEYS, { each: true }) modules!: string[];
  @IsOptional() @IsDateString() validUntil?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) vehicleQuota = 1000;
  @IsOptional() @IsString() @MaxLength(2000) offlineReference?: string;
}
export class TrackApplicationDto {
  @IsString() @IsNotEmpty() @MaxLength(80) businessNo!: string;
  @IsString() @MinLength(20) @MaxLength(128) trackingSecret!: string;
}
export class TrackingSecretDto {
  @IsString() @MinLength(20) @MaxLength(128) trackingSecret!: string;
}
export class ResubmitApplicationDto extends PartialType(ApplyCityDto) {
  @IsString() @MinLength(20) @MaxLength(128) trackingSecret!: string;
}
export class ReviewApplicationDto {
  @IsIn(['APPROVE', 'RETURN', 'REJECT']) action!: string;
  @IsString() @MinLength(2) @MaxLength(2000) comment!: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(MODULE_KEYS, { each: true }) modules?: string[];
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsObject() quotas?: Record<string, number>;
}
export class PatchWorkspaceDto {
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(MODULE_KEYS, { each: true }) modules?: string[];
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsObject() quotas?: Record<string, number>;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsString() @MinLength(2) @MaxLength(2000) reason!: string;
}
export class InviteMemberDto {
  @IsString() @Matches(/^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/) username!: string;
  @IsString() @MinLength(2) @MaxLength(40) displayName!: string;
  @IsOptional() @IsIn(['CITY_ADMIN', 'CITY_USER']) roleCode: string = 'CITY_ADMIN';
}
export class RecoverAdminDto extends InviteMemberDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}
export class ActivateMemberDto {
  @IsString() @MinLength(20) @MaxLength(128) token!: string;
  @IsString() @MinLength(8) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,128}$/, { message: '密码需至少8位且包含大小写字母、数字和符号' }) password!: string;
}
export class CreateWorkspaceMemberDto extends InviteMemberDto {
  @IsString() @MinLength(8) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,128}$/, { message: '密码需至少8位且包含大小写字母、数字和符号' }) password!: string;
  @IsOptional() @IsString() organizationId?: string;
}
export class PatchWorkspaceMemberDto {
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: string;
  @IsOptional() @IsIn(['CITY_ADMIN', 'CITY_USER']) roleCode?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(40) displayName?: string;
}
export class TransferAdminDto {
  @IsString() @IsNotEmpty() targetUserId!: string;
}
export class ChangeRequestDto {
  @IsIn(['EXTEND', 'RENEW', 'ADMIN_CHANGE']) kind!: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(MODULE_KEYS, { each: true }) modules?: string[];
  @IsString() @MinLength(5) @MaxLength(4000) materialNote!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(40) adminName?: string;
  @IsOptional() @IsString() @Matches(/^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/) adminUsername?: string;
}
