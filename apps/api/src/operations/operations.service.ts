import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { isScopedAdministrator } from '../auth/workspace-access';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { CreateOperationRegionDto, OperationsQueryDto, TelemetryDto, TrackQueryDto, UpdateOperationRegionDto } from './dto';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class OperationsService {
  constructor(private prisma: PrismaService, private auth: AuthService, private safety: SafetyService,private monitoring:MonitoringService) {}

  private isSuper(user: AuthUser) { return isScopedAdministrator(user); }
  private organizationRelation(user: AuthUser) {
    return { is: { OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] } };
  }
  private vehicleScope(user: AuthUser): Prisma.VehicleWhereInput {
    if (user.portal === 'ENTERPRISE') {
      if (!user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
      return { enterpriseId: user.enterpriseId, deletedAt: null };
    }
    return this.isSuper(user) ? { deletedAt: null } : { organization: this.organizationRelation(user), deletedAt: null };
  }
  private recordScope(user: AuthUser): Prisma.OperationRecordWhereInput {
    if (user.portal === 'ENTERPRISE') return { enterpriseId: user.enterpriseId ?? '__none__' };
    return this.isSuper(user) ? {} : { organization: this.organizationRelation(user) };
  }
  private regionScope(user: AuthUser): Prisma.OperationRegionWhereInput {
    if (user.portal === 'ENTERPRISE') return { organization:{is:{workspaceId:user.workspaceId??'__none__'}},OR:[{enterpriseId:user.enterpriseId??'__none__'},{enterpriseId:null}] };
    return this.isSuper(user) ? {} : { organization: this.organizationRelation(user) };
  }
  private page(query: OperationsQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
  private range(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    return { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
  }
  private parsePolygon(value: string) {
    try { return JSON.parse(value) as Array<{ longitude: number; latitude: number }>; }
    catch { return []; }
  }

  async options(user: AuthUser) {
    const vehicleWhere = this.vehicleScope(user);
    const enterpriseWhere: Prisma.EnterpriseWhereInput = user.portal === 'ENTERPRISE'
      ? { id: user.enterpriseId ?? '__none__' }
      : this.isSuper(user) ? {} : { organization: this.organizationRelation(user) };
    const organizationWhere: Prisma.OrganizationWhereInput = this.isSuper(user) ? {} : { OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] };
    const [vehicles, enterprises, organizations, regions, approvalResults] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({ where: vehicleWhere, orderBy: { name: 'asc' }, select: { id: true, name: true, businessNo: true, enterpriseId: true, organizationId: true, onlineStatus: true } }),
      this.prisma.enterprise.findMany({ where: enterpriseWhere, orderBy: { name: 'asc' }, select: { id: true, name: true, organizationId: true } }),
      this.prisma.organization.findMany({ where: organizationWhere, orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
      this.prisma.operationRegion.findMany({ where: this.regionScope(user), orderBy: { name: 'asc' }, select: { id: true, name: true, enterpriseId: true, status: true } }),
      this.prisma.approvalResult.findMany({ where: { resultType: 'ROAD_TEST', status: 'VALID', application: { ...this.recordScope(user) as any } }, orderBy: { issuedAt: 'desc' }, select: { id: true, documentNo: true, applicationId: true, validFrom: true, validTo: true } }),
    ]);
    return { vehicles, enterprises, organizations, regions, approvalResults };
  }

  private realtimeWhere(user: AuthUser, query: OperationsQueryDto): Prisma.VehicleWhereInput {
    return {
      ...this.vehicleScope(user),
      enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId,
      organizationId: query.organizationId,
      onlineStatus: query.status,
      realtimeStatus: query.drivingState ? { is: { drivingState: query.drivingState } } : undefined,
      operationRegions: query.regionId ? { some: { regionId: query.regionId } } : undefined,
      OR: query.q ? [
        { name: { contains: query.q } }, { businessNo: { contains: query.q } },
        { vin: { contains: query.q } }, { deviceNo: { contains: query.q } },
      ] : undefined,
    };
  }

  async realtime(user: AuthUser, query: OperationsQueryDto) { return this.monitoring.realtime(user,query); }

  async distribution(user: AuthUser, query: OperationsQueryDto) {
    const realtime = await this.realtime(user, query);
    const aggregate = (key: 'enterprise' | 'organization' | 'state') => {
      const values = new Map<string, { id: string; name: string; count: number }>();
      for (const item of realtime.items) {
        const target = key === 'enterprise' ? item.enterprise : key === 'organization' ? item.organization : { id: item.realtimeStatus?.drivingState ?? 'OFFLINE', name: item.realtimeStatus?.drivingState ?? 'OFFLINE' };
        const current = values.get(target.id) ?? { ...target, count: 0 };
        current.count += 1; values.set(target.id, current);
      }
      return [...values.values()].sort((a, b) => b.count - a.count);
    };
    return { ...realtime, byEnterprise: aggregate('enterprise'), byOrganization: aggregate('organization'), byState: aggregate('state') };
  }

  async onlineMonitor(user: AuthUser, query: OperationsQueryDto) {
    const realtime = await this.realtime(user, query);
    const vehicleIds = realtime.items.map((item) => item.id);
    const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 6);
    const metrics = vehicleIds.length ? await this.prisma.vehicleOnlineDaily.findMany({ where: { vehicleId: { in: vehicleIds }, metricDate: { gte: start } }, include: { vehicle: { select: { enterpriseId: true, enterprise: { select: { id: true, name: true } } } } }, orderBy: { metricDate: 'asc' } }) : [];
    const trend = new Map<string, { date: string; sum: number; count: number }>();
    for (let day = 0; day < 7; day++) {
      const date = new Date(start); date.setUTCDate(start.getUTCDate() + day);
      trend.set(date.toISOString().slice(0, 10), { date: date.toISOString().slice(0, 10), sum: 0, count: 0 });
    }
    const enterpriseRates = new Map<string, { id: string; name: string; sum: number; count: number }>();
    metrics.forEach((metric) => {
      const date = metric.metricDate.toISOString().slice(0, 10); const point = trend.get(date);
      if (point) { point.sum += metric.onlineRate; point.count += 1; }
      const enterprise = metric.vehicle.enterprise; const item = enterpriseRates.get(enterprise.id) ?? { ...enterprise, sum: 0, count: 0 };
      item.sum += metric.onlineRate; item.count += 1; enterpriseRates.set(enterprise.id, item);
    });
    const today = new Date().toISOString().slice(0, 10);
    const todayVehicleIds = new Set(metrics.filter((item) => item.metricDate.toISOString().slice(0, 10) === today && item.onlineMinutes > 0).map((item) => item.vehicleId));
    const enterpriseItems = [...enterpriseRates.values()].map((item) => ({ id: item.id, name: item.name, onlineRate: item.count ? Math.round(item.sum / item.count * 10) / 10 : 0 })).sort((a, b) => a.onlineRate - b.onlineRate);
    return {
      summary: { currentOnline: realtime.summary.online, todayOnline: todayVehicleIds.size, currentOffline: realtime.summary.offline, average7d: metrics.length ? Math.round(metrics.reduce((sum, item) => sum + item.onlineRate, 0) / metrics.length * 10) / 10 : 0 },
      trend: [...trend.values()].map((item) => ({ date: item.date, onlineRate: item.count ? Math.round(item.sum / item.count * 10) / 10 : 0 })),
      enterprises: enterpriseItems, abnormalEnterprises: enterpriseItems.filter((item) => item.onlineRate < 85), items: realtime.items,
    };
  }

  async records(user: AuthUser, query: OperationsQueryDto) {
    const where: Prisma.OperationRecordWhereInput = {
      ...this.recordScope(user), vehicleId: query.vehicleId, regionId: query.regionId, status: query.status,
      enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId,
      organizationId: query.organizationId, startedAt: this.range(query.from, query.to),
      OR: query.q ? [{ businessNo: { contains: query.q } }, { vehicle: { name: { contains: query.q } } }, { vehicle: { businessNo: { contains: query.q } } }] : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.operationRecord.count({ where }),
      this.prisma.operationRecord.findMany({ where, ...this.page(query), orderBy: { startedAt: 'desc' }, include: {
        vehicle: { select: { id: true, name: true, businessNo: true } }, enterprise: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } }, region: { select: { id: true, name: true } }, _count: { select: { trackPoints: true } },
      } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }

  async record(user: AuthUser, id: string) {
    const item = await this.prisma.operationRecord.findFirst({ where: { id, ...this.recordScope(user) }, include: {
      vehicle: { include: { model: { include: { manufacturer: true } } } }, enterprise: true, organization: true, region: true,
      trackPoints: { orderBy: { sequence: 'asc' } },
    } });
    if (!item) throw new NotFoundException('运行记录不存在或不在当前数据范围内');
    return item;
  }

  async tracks(user: AuthUser, vehicleId: string, query: TrackQueryDto) {
    const vehicle=await this.prisma.vehicle.findFirst({where:{id:vehicleId,...this.vehicleScope(user)},select:{id:true,name:true,businessNo:true}});
    if(!vehicle)throw new NotFoundException('车辆不存在或不在当前数据范围内');
    if(query.from&&query.to&&new Date(query.from)>new Date(query.to))throw new BadRequestException('轨迹结束时间不能早于开始时间');
    const dates=this.range(query.from,query.to);
    const existing=await this.prisma.vehicleTrackPoint.findMany({where:{vehicleId,operationRecordId:query.recordId,recordedAt:dates,operationRecord:this.recordScope(user)},orderBy:{recordedAt:'asc'},take:5001,include:{operationRecord:{select:{id:true,businessNo:true,startedAt:true,endedAt:true,status:true}}}});
    const raw=await this.prisma.vehicleObservation.findMany({where:{vehicleId,operationRecordId:query.recordId,recordedAt:dates},orderBy:{recordedAt:'asc'},take:5001});
    const unique=new Map<string,any>();for(const point of [...existing,...raw])unique.set(new Date(point.recordedAt).toISOString()+':'+point.longitude+':'+point.latitude,point);
    const merged=[...unique.values()].sort((a,b)=>+new Date(a.recordedAt)-+new Date(b.recordedAt));const points=merged.slice(0,5000).map((p,i)=>({...p,sequence:p.sequence??i+1}));
    return {vehicle,pointCount:points.length,points,truncated:merged.length>5000,gapSeconds:300};
  }

  async ingest(user: AuthUser, dto: TelemetryDto) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, ...this.vehicleScope(user) } });
    if (!vehicle) throw new NotFoundException('车辆不存在或不在当前数据范围内');
    if (dto.operationRecordId) {
      const record = await this.prisma.operationRecord.findFirst({ where: { id: dto.operationRecordId, vehicleId: dto.vehicleId, ...this.recordScope(user) } });
      if (!record) throw new BadRequestException('运行记录与车辆不匹配');
    }
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    if(recordedAt.getTime()>Date.now()+300000)throw new BadRequestException('上报时间不能超过当前时间5分钟');
    if(dto.longitude===0&&dto.latitude===0)throw new BadRequestException('不能使用零点坐标作为车辆定位');
    let acceptedLatest=false;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.vehicleObservation.create({data:{vehicleId:vehicle.id,operationRecordId:dto.operationRecordId,longitude:dto.longitude,latitude:dto.latitude,speed:dto.speed,battery:dto.battery,heading:dto.heading??0,drivingState:dto.drivingState??'RUNNING',autonomousState:dto.autonomousState??'AUTO',pointType:dto.pointType??'NORMAL',recordedAt}});
      const previous=await tx.vehicleRealtimeStatus.findUnique({where:{vehicleId:vehicle.id}});
      if(previous&&recordedAt<previous.locationTime)return {realtime:previous,trackPoint:null,historical:true};
      acceptedLatest=true;
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { onlineStatus: 'ONLINE' } });
      const realtime = await tx.vehicleRealtimeStatus.upsert({ where: { vehicleId: vehicle.id }, create: {
        vehicleId: vehicle.id, longitude: dto.longitude, latitude: dto.latitude, speed: dto.speed, battery: dto.battery,
        heading: dto.heading ?? 0, drivingState: dto.drivingState ?? 'RUNNING', autonomousState: dto.autonomousState ?? 'AUTO', signalStrength: dto.signalStrength ?? 100,
        mileageToday: dto.mileageToday ?? 0, locationTime: recordedAt, heartbeatAt: recordedAt,
      }, update: {
        longitude: dto.longitude, latitude: dto.latitude, speed: dto.speed, battery: dto.battery, heading: dto.heading,
        drivingState: dto.drivingState, autonomousState: dto.autonomousState, signalStrength: dto.signalStrength,
        mileageToday: dto.mileageToday, locationTime: recordedAt, heartbeatAt: recordedAt,
      } });
      let trackPoint = null;
      if (dto.operationRecordId) {
        const last = await tx.vehicleTrackPoint.aggregate({ where: { operationRecordId: dto.operationRecordId }, _max: { sequence: true } });
        trackPoint = await tx.vehicleTrackPoint.create({ data: {
          operationRecordId: dto.operationRecordId, vehicleId: vehicle.id, sequence: (last._max.sequence ?? 0) + 1,
          longitude: dto.longitude, latitude: dto.latitude, speed: dto.speed, battery: dto.battery, heading: dto.heading ?? 0,
          autonomousState: dto.autonomousState ?? 'AUTO', pointType: dto.pointType ?? 'NORMAL', recordedAt,
        } });
      }
      return { realtime, trackPoint };
    });
    if(acceptedLatest && Date.now()-recordedAt.getTime()<=600000)await this.safety.processTelemetry({ id: vehicle.id, name: vehicle.name, enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId }, dto, recordedAt);
    return result;
  }

  async regions(user: AuthUser, query: OperationsQueryDto) {
    const where: Prisma.OperationRegionWhereInput = {
      ...this.regionScope(user), status: query.status, regionType:query.regionType==='OPERATION'?{in:['OPERATION','DELIVERY','SANITATION','PATROL','RETAIL','SHUTTLE']}:query.regionType, enterpriseId: user.portal === 'ENTERPRISE' ? undefined : query.enterpriseId,
      organizationId: query.organizationId,
      OR: query.q ? [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }, { enterprise: { name: { contains: query.q } } }] : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.operationRegion.count({ where }),
      this.prisma.operationRegion.findMany({ where, ...this.page(query), orderBy: { updatedAt: 'desc' }, include: {
        enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } }, approvalResult: { select: { id: true, documentNo: true } },
        vehicles: { include: { vehicle: { select: { id: true, name: true, businessNo: true } } } }, _count: { select: { records: true } },
      } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items: items.map((item) => ({ ...item,regionType:['DELIVERY','SANITATION','PATROL','RETAIL','SHUTTLE'].includes(item.regionType)?'OPERATION':item.regionType, polygon: this.parsePolygon(item.polygonJson), polygonJson: undefined })) };
  }

  private validatePolygon(polygon?: Array<{ longitude: number; latitude: number }>) {
    if (polygon && polygon.length < 3) throw new BadRequestException('运行区域至少需要 3 个边界点');
    if(polygon){
      if(polygon.some(p=>!Number.isFinite(p.longitude)||!Number.isFinite(p.latitude)||Math.abs(p.longitude)>180||Math.abs(p.latitude)>90))throw new BadRequestException('区域包含无效经纬度');
      const points=polygon.length>3&&polygon[0].longitude===polygon.at(-1)!.longitude&&polygon[0].latitude===polygon.at(-1)!.latitude?polygon.slice(0,-1):polygon;
      if(new Set(points.map(p=>`${p.longitude},${p.latitude}`)).size!==points.length)throw new BadRequestException('区域边界不能包含重复顶点');
      const cross=(a:any,b:any,c:any)=>(b.longitude-a.longitude)*(c.latitude-a.latitude)-(b.latitude-a.latitude)*(c.longitude-a.longitude);
      const area=Math.abs(points.reduce((n,p,i)=>n+p.longitude*points[(i+1)%points.length].latitude-p.latitude*points[(i+1)%points.length].longitude,0));
      if(area<1e-10)throw new BadRequestException('区域边界不能退化为一条线');
      for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){if(i===0&&j===points.length-1)continue;const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(a.longitude,b.longitude)>=Math.min(c.longitude,d.longitude)&&Math.max(c.longitude,d.longitude)>=Math.min(a.longitude,b.longitude)&&Math.max(a.latitude,b.latitude)>=Math.min(c.latitude,d.latitude)&&Math.max(c.latitude,d.latitude)>=Math.min(a.latitude,b.latitude))throw new BadRequestException('区域边界不能自相交');}
    }
  }
  async regionOptions(user:AuthUser){
    const enterpriseWhere:any=user.portal==='ENTERPRISE'?{id:user.enterpriseId??'__none__'}:this.isSuper(user)?{}:{organization:this.organizationRelation(user)};
    const [enterprises,organizations,vehicles,approvalResults]=await this.prisma.$transaction([
      this.prisma.enterprise.findMany({where:enterpriseWhere,select:{id:true,name:true,organizationId:true},orderBy:{name:'asc'}}),
      this.prisma.organization.findMany({select:{id:true,name:true},orderBy:{name:'asc'}}),
      this.prisma.vehicle.findMany({where:{...this.vehicleScope(user),deletedAt:null},select:{id:true,name:true,businessNo:true,enterpriseId:true}}),
      this.prisma.approvalResult.findMany({where:{status:'VALID',application:{...this.recordScope(user) as any,status:{in:['APPROVED','COMPLETED']}}},select:{id:true,documentNo:true,application:{select:{enterpriseId:true,title:true}}},orderBy:{issuedAt:'desc'}}),
    ]);return {enterprises,organizations,vehicles,approvalResults};
  }
  async region(user:AuthUser,id:string){
    await this.requireRegion(user,id);
    const item=await this.prisma.operationRegion.findFirst({where:{id,...this.regionScope(user)},include:{enterprise:{select:{id:true,name:true}},organization:{select:{id:true,name:true}},approvalResult:{select:{id:true,documentNo:true}},vehicles:{include:{vehicle:{select:{id:true,name:true,businessNo:true,unifiedCode:true}}}},_count:{select:{records:true}}}});
    if(!item)throw new NotFoundException('区域不存在');
    let history:any[]=[];try{history=JSON.parse(item.historyJson)}catch{}
    return {...item,regionType:['DELIVERY','SANITATION','PATROL','RETAIL','SHUTTLE'].includes(item.regionType)?'OPERATION':item.regionType,polygon:this.parsePolygon(item.polygonJson),polygonJson:undefined,history,historyJson:undefined};
  }
  private async validateRegionApproval(user:AuthUser,dto:any,current?:any){
    const from=dto.validFrom?new Date(dto.validFrom):current?.validFrom,to=dto.validTo===null?null:dto.validTo?new Date(dto.validTo):current?.validTo;
    if(from&&to&&to<=from)throw new BadRequestException('区域有效期结束时间必须晚于开始时间');
    if(dto.allowedHours&&(!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(dto.allowedHours)||dto.allowedHours.slice(0,5)>=dto.allowedHours.slice(6)))throw new BadRequestException('允许时段格式应为 HH:mm-HH:mm，且结束时间晚于开始时间');
    const enterpriseId=dto.enterpriseId===null?null:dto.enterpriseId??current?.enterpriseId;
    if(dto.approvalResultId){const result=await this.prisma.approvalResult.findFirst({where:{id:dto.approvalResultId,status:'VALID',application:{...this.recordScope(user) as any,...(enterpriseId?{enterpriseId}:{})}}});if(!result)throw new BadRequestException('审批依据不存在或与所属企业不一致');}
  }
  private async requireRegion(user: AuthUser, id: string) {
    const item = await this.prisma.operationRegion.findFirst({ where: { id, ...this.regionScope(user) } });
    if (!item) throw new NotFoundException('运行区域不存在或不在当前数据范围内');
    return item;
  }
  private async assertRegulatoryWrite(user: AuthUser, organizationId: string) {
    if (user.portal === 'ENTERPRISE') throw new ForbiddenException('企业端无权直接维护已批准运行区域');
    if (this.isSuper(user)) return;
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId, OR: [{ id: { in: user.scopeOrganizationIds ?? [user.organizationId ?? '__none__'] } }, { parentId: user.organizationId ?? '__none__' }] } });
    if (!organization) throw new ForbiddenException('不能维护所辖组织之外的运行区域');
  }
  private async assertRegionRelations(user: AuthUser, enterpriseId?: string, vehicleIds?: string[]) {
    if (enterpriseId) {
      const enterprise = await this.prisma.enterprise.findFirst({ where: { id: enterpriseId, ...(this.isSuper(user) ? {} : { organization: this.organizationRelation(user) }) } });
      if (!enterprise) throw new ForbiddenException('关联企业不在当前数据范围内');
    }
    if (vehicleIds?.length) {
      const count = await this.prisma.vehicle.count({ where: { id: { in: vehicleIds }, ...this.vehicleScope(user), enterpriseId: enterpriseId || undefined } });
      if (count !== new Set(vehicleIds).size) throw new ForbiddenException('关联车辆不在当前数据范围或与企业不一致');
    }
  }

  async createRegion(user: AuthUser, dto: CreateOperationRegionDto) {
    this.validatePolygon(dto.polygon); await this.assertRegulatoryWrite(user, dto.organizationId); await this.assertRegionRelations(user, dto.enterpriseId??undefined, dto.vehicleIds);
    await this.validateRegionApproval(user,dto);
    const { polygon, vehicleIds, ...data } = dto;
    const item = await this.prisma.operationRegion.create({ data: {
      ...data,status:dto.approvalStatus&&dto.approvalStatus!=='APPROVED'?'INACTIVE':'ACTIVE', polygonJson: JSON.stringify(polygon), validFrom: new Date(dto.validFrom), validTo: dto.validTo ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(dto.validTo)?dto.validTo+'T23:59:59.999+08:00':dto.validTo) : undefined,historyJson:JSON.stringify([{action:'CREATE',actor:user.displayName,at:new Date().toISOString(),summary:'新建通行区域'}]),
      vehicles: vehicleIds?.length ? { create: vehicleIds.map((vehicleId) => ({ vehicleId })) } : undefined,
    } });
    await this.auth.audit(user, 'operation', 'operationRegion', item.id, 'CREATE', { businessNo: item.businessNo, name: item.name });
    return item;
  }

  async updateRegion(user: AuthUser, id: string, dto: UpdateOperationRegionDto) {
    const current = await this.requireRegion(user, id); this.validatePolygon(dto.polygon); await this.assertRegulatoryWrite(user, dto.organizationId ?? current.organizationId); await this.assertRegionRelations(user, dto.enterpriseId===null?undefined:dto.enterpriseId ?? current.enterpriseId ?? undefined, dto.vehicleIds);
    await this.validateRegionApproval(user,dto,current);
    if(dto.enterpriseId&&dto.enterpriseId!==current.enterpriseId&&!dto.vehicleIds){const existing=await this.prisma.operationRegionVehicle.count({where:{regionId:id,vehicle:{enterpriseId:{not:dto.enterpriseId}}}});if(existing)throw new BadRequestException('更换企业时需重新选择关联车辆');}
    let history:any[]=[];try{history=JSON.parse(current.historyJson)}catch{}
    const { polygon, vehicleIds, validFrom, validTo, ...data } = dto;
    const item = await this.prisma.$transaction(async tx=>{
      const claimed=await tx.operationRegion.updateMany({where:{id,updatedAt:current.updatedAt,historyJson:current.historyJson},data:{updatedAt:new Date()}});
      if(claimed.count!==1)throw new BadRequestException('区域刚被其他人更新，请刷新后重试');
      return tx.operationRegion.update({ where: { id }, data: {
      ...data,...(dto.approvalStatus&&dto.approvalStatus!=='APPROVED'?{status:'INACTIVE'}:{}), polygonJson: polygon ? JSON.stringify(polygon) : undefined,historyJson:JSON.stringify([...history,{action:'UPDATE',actor:user.displayName,at:new Date().toISOString(),summary:'更新范围或运行规则',before:{...current,historyJson:undefined},changes:dto}]),
      validFrom: validFrom ? new Date(validFrom) : undefined, validTo: validTo === ''||validTo===null ? null : validTo ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(validTo)?validTo+'T23:59:59.999+08:00':validTo) : undefined,
      vehicles: vehicleIds ? { deleteMany: {}, create: vehicleIds.map((vehicleId) => ({ vehicleId })) } : undefined,
      } });
    });
    await this.auth.audit(user, 'operation', 'operationRegion', id, 'UPDATE', { businessNo: item.businessNo, name: item.name });
    return item;
  }

  async setRegionStatus(user: AuthUser, id: string, status: string) {
    const current = await this.requireRegion(user, id); await this.assertRegulatoryWrite(user, current.organizationId);
    if (status === 'ACTIVE' && current.approvalStatus !== 'APPROVED') throw new BadRequestException('仅已审批通过的运行区域可以启用');
    let history:any[]=[];try{history=JSON.parse(current.historyJson)}catch{}
    const changed = await this.prisma.operationRegion.updateMany({ where: { id,updatedAt:current.updatedAt,historyJson:current.historyJson }, data: { status,historyJson:JSON.stringify([...history,{action:status==='ACTIVE'?'ENABLE':'DISABLE',actor:user.displayName,at:new Date().toISOString(),summary:status==='ACTIVE'?'启用区域':'停用区域'}]) } });
    if(changed.count!==1)throw new BadRequestException('区域刚被其他人更新，请刷新后重试');
    const item=await this.requireRegion(user,id);
    await this.auth.audit(user, 'operation', 'operationRegion', id, status === 'ACTIVE' ? 'ENABLE' : 'DISABLE', { name: item.name });
    return item;
  }
}
