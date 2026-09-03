import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' }) @IsString() username!: string;
  @ApiProperty({ example: 'Wrc@2026!' }) @IsString() @MinLength(8) password!: string;
}
export class RefreshDto { @ApiProperty() @IsString() refreshToken!: string; }
export class ChangePasswordDto {
  @ApiProperty() @IsString() oldPassword!: string;
  @ApiProperty() @IsString() @Length(8, 72) newPassword!: string;
}
