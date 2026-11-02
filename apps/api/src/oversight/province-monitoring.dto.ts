import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ProvinceMonitoringQueryDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() @MaxLength(100) workspaceId?: string;
  @IsOptional() @IsString() @MaxLength(100) enterpriseId?: string;
  @IsOptional() @IsString() @MaxLength(100) vehicleId?: string;
  @IsOptional() @IsString() @MaxLength(100) recordId?: string;
  @IsOptional() @IsIn(['ALL', 'RUNNING', 'OFFLINE', 'ALERT']) bucket: string = 'ALL';
  @IsOptional() @IsIn(['ONLINE', 'OFFLINE']) onlineStatus?: string;
  @IsOptional() @IsIn(['RUNNING', 'IDLE', 'PARKED', 'OFFLINE']) drivingState?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) riskLevel?: string;
  @IsOptional() @IsIn(['ALL', 'HANDLING', 'PENDING_CONFIRMATION', 'PENDING_HANDLING', 'IN_PROGRESS', 'PROCESSING', 'PENDING_REVIEW', 'CLOSED']) alertStatus?: string;
  @IsOptional() @IsIn(['DELIVERY', 'SANITATION', 'PATROL', 'RETAIL', 'SHUTTLE', 'OTHER']) vehicleType?: string;
  @IsOptional() @IsIn(['VALID', 'EXPIRED', 'NONE']) licenseState?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsIn(['AVAILABLE', 'MISSING']) videoState?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) windowMinutes = 5;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
