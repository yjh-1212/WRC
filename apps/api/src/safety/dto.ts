import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class SafetyQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) level?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize = 20;
}

export class CoordinateDto {
  @ApiProperty() @Type(() => Number) @IsNumber() longitude!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() latitude!: number;
}

export class CreateAlertDto {
  @ApiProperty() @IsString() vehicleId!: string;
  @ApiProperty() @IsIn(['VEHICLE_FAULT', 'AUTONOMOUS_ABNORMAL', 'SYSTEM_ABNORMAL', 'OVERSPEED', 'OUT_OF_BOUNDS', 'NO_ENTRY', 'OFFLINE', 'DEVICE_ABNORMAL', 'SENSOR_ABNORMAL', 'MANUAL_REPORT', 'OTHER']) alertType!: string;
  @ApiProperty() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) level!: string;
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() occurredAt?: string;
}

export class AlertActionDto {
  @ApiProperty() @IsIn(['CONFIRM', 'START', 'SUBMIT_REVIEW', 'CLOSE', 'REOPEN']) action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class CreateFenceDto {
  @ApiProperty() @IsString() businessNo!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsIn(['NO_ENTRY', 'SPEED_LIMIT', 'OPERATION', 'TEMPORARY']) fenceType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiProperty() @IsString() organizationId!: string;
  @ApiProperty({ type: [CoordinateDto] }) @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => CoordinateDto) polygon!: CoordinateDto[];
  @ApiProperty() @IsDateString() validFrom!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) active?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(80) speedLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() allowedHours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ruleDescription?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(300) @IsString({ each: true }) vehicleIds?: string[];
}

export class UpdateFenceDto extends PartialType(CreateFenceDto) {}
export class FenceStatusDto { @ApiProperty() @IsBoolean() active!: boolean; }

export class CreateAccidentDto {
  @ApiProperty() @IsString() vehicleId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operationRecordId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() alertId?: string;
  @ApiProperty() @IsIn(['COLLISION', 'PERSON_INJURY', 'PROPERTY_DAMAGE', 'LOSS_OF_CONTROL', 'OTHER']) accidentType!: string;
  @ApiProperty() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) level!: string;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() longitude!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() latitude!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiProperty() @IsDateString() occurredAt!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) casualties?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() damageDescription?: string;
}

export class AccidentActionDto {
  @ApiProperty() @IsIn(['ACCEPT', 'INVESTIGATE', 'DETERMINE', 'PROCESS', 'CLOSE', 'ARCHIVE']) action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class CreateViolationDto {
  @ApiProperty() @IsString() vehicleId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operationRecordId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() alertId?: string;
  @ApiProperty() @IsIn(['OVERSPEED', 'OUT_OF_BOUNDS', 'NO_ENTRY', 'OVERTIME', 'ILLEGAL_OPERATION', 'OTHER']) violationType!: string;
  @ApiProperty() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) level!: string;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() description!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @ApiProperty() @IsDateString() occurredAt!: string;
}

export class ViolationActionDto {
  @ApiProperty() @IsIn(['CONFIRM', 'REQUEST_RECTIFICATION', 'SUBMIT_RECTIFICATION', 'APPROVE', 'RETURN']) action!: string;
  @ApiProperty() @IsString() comment!: string;
}

export class OfflineActionDto {
  @ApiProperty() @IsIn(['INVESTIGATE', 'UPDATE_REASON', 'RECOVER']) action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class CreateEmergencyTaskDto {
  @ApiProperty() @IsString() alertId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accidentId?: string;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() requirement!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assigneeUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['REMOTE', 'FIELD']) responseMode?: string;
  @ApiProperty() @IsDateString() dueAt!: string;
}

export class EmergencyActionDto {
  @ApiProperty() @IsIn(['DISPATCH', 'RESPOND', 'SUBMIT_FEEDBACK', 'RETURN', 'CLOSE']) action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) score?: number;
}
