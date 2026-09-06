import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class ArchivePageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufacturerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() modelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() onlineStatus?: string;
  @ApiPropertyOptional({ default: 'updatedAt' }) @IsOptional() @IsIn(['name', 'createdAt', 'updatedAt', 'expiresAt']) sort = 'updatedAt';
  @ApiPropertyOptional({ default: 'desc' }) @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreateManufacturerDto {
  @ApiProperty() @IsString() @IsNotEmpty() businessNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shortName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() creditCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
}
export class UpdateManufacturerDto extends PartialType(CreateManufacturerDto) {}

export class CreateVehicleModelDto {
  @ApiProperty() @IsString() @IsNotEmpty() businessNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() modelCode!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() manufacturerId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() autonomyLevel?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) maxSpeed!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) ratedRange!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) loadCapacity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() dimensions?: string;
}
export class UpdateVehicleModelDto extends PartialType(CreateVehicleModelDto) {}

export class CreateVehicleDto {
  @ApiProperty() @IsString() @IsNotEmpty() businessNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() vin!: string;
  @ApiProperty() @IsString() @IsNotEmpty() deviceNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() modelId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() manufactureDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() serviceStartDate?: string;
}
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

export class UpdateStatusDto {
  @ApiProperty() @IsIn(['ACTIVE', 'INACTIVE']) status!: string;
}

export class CreateLicenseDto {
  @ApiProperty() @IsString() @IsNotEmpty() businessNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() licenseNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() vehicleId!: string;
  @ApiProperty() @IsDateString() issuedAt!: string;
  @ApiProperty() @IsDateString() expiresAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;
}
export class UpdateLicenseDto extends PartialType(CreateLicenseDto) {
  @ApiPropertyOptional() @IsOptional() @IsIn(['VALID', 'EXPIRED', 'SUSPENDED', 'CANCELLED']) status?: string;
}

export class UpdateEnterpriseArchiveDto {
  @ApiPropertyOptional() @IsOptional() @IsString() legalRepresentative?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registeredAddress?: string;
}

export class CreateQualificationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() businessNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() qualificationType!: string;
  @ApiProperty() @IsString() @IsNotEmpty() certificateNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() issuedBy!: string;
  @ApiProperty() @IsDateString() issuedAt!: string;
  @ApiProperty() @IsDateString() expiresAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() attachmentUrl?: string;
}
export class UpdateQualificationDto extends PartialType(CreateQualificationDto) {
  @ApiPropertyOptional() @IsOptional() @IsIn(['VALID', 'EXPIRED', 'SUSPENDED', 'CANCELLED']) status?: string;
}
