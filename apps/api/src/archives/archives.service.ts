import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  ArchivePageQueryDto, CreateLicenseDto, CreateManufacturerDto, CreateQualificationDto, CreateVehicleDto,
  CreateVehicleModelDto, UpdateEnterpriseArchiveDto, UpdateLicenseDto, UpdateManufacturerDto,
  UpdateQualificationDto, UpdateVehicleDto, UpdateVehicleModelDto,
} from './dto';

@Injectable()
export class ArchivesService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  private isSuper(user: AuthUser) { return user.roles.some((role) => role.code === 'SUPER_ADMIN'); }
  private vehicleScope(user: AuthUser): Prisma.VehicleWhereInput {
    if (user.portal === 'ENTERPRISE') {
      if (!user.enterpriseId) throw new ForbiddenException('企业账号尚未关联企业主体');
      return { enterpriseId: user.enterpriseId };
    }
    return this.isSuper(user) ? {} : { organizationId: user.organizationId ?? '__none__' };
  }
  private enterpriseScope(user: AuthUser): Prisma.EnterpriseWhereInput {
    if (user.portal === 'ENTERPRISE') return { id: user.enterpriseId ?? '__none__' };
    return this.isSuper(user) ? {} : { organizationId: user.organizationId ?? '__none__' };
  }
  private page(query: ArchivePageQueryDto) {
    return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
  }

  async options(user: AuthUser) {
    const [manufacturers, models, enterprises, organizations] = await this.prisma.$transaction([
      this.prisma.manufacturer.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true, shortName: true } }),
      this.prisma.vehicleModel.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true, modelCode: true, manufacturerId: true } }),
      this.prisma.enterprise.findMany({ where: { ...this.enterpriseScope(user), status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true, organizationId: true } }),
      this.prisma.organization.findMany({ where: this.isSuper(user) ? {} : { id: user.organizationId ?? '__none__' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return { manufacturers, models, enterprises, organizations };
  }

  async manufacturers(query: ArchivePageQueryDto) {
    const where: Prisma.ManufacturerWhereInput = {
      deletedAt: null,
      status: query.status,
      OR: query.q ? [{ name: { contains: query.q } }, { shortName: { contains: query.q } }, { businessNo: { contains: query.q } }, { creditCode: { contains: query.q } }] : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.manufacturer.count({ where }),
      this.prisma.manufacturer.findMany({ where, ...this.page(query), orderBy: { [query.sort]: query.order } as any, include: { _count: { select: { models: { where: { deletedAt: null } } } } } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async createManufacturer(user: AuthUser, dto: CreateManufacturerDto) {
    const item = await this.prisma.manufacturer.create({ data: { ...dto, creditCode: dto.creditCode || undefined } });
    await this.auth.audit(user, 'archive', 'manufacturer', item.id, 'CREATE', dto);
    return item;
  }
  async updateManufacturer(user: AuthUser, id: string, dto: UpdateManufacturerDto) {
    await this.requireManufacturer(id);
    const item = await this.prisma.manufacturer.update({ where: { id }, data: { ...dto, creditCode: dto.creditCode === '' ? null : dto.creditCode } });
    await this.auth.audit(user, 'archive', 'manufacturer', id, 'UPDATE', dto);
    return item;
  }
  async setManufacturerStatus(user: AuthUser, id: string, status: string) {
    await this.requireManufacturer(id);
    const item = await this.prisma.manufacturer.update({ where: { id }, data: { status } });
    await this.auth.audit(user, 'archive', 'manufacturer', id, status === 'ACTIVE' ? 'ENABLE' : 'DISABLE');
    return item;
  }
  async deleteManufacturer(user: AuthUser, id: string) {
    const item = await this.requireManufacturer(id);
    const modelCount = await this.prisma.vehicleModel.count({ where: { manufacturerId: id, deletedAt: null } });
    if (modelCount) throw new BadRequestException('该厂商仍有关联车型，不能删除');
    await this.prisma.manufacturer.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await this.auth.audit(user, 'archive', 'manufacturer', id, 'DELETE', { name: item.name });
    return { id, deleted: true };
  }
  private async requireManufacturer(id: string) {
    const item = await this.prisma.manufacturer.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new NotFoundException('厂商不存在');
    return item;
  }

  async models(query: ArchivePageQueryDto) {
    const where: Prisma.VehicleModelWhereInput = {
      deletedAt: null, status: query.status, manufacturerId: query.manufacturerId,
      OR: query.q ? [{ name: { contains: query.q } }, { modelCode: { contains: query.q } }, { businessNo: { contains: query.q } }] : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.vehicleModel.count({ where }),
      this.prisma.vehicleModel.findMany({ where, ...this.page(query), orderBy: { [query.sort]: query.order } as any, include: { manufacturer: { select: { id: true, name: true, shortName: true } }, _count: { select: { vehicles: { where: { deletedAt: null } } } } } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async createModel(user: AuthUser, dto: CreateVehicleModelDto) {
    await this.requireManufacturer(dto.manufacturerId);
    const item = await this.prisma.vehicleModel.create({ data: dto });
    await this.auth.audit(user, 'archive', 'vehicleModel', item.id, 'CREATE', dto);
    return item;
  }
  async updateModel(user: AuthUser, id: string, dto: UpdateVehicleModelDto) {
    await this.requireModel(id);
    if (dto.manufacturerId) await this.requireManufacturer(dto.manufacturerId);
    const item = await this.prisma.vehicleModel.update({ where: { id }, data: dto });
    await this.auth.audit(user, 'archive', 'vehicleModel', id, 'UPDATE', dto);
    return item;
  }
  async setModelStatus(user: AuthUser, id: string, status: string) {
    await this.requireModel(id);
    const item = await this.prisma.vehicleModel.update({ where: { id }, data: { status } });
    await this.auth.audit(user, 'archive', 'vehicleModel', id, status === 'ACTIVE' ? 'ENABLE' : 'DISABLE');
    return item;
  }
  async deleteModel(user: AuthUser, id: string) {
    await this.requireModel(id);
    const vehicleCount = await this.prisma.vehicle.count({ where: { modelId: id, deletedAt: null } });
    if (vehicleCount) throw new BadRequestException('该车型仍有关联车辆，不能删除');
    await this.prisma.vehicleModel.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await this.auth.audit(user, 'archive', 'vehicleModel', id, 'DELETE');
    return { id, deleted: true };
  }
  private async requireModel(id: string) {
    const item = await this.prisma.vehicleModel.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new NotFoundException('车型不存在');
    return item;
  }

  private vehicleWhere(user: AuthUser, query: ArchivePageQueryDto): Prisma.VehicleWhereInput {
    return {
      ...this.vehicleScope(user), deletedAt: null, status: query.status, enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId,
      modelId: query.modelId, onlineStatus: query.onlineStatus,
      OR: query.q ? [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }, { vin: { contains: query.q } }, { deviceNo: { contains: query.q } }, { licenses: { some: { licenseNo: { contains: query.q } } } }] : undefined,
    };
  }
  async vehicles(user: AuthUser, query: ArchivePageQueryDto) {
    const where = this.vehicleWhere(user, query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({ where, ...this.page(query), orderBy: { [query.sort]: query.order } as any, include: {
        enterprise: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } },
        model: { include: { manufacturer: { select: { id: true, name: true, shortName: true } } } },
        archive: true, licenses: { where: { status: { not: 'CANCELLED' } }, orderBy: { issuedAt: 'desc' }, take: 1 },
      } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async vehicleDetail(user: AuthUser, id: string) {
    const item = await this.prisma.vehicle.findFirst({ where: { id, ...this.vehicleScope(user), deletedAt: null }, include: {
      enterprise: true, organization: true, model: { include: { manufacturer: true } }, archive: true,
      licenses: { orderBy: { issuedAt: 'desc' } },
    } });
    if (!item) throw new NotFoundException('车辆不存在或不在当前数据范围内');
    return item;
  }
  async createVehicle(user: AuthUser, dto: CreateVehicleDto) {
    await this.requireModel(dto.modelId);
    const enterpriseId = user.portal === 'ENTERPRISE' ? user.enterpriseId ?? undefined : dto.enterpriseId;
    if (!enterpriseId) throw new BadRequestException('请选择所属企业');
    const enterprise = await this.prisma.enterprise.findFirst({ where: { id: enterpriseId, ...this.enterpriseScope(user), status: 'ACTIVE' } });
    if (!enterprise) throw new ForbiddenException('企业不存在或不在当前数据范围内');
    const item = await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({ data: {
        businessNo: dto.businessNo, vin: dto.vin, deviceNo: dto.deviceNo, name: dto.name, modelId: dto.modelId,
        enterpriseId, organizationId: enterprise.organizationId, color: dto.color,
        manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : undefined,
        serviceStartDate: dto.serviceStartDate ? new Date(dto.serviceStartDate) : undefined,
      } });
      await tx.vehicleArchive.create({ data: { archiveNo: `ARC-${dto.businessNo}`, vehicleId: vehicle.id, registeredAt: dto.serviceStartDate ? new Date(dto.serviceStartDate) : new Date() } });
      return vehicle;
    });
    await this.auth.audit(user, 'archive', 'vehicle', item.id, 'CREATE', dto);
    return item;
  }
  async updateVehicle(user: AuthUser, id: string, dto: UpdateVehicleDto) {
    await this.vehicleDetail(user, id);
    if (dto.modelId) await this.requireModel(dto.modelId);
    const data: Prisma.VehicleUpdateInput = {
      businessNo: dto.businessNo, vin: dto.vin, deviceNo: dto.deviceNo, name: dto.name, color: dto.color,
      manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : undefined,
      serviceStartDate: dto.serviceStartDate ? new Date(dto.serviceStartDate) : undefined,
      model: dto.modelId ? { connect: { id: dto.modelId } } : undefined,
    };
    if (dto.enterpriseId && user.portal !== 'ENTERPRISE') {
      const enterprise = await this.prisma.enterprise.findFirst({ where: { id: dto.enterpriseId, ...this.enterpriseScope(user) } });
      if (!enterprise) throw new ForbiddenException('企业不存在或不在当前数据范围内');
      data.enterprise = { connect: { id: enterprise.id } };
      data.organization = { connect: { id: enterprise.organizationId } };
    }
    const item = await this.prisma.vehicle.update({ where: { id }, data });
    await this.auth.audit(user, 'archive', 'vehicle', id, 'UPDATE', dto);
    return item;
  }
  async setVehicleStatus(user: AuthUser, id: string, status: string) {
    await this.vehicleDetail(user, id);
    const item = await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.update({ where: { id }, data: { status, onlineStatus: status === 'INACTIVE' ? 'OFFLINE' : undefined } });
      await tx.vehicleArchive.update({ where: { vehicleId: id }, data: { lifecycleStatus: status === 'ACTIVE' ? 'IN_SERVICE' : 'SUSPENDED' } });
      return vehicle;
    });
    await this.auth.audit(user, 'archive', 'vehicle', id, status === 'ACTIVE' ? 'ENABLE' : 'DISABLE');
    return item;
  }
  async deleteVehicle(user: AuthUser, id: string) {
    await this.vehicleDetail(user, id);
    await this.prisma.$transaction([
      this.prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE', onlineStatus: 'OFFLINE' } }),
      this.prisma.vehicleArchive.update({ where: { vehicleId: id }, data: { lifecycleStatus: 'EXITED', exitedAt: new Date() } }),
      this.prisma.vehicleLicense.updateMany({ where: { vehicleId: id }, data: { status: 'CANCELLED' } }),
    ]);
    await this.auth.audit(user, 'archive', 'vehicle', id, 'DELETE');
    return { id, deleted: true };
  }

  async licenses(user: AuthUser, vehicleId: string) {
    await this.vehicleDetail(user, vehicleId);
    return this.prisma.vehicleLicense.findMany({ where: { vehicleId }, orderBy: { issuedAt: 'desc' } });
  }
  async createLicense(user: AuthUser, dto: CreateLicenseDto) {
    const vehicle = await this.vehicleDetail(user, dto.vehicleId);
    const item = await this.prisma.vehicleLicense.create({ data: { ...dto, issuedAt: new Date(dto.issuedAt), expiresAt: new Date(dto.expiresAt), enterpriseId: vehicle.enterpriseId, organizationId: vehicle.organizationId } });
    await this.auth.audit(user, 'archive', 'vehicleLicense', item.id, 'CREATE', dto);
    return item;
  }
  async updateLicense(user: AuthUser, id: string, dto: UpdateLicenseDto) {
    const current = await this.prisma.vehicleLicense.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('牌照不存在');
    await this.vehicleDetail(user, current.vehicleId);
    const { vehicleId: _vehicleId, ...rest } = dto;
    const item = await this.prisma.vehicleLicense.update({ where: { id }, data: { ...rest, issuedAt: rest.issuedAt ? new Date(rest.issuedAt) : undefined, expiresAt: rest.expiresAt ? new Date(rest.expiresAt) : undefined } });
    await this.auth.audit(user, 'archive', 'vehicleLicense', id, 'UPDATE', dto);
    return item;
  }

  async enterprises(user: AuthUser, query: ArchivePageQueryDto) {
    const where: Prisma.EnterpriseWhereInput = {
      ...this.enterpriseScope(user), status: query.status,
      OR: query.q ? [{ name: { contains: query.q } }, { businessNo: { contains: query.q } }, { creditCode: { contains: query.q } }] : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.enterprise.count({ where }),
      this.prisma.enterprise.findMany({ where, ...this.page(query), orderBy: { [query.sort]: query.order } as any, include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { vehicles: { where: { deletedAt: null } }, qualifications: { where: { deletedAt: null } }, users: true } },
      } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async enterpriseDetail(user: AuthUser, id?: string) {
    const targetId = user.portal === 'ENTERPRISE' ? user.enterpriseId : id;
    if (!targetId) throw new BadRequestException('缺少企业标识');
    const item = await this.prisma.enterprise.findFirst({ where: { id: targetId, ...this.enterpriseScope(user) }, include: {
      organization: true, qualifications: { where: { deletedAt: null }, orderBy: { expiresAt: 'asc' } },
      _count: { select: { vehicles: { where: { deletedAt: null } }, users: true } },
    } });
    if (!item) throw new NotFoundException('企业不存在或不在当前数据范围内');
    return item;
  }
  async updateEnterprise(user: AuthUser, id: string | undefined, dto: UpdateEnterpriseArchiveDto) {
    const current = await this.enterpriseDetail(user, id);
    const item = await this.prisma.enterprise.update({ where: { id: current.id }, data: dto });
    await this.auth.audit(user, 'archive', 'enterprise', current.id, 'UPDATE_PROFILE', dto);
    return item;
  }
  async qualifications(user: AuthUser, query: ArchivePageQueryDto) {
    const enterpriseIds = await this.prisma.enterprise.findMany({ where: this.enterpriseScope(user), select: { id: true } });
    const where: Prisma.EnterpriseQualificationWhereInput = {
      deletedAt: null, enterpriseId: user.portal === 'ENTERPRISE' ? user.enterpriseId ?? '__none__' : query.enterpriseId ? query.enterpriseId : { in: enterpriseIds.map((item) => item.id) },
      status: query.status,
      OR: query.q ? [{ qualificationType: { contains: query.q } }, { certificateNo: { contains: query.q } }, { businessNo: { contains: query.q } }] : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.enterpriseQualification.count({ where }),
      this.prisma.enterpriseQualification.findMany({ where, ...this.page(query), orderBy: { [query.sort]: query.order } as any, include: { enterprise: { select: { id: true, name: true } } } }),
    ]);
    return { page: query.page, pageSize: query.pageSize, total, items };
  }
  async createQualification(user: AuthUser, dto: CreateQualificationDto) {
    const enterpriseId = user.portal === 'ENTERPRISE' ? user.enterpriseId ?? undefined : dto.enterpriseId;
    const enterprise = await this.enterpriseDetail(user, enterpriseId);
    const { enterpriseId: _enterpriseId, ...rest } = dto;
    const item = await this.prisma.enterpriseQualification.create({ data: { ...rest, enterpriseId: enterprise.id, issuedAt: new Date(dto.issuedAt), expiresAt: new Date(dto.expiresAt) } });
    await this.auth.audit(user, 'archive', 'enterpriseQualification', item.id, 'CREATE', dto);
    return item;
  }
  async updateQualification(user: AuthUser, id: string, dto: UpdateQualificationDto) {
    const current = await this.prisma.enterpriseQualification.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('企业资质不存在');
    await this.enterpriseDetail(user, current.enterpriseId);
    const { enterpriseId: _enterpriseId, ...rest } = dto;
    const item = await this.prisma.enterpriseQualification.update({ where: { id }, data: { ...rest, issuedAt: rest.issuedAt ? new Date(rest.issuedAt) : undefined, expiresAt: rest.expiresAt ? new Date(rest.expiresAt) : undefined } });
    await this.auth.audit(user, 'archive', 'enterpriseQualification', id, 'UPDATE', dto);
    return item;
  }
  async deleteQualification(user: AuthUser, id: string) {
    const current = await this.prisma.enterpriseQualification.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('企业资质不存在');
    await this.enterpriseDetail(user, current.enterpriseId);
    await this.prisma.enterpriseQualification.update({ where: { id }, data: { deletedAt: new Date(), status: 'CANCELLED' } });
    await this.auth.audit(user, 'archive', 'enterpriseQualification', id, 'DELETE');
    return { id, deleted: true };
  }
}
