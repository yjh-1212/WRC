import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import {
  ArchivePageQueryDto, CreateLicenseDto, CreateManufacturerDto, CreateQualificationDto, CreateVehicleDto,
  CreateVehicleModelDto, UpdateEnterpriseArchiveDto, UpdateLicenseDto, UpdateManufacturerDto,
  UpdateQualificationDto, UpdateStatusDto, UpdateVehicleDto, UpdateVehicleModelDto,
} from './dto';
import { ArchivesService } from './archives.service';

@ApiTags('监管档案') @ApiBearerAuth() @Controller('archives')
export class ArchivesController {
  constructor(private archives: ArchivesService) {}

  @Get('options') @RequirePermissions('archive:vehicle:read')
  options(@CurrentUser() user: AuthUser) { return this.archives.options(user); }

  @Get('manufacturers') @RequirePermissions('archive:manufacturer:read')
  manufacturers(@Query() query: ArchivePageQueryDto) { return this.archives.manufacturers(query); }
  @Post('manufacturers') @RequirePermissions('archive:manufacturer:write')
  createManufacturer(@CurrentUser() user: AuthUser, @Body() dto: CreateManufacturerDto) { return this.archives.createManufacturer(user, dto); }
  @Patch('manufacturers/:id') @RequirePermissions('archive:manufacturer:write')
  updateManufacturer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateManufacturerDto) { return this.archives.updateManufacturer(user, id, dto); }
  @Patch('manufacturers/:id/status') @RequirePermissions('archive:manufacturer:write')
  setManufacturerStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStatusDto) { return this.archives.setManufacturerStatus(user, id, dto.status); }
  @Delete('manufacturers/:id') @RequirePermissions('archive:manufacturer:write')
  deleteManufacturer(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.archives.deleteManufacturer(user, id); }

  @Get('models') @RequirePermissions('archive:model:read')
  models(@Query() query: ArchivePageQueryDto) { return this.archives.models(query); }
  @Post('models') @RequirePermissions('archive:model:write')
  createModel(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleModelDto) { return this.archives.createModel(user, dto); }
  @Patch('models/:id') @RequirePermissions('archive:model:write')
  updateModel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateVehicleModelDto) { return this.archives.updateModel(user, id, dto); }
  @Patch('models/:id/status') @RequirePermissions('archive:model:write')
  setModelStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStatusDto) { return this.archives.setModelStatus(user, id, dto.status); }
  @Delete('models/:id') @RequirePermissions('archive:model:write')
  deleteModel(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.archives.deleteModel(user, id); }

  @Get('vehicles') @RequirePermissions('archive:vehicle:read')
  vehicles(@CurrentUser() user: AuthUser, @Query() query: ArchivePageQueryDto) { return this.archives.vehicles(user, query); }
  @Get('vehicles/:id') @RequirePermissions('archive:vehicle:read')
  vehicleDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.archives.vehicleDetail(user, id); }
  @Post('vehicles') @RequirePermissions('archive:vehicle:write')
  createVehicle(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) { return this.archives.createVehicle(user, dto); }
  @Patch('vehicles/:id') @RequirePermissions('archive:vehicle:write')
  updateVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateVehicleDto) { return this.archives.updateVehicle(user, id, dto); }
  @Patch('vehicles/:id/status') @RequirePermissions('archive:vehicle:write')
  setVehicleStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStatusDto) { return this.archives.setVehicleStatus(user, id, dto.status); }
  @Delete('vehicles/:id') @RequirePermissions('archive:vehicle:write')
  deleteVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.archives.deleteVehicle(user, id); }

  @Get('vehicles/:vehicleId/licenses') @RequirePermissions('archive:license:read')
  licenses(@CurrentUser() user: AuthUser, @Param('vehicleId') vehicleId: string) { return this.archives.licenses(user, vehicleId); }
  @Post('licenses') @RequirePermissions('archive:license:write')
  createLicense(@CurrentUser() user: AuthUser, @Body() dto: CreateLicenseDto) { return this.archives.createLicense(user, dto); }
  @Patch('licenses/:id') @RequirePermissions('archive:license:write')
  updateLicense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLicenseDto) { return this.archives.updateLicense(user, id, dto); }

  @Get('enterprises') @RequirePermissions('archive:enterprise-archive:read')
  enterprises(@CurrentUser() user: AuthUser, @Query() query: ArchivePageQueryDto) { return this.archives.enterprises(user, query); }
  @Get('enterprises/current') @RequirePermissions('archive:enterprise-archive:read')
  currentEnterprise(@CurrentUser() user: AuthUser) { return this.archives.enterpriseDetail(user); }
  @Get('enterprises/:id') @RequirePermissions('archive:enterprise-archive:read')
  enterpriseDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.archives.enterpriseDetail(user, id); }
  @Patch('enterprises/current') @RequirePermissions('archive:enterprise-archive:write')
  updateCurrentEnterprise(@CurrentUser() user: AuthUser, @Body() dto: UpdateEnterpriseArchiveDto) { return this.archives.updateEnterprise(user, undefined, dto); }
  @Patch('enterprises/:id') @RequirePermissions('archive:enterprise-archive:write')
  updateEnterprise(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEnterpriseArchiveDto) { return this.archives.updateEnterprise(user, id, dto); }

  @Get('qualifications') @RequirePermissions('archive:qualification:read')
  qualifications(@CurrentUser() user: AuthUser, @Query() query: ArchivePageQueryDto) { return this.archives.qualifications(user, query); }
  @Post('qualifications') @RequirePermissions('archive:qualification:write')
  createQualification(@CurrentUser() user: AuthUser, @Body() dto: CreateQualificationDto) { return this.archives.createQualification(user, dto); }
  @Patch('qualifications/:id') @RequirePermissions('archive:qualification:write')
  updateQualification(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateQualificationDto) { return this.archives.updateQualification(user, id, dto); }
  @Delete('qualifications/:id') @RequirePermissions('archive:qualification:write')
  deleteQualification(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.archives.deleteQualification(user, id); }
}
