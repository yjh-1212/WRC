import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { jsonValue, ownerScope } from './permit.service';

@Injectable()
export class AdmissionMaterialsService {
  constructor(private prisma:PrismaService,private auth:AuthService){}
  private root=resolve(process.cwd().endsWith('api')?'../../data/admission-materials':'data/admission-materials');
  private async application(user:AuthUser,id:string,write=false){
    const app=await this.prisma.admissionApplication.findFirst({where:{id,...ownerScope(user)}});
    if(!app)throw new NotFoundException('申请不存在或不在授权范围内');
    if(write&&(user.portal!=='ENTERPRISE'||!['DRAFT','RETURNED'].includes(app.status)))throw new ForbiddenException('仅企业可维护草稿或补正中的材料');
    return app;
  }
  async upload(user:AuthUser,id:string,file:any,category='其他材料'){
    const app=await this.application(user,id,true);
    if(!file?.buffer||!file.size||file.size>2*1024*1024)throw new BadRequestException('请上传不超过2MB的PDF、PNG或JPG文件');
    const header=file.buffer.subarray(0,8),mime=header.subarray(0,5).toString()==='%PDF-'?'application/pdf':header.equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':header[0]===255&&header[1]===216&&header[2]===255?'image/jpeg':'';
    if(!mime)throw new BadRequestException('仅支持内容有效的PDF、PNG、JPG文件');
    if(category.length>30)throw new BadRequestException('材料分类过长');
    const materials=jsonValue(app.materialsJson,[]);if(materials.length>=20)throw new BadRequestException('每次申报最多上传20份材料');
    const original=String(file.originalname),decoded=Buffer.from(original,'latin1').toString('utf8');
    const name=[...original].every(c=>c.charCodeAt(0)<=255)&&!decoded.includes('\ufffd')?decoded:original;
    const key=randomUUID(),item={id:key,name:name.replace(/[\\/\x00-\x1f]/g,'_').slice(0,160),category,mimeType:mime,size:file.size,uploadedAt:new Date().toISOString()};
    await mkdir(this.root,{recursive:true});await writeFile(resolve(this.root,key),file.buffer,{flag:'wx'});
    const updated=await this.prisma.admissionApplication.updateMany({where:{id,status:app.status,updatedAt:app.updatedAt},data:{materialsJson:JSON.stringify([...materials,item])}});
    if(updated.count!==1)throw new BadRequestException('申请或材料刚被更新，请刷新后重试');
    await this.auth.audit(user,'admission','application',id,'UPLOAD_MATERIAL',{materialId:key,name:item.name});return item;
  }
  async remove(user:AuthUser,id:string,materialId:string){
    const app=await this.application(user,id,true),materials=jsonValue(app.materialsJson,[]);
    if(!materials.some((m:any)=>m.id===materialId))throw new NotFoundException('材料不存在');
    const changed=await this.prisma.admissionApplication.updateMany({where:{id,status:app.status,updatedAt:app.updatedAt},data:{materialsJson:JSON.stringify(materials.filter((m:any)=>m.id!==materialId))}});
    if(changed.count!==1)throw new BadRequestException('材料刚被更新，请刷新后重试');
    // Submitted snapshots retain access to their original files.
    await this.auth.audit(user,'admission','application',id,'REMOVE_MATERIAL',{materialId});return {removed:true};
  }
  async download(user:AuthUser,id:string,materialId:string){
    if(!/^[\da-f-]{36}$/i.test(materialId))throw new NotFoundException('材料不存在');
    const app=await this.application(user,id),current=jsonValue(app.materialsJson,[]);
    const histories=await this.prisma.approvalHistory.findMany({where:{applicationId:id,snapshotJson:{not:null}},select:{snapshotJson:true}});
    const materials=[...current,...histories.flatMap(h=>jsonValue(h.snapshotJson).materials??[])],item=materials.find((m:any)=>m.id===materialId);
    if(!item)throw new NotFoundException('材料不存在');
    let buffer:Buffer;try{buffer=await readFile(resolve(this.root,materialId))}catch{throw new NotFoundException('材料文件暂不可用，请联系上传人补充')}
    return {...item,buffer};
  }
}
