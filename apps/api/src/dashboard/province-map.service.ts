import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CockpitQueryDto } from './cockpit.dto';
import { CockpitService } from './cockpit.service';
import { currentVehicleTrack } from './current-vehicle-track';

export class ProvinceMapQueryDto extends CockpitQueryDto {
  @IsOptional() @Matches(/^\d{6}$/) cityCode?: string;
}

@Injectable()
export class ProvinceMapService {
  constructor(private readonly prisma: PrismaService, private readonly cockpit: CockpitService) {}
  private async scope(user: AuthUser, cityCode?: string) {
    if (user.accountLevel !== 'PROVINCE' || user.portal !== 'REGULATORY') throw new ForbiddenException('仅省级监管账号可访问全省地图');
    const [regions, workspaces] = await Promise.all([
      this.prisma.cockpitRegion.findMany({ where: { parentCode: '370000', level: 'CITY', status: 'ACTIVE' }, orderBy: { code: 'asc' }, select: { code: true, name: true, longitude: true, latitude: true } }),
      this.prisma.cityWorkspace.findMany({ select: { id: true, cityCode: true, cityName: true, organizationId: true } }),
    ]);
    if (cityCode && !regions.some(city => city.code === cityCode)) throw new BadRequestException('请选择有效的山东省地市');
    const selected = workspaces.filter(workspace => !cityCode || workspace.cityCode === cityCode);
    const organizations = await this.prisma.organization.findMany({ where: { workspaceId: { in: selected.map(row => row.id) } }, select: { id: true, workspaceId: true } });
    const organizationIds = [...new Set([...selected.map(row => row.organizationId), ...organizations.map(row => row.id)])];
    const cityForOrganization = new Map<string, string>();
    for (const workspace of selected) {
      cityForOrganization.set(workspace.organizationId, workspace.cityCode);
      for (const org of organizations.filter(org => org.workspaceId === workspace.id)) cityForOrganization.set(org.id, workspace.cityCode);
    }
    return { regions, workspaces, selected, organizationIds, cityForOrganization };
  }
  private async vehicles(organizationIds: string[], query: ProvinceMapQueryDto = {}) {
    if (query.organizationId && !organizationIds.includes(query.organizationId)) throw new ForbiddenException('区县不在当前地市范围');
    return this.prisma.vehicle.findMany({
      where: { deletedAt: null, AND: [{ organizationId: { in: organizationIds } }], ...(query.organizationId ? { organizationId: query.organizationId } : {}), ...(query.enterpriseId ? { enterpriseId: query.enterpriseId } : {}), ...(query.vehicleId ? { id: query.vehicleId } : {}) },
      select: { id: true, businessNo: true, name: true, organizationId: true, enterpriseId: true, vehicleType: true, onlineStatus: true, enterprise: { select: { name: true } }, organization: { select: { name: true } }, _count: { select: { safetyAlerts: { where: { status: { not: 'CLOSED' }, level: { in: ['HIGH', 'CRITICAL'] } } } } }, realtimeStatus: { select: { longitude: true, latitude: true, heading: true, speed: true, battery: true, drivingState: true, heartbeatAt: true, locationTime: true, mileageToday: true } } },
    });
  }
  private point(row: Awaited<ReturnType<ProvinceMapService['vehicles']>>[number], cityCode?: string) {
    return { id: row.id, businessNo: row.businessNo, name: row.name, organizationId: row.organizationId, enterpriseId: row.enterpriseId, vehicleType: row.vehicleType, onlineStatus: row.onlineStatus, enterprise: row.enterprise.name, organization: row.organization.name, cityCode, highRisks: row._count.safetyAlerts, longitude: row.realtimeStatus?.longitude ?? null, latitude: row.realtimeStatus?.latitude ?? null, speed: row.realtimeStatus?.speed ?? null, battery: row.realtimeStatus?.battery ?? null, heading: row.realtimeStatus?.heading ?? null, heartbeatAt: row.realtimeStatus?.heartbeatAt ?? null, locationTime: row.realtimeStatus?.locationTime ?? null, drivingState: row.realtimeStatus?.drivingState ?? null, mileageToday: row.realtimeStatus?.mileageToday ?? null };
  }
  async overview(user: AuthUser, query: ProvinceMapQueryDto) {
    const scope = await this.scope(user, query.cityCode);
    if (!query.cityCode && (query.organizationId || query.enterpriseId || query.vehicleId || query.level && query.level !== 'city')) throw new BadRequestException('请先选择监管地市');
    const rows = await this.vehicles(scope.organizationIds, query);
    const vehicles = rows.filter(row => row.realtimeStatus && Number.isFinite(row.realtimeStatus.longitude) && Number.isFinite(row.realtimeStatus.latitude)).map(row => this.point(row, scope.cityForOrganization.get(row.organizationId)));
    const cities = scope.regions.map(city => {
      const local = rows.filter(row => scope.cityForOrganization.get(row.organizationId) === city.code);
      return { ...city, id: city.code, connected: scope.workspaces.some(workspace => workspace.cityCode === city.code), count: local.length, online: local.filter(row => row.onlineStatus === 'ONLINE').length };
    });
    if (!query.cityCode || !scope.selected.length) {
      const areas = await this.prisma.operationRegion.findMany({ where: { organizationId: { in: scope.organizationIds }, status: 'ACTIVE' }, select: { id: true, name: true, polygonJson: true } });
      const operationRegions = areas.flatMap(row => { try { return [{ id: row.id, name: row.name, polygon: JSON.parse(row.polygonJson) }]; } catch { return []; } });
      return {
      updatedAt: new Date(), level: query.cityCode ? 'city' : 'province', connected: !query.cityCode,
      cityCode: query.cityCode ?? null, cityName: scope.regions.find(city => city.code === query.cityCode)?.name ?? '山东省',
      scope: { level: query.cityCode ? 'city' : 'province', city: null, district: null, enterprise: null, vehicle: null },
      map: { kind: 'cities', items: query.cityCode ? cities.filter(city => city.code === query.cityCode) : cities, track: [], operationRegions }, vehicles, context: {}, distribution: null, summary: null,
      };
    }
    const detail = await this.cockpit.overview(user, query, { organizationIds: scope.organizationIds, cityOrganizationId: scope.selected[0].organizationId });
    return { ...detail, level: detail.scope.level, connected: true, cityCode: query.cityCode, cityName: scope.selected[0].cityName, vehicles };
  }
  async telemetry(user: AuthUser, cityCode: string | undefined, vehicleId: string) {
    if (!cityCode) throw new BadRequestException('请先选择监管地市');
    const scope = await this.scope(user, cityCode), rows = await this.vehicles(scope.organizationIds, { vehicleId });
    if (!rows.length) throw new NotFoundException('车辆不在当前地市范围');
    const running = rows[0].onlineStatus === 'ONLINE' && rows[0].realtimeStatus?.drivingState === 'RUNNING';
    const current = running ? await currentVehicleTrack(this.prisma, rows[0].id) : { track: [], trip: null };
    return { updatedAt: new Date(), vehicle: this.point(rows[0], cityCode), currentTrack: current.track, currentTrip: current.trip };
  }
}
