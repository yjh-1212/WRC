import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CockpitQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['city', 'district', 'enterprise', 'vehicle']) level?: 'city' | 'district' | 'enterprise' | 'vehicle';
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() enterpriseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['situation', 'vehicles', 'enterprises', 'regions']) mapMode?: 'situation' | 'vehicles' | 'enterprises' | 'regions';
}
