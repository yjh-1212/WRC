import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ThreeLevelCockpitQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['national', 'province', 'city']) level?: 'national' | 'province' | 'city';
  @ApiPropertyOptional() @IsOptional() @IsString() regionCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['ALL', 'DELIVERY', 'SANITATION', 'PATROL', 'RETAIL', 'SHUTTLE']) vehicleType?: string;
}
