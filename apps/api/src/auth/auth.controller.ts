import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto } from './dto';
import { CurrentUser, Public } from './auth.decorators';
import { AuthUser } from './auth.types';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Public() @Post('login') @HttpCode(HttpStatus.OK) login(@Body() dto: LoginDto, @Req() req: Request) { return this.auth.login(dto, req.ip, req.headers['user-agent']); }
  @Public() @Post('refresh') @HttpCode(HttpStatus.OK) refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }
  @Post('logout') @HttpCode(HttpStatus.OK) @ApiBearerAuth() logout(@Body() dto: RefreshDto, @CurrentUser() user: AuthUser) { return this.auth.logout(user, dto.refreshToken); }
  @Get('me') @ApiBearerAuth() me(@CurrentUser() user: AuthUser) { return this.auth.profile(user); }
  @Get('menus') @ApiBearerAuth() menus(@CurrentUser() user: AuthUser) { return this.auth.menus(user); }
  @Post('change-password') @HttpCode(HttpStatus.OK) @ApiBearerAuth() changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(user, dto); }
}
