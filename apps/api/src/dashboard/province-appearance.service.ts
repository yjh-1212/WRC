import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsInt, IsObject, IsString, MaxLength, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { APPEARANCE_DEFAULTS, APPEARANCE_FIELDS, APPEARANCE_PRESETS, AppearanceStyle, cleanAppearance } from './province-appearance.schema';
export class AppearanceRevisionDto { @IsInt() @Min(0) expectedRevision!: number; }
export class SaveAppearanceDto extends AppearanceRevisionDto { @IsObject() style!: Record<string, unknown>; }
export class SaveAppearancePresetDto extends SaveAppearanceDto { @IsString() @MaxLength(20) name!: string; }
type Preset = { id: string; name: string; style: AppearanceStyle };
type Stored = { revision: number; payload: string; updatedAt: Date | string };

@Injectable()
export class ProvinceAppearanceService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}
  private authorize(user: AuthUser, write = false) {
    if (user.accountLevel !== 'PROVINCE' || user.portal !== 'REGULATORY' || !user.permissions.includes('dashboard:view')) throw new ForbiddenException('仅省级监管人员可访问大屏风格');
    if (write && !user.permissions.includes('system:organization:update')) throw new ForbiddenException('当前账号可预览风格，共享保存需要省级管理权限');
  }
  private clean(input: unknown) { try { return cleanAppearance(input); } catch (reason) { throw new BadRequestException((reason as Error).message); } }
  private async state() {
    // This global configuration is deliberately outside city scopes; every caller is explicitly province-checked.
    const rows = await this.prisma.$queryRaw<Stored[]>`SELECT "revision", "payload", "updatedAt" FROM "CockpitAppearance" WHERE "id" = 'province'`;
    if (!rows[0]) throw new NotFoundException('共享风格尚未初始化，请完成数据库迁移');
    const payload = JSON.parse(rows[0].payload) as { style?: Record<string, unknown>; presets?: Preset[] };
    return { revision: rows[0].revision, updatedAt: rows[0].updatedAt, style: this.clean(payload.style ?? {}), presets: (payload.presets ?? []).map(preset => ({ ...preset, style: this.clean(preset.style) })) };
  }
  async read(user: AuthUser) { this.authorize(user); return { ...await this.state(), fields: APPEARANCE_FIELDS, builtins: APPEARANCE_PRESETS, canEdit: user.permissions.includes('system:organization:update') }; }
  private async change(user: AuthUser, revision: number, action: string, transform: (state: Awaited<ReturnType<ProvinceAppearanceService['state']>>) => { style: AppearanceStyle; presets: Preset[] }) {
    this.authorize(user, true);
    const current = await this.state();
    if (current.revision !== revision) throw new ConflictException('其他浏览器已更新风格，已保留你的预览；核对最新设置后可再次保存');
    const next = transform(current), payload = JSON.stringify(next), at = new Date().toISOString();
    const changed = await this.prisma.$executeRaw`UPDATE "CockpitAppearance" SET "payload" = ${payload}, "revision" = "revision" + 1, "updatedAt" = ${at} WHERE "id" = 'province' AND "revision" = ${revision}`;
    if (changed !== 1) throw new ConflictException('其他浏览器刚刚更新风格，请核对后重试');
    await this.auth.audit(user, 'dashboard', 'cockpit-appearance', 'province', action, { revision: revision + 1 });
    return this.read(user);
  }
  save(user: AuthUser, dto: SaveAppearanceDto) { return this.change(user, dto.expectedRevision, 'SAVE_STYLE', state => ({ style: this.clean(dto.style), presets: state.presets })); }
  preset(user: AuthUser, dto: SaveAppearancePresetDto) {
    return this.change(user, dto.expectedRevision, 'SAVE_PRESET', state => {
      const name = dto.name.trim(); if (!name || /[\u0000-\u001f]/.test(name)) throw new BadRequestException('请输入1至20字的预设名称');
      const old = state.presets.find(preset => preset.name === name);
      if (!old && state.presets.length >= 12) throw new BadRequestException('最多保存12个自定义预设，请先删除不需要的预设');
      const preset = { id: old?.id ?? randomUUID(), name, style: this.clean(dto.style) };
      return { style: state.style, presets: old ? state.presets.map(item => item.id === old.id ? preset : item) : [...state.presets, preset] };
    });
  }
  removePreset(user: AuthUser, id: string, dto: AppearanceRevisionDto) {
    return this.change(user, dto.expectedRevision, 'DELETE_PRESET', state => { if (!state.presets.some(preset => preset.id === id)) throw new NotFoundException('预设已不存在，请刷新后重试'); return { style: state.style, presets: state.presets.filter(preset => preset.id !== id) }; });
  }
}
