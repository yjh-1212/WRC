import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class OperationsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() drivingState?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize = 20;
}

export class TrackQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() recordId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CoordinateDto {
  @ApiProperty() @Type(() => Number) @IsNumber() longitude!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() latitude!: number;
}

export class CreateOperationRegionDto {
  @ApiProperty() @IsString() @IsNotEmpty() businessNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['OPERATION', 'ROAD_TEST', 'TEMPORARY']) regionType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() organizationId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() approvalResultId?: string;
  @ApiProperty({ type: [CoordinateDto] }) @IsArray() @ArrayMinSize(3) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CoordinateDto) polygon!: CoordinateDto[];
  @ApiProperty() @IsDateString() validFrom!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) approvalStatus?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(80) speedLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() allowedHours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ruleDescription?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) vehicleIds?: string[];
}
export class UpdateOperationRegionDto extends PartialType(CreateOperationRegionDto) {}

export class UpdateOperationRegionStatusDto {
  @ApiProperty() @IsIn(['ACTIVE', 'INACTIVE']) status!: string;
}

export class TelemetryDto {
  @ApiProperty() @IsString() @IsNotEmpty() vehicleId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operationRecordId?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() longitude!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() latitude!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) speed!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100) battery!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() heading?: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['RUNNING', 'IDLE', 'PARKED']) drivingState?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['AUTO', 'MANUAL', 'REMOTE_TAKEOVER', 'STANDBY']) autonomousState?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) signalStrength?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) mileageToday?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() recordedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['NORMAL', 'STOP', 'ALERT']) pointType?: string;
}
