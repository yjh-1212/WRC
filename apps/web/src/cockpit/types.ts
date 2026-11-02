export type CockpitLevel = 'national' | 'province' | 'city';
export type VehicleType = 'ALL' | 'DELIVERY' | 'SANITATION' | 'PATROL' | 'RETAIL' | 'SHUTTLE';

export type CockpitSummary = {
  registeredVehicles: number; onlineVehicles: number; runningVehicles: number; operatingEnterprises: number;
  mileageToday: number; riskEvents: number; majorEvents: number; unresolvedMajor: number;
  onlineRate: number; dataQualityRate: number;
};

export type RegionItem = {
  id: string; code?: string; name: string; longitude?: number; latitude?: number; connected?: boolean;
  registeredVehicles?: number; onlineVehicles?: number;
  reportedAt?: string | null; sourceName?: string | null;
  summary?: CockpitSummary & { riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' };
};

export type CockpitSceneData = {
  scene: { level: CockpitLevel; regionCode: string; regionName: string; parentCode?: string | null; camera: { longitude: number; latitude: number; height: number }; vehicleType: VehicleType };
  summary: CockpitSummary;
  vehicleTypes: Record<string, number>;
  trend: Array<{ date: string; onlineRate: number | null; runningVehicles: number | null; mileage: number | null; riskEvents: number | null }>;
  regions: RegionItem[];
  ranking: Array<RegionItem & { riskEvents?: number }>;
  risks: Array<any>;
  map?: { vehicles: Array<any>; operationRegions: Array<any>; roadRights: Array<any> };
  source: { name: string; reportedAt: string | null; capturedAt: string | null; scope: string };
  layers: Record<string, boolean>;
};

export type SceneSelection = { kind: 'region' | 'vehicle'; id: string; code?: string; name: string; connected?: boolean; raw: any };
