import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class ProvinceAnalysisQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() workspaceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
}
