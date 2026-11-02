import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GovernanceQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export const MAX_OPERATOR_VEHICLES = 5;
export class SafetyOperatorQueryDto extends GovernanceQueryDto {
  @IsOptional() @IsIn(['name', 'createdAt', 'updatedAt']) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
}
export class CreateSafetyOperatorDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(40) idNumberMasked?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() enterpriseId?: string;
  @IsOptional() @IsString() @MaxLength(80) qualificationNo?: string;
  @IsOptional() @IsDateString() expiresAt?: string | null;
  @IsOptional() @IsBoolean() trainingCompleted?: boolean;
  @IsOptional() @IsString() shiftStart?: string;
  @IsOptional() @IsString() shiftEnd?: string;
  @IsOptional() @IsBoolean() onDuty?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_OPERATOR_VEHICLES, { message: '每位安全员最多负责5台车辆' }) @ArrayUnique() @IsString({ each: true }) vehicleIds?: string[];
}
export class UpdateSafetyOperatorDto extends PartialType(CreateSafetyOperatorDto) {}
export class ReviewSafetyOperatorDto {
  @IsIn(['APPROVED', 'REJECTED', 'SUSPENDED']) status!: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class CreateInterfaceConfigDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiProperty() @IsIn(['TELEMETRY', 'REMOTE_OPERATION']) interfaceType!: string;
  @ApiProperty() @IsString() @IsNotEmpty() endpoint!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() protocolVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) capabilities?: string[];
}
export class UpdateInterfaceConfigDto extends PartialType(CreateInterfaceConfigDto) {}

export class CreateInspectionDto {
  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() enterpriseId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inspectionType?: string;
  @ApiProperty() @IsString() @IsNotEmpty() inspectorName!: string;
  @ApiProperty() @IsDateString() scheduledAt!: string;
}

export class InspectionActionDto {
  @ApiProperty() @IsIn(['COMPLETE', 'REQUEST_RECTIFICATION', 'SUBMIT_RECTIFICATION', 'CLOSE']) action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) issueCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueAt?: string;
}

export class CreateBusinessRuleDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsIn(['VEHICLE', 'SCENE', 'OPERATOR', 'ACCIDENT_SLA', 'CREDIT', 'INTERFACE', 'RETENTION']) category!: string;
  @ApiProperty() value!: unknown;
}

export class CreditEntryDto {
  @ApiProperty() @IsIn(['MINOR', 'GENERAL', 'SERIOUS', 'MAJOR']) severity!: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceId?: string;
}

export class CreditRepairDto {
  @ApiProperty() @IsString() @IsNotEmpty() comment!: string;
}
