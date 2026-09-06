import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @ApiPropertyOptional() @IsOptional() @IsIn(['createdAt', 'lastLoginAt', 'displayName']) sort?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['asc', 'desc']) order?: string;
}
export class CreateUserDto {
  @ApiProperty() @IsString() @Length(3, 30) username!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty() @IsString() @IsNotEmpty() displayName!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndefined) @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 32) phone?: string;
  @ApiProperty() @IsIn(['REGULATORY', 'ENTERPRISE']) portal!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roleIds!: string[];
}
export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() displayName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndefined) @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 32) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roleIds?: string[];
}
export class StatusDto { @ApiProperty() @IsIn(['ACTIVE', 'INACTIVE']) status!: string; }
export class ResetPasswordDto {
  @ApiProperty() @IsString() @Length(8, 72) password!: string;
}
export class UpdateRolePermissionsDto { @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) permissionIds!: string[]; }
export class CreateRoleDto {
  @ApiProperty() @IsString() @Length(2, 40) code!: string;
  @ApiProperty() @IsString() @Length(2, 40) name!: string;
  @ApiProperty() @IsIn(['REGULATORY', 'ENTERPRISE']) portal!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}
export class CreateOrganizationDto {
  @ApiProperty() @IsString() @Length(2, 40) code!: string;
  @ApiProperty() @IsString() @Length(2, 80) name!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndefined) @IsString() parentId?: string;
}
export class CreateEnterpriseDto {
  @ApiProperty() @IsString() @IsNotEmpty() businessNo!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() creditCode!: string;
  @ApiProperty() @IsString() @IsNotEmpty() organizationId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
}
