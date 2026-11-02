import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SafetyQueryDto, AccidentVideoDto } from './dto';
export class WorkspaceQueryDto extends SafetyQueryDto {
  @IsOptional() @IsIn(['ALERT','ACCIDENT','VIOLATION','OFFLINE']) eventType?: string;
  @IsOptional() @IsIn(['EMERGENCY','RECTIFICATION']) taskType?: string;
  @IsOptional() @IsIn(['ALL','PENDING','HANDLING','REVIEW','CLOSED','OVERDUE']) queue?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}
export class EvidenceSealDto { @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string; }
export class EventVideosDto { @IsArray() @ArrayMaxSize(20) @ValidateNested({each:true}) @Type(()=>AccidentVideoDto) videos!: AccidentVideoDto[]; }
export class WorkspaceTaskDto {
  @IsIn(['EMERGENCY','RECTIFICATION']) taskType!: string;
  @IsIn(['ALERT','ACCIDENT','VIOLATION','OFFLINE']) sourceType!: string;
  @IsString() @IsNotEmpty() sourceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) requirement!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) responsibleName!: string;
  @IsDateString() dueAt!: string;
  @IsOptional() @IsIn(['REMOTE','FIELD']) responseMode?: string;
}
export class WorkspaceTaskActionDto {
  @IsIn(['DISPATCH','RESPOND','SUBMIT_FEEDBACK','RETURN','CLOSE']) action!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) comment!: string;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(5) score?: number;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) version?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({each:true}) materialIds?: string[];
}
export class WorkspaceInspectionDto {
  @IsString() @IsNotEmpty() @MaxLength(150) title!: string;
  @IsString() @IsNotEmpty() enterpriseId!: string;
  @IsIn(['ROUTINE','SPECIAL','RANDOM']) inspectionType!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) inspectorName!: string;
  @IsDateString() scheduledAt!: string;
}
export class InspectionIssueDto {
  @IsString() @IsNotEmpty() @MaxLength(150) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) requirement!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) responsibleName!: string;
  @IsDateString() dueAt!: string;
}
export class InspectionResultDto {
  @IsString() @IsNotEmpty() @MaxLength(5000) result!: string;
  @Type(()=>Number) @IsInt() @Min(1) version!: number;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({each:true}) @Type(()=>InspectionIssueDto) issues!: InspectionIssueDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({each:true}) materialIds?: string[];
}
export class DeterminationDto {
  @IsString() @IsNotEmpty() @MaxLength(150) authority!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) documentNo!: string;
  @IsDateString() issuedAt!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) result!: string;
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({each:true}) materialIds!: string[];
}
