import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateConversationDto {
  @IsIn(['GENERAL', 'OVERVIEW', 'VEHICLE', 'SAFETY', 'ADMISSION', 'ANALYTICS', 'GUIDE']) agentCode!: string;
  @IsOptional() @IsString() @MaxLength(500) pagePath = '';
}
export class ConversationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(40) pageSize = 20;
}
export class AgentMessageDto {
  @IsString() @MinLength(2) @MaxLength(3000) question!: string;
  @IsString() @MinLength(8) @MaxLength(100) requestKey!: string;
}
