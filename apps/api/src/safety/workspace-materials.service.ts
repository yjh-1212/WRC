import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { scope } from './workspace-rules';

@Injectable()
export class SafetyMaterialsService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}
  private root = resolve(process.cwd().endsWith('api') ? '../../data/safety-materials' : 'data/safety-materials');
  private access(user: AuthUser, write = false) {
    const allowed = write ? ['safety:accident:report','safety:alert:write','safety:emergency:respond','safety:emergency:dispatch','safety:emergency:review','safety:violation:write','safety:violation:review'] : ['safety:accident:read','safety:alert:read','safety:emergency:read','safety:violation:read','safety:offline:read'];
    if (!allowed.some(p => user.permissions.includes(p)) || write && ['PROVINCE','OPERATIONS'].includes(user.accountLevel ?? '')) throw new ForbiddenException('当前账号不能访问安全监管材料');
  }
  private creditAccess(user:AuthUser,write=false) { if(user.accountLevel!=='CITY'||user.portal!=='REGULATORY'||!user.permissions.includes(write?'analytics:evaluation:publish':'analytics:evaluation:read'))throw new ForbiddenException('当前账号不能访问信用修复材料'); }
  async upload(user: AuthUser, enterpriseId: string, file: any, purpose?:'CREDIT') {
    if(purpose==='CREDIT')this.creditAccess(user,true);else this.access(user, true);
    if(user.portal==='ENTERPRISE'&&enterpriseId!==user.enterpriseId)throw new ForbiddenException('不能向其他企业上传材料');
    const enterprise = await this.prisma.enterprise.findFirst({ where: { id: enterpriseId, organizationId: scope(user).organizationId } });
    if (!enterprise) throw new NotFoundException('企业不存在或不在当前数据范围内');
    if (!file?.buffer || !file.size || file.size > 100 * 1024 * 1024) throw new BadRequestException('请上传100MB以内的PDF、PNG、JPG或MP4文件');
    const bytes: Buffer = file.buffer, header = bytes.subarray(0, 12);
    const mimeType = header.subarray(0,5).toString() === '%PDF-' ? 'application/pdf' : header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : header[0] === 255 && header[1] === 216 && header[2] === 255 ? 'image/jpeg' : header.subarray(4,8).toString() === 'ftyp' ? 'video/mp4' : '';
    if (!mimeType) throw new BadRequestException('仅支持内容有效的PDF、PNG、JPG或MP4文件');
    const original = String(file.originalname ?? '材料'), decoded = Buffer.from(original,'latin1').toString('utf8');
    const name = ([...original].every(c => c.charCodeAt(0) <= 255) && !decoded.includes('\ufffd') ? decoded : original).replace(/[\\/\x00-\x1f]/g,'_').slice(0,160);
    const id = randomUUID(), sha256 = createHash('sha256').update(bytes).digest('hex');
    await mkdir(this.root, { recursive: true }); await writeFile(resolve(this.root,id), bytes, { flag: 'wx' });
    try {
      const item = await this.prisma.safetyMaterial.create({ data: { id, name, mimeType, size: file.size, sha256, enterpriseId: enterprise.id, organizationId: enterprise.organizationId, uploadedById: user.id, uploadedByName: user.displayName } });
      await this.auth.audit(user,'safety','safetyMaterial',id,'UPLOAD',{name,sha256}); return { ...item, url: mimeType === 'video/mp4' ? `/media/safety/${id}` : undefined };
    } catch (error) { await unlink(resolve(this.root,id)).catch(() => {}); throw error; }
  }
  async items(user: AuthUser, enterpriseId: string, ids: string[] = []) {
    if (!ids.length) return [];
    const items = await this.prisma.safetyMaterial.findMany({ where: { id: { in: ids }, enterpriseId, ...scope(user) } });
    if (items.length !== new Set(ids).size) throw new BadRequestException('存在不可用或不属于本企业的材料');
    return items.map(({ id,name,mimeType,size,sha256,createdAt }) => ({id,name,mimeType,size,sha256,createdAt}));
  }
  async download(user: AuthUser, id: string, purpose?:'CREDIT') {
    if(purpose==='CREDIT')this.creditAccess(user);else this.access(user); if (!/^[a-f\d-]{36}$/i.test(id)) throw new NotFoundException('材料不存在');
    const row = await this.prisma.safetyMaterial.findFirst({where:{id,...scope(user)}}); if (!row) throw new NotFoundException('材料不存在或不在授权范围内');
    let buffer: Buffer; try { buffer = await readFile(resolve(this.root,id)); } catch { throw new NotFoundException('材料文件暂不可用，请联系上传人补充'); }
    if (createHash('sha256').update(buffer).digest('hex') !== row.sha256) throw new BadRequestException('材料校验不一致，请联系管理员核查');
    return {...row,buffer};
  }
}
